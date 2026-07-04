// Smallest possible sketch: a bare update(elapsed) that lets the manager own
// the render loop. Good starting template for a non-shader visualization — add
// meshes to `scene`, animate them in the returned callback.

import * as THREE from "three";

export function spinningCube({ scene, camera }) {
  camera.position.z = 4;

  const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  const material = new THREE.MeshNormalMaterial();
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  return (elapsed) => {
    cube.rotation.x = elapsed * 0.6;
    cube.rotation.y = elapsed * 0.8;
  };
}
