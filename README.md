# @fern-solutions/three-vr-postfx
[![npm version](https://img.shields.io/npm/v/@fern-solutions/three-vr-postfx.svg?style=flat-square)](https://www.npmjs.com/package/@fern-solutions/three-vr-postfx)
[![npm version](https://img.shields.io/npm/l/@fern-solutions/three-vr-postfx.svg?style=flat-square)](https://www.npmjs.com/package/@fern-solutions/three-vr-postfx)
[![github](https://flat.badgen.net/badge/icon/github?icon=github&label)](https://github.com/mrxz/three-vr-postfx/)
[![twitter](https://flat.badgen.net/badge/twitter/@noerihuisman/blue?icon=twitter&label)](https://twitter.com/noerihuisman)
[![mastodon](https://flat.badgen.net/badge/mastodon/@noerihuisman@arvr.social/blue?icon=mastodon&label)](https://arvr.social/@noerihuisman)
[![ko-fi](https://img.shields.io/badge/ko--fi-buy%20me%20a%20coffee-ff5f5f?style=flat-square)](https://ko-fi.com/fernsolutions)

Post-processing effects tailored for VR. It aims to avoid many of the performance pitfalls when

# Usage
Either install the package from [npm](https://www.npmjs.com/package/@fern-solutions/three-vr-postfx) or load it using import maps:
```HTML
<script type="importmap">
  {
    "imports": {
      "@fern-solutions/three-vr-postfx": "https://cdn.jsdelivr.net/npm/@fern-solutions/three-vr-postfx/dist/three-vr-postfx.min.js"
    }
  }
</script>
```

This allows the effect to be used as follows:
```js
import { SobelEffect } from '@fern-solutions/three-vr-postfx';

// Instantiate effect
const sobelEffect = new SobelEffect();

// Handle resizing
const resize = () => {
    if(!renderer.xr.isPresenting) {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }

    const size = renderer.getSize(new THREE.Vector2());
    sobelEffect.setSize(size.width, size.height);
}
window.addEventListener('resize', _ => resize())
renderer.xr.addEventListener('sessionstart', _ => resize());
renderer.xr.addEventListener('sessionend', _ => resize());

// Render
//renderer.render(scene, camera);
sobelEffect.render(scene, camera);
```
See the example in [`example/`](./example/) for a full example.

Each effect is intended to replace the main `renderer.render` call. This means that the effects can't be combined with each-other. This is a deliberate limitation of the library. Ultimately having multiple passes is a poor fit for VR on mobile tile-based GPUs. Optimizing one effect makes it possible to use it for your experience, but the headroom generally does not allow these effects to be stacked on top of each other.

# Effects
 * `SobelEffect(resolution?)`
 * `BlurEffect(resolution?)`
 * `BasicBloomEffect(resolution?, strength?, radius?, threshold?)`
 * `UnrealBloomEffect(resolution?, strength?, radius?, threshold?)`