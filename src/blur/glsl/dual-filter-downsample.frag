uniform sampler2D previousTexture;
uniform float luminosityThreshold;
uniform vec2 previousTextureRes;

varying vec2 vUv;

void main() {
    vec2 halfpixel = 0.5 / previousTextureRes;
    float offset = 1.0;

    vec4 sum = texture(previousTexture, vUv) * 4.0;
    sum += texture(previousTexture, vUv - halfpixel.xy * offset);
    sum += texture(previousTexture, vUv + halfpixel.xy * offset);
    sum += texture(previousTexture, vUv + vec2(halfpixel.x, -halfpixel.y) * offset);
    sum += texture(previousTexture, vUv - vec2(halfpixel.x, -halfpixel.y) * offset);

    gl_FragColor = sum / 8.0;
}