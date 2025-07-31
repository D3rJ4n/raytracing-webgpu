import * as THREE from 'three'

export class Ray {
    origin: THREE.Vector3
    direction: THREE.Vector3
    tMin: number
    tMax: number

    constructor(origin: THREE.Vector3, direction: THREE.Vector3, tMin = 0.1, tMax = Infinity) {
        this.origin = origin
        this.direction = direction.normalize()
        this.tMin = tMin
        this.tMax = tMax
    }

    /**
     * Gibt den Punkt auf dem Ray bei Parameter t zurück: p(t) = origin + t * direction
     */
    at(t: number): THREE.Vector3 | null {
        if (this.checkT(t)) {
            return this.origin.clone().add(this.direction.clone().multiplyScalar(t))
        }
        return null
    }

    /**
     * Prüft, ob t im gültigen Bereich [tMin, tMax] liegt
     */
    checkT(t: number): boolean {
        return t >= this.tMin && t <= this.tMax
    }
}
