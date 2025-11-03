import { Logger } from '../utils/Logger';

export interface SpherePosition {
    x: number;
    y: number;
    z: number;
}

export interface SphereData {
    position: SpherePosition;
    radius: number;
}

export class GeometryMovementTracker {
    private logger: Logger;
    private lastSpherePositions: Map<number, SpherePosition> = new Map();
    private lastSphereRadii: Map<number, number> = new Map();
    private lastCameraData: Float32Array | null = null;
    private sphereMovementThreshold: number = 0.001;
    private cameraMovementThreshold: number = 0.001;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * Kamera-Daten aktualisieren und Änderung erkennen
     */
    public updateCameraData(cameraData: Float32Array): boolean {
        if (!this.lastCameraData) {
            this.lastCameraData = new Float32Array(cameraData);
            return false;
        }

        let changed = false;
        for (let i = 0; i < Math.min(cameraData.length, this.lastCameraData.length); i++) {
            if (Math.abs(cameraData[i] - this.lastCameraData[i]) > this.cameraMovementThreshold) {
                changed = true;
                break;
            }
        }

        this.lastCameraData = new Float32Array(cameraData);
        return changed;
    }

    /**
     * Sphere-Daten aktualisieren und bewegte Spheres erkennen
     */
    public updateSpheresData(spheresData: Float32Array): number[] {
        const movedSpheres: number[] = [];
        const sphereCount = Math.floor(spheresData.length / 8);

        for (let i = 0; i < sphereCount; i++) {
            const currentData = this.extractSphereData(spheresData, i);

            if (currentData) {
                const lastPosition = this.lastSpherePositions.get(i);
                const lastRadius = this.lastSphereRadii.get(i);

                if (lastPosition && this.hasSphereMovedSignificantly(lastPosition, currentData.position)) {
                    movedSpheres.push(i);
                } else if (lastRadius !== undefined && Math.abs(lastRadius - currentData.radius) > 0.001) {
                    movedSpheres.push(i);
                }

                this.lastSpherePositions.set(i, { ...currentData.position });
                this.lastSphereRadii.set(i, currentData.radius);
            }
        }

        return movedSpheres;
    }

    /**
     * Sphere-Daten (Position + Radius) aus Float32Array extrahieren
     */
    private extractSphereData(spheresData: Float32Array, sphereIndex: number): SphereData | null {
        const offset = sphereIndex * 8;

        if (offset + 3 >= spheresData.length) {
            return null;
        }

        return {
            position: {
                x: spheresData[offset + 0],
                y: spheresData[offset + 1],
                z: spheresData[offset + 2]
            },
            radius: spheresData[offset + 3]
        };
    }

    /**
     * Prüfen ob sich Sphere signifikant bewegt hat
     */
    private hasSphereMovedSignificantly(oldPos: SpherePosition, newPos: SpherePosition): boolean {
        const distance = Math.sqrt(
            Math.pow(oldPos.x - newPos.x, 2) +
            Math.pow(oldPos.y - newPos.y, 2) +
            Math.pow(oldPos.z - newPos.z, 2)
        );
        return distance > this.sphereMovementThreshold;
    }

    /**
     * Letzte Position einer Sphere abrufen
     */
    public getLastPosition(sphereIndex: number): SpherePosition | undefined {
        return this.lastSpherePositions.get(sphereIndex);
    }

    /**
     * Alle getrackte Positionen löschen
     */
    public clearAllPositions(): void {
        this.lastSpherePositions.clear();
        this.lastSphereRadii.clear();
    }

    /**
     * Stats zurücksetzen
     */
    public reset(): void {
        this.lastSpherePositions.clear();
        this.lastSphereRadii.clear();
        this.lastCameraData = null;
    }

    /**
     * Cleanup
     */
    public cleanup(): void {
        this.reset();
        this.logger.cache('MovementTracker aufgeräumt');
    }
}