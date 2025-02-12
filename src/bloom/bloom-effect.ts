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

const VERTEX_SHADER = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }`;
const DOWNSAMPLE_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D previousTexture;
  uniform float luminosityThreshold;
  uniform vec2 previousTextureRes;

  varying vec2 vUv;

  vec4 textureSample(in sampler2D tex, vec2 uv) {
    vec4 texel = texture2D(tex, uv);

    if(luminosityThreshold > 0.0) {
      float v = luminance( texel.xyz );

      vec4 outputColor = vec4( 0.0 );

      float alpha = smoothstep( luminosityThreshold, luminosityThreshold + 0.01, v );

      return mix( outputColor, texel, alpha );
    }

    return texel;
  }

  void main() {
    vec2 halfpixel = 0.5 / (previousTextureRes / 2.0);
    float offset = 3.0;

    vec4 sum = textureSample(previousTexture, vUv) * 4.0;
    sum += textureSample(previousTexture, vUv - halfpixel.xy * offset);
    sum += textureSample(previousTexture, vUv + halfpixel.xy * offset);
    sum += textureSample(previousTexture, vUv + vec2(halfpixel.x, -halfpixel.y) * offset);
    sum += textureSample(previousTexture, vUv - vec2(halfpixel.x, -halfpixel.y) * offset);

    gl_FragColor = sum / 8.0;
  }`;
const UPSAMPLE_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D previousTexture;
  uniform vec2 previousTextureRes;
  varying vec2 vUv;

  void main() {
    vec2 halfpixel = 0.5 / (previousTextureRes / 2.0);
    float offset = 1.0;

    vec4 sum = texture(previousTexture, vUv + vec2(-halfpixel.x * 2.0, 0.0) * offset);
    sum += texture(previousTexture, vUv + vec2(-halfpixel.x, halfpixel.y) * offset) * 2.0;
    sum += texture(previousTexture, vUv + vec2(0.0, halfpixel.y * 2.0) * offset);
    sum += texture(previousTexture, vUv + vec2(halfpixel.x, halfpixel.y) * offset) * 2.0;
    sum += texture(previousTexture, vUv + vec2(halfpixel.x * 2.0, 0.0) * offset);
    sum += texture(previousTexture, vUv + vec2(halfpixel.x, -halfpixel.y) * offset) * 2.0;
    sum += texture(previousTexture, vUv + vec2(0.0, -halfpixel.y * 2.0) * offset);
    sum += texture(previousTexture, vUv + vec2(-halfpixel.x, -halfpixel.y) * offset) * 2.0;

    gl_FragColor = sum / 12.0;
  }`;

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

    private clearColor: Color;
    private resolutionFactor: number;
    private nMips: number;
    private targetMip: number;
    private blurRenderTargets: Array<WebGLRenderTarget>;
    private downsampleRenderTargets: Array<WebGLRenderTarget>;
    private upsampleRenderTargets: Array<WebGLRenderTarget>;

    private downsampleMaterial: ShaderMaterial;
    private upsampleMaterial: ShaderMaterial;
    private compositeMaterial: ShaderMaterial;

    private bloomTintColors: Array<Vector3>;

    private _oldClearColor: Color;
    private oldClearAlpha: number;
    private fsQuad: FullScreenQuad;

  constructor (resolution?: Vector2, strength?: number, radius?: number, threshold?: number) {
    this.strength = (strength !== undefined) ? strength : 1;
    this.radius = (radius !== undefined) ? radius : 1;
    this.threshold = (threshold !== undefined) ? threshold : 0.1;
    this.resolution = (resolution !== undefined) ? new Vector2(resolution.x, resolution.y) : new Vector2(256, 256);

    // create color only once here, reuse it later inside the render function
    this.clearColor = new Color(0, 0, 0);

    // render targets
    this.resolutionFactor = 0.5;
    let resx = Math.round(this.resolution.x * this.resolutionFactor);
    let resy = Math.round(this.resolution.y * this.resolutionFactor);

    this.nMips = 7;
    this.targetMip = 1;
    this.blurRenderTargets = [];

    this.downsampleRenderTargets = [];
    this.upsampleRenderTargets = [];
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
    this.compositeMaterial = this.getCompositeMaterial(this.nMips);
    this.compositeMaterial.uniforms['blurTexture1'].value = this.blurRenderTargets[0]?.texture; //this.downsampleRenderTargets[this.targetMip]?.texture;
    this.compositeMaterial.uniforms['blurTexture2'].value = this.blurRenderTargets[1]?.texture;
    this.compositeMaterial.uniforms['blurTexture3'].value = this.blurRenderTargets[2]?.texture;
    this.compositeMaterial.uniforms['blurTexture4'].value = this.blurRenderTargets[3]?.texture;
    this.compositeMaterial.uniforms['blurTexture5'].value = this.blurRenderTargets[4]?.texture;
    this.compositeMaterial.uniforms['bloomStrength'].value = strength;
    this.compositeMaterial.uniforms['bloomRadius'].value = this.radius;

    const bloomFactors = [1.0, 0.8, 0.6, 0.4, 0.2];
    this.compositeMaterial.uniforms['bloomFactors'].value = bloomFactors;
    this.bloomTintColors = [new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1)];
    this.compositeMaterial.uniforms['bloomTintColors'].value = this.bloomTintColors;

    this._oldClearColor = new Color();
    this.oldClearAlpha = 1;
    this.fsQuad = new FullScreenQuad();
  }

  dispose () {
    for (let i = 0; i < this.nMips; i++) {
      this.blurRenderTargets[i].dispose();
      this.downsampleRenderTargets[i].dispose();
      this.upsampleRenderTargets[i].dispose();
    }

    this.compositeMaterial.dispose();

    this.fsQuad.dispose();
  }

  setSize (width: number, height: number) {
    let resx = Math.round(width * this.resolutionFactor);
    let resy = Math.round(height * this.resolutionFactor);

    for (let i = 0; i < this.nMips; i++) {
      if (i === this.targetMip) {
        for (let j = 0; j < this.blurRenderTargets.length; j++) {
          this.blurRenderTargets[j].setSize(resx, resy); // 640, 335);
        }
      }

      this.downsampleRenderTargets[i].setSize(resx, resy);
      this.upsampleRenderTargets[i].setSize(resx, resy);
      resx = Math.floor(resx / 2);
      resy = Math.floor(resy / 2);
    }
  }

  render (renderer: WebGLRenderer, scene: Object3D, camera: Camera) {
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
    this.oldClearAlpha = renderer.getClearAlpha();
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
      this.downsampleMaterial.uniforms['luminosityThreshold'].needsUpdate = true;
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

    // Composite All the mips
    this.fsQuad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms['bloomStrength'].value = this.strength;
    this.compositeMaterial.uniforms['bloomRadius'].value = this.radius;
    this.compositeMaterial.uniforms['bloomTintColors'].value = this.bloomTintColors;

    renderer.setRenderTarget(null);
    renderer.xr.enabled = oldXrEnabled;
    renderer.render(scene, camera);
    renderer.xr.enabled = false;
    if (renderer.xr.isPresenting) {
      //const renderTarget = renderer.xr.getRenderTarget();
      //renderer.setViewport(0, 0, renderTarget.width, renderTarget.height);
    }
    this.fsQuad.render(renderer);

    // Restore renderer settings
    renderer.setClearColor(this._oldClearColor, this.oldClearAlpha);
    renderer.autoClear = oldAutoClear;
    renderer.xr.enabled = oldXrEnabled;
  }

   getCompositeMaterial (nMips: number) {
    return new ShaderMaterial({
      defines: {
        'NUM_MIPS': Math.min(nMips, 5)
      },
      uniforms: {
        'blurTexture1': { value: null },
        'blurTexture2': { value: null },
        'blurTexture3': { value: null },
        'blurTexture4': { value: null },
        'blurTexture5': { value: null },
        'bloomStrength': { value: 1.0 },
        'bloomFactors': { value: null },
        'bloomTintColors': { value: null },
        'bloomRadius': { value: 0.0 }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D blurTexture1;
        uniform sampler2D blurTexture2;
        uniform sampler2D blurTexture3;
        uniform sampler2D blurTexture4;
        uniform sampler2D blurTexture5;
        uniform float bloomStrength;
        uniform float bloomRadius;
        uniform float bloomFactors[NUM_MIPS];
        uniform vec3 bloomTintColors[NUM_MIPS];

        float lerpBloomFactor(const in float factor) {
          float mirrorFactor = 1.2 - factor;
          return mix(factor, mirrorFactor, bloomRadius);
        }

        void main() {
          gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
            lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
            lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
            lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
            lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv)
          );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending
    });
  }
}