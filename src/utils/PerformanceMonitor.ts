import { Logger } from './Logger';

/**
 * 📊 PerformanceMonitor - Performance Tracking & Display
 * 
 * Überwacht und zeigt:
 * - Frame-Zeit (min, max, average)
 * - FPS (Frames per Second)
 * - Cache Hit Rate
 * - Live-Display im UI
 */
export class PerformanceMonitor {
    private logger: Logger;

    // ===== PERFORMANCE DATEN =====
    private frameTimes: number[] = [];
    private maxFrameHistory: number = 60;

    private cacheHitRate: number = 0;
    private lastCacheStats: {
        totalPixels: number;
        cacheHits: number;
        cacheMisses: number;
        hitRate: number;
    } | null = null;

    // ===== UI DISPLAY =====
    private displayElement: HTMLDivElement | null = null;
    private isDisplayVisible: boolean = true;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * 🚀 Performance Monitor initialisieren
     */
    public initialize(): void {
        this.createDisplayElement();
        this.logger.init('Performance Monitor initialisiert');
    }

    /**
     * 🎨 Display-Element erstellen
     */
    private createDisplayElement(): void {
        // Suche nach existierendem Element in der HTML
        let existingElement = document.getElementById('performance-stats');

        if (existingElement) {
            this.displayElement = existingElement as HTMLDivElement;
        } else {
            // Fallback: Element erstellen falls nicht in HTML vorhanden
            this.displayElement = document.createElement('div');
            this.displayElement.id = 'performance-stats';
            this.displayElement.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.8);
                color: #00ff00;
                padding: 15px;
                border-radius: 8px;
                font-family: 'Courier New', monospace;
                font-size: 14px;
                z-index: 1000;
                min-width: 250px;
                display: block;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            `;
            document.body.appendChild(this.displayElement);
        }
    }

    /**
     * ⏱️ Frame-Zeit aufzeichnen
     */
    public recordFrameTime(frameTime: number): void {
        // Filter: Nur Werte > 0 aufzeichnen (0ms ist unrealistisch)
        if (frameTime > 0) {
            this.frameTimes.push(frameTime);

            // Nur die letzten N Frames behalten
            if (this.frameTimes.length > this.maxFrameHistory) {
                this.frameTimes.shift();
            }
        }

        this.updateDisplay();
    }

    /**
     * 💾 Cache-Statistiken aufzeichnen
     */
    public recordCacheStats(stats: {
        totalPixels: number;
        cacheHits: number;
        cacheMisses: number;
        hitRate: number;
    }): void {
        this.lastCacheStats = stats;
        this.cacheHitRate = stats.hitRate;
        this.updateDisplay();
    }

    /**
     * 📊 Aktuelle Statistiken berechnen
     */
    public getStats(): {
        frameTime: {
            current: number;
            average: number;
            min: number;
            max: number;
        };
        fps: {
            current: number;
            average: number;
        };
        cache: {
            hitRate: number;
            hits: number;
            misses: number;
            total: number;
        };
    } {
        // Filtere 0-Werte raus für korrekte Berechnungen
        const validFrameTimes = this.frameTimes.filter(t => t > 0);

        // Letzter GÜLTIGER Frame-Wert (aktuell)
        const current = validFrameTimes.length > 0
            ? validFrameTimes[validFrameTimes.length - 1]
            : 0;

        // Durchschnitt aller GÜLTIGEN Frames
        const average = validFrameTimes.length > 0
            ? validFrameTimes.reduce((a, b) => a + b, 0) / validFrameTimes.length
            : 0;

        const min = validFrameTimes.length > 0
            ? Math.min(...validFrameTimes)
            : 0;

        const max = validFrameTimes.length > 0
            ? Math.max(...validFrameTimes)
            : 0;

        // FPS aus Frame-Zeit berechnen
        const currentFPS = current > 0 ? 1000 / current : 0;
        const averageFPS = average > 0 ? 1000 / average : 0;

        return {
            frameTime: {
                current: current,
                average: average,
                min: min,
                max: max
            },
            fps: {
                current: currentFPS,
                average: averageFPS
            },
            cache: {
                hitRate: this.lastCacheStats?.hitRate || 0,
                hits: this.lastCacheStats?.cacheHits || 0,
                misses: this.lastCacheStats?.cacheMisses || 0,
                total: this.lastCacheStats?.totalPixels || 0
            }
        };
    }

    /**
     * 🔄 Display aktualisieren
     */
    private updateDisplay(): void {
        if (!this.displayElement || !this.isDisplayVisible) {
            return;
        }

        const stats = this.getStats();

        // Sicherstellen dass Werte Zahlen sind
        const currentFPS = isNaN(stats.fps.current) ? 0 : stats.fps.current;
        const currentFrame = isNaN(stats.frameTime.current) ? 0 : stats.frameTime.current;

        const html = `
            <div style="border-bottom: 2px solid #00ff00; margin-bottom: 10px; padding-bottom: 5px;">
                <strong>⚡ PERFORMANCE</strong>
            </div>
            <div style="line-height: 1.8;">
                <div><strong>FPS:</strong> ${currentFPS.toFixed(1)}</div>
                <div><strong>Frame:</strong> ${currentFrame.toFixed(2)}ms</div>
                <div><strong>Avg Frame:</strong> ${stats.frameTime.average.toFixed(2)}ms</div>
            </div>
        `;

        this.displayElement.innerHTML = html;
    }

    /**
     * 👁️ Display ein/ausschalten
     */
    public toggleDisplay(visible?: boolean): void {
        if (!this.displayElement) {
            return;
        }

        if (visible === undefined) {
            this.isDisplayVisible = !this.isDisplayVisible;
        } else {
            this.isDisplayVisible = visible;
        }

        this.displayElement.style.display = this.isDisplayVisible ? 'block' : 'none';

        if (this.isDisplayVisible) {
            this.updateDisplay();
        }
    }

    /**
     * 📋 Detaillierte Statistiken in Console ausgeben
     */
    public logDetailedStats(): void {
        const stats = this.getStats();

        console.log('\n' + '='.repeat(60));
        console.log('📊 PERFORMANCE STATISTIKEN');
        console.log('='.repeat(60));
        console.log(`FPS (aktuell):        ${stats.fps.current.toFixed(1)}`);
        console.log(`FPS (Ø):              ${stats.fps.average.toFixed(1)}`);
        console.log(`Frame-Zeit (aktuell): ${stats.frameTime.current.toFixed(2)}ms`);
        console.log(`Frame-Zeit (Ø):       ${stats.frameTime.average.toFixed(2)}ms`);
        console.log(`Frame-Zeit (Min):     ${stats.frameTime.min.toFixed(2)}ms`);
        console.log(`Frame-Zeit (Max):     ${stats.frameTime.max.toFixed(2)}ms`);
        console.log(`Cache Hit Rate:       ${stats.cache.hitRate.toFixed(1)}%`);
        console.log(`Cache Hits:           ${stats.cache.hits.toLocaleString()}`);
        console.log(`Cache Misses:         ${stats.cache.misses.toLocaleString()}`);
        console.log('='.repeat(60));
    }

    /**
     * 🏆 Performance-Rating berechnen
     */
    public getPerformanceRating(): {
        rating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
        message: string;
    } {
        const stats = this.getStats();
        const fps = stats.fps.average;

        if (fps >= 60) {
            return {
                rating: 'Excellent',
                message: '🚀 Performance: AUSGEZEICHNET (≥60 FPS)'
            };
        } else if (fps >= 30) {
            return {
                rating: 'Good',
                message: '✅ Performance: GUT (≥30 FPS)'
            };
        } else if (fps >= 15) {
            return {
                rating: 'Fair',
                message: '⚠️ Performance: AKZEPTABEL (≥15 FPS)'
            };
        } else {
            return {
                rating: 'Poor',
                message: '❌ Performance: SCHLECHT (<15 FPS)'
            };
        }
    }

    /**
     * 🔄 Statistiken zurücksetzen
     */
    public reset(): void {
        this.frameTimes = [];
        this.cacheHitRate = 0;
        this.lastCacheStats = null;
        this.updateDisplay();
    }

    /**
     * 🧹 Ressourcen aufräumen
     */
    public cleanup(): void {
        if (this.displayElement) {
            document.body.removeChild(this.displayElement);
            this.displayElement = null;
        }

        this.frameTimes = [];
        this.lastCacheStats = null;
        this.isDisplayVisible = false;

        this.logger.info('Performance Monitor aufgeräumt');
    }
}