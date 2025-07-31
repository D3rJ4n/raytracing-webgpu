import * as THREE from 'three'
import type { Ray } from './ray'

export class Sphere {
    center: THREE.Vector3
    radius: number

    constructor(center: THREE.Vector3, radius: number) {
        this.center = center
        this.radius = radius
    }

    /**
   * Prüft, ob der Ray die Kugel schneidet.
   * Gibt den kleinsten gültigen t-Wert zurück oder null, wenn kein Treffer.
   */
    intersect(ray: Ray): number | null {
        const oc = ray.origin.clone().sub(this.center)

        const a = ray.direction.dot(ray.direction)
        const b = 2.0 * oc.dot(ray.direction)
        const c = oc.dot(oc) - this.radius * this.radius

        const discriminant = b * b - 4 * a * c

        if (discriminant < 0) {
            return null // kein Schnittpunkt
        } else {
            const sqrtD = Math.sqrt(discriminant)
            const t1 = (-b - sqrtD) / (2.0 * a)
            const t2 = (-b + sqrtD) / (2.0 * a)

            // Gültigen t-Wert im Bereich [tMin, tMax] finden
            if (ray.checkT(t1)) return t1
            if (ray.checkT(t2)) return t2
            return null
        }
    }
}