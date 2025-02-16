uniform sampler2D previousTexture;
uniform vec2 previousTextureRes;
varying vec2 vUv;

void main() {
    vec2 halfpixel = 0.5 / previousTextureRes;
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
}