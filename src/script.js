import "./style.css";
import "./app.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";

import vertexShader from "./shaders/test/vertex.glsl";
import fragmentShader from "./shaders/test/fragment.glsl";

import one from "./../static/images/01.webp";
import { initBlog } from "./blog/index.js";

// Initialize Vercel Analytics & Speed Insights
inject();
injectSpeedInsights();

// Scroll down button
const scrollDownBtn = document.getElementById("scroll-down");
scrollDownBtn.addEventListener("click", () => {
  const blogSection = document.querySelector(".blog-section");
  if (blogSection) {
    blogSection.scrollIntoView({ behavior: "smooth" });
  }
});

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

// Get container size for responsive canvas
const glowContainer = document.querySelector(".glow-container");
const containerRect = glowContainer.getBoundingClientRect();

const sizes = {
  width: containerRect.width,
  height: containerRect.height,
};

const camera = new THREE.PerspectiveCamera(50, sizes.width / sizes.height);
camera.position.z = 11;
scene.add(camera);

// Objects
const geometry = new THREE.PlaneGeometry(14, 9);
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0.0 },
    uTexture: { value: new THREE.TextureLoader().load(one) },
    uIntensity: 2.0
  },
  wireframe: false,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableRotate = false;
controls.enableZoom = false;

const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  alpha: true,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const clock = new THREE.Clock();

// Handle resize
window.addEventListener("resize", () => {
  const containerRect = glowContainer.getBoundingClientRect();

  // Update sizes
  sizes.width = containerRect.width;
  sizes.height = containerRect.height;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

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

// Initialize blog
initBlog();
