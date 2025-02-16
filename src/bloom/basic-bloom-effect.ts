import { Camera, Color, HalfFloatType, NoColorSpace, Object3D, ShaderMaterial, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three';
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

export class BasicBloomEffect {
    private resolution: Vector2;
    private resolutionFactor: number = 1.0;

    private strength: number;
    private radius: number;
    private threshold: number;

    private clearColor: Color = new Color(0, 0, 0);
    private steps: number = 5;
    private downsampleRenderTargets: Array<WebGLRenderTarget> = [];
    private upsampleRenderTargets: Array<WebGLRenderTarget> = [];

    private downsampleMaterial: ShaderMaterial;
    private upsampleMaterial: ShaderMaterial;
    private compositeMaterial: ShaderMaterial;

    private _oldClearColor: Color = new Color();
    private fsQuad: FullScreenQuad = new FullScreenQuad();

    constructor(resolution?: Vector2, strength?: number, radius?: number, threshold?: number) {
        this.strength = (strength !== undefined) ? strength : 1;
        this.radius = (radius !== undefined) ? radius : 1; // Not implemented
        this.threshold = (threshold !== undefined) ? threshold : 0.1;
        this.resolution = (resolution !== undefined) ? new Vector2(resolution.x, resolution.y) : new Vector2(256, 256);

        // render targets
        let resx = Math.round(this.resolution.x * this.resolutionFactor);
        let resy = Math.round(this.resolution.y * this.resolutionFactor);
        for (let i = 0; i < this.steps; i++) {
            const downsampleRenderTarget = new WebGLRenderTarget(resx, resy, {
                ...RENDER_TARGET_DEFAULTS,
                colorSpace: i === 0 ? NoColorSpace : NoColorSpace,
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
        this.compositeMaterial = new ShaderMaterial({
            uniforms: {
                blurTexture: { value: this.upsampleRenderTargets[0].texture },
                baseTexture: { value: this.downsampleRenderTargets[0].texture },
                bloomStrength: { value: strength },
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: COMPOSITE_FRAGMENT_SHADER,
        })
    }

    dispose() {
        for (let i = 0; i < this.steps; i++) {
            this.downsampleRenderTargets[i].dispose();
            this.upsampleRenderTargets[i].dispose();
        }

        this.downsampleMaterial.dispose();
        this.upsampleMaterial.dispose();

        this.fsQuad.dispose();
    }

    setSize(width: number, height: number) {
        let resx = Math.round(width * this.resolutionFactor);
        let resy = Math.round(height * this.resolutionFactor);

        for (let i = 0; i < this.steps; i++) {
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

        // 1. Render main scene
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
        for (let i = 1; i < this.steps; i++) {
            renderer.setRenderTarget(this.downsampleRenderTargets[i]);
            renderer.clear();
            this.fsQuad.render(renderer);

            this.downsampleMaterial.uniforms['previousTexture'].value = this.downsampleRenderTargets[i].texture;
            this.downsampleMaterial.uniforms['previousTextureRes'].value.set(this.downsampleRenderTargets[i].width, this.downsampleRenderTargets[i].height);
            this.downsampleMaterial.uniforms['luminosityThreshold'].value = 0.0;
        }

        // 3. Upsample
        this.fsQuad.material = this.upsampleMaterial;
        this.upsampleMaterial.uniforms['previousTexture'].value = this.downsampleRenderTargets[this.steps - 1].texture;
        this.upsampleMaterial.uniforms['previousTextureRes'].value.set(this.downsampleRenderTargets[this.steps - 1].width, this.downsampleRenderTargets[this.steps - 1].height);
        for (let i = this.steps - 2; i >= 0; i--) {
            renderer.setRenderTarget(this.upsampleRenderTargets[i]);
            renderer.clear();
            this.fsQuad.render(renderer);

            this.upsampleMaterial.uniforms['previousTexture'].value = this.upsampleRenderTargets[i].texture;
            this.upsampleMaterial.uniforms['previousTextureRes'].value.set(this.upsampleRenderTargets[i].width, this.upsampleRenderTargets[i].height);
        }

        // Final render (composite)
        renderer.setRenderTarget(currentRenderTarget);
        renderer.clear();
        if (renderer.xr.isPresenting) {
            renderer.setViewport(0, 0, currentRenderTarget!.width, currentRenderTarget!.height);
        }
        this.fsQuad.material = this.compositeMaterial;
        this.compositeMaterial.uniforms['bloomStrength'].value = this.strength;
        //this.compositeMaterial.uniforms['bloomRadius'].value = this.radius;
        this.fsQuad.render(renderer);

        // Restore renderer settings
        renderer.setClearColor(this._oldClearColor, oldClearAlpha);
        renderer.autoClear = oldAutoClear;
        renderer.xr.enabled = oldXrEnabled;
    }
}