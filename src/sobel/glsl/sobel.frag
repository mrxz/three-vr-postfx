varying vec2 vUv;

uniform sampler2D readBuffer;
uniform vec2 resolution;

#include <common>

void main() {
    vec2 texel = vec2( 1.0 / resolution.x, 1.0 / resolution.y );

    float t00 = texture2D(readBuffer, vUv + texel * vec2(-1, -1)).g;
    float t10 = texture2D(readBuffer, vUv + texel * vec2( 0, -1)).g;
    float t20 = texture2D(readBuffer, vUv + texel * vec2( 1, -1)).g;

    float t01 = texture2D(readBuffer, vUv + texel * vec2(-1,  0)).g;
    float t11 = texture2D(readBuffer, vUv + texel * vec2( 0,  0)).g;
    float t21 = texture2D(readBuffer, vUv + texel * vec2( 1,  0)).g;

    float t02 = texture2D(readBuffer, vUv + texel * vec2(-1,  1)).g;
    float t12 = texture2D(readBuffer, vUv + texel * vec2( 0,  1)).g;
    float t22 = texture2D(readBuffer, vUv + texel * vec2( 1,  1)).g;

    float valueX =
        t00*-1.0 + t10*-2.0 + t20*-1.0 +
        t02* 1.0 + t12* 2.0 + t22* 1.0;
    valueX /= 4.0;
    float valueY =
        t00*-1.0 + t01*-2.0 + t02*-1.0 +
        t20* 1.0 + t20* 2.0 + t22* 1.0;
    valueY /= 4.0;

    float G = sqrt((valueX * valueX) + (valueY * valueY));
    float value = clamp(G, 0.0, 1.0);

    gl_FragColor = vec4(vec3(value), 1.0);
}