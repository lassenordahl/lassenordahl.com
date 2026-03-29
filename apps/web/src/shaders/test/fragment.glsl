varying vec2 vUv;
varying float vWave;
uniform sampler2D uTexture;

void main() {
  float wave = vWave * 0.3;
  // Split each texture color vector
  float r = texture2D(uTexture, vUv).r;
  float g = texture2D(uTexture, vUv).g;
  float b = texture2D(uTexture, vUv + wave).b;
  // Put them back together
  vec3 texture = vec3(r, g, b);
  gl_FragColor = vec4(texture, 1.);
}