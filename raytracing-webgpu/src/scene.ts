import * as THREE from 'three'

export function createScene() {
    const scene = new THREE.Scene()

    // Kamera (nicht unsere Raytracer-Kamera)
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
    camera.position.set(0, 0, 0)

    // Kugel in der Szene
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32)
    const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 })
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    sphere.position.set(0, 0, -5)
    scene.add(sphere)

    // Licht
    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.set(5, 5, 0)
    scene.add(light)

    // Debug-Hilfen (optional)
    scene.add(new THREE.GridHelper(10, 10))
    scene.add(new THREE.AxesHelper(5))

    return { scene, camera, sphere }
}
