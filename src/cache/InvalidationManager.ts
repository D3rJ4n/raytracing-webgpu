// FIXED InvalidationManager.ts - Einfache aber funktionierende Version

import { Logger } from '../utils/Logger';

export interface InvalidationResult {
    pixelsInvalidated: number;
    regionsInvalidated: number;
    invalidationTime: number;
    cameraInvalidation: boolean;
}

export class GeometryInvalidationManager {
    private device: GPUDevice;
    private cacheBuffer: GPUBuffer;
    private canvasWidth: number;
    private canvasHeight: number;
    private logger: Logger;

    // Einfaches Tracking für Änderungen
    private lastSphereData: Float32Array | null = null;
    private lastCameraData: Float32Array | null = null;

    // DEBUG
    private debugMode: boolean = true;

    constructor(
        device: GPUDevice,
        cacheBuffer: GPUBuffer,
        canvasWidth: number,
        canvasHeight: number
    ) {
        this.device = device;
        this.cacheBuffer = cacheBuffer;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.logger = Logger.getInstance();

        this.logger.cache('FIXED InvalidationManager initialisiert');
    }

    /**
     * HAUPTMETHODE: Prüfe auf Änderungen und invalidiere bei Bedarf
     */
    public async invalidateForFrame(spheresData: Float32Array, cameraData: Float32Array): Promise<InvalidationResult> {
        const startTime = performance.now();

        if (this.debugMode) {
            this.logger.cache('--- INVALIDATION CHECK START ---');
        }

        // 1. Prüfe ob es das erste Mal ist
        if (!this.lastSphereData || !this.lastCameraData) {
            this.logger.cache('Erste Initialisierung - keine Invalidierung nötig');
            this.lastSphereData = new Float32Array(spheresData);
            this.lastCameraData = new Float32Array(cameraData);

            return {
                pixelsInvalidated: 0,
                regionsInvalidated: 0,
                invalidationTime: performance.now() - startTime,
                cameraInvalidation: false
            };
        }

        // 2. Prüfe Kamera-Änderungen (einfach: alle Werte vergleichen)
        const cameraChanged = this.hasDataChanged(this.lastCameraData, cameraData, 0.001);

        // 3. Prüfe Sphere-Änderungen (nur Positionen, Radius)
        const spheresChanged = this.hasSphereDataChanged(this.lastSphereData, spheresData);

        if (this.debugMode) {
            this.logger.cache(`Kamera geändert: ${cameraChanged ? 'JA' : 'NEIN'}`);
            this.logger.cache(`Spheres geändert: ${spheresChanged ? 'JA' : 'NEIN'}`);
        }

        let result: InvalidationResult;

        if (cameraChanged) {
            // Kamera bewegt → Komplette Invalidierung
            result = await this.invalidateCompleteCache();
            result.cameraInvalidation = true;
            this.logger.cache('KAMERA-BEWEGUNG → Komplette Invalidierung');

        } else if (spheresChanged) {
            // Objekte bewegt → Für jetzt auch komplette Invalidierung
            // (Das ist der sichere Weg bis die selektive Invalidierung debuggt ist)
            result = await this.invalidateCompleteCache();
            result.cameraInvalidation = false;
            this.logger.cache('OBJEKT-BEWEGUNG → Komplette Invalidierung (Safe Mode)');

        } else {
            // Keine Änderung → Keine Invalidierung
            result = {
                pixelsInvalidated: 0,
                regionsInvalidated: 0,
                invalidationTime: performance.now() - startTime,
                cameraInvalidation: false
            };

            if (this.debugMode) {
                this.logger.cache('KEINE ÄNDERUNG → Keine Invalidierung');
            }
        }

        // 4. Aktuelle Daten speichern
        this.lastSphereData = new Float32Array(spheresData);
        this.lastCameraData = new Float32Array(cameraData);

        result.invalidationTime = performance.now() - startTime;

        if (this.debugMode) {
            this.logger.cache(`--- INVALIDATION RESULT: ${result.pixelsInvalidated} pixels, ${result.invalidationTime.toFixed(2)}ms ---`);
        }

        return result;
    }

    /**
     * Prüfe ob Float32Array-Daten sich geändert haben
     */
    private hasDataChanged(oldData: Float32Array, newData: Float32Array, threshold: number = 0.001): boolean {
        if (oldData.length !== newData.length) {
            return true;
        }

        for (let i = 0; i < oldData.length; i++) {
            if (Math.abs(oldData[i] - newData[i]) > threshold) {
                if (this.debugMode) {
                    this.logger.cache(`Änderung bei Index ${i}: ${oldData[i].toFixed(3)} → ${newData[i].toFixed(3)}`);
                }
                return true;
            }
        }

        return false;
    }

    /**
     * Prüfe ob Sphere-Daten sich geändert haben (nur Position + Radius)
     */
    private hasSphereDataChanged(oldData: Float32Array, newData: Float32Array): boolean {
        if (oldData.length !== newData.length) {
            return true;
        }

        const sphereCount = Math.floor(newData.length / 8);

        for (let i = 0; i < sphereCount; i++) {
            const offset = i * 8;

            // Prüfe Position (x, y, z) und Radius
            for (let j = 0; j < 4; j++) { // Nur die ersten 4 Werte: x, y, z, radius
                const oldValue = oldData[offset + j];
                const newValue = newData[offset + j];

                if (Math.abs(oldValue - newValue) > 0.001) {
                    if (this.debugMode) {
                        const component = ['x', 'y', 'z', 'radius'][j];
                        this.logger.cache(`Sphere ${i} ${component}: ${oldValue.toFixed(3)} → ${newValue.toFixed(3)}`);
                    }
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Kompletten Cache invalidieren (sicher aber nicht optimal)
     */
    private async invalidateCompleteCache(): Promise<InvalidationResult> {
        const totalPixels = this.canvasWidth * this.canvasHeight;

        // METHODE 1: Kompletter Cache-Reset
        const cacheData = new Float32Array(totalPixels * 7).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.logger.cache(`Kompletter Cache invalidiert: ${totalPixels.toLocaleString()} Pixel`);

        return {
            pixelsInvalidated: totalPixels,
            regionsInvalidated: 1,
            invalidationTime: 0, // Wird später gesetzt
            cameraInvalidation: false // Wird später gesetzt
        };
    }

    /**
     * Debug-Modus umschalten
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        this.logger.cache(`FIXED InvalidationManager Debug: ${enabled ? 'ON' : 'OFF'}`);
    }

    /**
     * Statistiken (Dummy für Kompatibilität)
     */
    public getStats() {
        return {
            totalInvalidations: 0,
            pixelsInvalidated: 0,
            lastInvalidationTime: 0
        };
    }

    public resetStats(): void {
        this.lastSphereData = null;
        this.lastCameraData = null;
        this.logger.cache('FIXED InvalidationManager Stats zurückgesetzt');
    }

    public cleanup(): void {
        this.lastSphereData = null;
        this.lastCameraData = null;
        this.logger.cache('FIXED InvalidationManager aufgeräumt');
    }
}