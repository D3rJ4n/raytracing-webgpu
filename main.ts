import * as THREE from 'three'
import { Camera } from './raytracing-webgpu/src/core/Camera'
import { Sphere } from './raytracing-webgpu/src/core/Sphere'
import { createScene } from './raytracing-webgpu/src/scene'


const { scene, camera: threeCamera, sphere: sphereMesh } = createScene()
const canvas = document.getElementById('rayCanvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const width = canvas.width
const height = canvas.height

// Unsere eigene Kamera + Kugel
const rtCamera = new Camera(
    threeCamera.position.clone(),
    new THREE.Vector3(0, 0, -1),
    45,
    width / height
)

const rtSphere = new Sphere(sphereMesh.position.clone(), 1)

// Raytracing
const image = ctx.createImageData(width, height)
const pixels = image.data

/*
console.log("Raytracing gestartet")
console.log("Canvasgröße:", width, height)
console.log("Kugelmittelpunkt:", rtSphere.center.toArray())
console.log("Kugelradius:", rtSphere.radius)
console.log("Kameraposition:", rtCamera.position.toArray())
*/

let i = 0
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const u = x / width
        const v = 1 - y / height

        const ray = rtCamera.getRay(u, v)
        const t = rtSphere.intersect(ray)
        /*
        if (x === width / 2 && y === height / 2) {
            console.log("Ray direction (Mitte):", ray.direction.toArray())
        }


        if (x === width / 2 && y === height / 2) {
            console.log(">> Ray für Bildmitte:")
            console.log("u, v:", u.toFixed(3), v.toFixed(3))
            console.log("Ray origin:", ray.origin.toArray())
            console.log("Ray direction:", ray.direction.toArray())
        }
*/
        const color = t !== null ? 255 : 0
        pixels[i++] = color // R
        pixels[i++] = color // G
        pixels[i++] = color // B
        pixels[i++] = 255   // A

        if (t !== null) {
            console.log(`Treffer bei Pixel (${x}, ${y}), t = ${t.toFixed(3)}`)
        }

    }
}

ctx.putImageData(image, 0, 0)
