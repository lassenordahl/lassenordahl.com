import "./style.css";
import "./app.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import vertexShader from "./shaders/test/vertex.glsl";
import fragmentShader from "./shaders/test/fragment.glsl";

import { initBlog } from "./blog/index.js";
import { createIcons, icons } from "lucide";

const onPostPage = window.location.pathname.startsWith('/post/');

if (!onPostPage) {
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

  // Reuse the already-loaded .glow-image element as the shader texture
  // instead of fetching 01.webp a second time via TextureLoader.
  const glowImage = glowContainer.querySelector(".glow-image");
  const texture = new THREE.Texture(glowImage);
  const markTextureReady = () => {
    texture.needsUpdate = true;
  };
  if (glowImage.complete && glowImage.naturalWidth) {
    markTextureReady();
  } else {
    glowImage.addEventListener("load", markTextureReady, { once: true });
  }

  // Objects
  const geometry = new THREE.PlaneGeometry(14, 9);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0.0 },
      uTexture: { value: texture },
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
  controls.enablePan = false;

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

  let frameId = null;

  const tick = () => {
    const elapsedTime = clock.getElapsedTime();

    material.uniforms.uTime.value = elapsedTime;

    // Update controls
    controls.update();

    // Render
    renderer.render(scene, camera);

    // Call tick again on the next frame
    frameId = window.requestAnimationFrame(tick);
  };

  const start = () => {
    if (frameId === null) frameId = window.requestAnimationFrame(tick);
  };
  const stop = () => {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
  };

  // Pause the render loop while the hero is scrolled out of view — no GPU work
  // happens once you've scrolled past it.
  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) start();
      else stop();
    }
  });
  visibility.observe(glowContainer);
  start();
}

// Expose Lucide globally for dynamic content
window.lucide = { createIcons, icons };

// Initialize header icons immediately
createIcons({ icons });

// Initialize blog (this will call createIcons again after rendering blog content)
initBlog();
