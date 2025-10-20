import { Logger } from '../../utils/Logger';

export interface CameraState {
    position: { x: number; y: number; z: number };
    lookAt: { x: number; y: number; z: number };
    fov: number;
    aspect: number;
}

export interface SpherePosition {
    x: number;
    y: number;
    z: number;
}

export class GeometryMovementTracker {
    private logger: Logger;

    // Kamera-Tracking
    private lastCameraState: CameraState | null = null;
    private cameraMovementThreshold: number = 0.001; // Minimale Bewegung um als "bewegt" zu gelten

    // Sphere-Tracking
    private lastSpherePositions: Map<number, SpherePosition> = new Map();
    private sphereMovementThreshold: number = 0.001;

    // Statistiken
    private stats = {
        cameraMovements: 0,
        sphereMovements: 0,
        totalFramesTracked: 0,
        averageMovedSpheresPerFrame: 0
    };

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * Kamera-Daten aktualisieren und Bewegung erkennen
     */
    public updateCameraData(cameraData: Float32Array): boolean {
        const currentState = this.extractCameraState(cameraData);
        const hasChanged = this.hasCameraChanged(currentState);

        if (hasChanged) {
            this.stats.cameraMovements++;
            this.logger.cache(`Kamera-Bewegung erkannt (Frame ${this.stats.totalFramesTracked})`);
        }

        this.lastCameraState = currentState;
        return hasChanged;
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

                if (lastPosition) {
                    // Nur prüfen wenn wir eine vorherige Position haben
                    if (this.hasSphereMovedSignificantly(lastPosition, currentPosition)) {
                        movedSpheres.push(i);
                    }
                }
                // IMMER die aktuelle Position speichern (auch beim ersten Mal)
                this.lastSpherePositions.set(i, { ...currentPosition });
            }
        }

        if (movedSpheres.length > 0) {
            this.stats.sphereMovements += movedSpheres.length;
            this.updateAverageMovedSpheres(movedSpheres.length);

            this.logger.cache(
                `Sphere-Bewegung: ${movedSpheres.length} Objekte ` +
                `(${movedSpheres.slice(0, 5).join(', ')}${movedSpheres.length > 5 ? '...' : ''})`
            );
        }

        this.stats.totalFramesTracked++;
        return movedSpheres;
    }

    /**
     * Kamera-State aus Float32Array extrahieren
     */
    private extractCameraState(cameraData: Float32Array): CameraState {
        // Basierend auf deinem Camera Buffer Layout
        return {
            position: {
                x: cameraData[0],
                y: cameraData[1],
                z: cameraData[2]
            },
            lookAt: {
                x: cameraData[4],
                y: cameraData[5],
                z: cameraData[6]
            },
            fov: 1.0472, // 60 Grad in Radiant - aus Constants
            aspect: 1.0  // Wird separat berechnet
        };
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
        };
    }

    /**
     * Prüfen ob sich Kamera signifikant bewegt hat
     */
    private hasCameraChanged(currentState: CameraState): boolean {
        if (!this.lastCameraState) {
            return true; // Erste Initialisierung
        }

        const positionChanged = this.distance3D(
            this.lastCameraState.position,
            currentState.position
        ) > this.cameraMovementThreshold;

        const lookAtChanged = this.distance3D(
            this.lastCameraState.lookAt,
            currentState.lookAt
        ) > this.cameraMovementThreshold;

        const fovChanged = Math.abs(
            this.lastCameraState.fov - currentState.fov
        ) > this.cameraMovementThreshold;

        return positionChanged || lookAtChanged || fovChanged;
    }

    /**
     * Prüfen ob sich Sphere signifikant bewegt hat
     */
    private hasSphereMovedSignificantly(oldPos: SpherePosition, newPos: SpherePosition): boolean {
        const distance = this.distance3D(oldPos, newPos);
        return distance > this.sphereMovementThreshold;
    }

    /**
     * 3D Distanz zwischen zwei Punkten berechnen
     */
    private distance3D(
        a: { x: number; y: number; z: number },
        b: { x: number; y: number; z: number }
    ): number {
        return Math.sqrt(
            Math.pow(a.x - b.x, 2) +
            Math.pow(a.y - b.y, 2) +
            Math.pow(a.z - b.z, 2)
        );
    }

    /**
     * Durchschnittliche bewegte Spheres pro Frame aktualisieren
     */
    private updateAverageMovedSpheres(movedCount: number): void {
        const totalFrames = this.stats.totalFramesTracked + 1;
        this.stats.averageMovedSpheresPerFrame =
            (this.stats.averageMovedSpheresPerFrame * (totalFrames - 1) + movedCount) / totalFrames;
    }

    /**
     * Letzte Position einer Sphere abrufen
     */
    public getLastPosition(sphereIndex: number): SpherePosition | undefined {
        return this.lastSpherePositions.get(sphereIndex);
    }

    /**
     * Bewegungs-Thresholds konfigurieren
     */
    public setMovementThresholds(camera: number, sphere: number): void {
        this.cameraMovementThreshold = camera;
        this.sphereMovementThreshold = sphere;

        this.logger.cache(
            `Bewegungs-Thresholds: Kamera=${camera}, Sphere=${sphere}`
        );
    }

    /**
     * Bewegungs-Statistiken abrufen
     */
    public getStats() {
        return {
            ...this.stats,
            trackedSpheres: this.lastSpherePositions.size,
            hasInitialCameraState: this.lastCameraState !== null
        };
    }

    /**
     * Detaillierte Bewegungs-Info für Debugging
     */
    public getMovementInfo(): {
        cameraState: CameraState | null;
        trackedSphereCount: number;
        recentMovements: {
            cameraMovements: number;
            sphereMovements: number;
            averageMovedPerFrame: number;
        };
    } {
        return {
            cameraState: this.lastCameraState,
            trackedSphereCount: this.lastSpherePositions.size,
            recentMovements: {
                cameraMovements: this.stats.cameraMovements,
                sphereMovements: this.stats.sphereMovements,
                averageMovedPerFrame: this.stats.averageMovedSpheresPerFrame
            }
        };
    }

    /**
     * Spezifische Sphere-Position setzen (für manuelle Updates)
     */
    public setSpherePosition(sphereIndex: number, position: SpherePosition): void {
        this.lastSpherePositions.set(sphereIndex, { ...position });
    }

    /**
     * Alle getrackte Positionen löschen (bei Scene-Reset)
     */
    public clearAllPositions(): void {
        this.lastSpherePositions.clear();
        this.lastCameraState = null;

        this.logger.cache('Alle getrackten Positionen gelöscht');
    }

    /**
     * Statistiken zurücksetzen
     */
    public reset(): void {
        this.stats = {
            cameraMovements: 0,
            sphereMovements: 0,
            totalFramesTracked: 0,
            averageMovedSpheresPerFrame: 0
        };

        this.logger.cache('MovementTracker Statistiken zurückgesetzt');
    }

    /**
     * Cleanup
     */
    public cleanup(): void {
        this.lastSpherePositions.clear();
        this.lastCameraState = null;

        this.logger.cache('MovementTracker aufgeräumt');
    }
}