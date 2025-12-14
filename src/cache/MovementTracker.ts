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

export class MovementTracker {
    private logger: Logger;
    private lastSpherePositions: Map<number, SpherePosition> = new Map();
    private lastSphereRadii: Map<number, number> = new Map();
    private lastCameraData: Float32Array | null = null;
    private sphereMovementThreshold: number = 0.00001;
    private cameraMovementThreshold: number = 0.001;

    constructor() {
        this.logger = Logger.getInstance();
    }

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

    public updateSpheresData(spheresData: Float32Array): number[] {
        const movedSpheres: number[] = [];
        const sphereCount = Math.floor(spheresData.length / 8);

        for (let i = 0; i < sphereCount; i++) {
            const currentData = this.extractSphereData(spheresData, i);

            if (currentData) {
                const lastPosition = this.lastSpherePositions.get(i);
                const lastRadius = this.lastSphereRadii.get(i);

                // Debug: Log erste Sphere
                // if (i === 0) {
                //     console.log(`🔍 MovementTracker Sphere 0: current.y=${currentData.position.y.toFixed(3)}, last.y=${lastPosition?.y.toFixed(3) || 'null'}`);
                // }

                if (lastPosition && this.hasSphereMovedSignificantly(lastPosition, currentData.position)) {
                    movedSpheres.push(i);
                    // if (i === 0) console.log(`✅ Sphere 0 als MOVED erkannt!`);
                } else if (lastRadius !== undefined && Math.abs(lastRadius - currentData.radius) > 0.001) {
                    movedSpheres.push(i);
                }

                this.lastSpherePositions.set(i, { ...currentData.position });
                this.lastSphereRadii.set(i, currentData.radius);
            }
        }

        // console.log(`🔍 MovementTracker: ${movedSpheres.length} Spheres moved:`, movedSpheres);
        return movedSpheres;
    }

    public getOldPositions(): Map<number, SpherePosition> {
        return new Map(this.lastSpherePositions);
    }

    private extractSphereData(spheresData: Float32Array, sphereIndex: number): SphereData | null {
        const offset = sphereIndex * 8;
        if (offset + 3 >= spheresData.length) return null;

        return {
            position: {
                x: spheresData[offset + 0],
                y: spheresData[offset + 1],
                z: spheresData[offset + 2]
            },
            radius: spheresData[offset + 3]
        };
    }

    private hasSphereMovedSignificantly(oldPos: SpherePosition, newPos: SpherePosition): boolean {
        const distance = Math.sqrt(
            Math.pow(oldPos.x - newPos.x, 2) +
            Math.pow(oldPos.y - newPos.y, 2) +
            Math.pow(oldPos.z - newPos.z, 2)
        );

        // Debug: Log für Sphere 0
        // if (Math.abs(oldPos.y - newPos.y) < 0.01) {
        //     console.log(`🔍 Distance Check: distance=${distance.toFixed(8)}, threshold=${this.sphereMovementThreshold}, moved=${distance > this.sphereMovementThreshold}`);
        // }

        return distance > this.sphereMovementThreshold;
    }

    public getLastPosition(sphereIndex: number): SpherePosition | undefined {
        return this.lastSpherePositions.get(sphereIndex);
    }

    public clearAllPositions(): void {
        this.lastSpherePositions.clear();
        this.lastSphereRadii.clear();
    }

    public reset(): void {
        this.lastSpherePositions.clear();
        this.lastSphereRadii.clear();
        this.lastCameraData = null;
    }

    public cleanup(): void {
        this.reset();
        this.logger.cache('MovementTracker aufgeräumt');
    }
}
