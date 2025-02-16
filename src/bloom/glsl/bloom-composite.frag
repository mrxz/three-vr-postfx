varying vec2 vUv;
uniform sampler2D blurTexture;
uniform sampler2D baseTexture;
uniform float bloomStrength;

#include <common>
#include <dithering_pars_fragment>

void main() {
    gl_FragColor = texture(baseTexture, vUv) + bloomStrength * texture(blurTexture, vUv);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
}