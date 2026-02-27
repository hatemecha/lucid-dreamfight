// renderer.js – sets up Three.js scene, camera, simple view‑model weapon, and FOV controls
// This is a minimal implementation just to demonstrate a proper first‑person viewmodel.

import * as THREE from 'three';

// Global objects
let scene, camera, renderer;
let weaponMesh;
let yaw = 0; // rotation around Y axis
let pitch = 0; // rotation around X axis (limited)
let targetFov = 90; // default FOV

// Settings
const EYE_HEIGHT = 1.6; // player eye height (meters)
const SENSITIVITY = 0.002;
const MIN_FOV = 60;
const MAX_FOV = 110;

function init() {
    const canvas = document.getElementById('app');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090d);

    // Perspective camera – the viewmodel camera (first‑person)
    camera = new THREE.PerspectiveCamera(targetFov, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, EYE_HEIGHT, 0);
    scene.add(camera);

    // Simple weapon – a box as placeholder. It is attached to the camera so it moves with the view.
    const geom = new THREE.BoxGeometry(0.3, 0.2, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    weaponMesh = new THREE.Mesh(geom, mat);
    // Position weapon a bit in front of the camera (view‑model space)
    weaponMesh.position.set(0.2, -0.2, -0.8);
    // Slight tilt for a classic FPS feel
    weaponMesh.rotation.set(0.2, 0, 0);
    camera.add(weaponMesh);
    scene.add(camera);

    // Light – simple ambient + directional
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 2);
    scene.add(dir);

    // Event listeners for mouse look and FOV wheel
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel);
    window.addEventListener('resize', onResize);

    animate();
}

function onMouseMove(event) {
    // Only rotate when pointer is locked (default behavior for FPS controls)
    if (document.pointerLockElement !== document.body) return;
    yaw   -= event.movementX * SENSITIVITY;
    pitch -= event.movementY * SENSITIVITY;
    // Clamp pitch to avoid flipping
    const limit = Math.PI / 2 - 0.1;
    pitch = Math.max(-limit, Math.min(limit, pitch));
    updateCameraRotation();
}

function updateCameraRotation() {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
}

function onWheel(event) {
    // Simple FOV zoom (mouse wheel). Positive delta = zoom out.
    targetFov += event.deltaY * 0.05;
    targetFov = Math.max(MIN_FOV, Math.min(MAX_FOV, targetFov));
    // Update projection matrix smoothly
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    // Here you could sync the camera position with the player character.
    // For this demo we keep the camera at (0, EYE_HEIGHT, 0).
    renderer.render(scene, camera);
}

// Request pointer lock on click (common FPS behaviour)
window.addEventListener('click', () => {
    if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
    }
});

// Export init so that other scripts (if any) can call it after the DOM is ready.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { scene, camera, renderer, weaponMesh };