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
}