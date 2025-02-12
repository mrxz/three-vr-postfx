import * as THREE from 'three';
import { Timer } from 'three/addons/misc/Timer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { UnrealBloomEffect } from '@fern-solutions/three-vr-postfx';

// Setup Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 2.0);

const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 'red', emissive: 'red', emissiveIntensity: 0.02 }))
scene.add(cube);

const light = new THREE.DirectionalLight('white', 2.5);
light.position.set(2, 4, 3);
scene.add(light);

const renderer = new THREE.WebGLRenderer();
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

// UnrealBloom Effect
const unrealBloomEffect = new UnrealBloomEffect(undefined, 1.0, 0.0, 0.1);

const resize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  unrealBloomEffect.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', () => resize())
resize();

const timer = new Timer();
renderer.setAnimationLoop((timestamp) => {
    // Update
    timer.update(timestamp);
    controls.update(timer.getDelta());

    //renderer.render(scene, camera);
    unrealBloomEffect.render(renderer, scene, camera);
});
