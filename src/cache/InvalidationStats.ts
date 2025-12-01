export interface InvalidationResult {
    pixelsInvalidated: number;
    regionsInvalidated: number;
    invalidationTime: number;
    cameraInvalidation: boolean;
}

export interface InvalidationStatistics {
    totalInvalidations: number;
    totalPixelsInvalidated: number;
    averagePixelsPerInvalidation: number;
    lastPixelsInvalidated: number;
}

export class InvalidationStats {
    private stats = {
        totalInvalidations: 0,
        totalPixelsInvalidated: 0,
        lastPixelsInvalidated: 0
    };

    constructor() { }

    /**
     * Invalidierung aufzeichnen
     */
    public recordInvalidation(result: InvalidationResult): void {
        this.stats.totalInvalidations++;
        this.stats.totalPixelsInvalidated += result.pixelsInvalidated;
        this.stats.lastPixelsInvalidated = result.pixelsInvalidated;
    }

    /**
     * Aktuelle Statistiken abrufen
     */
    public getStats(): InvalidationStatistics {
        return {
            totalInvalidations: this.stats.totalInvalidations,
            totalPixelsInvalidated: this.stats.totalPixelsInvalidated,
            averagePixelsPerInvalidation: this.stats.totalInvalidations > 0
                ? this.stats.totalPixelsInvalidated / this.stats.totalInvalidations
                : 0,
            lastPixelsInvalidated: this.stats.lastPixelsInvalidated
        };
    }

    /**
     * Statistiken zurücksetzen
     */
    public reset(): void {
        this.stats = {
            totalInvalidations: 0,
            totalPixelsInvalidated: 0,
            lastPixelsInvalidated: 0
        };
    }

    /**
     * Cleanup
     */
    public cleanup(): void {
        this.reset();
    }
}