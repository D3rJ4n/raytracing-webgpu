import { Logger } from '../../utils/Logger';

export interface InvalidationResult {
    pixelsInvalidated: number;
    regionsInvalidated: number;
    invalidationTime: number;
    cameraInvalidation: boolean;
}

export interface InvalidationStatistics {
    totalInvalidations: number;
    totalPixelsInvalidated: number;
    totalRegionsInvalidated: number;
    totalInvalidationTime: number;

    cameraInvalidations: number;
    objectInvalidations: number;

    averagePixelsPerInvalidation: number;
    averageRegionsPerInvalidation: number;
    averageInvalidationTime: number;
    averageInvalidationPercentage: number;

    lastInvalidationTime: number;
    lastPixelsInvalidated: number;
    lastInvalidationPercentage: number;
}

export class GeometryInvalidationStats {
    private logger: Logger;
    private canvasWidth: number = 800;
    private canvasHeight: number = 600;

    private stats = {
        totalInvalidations: 0,
        totalPixelsInvalidated: 0,
        totalRegionsInvalidated: 0,
        totalInvalidationTime: 0,

        cameraInvalidations: 0,
        objectInvalidations: 0,

        lastInvalidationTime: 0,
        lastPixelsInvalidated: 0
    };

    // Rolling averages für Performance-Monitoring
    private recentInvalidations: InvalidationResult[] = [];
    private maxRecentHistory: number = 20;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * Canvas-Dimensionen setzen für Prozentberechnung
     */
    public setCanvasDimensions(width: number, height: number): void {
        this.canvasWidth = width;
        this.canvasHeight = height;
    }

    /**
     * Invalidierung aufzeichnen
     */
    public recordInvalidation(result: InvalidationResult): void {
        // Grundstatistiken aktualisieren
        this.stats.totalInvalidations++;
        this.stats.totalPixelsInvalidated += result.pixelsInvalidated;
        this.stats.totalRegionsInvalidated += result.regionsInvalidated;
        this.stats.totalInvalidationTime += result.invalidationTime;

        this.stats.lastInvalidationTime = result.invalidationTime;
        this.stats.lastPixelsInvalidated = result.pixelsInvalidated;

        // Typ-spezifische Statistiken
        if (result.cameraInvalidation) {
            this.stats.cameraInvalidations++;
        } else {
            this.stats.objectInvalidations++;
        }

        // Rolling History für Trends
        this.recentInvalidations.push(result);
        if (this.recentInvalidations.length > this.maxRecentHistory) {
            this.recentInvalidations.shift();
        }

        // Logging nur für signifikante Invalidierungen
        if (result.pixelsInvalidated > 1000 || result.cameraInvalidation) {
            const percentage = this.calculatePixelPercentage(result.pixelsInvalidated);
            this.logger.cache(
                `Invalidierung #${this.stats.totalInvalidations}: ` +
                `${result.pixelsInvalidated.toLocaleString()} Pixel (${percentage.toFixed(2)}%) ` +
                `in ${result.invalidationTime.toFixed(2)}ms`
            );
        }
    }

    /**
     * Aktuelle Statistiken abrufen
     */
    public getStats(): InvalidationStatistics {
        const totalPixels = this.canvasWidth * this.canvasHeight;

        return {
            totalInvalidations: this.stats.totalInvalidations,
            totalPixelsInvalidated: this.stats.totalPixelsInvalidated,
            totalRegionsInvalidated: this.stats.totalRegionsInvalidated,
            totalInvalidationTime: this.stats.totalInvalidationTime,

            cameraInvalidations: this.stats.cameraInvalidations,
            objectInvalidations: this.stats.objectInvalidations,

            averagePixelsPerInvalidation: this.stats.totalInvalidations > 0
                ? this.stats.totalPixelsInvalidated / this.stats.totalInvalidations
                : 0,
            averageRegionsPerInvalidation: this.stats.totalInvalidations > 0
                ? this.stats.totalRegionsInvalidated / this.stats.totalInvalidations
                : 0,
            averageInvalidationTime: this.stats.totalInvalidations > 0
                ? this.stats.totalInvalidationTime / this.stats.totalInvalidations
                : 0,
            averageInvalidationPercentage: this.stats.totalInvalidations > 0
                ? (this.stats.totalPixelsInvalidated / this.stats.totalInvalidations / totalPixels) * 100
                : 0,

            lastInvalidationTime: this.stats.lastInvalidationTime,
            lastPixelsInvalidated: this.stats.lastPixelsInvalidated,
            lastInvalidationPercentage: this.calculatePixelPercentage(this.stats.lastPixelsInvalidated)
        };
    }

    /**
     * Trend-Analyse der letzten Invalidierungen
     */
    public getRecentTrends(): {
        recentAveragePixels: number;
        recentAverageTime: number;
        recentAveragePercentage: number;
        cameraInvalidationRatio: number;
        efficiencyTrend: 'improving' | 'stable' | 'degrading';
    } {
        if (this.recentInvalidations.length === 0) {
            return {
                recentAveragePixels: 0,
                recentAverageTime: 0,
                recentAveragePercentage: 0,
                cameraInvalidationRatio: 0,
                efficiencyTrend: 'stable'
            };
        }

        const recent = this.recentInvalidations;
        const recentPixels = recent.reduce((sum, inv) => sum + inv.pixelsInvalidated, 0) / recent.length;
        const recentTime = recent.reduce((sum, inv) => sum + inv.invalidationTime, 0) / recent.length;
        const recentPercentage = this.calculatePixelPercentage(recentPixels);

        const cameraInvalidations = recent.filter(inv => inv.cameraInvalidation).length;
        const cameraRatio = cameraInvalidations / recent.length;

        // Trend-Analyse: Vergleiche erste Hälfte mit zweiter Hälfte
        const efficiencyTrend = this.calculateEfficiencyTrend(recent);

        return {
            recentAveragePixels: recentPixels,
            recentAverageTime: recentTime,
            recentAveragePercentage: recentPercentage,
            cameraInvalidationRatio: cameraRatio,
            efficiencyTrend: efficiencyTrend
        };
    }

    /**
     * Effizienz-Bewertung
     */
    public getEfficiencyRating(): {
        rating: 'excellent' | 'good' | 'fair' | 'poor';
        message: string;
        recommendations: string[];
    } {
        const stats = this.getStats();
        const trends = this.getRecentTrends();
        const recommendations: string[] = [];

        // Bewertung basierend auf durchschnittlicher Invalidierung
        let rating: 'excellent' | 'good' | 'fair' | 'poor';
        let message: string;

        if (trends.recentAveragePercentage < 2.0) {
            rating = 'excellent';
            message = 'Cache-Invalidierung sehr effizient (<2% pro Frame)';
        } else if (trends.recentAveragePercentage < 5.0) {
            rating = 'good';
            message = 'Cache-Invalidierung effizient (<5% pro Frame)';
        } else if (trends.recentAveragePercentage < 15.0) {
            rating = 'fair';
            message = 'Cache-Invalidierung akzeptabel (<15% pro Frame)';
            recommendations.push('Prüfe Bewegungs-Patterns auf Optimierungspotential');
        } else {
            rating = 'poor';
            message = 'Cache-Invalidierung ineffizient (>15% pro Frame)';
            recommendations.push('Reduziere Objekt-Bewegungen oder optimiere Invalidierungs-Algorithmus');
            recommendations.push('Prüfe ob zu viele Kamera-Bewegungen stattfinden');
        }

        // Spezifische Empfehlungen
        if (trends.cameraInvalidationRatio > 0.5) {
            recommendations.push('Viele Kamera-Bewegungen erkannt - reduziere Kamera-Updates für bessere Performance');
        }

        if (trends.efficiencyTrend === 'degrading') {
            recommendations.push('Invalidierungs-Effizienz verschlechtert sich - analysiere aktuelle Bewegungs-Patterns');
        }

        if (stats.averageRegionsPerInvalidation > 10) {
            recommendations.push('Viele kleine Regionen - erwäge Region-Zusammenführung');
        }

        return { rating, message, recommendations };
    }

    /**
     * Detaillierte Statistiken für Debugging
     */
    public logDetailedStats(): void {
        const stats = this.getStats();
        const trends = this.getRecentTrends();
        const efficiency = this.getEfficiencyRating();

        console.log('\n' + '='.repeat(70));
        console.log('📊 CACHE-INVALIDIERUNG STATISTIKEN');
        console.log('='.repeat(70));
        console.log(`Gesamt Invalidierungen:    ${stats.totalInvalidations.toLocaleString()}`);
        console.log(`Gesamt Pixel invalidiert:  ${stats.totalPixelsInvalidated.toLocaleString()}`);
        console.log(`Gesamt Regionen:           ${stats.totalRegionsInvalidated.toLocaleString()}`);
        console.log(`Gesamt Zeit:               ${stats.totalInvalidationTime.toFixed(2)}ms`);
        console.log('');
        console.log('--- DURCHSCHNITTSWERTE ---');
        console.log(`Ø Pixel pro Invalidierung: ${stats.averagePixelsPerInvalidation.toFixed(0)}`);
        console.log(`Ø Regionen pro Inv.:       ${stats.averageRegionsPerInvalidation.toFixed(1)}`);
        console.log(`Ø Zeit pro Invalidierung:  ${stats.averageInvalidationTime.toFixed(2)}ms`);
        console.log(`Ø Invalidierung:           ${stats.averageInvalidationPercentage.toFixed(2)}%`);
        console.log('');
        console.log('--- INVALIDIERUNGS-TYPEN ---');
        console.log(`Kamera-Invalidierungen:    ${stats.cameraInvalidations} (${(stats.cameraInvalidations / stats.totalInvalidations * 100).toFixed(1)}%)`);
        console.log(`Objekt-Invalidierungen:    ${stats.objectInvalidations} (${(stats.objectInvalidations / stats.totalInvalidations * 100).toFixed(1)}%)`);
        console.log('');
        console.log('--- AKTUELLE TRENDS ---');
        console.log(`Aktuelle Ø Pixel:         ${trends.recentAveragePixels.toFixed(0)}`);
        console.log(`Aktuelle Ø Zeit:          ${trends.recentAverageTime.toFixed(2)}ms`);
        console.log(`Aktuelle Ø Prozent:       ${trends.recentAveragePercentage.toFixed(2)}%`);
        console.log(`Kamera-Invalidierung:      ${(trends.cameraInvalidationRatio * 100).toFixed(1)}%`);
        console.log(`Effizienz-Trend:           ${trends.efficiencyTrend}`);
        console.log('');
        console.log('--- BEWERTUNG ---');
        console.log(`Rating: ${efficiency.rating.toUpperCase()}`);
        console.log(`${efficiency.message}`);
        if (efficiency.recommendations.length > 0) {
            console.log('\nEmpfehlungen:');
            efficiency.recommendations.forEach((rec, i) => {
                console.log(`  ${i + 1}. ${rec}`);
            });
        }
        console.log('='.repeat(70));
    }

    /**
     * Pixel-Prozentsatz berechnen
     */
    private calculatePixelPercentage(pixels: number): number {
        const totalPixels = this.canvasWidth * this.canvasHeight;
        return totalPixels > 0 ? (pixels / totalPixels) * 100 : 0;
    }

    /**
     * Effizienz-Trend berechnen
     */
    private calculateEfficiencyTrend(invalidations: InvalidationResult[]): 'improving' | 'stable' | 'degrading' {
        if (invalidations.length < 4) return 'stable';

        const mid = Math.floor(invalidations.length / 2);
        const firstHalf = invalidations.slice(0, mid);
        const secondHalf = invalidations.slice(mid);

        const firstAvg = firstHalf.reduce((sum, inv) => sum + inv.pixelsInvalidated, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, inv) => sum + inv.pixelsInvalidated, 0) / secondHalf.length;

        const change = (secondAvg - firstAvg) / firstAvg;

        if (change < -0.1) return 'improving';  // 10% Verbesserung
        if (change > 0.1) return 'degrading';  // 10% Verschlechterung
        return 'stable';
    }

    /**
     * Statistiken zurücksetzen
     */
    public reset(): void {
        this.stats = {
            totalInvalidations: 0,
            totalPixelsInvalidated: 0,
            totalRegionsInvalidated: 0,
            totalInvalidationTime: 0,
            cameraInvalidations: 0,
            objectInvalidations: 0,
            lastInvalidationTime: 0,
            lastPixelsInvalidated: 0
        };

        this.recentInvalidations = [];
        this.logger.cache('InvalidationStats zurückgesetzt');
    }

    /**
     * Cleanup
     */
    public cleanup(): void {
        this.recentInvalidations = [];
        this.logger.cache('InvalidationStats aufgeräumt');
    }
}