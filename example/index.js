import * as THREE from 'three';
import { Timer } from 'three/addons/misc/Timer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { BasicBloomEffect, UnrealBloomEffect, SobelEffect, BlurEffect } from '@fern-solutions/three-vr-postfx';

// Setup Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 2.0);

const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 'red', emissive: 'red', emissiveIntensity: 0.02 }))
scene.add(cube);

const light = new THREE.DirectionalLight('white', 2.5);
light.position.set(2, 4, 3);
scene.add(light);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const controls = new OrbitControls(camera, renderer.domElement);

// Effects
const basicBloomEffect = new BasicBloomEffect();
const unrealBloomEffect = new UnrealBloomEffect(undefined, 1.0, 0.0, 0.1);
const sobelEffect = new SobelEffect();
const blurEffect = new BlurEffect();

const resize = () => {
    if(renderer.xr.isPresenting) {
        return;
    }

    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    basicBloomEffect.setSize(window.innerWidth, window.innerHeight);
    unrealBloomEffect.setSize(window.innerWidth, window.innerHeight);
    sobelEffect.setSize(window.innerWidth, window.innerHeight);
    blurEffect.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', () => resize())
resize();

// Resize when entering/exiting VR
renderer.xr.addEventListener('sessionstart', _ => {
    const size = renderer.getSize(new THREE.Vector2());
    basicBloomEffect.setSize(size.width, size.height);
    unrealBloomEffect.setSize(size.width, size.height);
    sobelEffect.setSize(size.width, size.height);
    blurEffect.setSize(size.width, size.height);
});
renderer.xr.addEventListener('sessionend', _ => resize());

const timer = new Timer();
renderer.setAnimationLoop((timestamp) => {
    // Update
    timer.update(timestamp);
    controls.update(timer.getDelta());

    //renderer.render(scene, camera);
    basicBloomEffect.render(renderer, scene, camera);
    //unrealBloomEffect.render(renderer, scene, camera);
    //sobelEffect.render(renderer, scene, camera);
    //blurEffect.render(renderer, scene, camera);
});
