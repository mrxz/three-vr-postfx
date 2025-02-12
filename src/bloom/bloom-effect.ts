import {
    AdditiveBlending,
    Camera,
    Color,
    HalfFloatType,
    Object3D,
    ShaderMaterial,
    Vector2,
    Vector3,
    WebGLRenderer,
    WebGLRenderTarget
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

import VERTEX_SHADER from './glsl/default.vert?raw';
import DOWNSAMPLE_FRAGMENT_SHADER from './glsl/dual-filter-downsample.frag?raw';
import UPSAMPLE_FRAGMENT_SHADER from './glsl/dual-filter-upsample.frag?raw';
import COMPOSITE_FRAGMENT_SHADER from './glsl/bloom-composite.frag?raw';

const RENDER_TARGET_DEFAULTS = {
    type: HalfFloatType,
    format: 'RGB' as unknown as number,
    internalFormat: 'R11F_G11F_B10F',
    depthBuffer: false
} as const;

/**
 * UnrealBloomEffect aims to replicate the bloom effect of UnrealBloomPass from three.js.
 * See: https://threejs.org/examples/webgl_postprocessing_unreal_bloom.html
 */
export class UnrealBloomEffect {
    private strength: number;
    private radius: number;
    private threshold: number;
    private resolution: Vector2;

    private clearColor: Color = new Color(0, 0, 0);
    private resolutionFactor: number = 0.5;
    private nMips: number = 7;
    private targetMip: number = 1;
    private blurRenderTargets: Array<WebGLRenderTarget> = [];
    private downsampleRenderTargets: Array<WebGLRenderTarget> = [];
    private upsampleRenderTargets: Array<WebGLRenderTarget> = [];

    private downsampleMaterial: ShaderMaterial;
    private upsampleMaterial: ShaderMaterial;
    private compositeMaterial: ShaderMaterial;

    private bloomTintColors: Array<Vector3>;

    private _oldClearColor: Color = new Color();
    private fsQuad: FullScreenQuad = new FullScreenQuad();

    constructor(resolution?: Vector2, strength?: number, radius?: number, threshold?: number) {
        this.strength = (strength !== undefined) ? strength : 1;
        this.radius = (radius !== undefined) ? radius : 1;
        this.threshold = (threshold !== undefined) ? threshold : 0.1;
        this.resolution = (resolution !== undefined) ? new Vector2(resolution.x, resolution.y) : new Vector2(256, 256);

        // create color only once here, reuse it later inside the render function

        // render targets
        let resx = Math.round(this.resolution.x * this.resolutionFactor);
        let resy = Math.round(this.resolution.y * this.resolutionFactor);
        for (let i = 0; i < this.nMips; i++) {
            if (i === this.targetMip) {
                for (let j = i; j < this.nMips; j++) {
                    this.blurRenderTargets.push(new WebGLRenderTarget(resx, resy, RENDER_TARGET_DEFAULTS));
                }
            }

            const downsampleRenderTarget = new WebGLRenderTarget(resx, resy, {
                ...RENDER_TARGET_DEFAULTS,
                depthBuffer: i === 0 // first buffer is used to render to
            });
            const upsampleRenderTarget = new WebGLRenderTarget(resx, resy, RENDER_TARGET_DEFAULTS);
            this.downsampleRenderTargets.push(downsampleRenderTarget);
            this.upsampleRenderTargets.push(upsampleRenderTarget);
            resx = Math.floor(resx / 2);
            resy = Math.floor(resy / 2);
        }

        // downsample material
        this.downsampleMaterial = new ShaderMaterial({
            uniforms: {
                previousTexture: { value: null },
                previousTextureRes: { value: new Vector2() },
                luminosityThreshold: { value: 1.0 }
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: DOWNSAMPLE_FRAGMENT_SHADER
        });
        // upsample material
        this.upsampleMaterial = new ShaderMaterial({
            uniforms: {
                previousTexture: { value: null },
                previousTextureRes: { value: new Vector2() }
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: UPSAMPLE_FRAGMENT_SHADER
        });

        // composite material
        this.bloomTintColors = [new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1)];
        this.compositeMaterial = new ShaderMaterial({
            defines: {
                'NUM_MIPS': Math.min(this.nMips, 5)
            },
            uniforms: {
                'blurTexture1': { value: this.blurRenderTargets[0]?.texture },
                'blurTexture2': { value: this.blurRenderTargets[1]?.texture },
                'blurTexture3': { value: this.blurRenderTargets[2]?.texture },
                'blurTexture4': { value: this.blurRenderTargets[3]?.texture },
                'blurTexture5': { value: this.blurRenderTargets[4]?.texture },
                'bloomStrength': { value: strength },
                'bloomFactors': { value: [1.0, 0.8, 0.6, 0.4, 0.2] },
                'bloomTintColors': { value: this.bloomTintColors },
                'bloomRadius': { value: this.radius }
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: COMPOSITE_FRAGMENT_SHADER,
            depthTest: false,
            depthWrite: false,
            blending: AdditiveBlending
        });
    }

    dispose() {
        for (let i = 0; i < this.nMips; i++) {
            this.blurRenderTargets[i].dispose();
            this.downsampleRenderTargets[i].dispose();
            this.upsampleRenderTargets[i].dispose();
        }

        this.compositeMaterial.dispose();

        this.fsQuad.dispose();
    }

    setSize(width: number, height: number) {
        let resx = Math.round(width * this.resolutionFactor);
        let resy = Math.round(height * this.resolutionFactor);

        for (let i = 0; i < this.nMips; i++) {
            if (i === this.targetMip) {
                for (let j = 0; j < this.blurRenderTargets.length; j++) {
                    this.blurRenderTargets[j].setSize(resx, resy);
                }
            }

            this.downsampleRenderTargets[i].setSize(resx, resy);
            this.upsampleRenderTargets[i].setSize(resx, resy);
            resx = Math.floor(resx / 2);
            resy = Math.floor(resy / 2);
        }
    }

    render(renderer: WebGLRenderer, scene: Object3D, camera: Camera) {
        const currentRenderTarget = renderer.getRenderTarget();

        // Adjust viewport of xr camera
        if (renderer.xr.isPresenting) {
            const xrCamera = renderer.xr.getCamera();
            xrCamera.cameras[0].viewport.multiplyScalar(this.resolutionFactor);
            xrCamera.cameras[1].viewport.multiplyScalar(this.resolutionFactor);
        }

        // Render main scene
        renderer.setRenderTarget(this.downsampleRenderTargets[0]);
        renderer.render(scene, camera);

        if (renderer.xr.isPresenting) {
            const xrCamera = renderer.xr.getCamera();
            xrCamera.cameras[0].viewport.divideScalar(this.resolutionFactor);
            xrCamera.cameras[1].viewport.divideScalar(this.resolutionFactor);
        }

        // Disable XR rendering
        const oldXrEnabled = renderer.xr.enabled;
        renderer.xr.enabled = false;

        renderer.getClearColor(this._oldClearColor);
        const oldClearAlpha = renderer.getClearAlpha();
        const oldAutoClear = renderer.autoClear;
        renderer.autoClear = false;

        renderer.setClearColor(this.clearColor, 0);

        // 2. Downsample
        this.fsQuad.material = this.downsampleMaterial;
        this.downsampleMaterial.uniforms['previousTexture'].value = this.downsampleRenderTargets[0].texture;
        this.downsampleMaterial.uniforms['previousTextureRes'].value.set(this.downsampleRenderTargets[0].width, this.downsampleRenderTargets[0].height);
        this.downsampleMaterial.uniforms['luminosityThreshold'].value = this.threshold;
        for (let i = 1; i < this.nMips; i++) {
            renderer.setRenderTarget(this.downsampleRenderTargets[i]);
            renderer.clear();
            this.fsQuad.render(renderer);

            this.downsampleMaterial.uniforms['previousTexture'].value = this.downsampleRenderTargets[i].texture;
            this.downsampleMaterial.uniforms['previousTextureRes'].value.set(this.downsampleRenderTargets[i].width, this.downsampleRenderTargets[i].height);
            this.downsampleMaterial.uniforms['luminosityThreshold'].value = 0.0;
        }

        // 3. Upsample
        for (let start = this.nMips - 1; start > this.nMips - 6; start--) {
            this.fsQuad.material = this.upsampleMaterial;
            this.upsampleMaterial.uniforms['previousTexture'].value = this.downsampleRenderTargets[start].texture;
            this.upsampleMaterial.uniforms['previousTextureRes'].value.set(this.downsampleRenderTargets[start].width, this.downsampleRenderTargets[start].height);
            for (let i = start - 1; i > this.targetMip; i--) {
                renderer.setRenderTarget(this.upsampleRenderTargets[i]);
                renderer.clear();
                this.fsQuad.render(renderer);

                this.upsampleMaterial.uniforms['previousTexture'].value = this.upsampleRenderTargets[i].texture;
                this.upsampleMaterial.uniforms['previousTextureRes'].value.set(this.upsampleRenderTargets[i].width, this.upsampleRenderTargets[i].height);
            }

            // Final render
            renderer.setRenderTarget(this.blurRenderTargets[start - this.nMips + 5]);
            renderer.clear();
            this.fsQuad.render(renderer);
        }

        // Composite all different blur levels
        this.fsQuad.material = this.compositeMaterial;
        this.compositeMaterial.uniforms['bloomStrength'].value = this.strength;
        this.compositeMaterial.uniforms['bloomRadius'].value = this.radius;
        this.compositeMaterial.uniforms['bloomTintColors'].value = this.bloomTintColors;

        renderer.setRenderTarget(currentRenderTarget);
        renderer.xr.enabled = oldXrEnabled;
        renderer.render(scene, camera);
        renderer.xr.enabled = false;
        if (renderer.xr.isPresenting) {
            renderer.setViewport(0, 0, currentRenderTarget!.width, currentRenderTarget!.height);
        }
        this.fsQuad.render(renderer);

        // Restore renderer settings
        renderer.setClearColor(this._oldClearColor, oldClearAlpha);
        renderer.autoClear = oldAutoClear;
        renderer.xr.enabled = oldXrEnabled;
    }
}