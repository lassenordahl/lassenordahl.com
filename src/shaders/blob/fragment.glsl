varying vec2 vUv;
varying float vDistort;

uniform float uTime;
uniform float uIntensity;

vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}    

float random( vec2 p ) {
    vec2 K1 = vec2(
        23.14069263277926, // e^pi (Gelfond's constant)
        2.665144142690225 // 2^sqrt(2) (Gelfondâ€“Schneider constant)
    );
    return fract( cos( dot(p,K1) ) * 12345.6789 );
}

void main() {
    float distort = -1. * vDistort * uIntensity;

    vec3 brightness = vec3(0., 0., 0.);
    vec3 contrast = vec3(1., 1., 1.);
    vec3 oscilation = vec3(.4, .18, .28);
    vec3 phase = vec3(0., 0.16, 0.);

    // Apply the cosine palette.
    vec3 color = cosPalette(
        distort,
        vec3(0.00,0.00,0.00),
        vec3(1.00,1.00,1.00),
        vec3(0.59,0.18,0.35),
        vec3(0.00,0.16,0.00)
    );
    // Take the color matrix, and apply the random gradient.
    vec4 noiseColor = vec4(color, 1.0);
    vec2 uvRandom = vUv;
    uvRandom.y *= random(vec2(uvRandom.y, 1));
    noiseColor.rgb += random(uvRandom) * 0.15;

    gl_FragColor = noiseColor;
}  