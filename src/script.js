import "./style.css";
import "./app.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as dat from "lil-gui";

import vertexShader from "./shaders/test/vertex.glsl";
import fragmentShader from "./shaders/test/fragment.glsl";
import blobVertex from "./shaders/blob/vertex.glsl";
import blobFragment from "./shaders/blob/fragment.glsl";

import one from "./../static/images/01.png";
import three from "./../static/images/03.png";
import four from "./../static/images/04.png";
import five from "./../static/images/05.png";
import six from "./../static/images/06.png";

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

const resetCameraPosition = () => {
  const idealRatio = 16 / 9;
  const currentRatio = sizes.width / sizes.height;

  const diff = idealRatio - currentRatio;
  camera.position.z = diff > 0.54 ? diff * 24 : 0.54 * 24;
};

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  resetCameraPosition();
});

const camera = new THREE.PerspectiveCamera(50, sizes.width / sizes.height);
resetCameraPosition();
scene.add(camera);

// Objects
const geometry = new THREE.PlaneBufferGeometry(14, 9);
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0.0 },
    uTexture: { value: new THREE.TextureLoader().load(one) },
  },
  wireframe: false,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enableRotate = false;
controls.enableZoom = false;

const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const clock = new THREE.Clock();

const tick = () => {
  const elapsedTime = clock.getElapsedTime();

  material.uniforms.uTime.value = elapsedTime;

  // Update controls
  controls.update();

  // Render
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();

var index = 0;

document.getElementsByClassName("webgl")[0].addEventListener("click", () => {
  const images = [one, six, three, five, four];

  index += 1;
  material.uniforms.uTexture.value = new THREE.TextureLoader().load(
    images[index % images.length]
  );
});
