import { Logger } from '../utils/Logger';

export interface SpherePosition {
    x: number;
    y: number;
    z: number;
}

export class GeometryMovementTracker {
    private logger: Logger;
    private lastSpherePositions: Map<number, SpherePosition> = new Map();
    private sphereMovementThreshold: number = 0.001;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * Sphere-Daten aktualisieren und bewegte Spheres erkennen
     */
    public updateSpheresData(spheresData: Float32Array): number[] {
        const movedSpheres: number[] = [];
        const sphereCount = Math.floor(spheresData.length / 8);

        for (let i = 0; i < sphereCount; i++) {
            const currentPosition = this.extractSpherePosition(spheresData, i);

            if (currentPosition) {
                const lastPosition = this.lastSpherePositions.get(i);

                if (lastPosition && this.hasSphereMovedSignificantly(lastPosition, currentPosition)) {
                    movedSpheres.push(i);
                }

                this.lastSpherePositions.set(i, { ...currentPosition });
            }
        }

        return movedSpheres;
    }

    /**
     * Sphere-Position aus Float32Array extrahieren
     */
    private extractSpherePosition(spheresData: Float32Array, sphereIndex: number): SpherePosition | null {
        const offset = sphereIndex * 8;

        if (offset + 2 >= spheresData.length) {
            return null;
        }

        return {
            x: spheresData[offset + 0],
            y: spheresData[offset + 1],
            z: spheresData[offset + 2]
        };//optimierung in arbeit erwähnen 
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
    }

    /**
     * Cleanup
     */
    public cleanup(): void {
        this.lastSpherePositions.clear();
    }
}