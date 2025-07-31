import * as THREE from 'three';
import { Ray } from '../core/Ray'

export class Camera {
    position: THREE.Vector3
    lookAt: THREE.Vector3
    angle: number
    aspectRatio: number

    lowerLeftCorner: THREE.Vector3;   // Linker unterer Punkt der Bildebene
    horizontal: THREE.Vector3;        // Vektor, der die Breite der Bildebene beschreibt
    vertical: THREE.Vector3;          // Vektor, der die Höhe der Bildebene beschreibt


    constructor(
        position: THREE.Vector3,
        lookAt: THREE.Vector3,
        angle: number,
        aspectRatio: number
    ) {
        this.position = position
        this.lookAt = lookAt
        this.angle = angle
        this.aspectRatio = aspectRatio

        const radiant: number = this.angle * Math.PI / 180 // conversion into Radiant
        const halfheight: number = Math.tan(radiant / 2)//half height
        const halfWidth: number = this.aspectRatio * halfheight // half Width

        //Blickrichtung berechnen
        const normalLookAt: THREE.Vector3 = this.lookAt.clone().sub(this.position).normalize()
        // right = Kamera-Rechts-Vektor (senkrecht zu forward und Welt-y-Achse)
        const right: THREE.Vector3 = new THREE.Vector3()
            .crossVectors(normalLookAt, new THREE.Vector3(0, 1, 0))
            .normalize();

        // up = Kamera-Hoch-Vektor (senkrecht zu right und forward)
        const up: THREE.Vector3 = new THREE.Vector3()
            .crossVectors(right, normalLookAt)
            .normalize();

        // Position des linken unteren Punkts auf der Bildebene berechnen
        this.lowerLeftCorner = this.position.clone()
            .add(normalLookAt)
            .sub(right.clone().multiplyScalar(halfWidth))
            .sub(up.clone().multiplyScalar(halfheight));

        // Bildebene horizontal und vertikal aufspannen
        this.horizontal = right.multiplyScalar(2 * halfWidth);
        this.vertical = up.multiplyScalar(2 * halfheight);


        // DEBUG:
        console.log("== Kamera-Setup ==")
        console.log("forward:", normalLookAt.toArray())
        console.log("right:", right.toArray())
        console.log("up:", up.toArray())
        console.log("lowerLeftCorner:", this.lowerLeftCorner.toArray())
    }

    /**
      * Erzeugt einen Ray für die Bildebene bei u,v ∈ [0,1].
      * u: Horizontal von links (0) nach rechts (1)
      * v: Vertikal von unten (0) nach oben (1)
      */

    getRay(u: number, v: number): Ray {
        const direction = this.lowerLeftCorner.clone()
            .add(this.horizontal.clone().multiplyScalar(u))
            .add(this.vertical.clone().multiplyScalar(v))
            .sub(this.position)
            .normalize()

        return new Ray(this.position.clone(), direction)
    }

}


