/**
 * 📝 Logger - Einheitliches Logging-System
 * 
 * Bietet kategorisierte Logs mit Emojis und Zeitstempeln
 */

// Replace enum with const object
export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    SUCCESS: 2,
    WARNING: 3,
    ERROR: 4
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

export class Logger {
    private static instance: Logger;
    private logLevel: LogLevel = LogLevel.INFO;

    // === NEUE EINSTELLUNG: MINIMAL MODE ===
    private minimalMode: boolean = true; // Standardmäßig minimal

    private constructor() { }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    // === MINIMAL MODE KONTROLLE ===
    public setMinimalMode(enabled: boolean): void {
        this.minimalMode = enabled;
    }

    private log(level: LogLevel, emoji: string, category: string, message: string, ...args: any[]): void {
        if (level < this.logLevel) return;

        // In Minimal Mode nur wichtige Nachrichten zeigen
        if (this.minimalMode && this.shouldSkipInMinimalMode(category, message)) {
            return;
        }

        const timestamp = new Date().toLocaleTimeString();
        const prefix = `${emoji} [${category}]`;

        console.log(`${prefix} ${message}`, ...args);
    }

    // === FILTER FÜR MINIMAL MODE ===
    private shouldSkipInMinimalMode(category: string, message: string): boolean {
        // Diese Nachrichten IMMER zeigen (auch im Minimal Mode)
        const alwaysShow = [
            'SUCCESS',
            'ERROR',
            'CACHE STATS'
        ];

        if (alwaysShow.includes(category)) {
            return false;
        }

        // INIT: Nur wichtige Init-Nachrichten
        if (category === 'INIT' && (
            message.includes('WebGPU erfolgreich') ||
            message.includes('Szene erstellt') ||
            message.includes('erfolgreich gestartet')
        )) {
            return false;
        }

        // FRAME: Nur Frame-Ergebnis, nicht jeden Schritt
        if (category.includes('FRAME') && (
            message.includes('erfolgreich abgeschlossen') ||
            message.includes('Rendering erfolgreich')
        )) {
            return false;
        }

        // TEST: Wichtige Test-Nachrichten
        if (category === 'TEST') {
            return false;
        }

        // Alle anderen Nachrichten in Minimal Mode ausblenden
        return true;
    }

    // ===== KATEGORISIERTE LOGGING-METHODEN =====

    // 🔧 Initialisierung & Setup
    public init(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '🔧', 'INIT', message, ...args);
    }

    // 🎬 Frame & Rendering
    public frame(frameNum: number, message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '🎬', `FRAME ${frameNum}`, message, ...args);
    }

    // 🎨 Pipeline & Shader
    public pipeline(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '⚙️', 'PIPELINE', message, ...args);
    }

    // 📦 Buffer Management
    public buffer(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '📦', 'BUFFER', message, ...args);
    }

    // 💾 Cache-System
    public cache(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '💾', 'CACHE', message, ...args);
    }

    public cacheStats(frameNum: number, message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '📊', `CACHE STATS`, message, ...args);
    }

    // 🔍 Debug & Testing
    public debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, '🔍', 'DEBUG', message, ...args);
    }

    public test(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '🧪', 'TEST', message, ...args);
    }

    // 📱 Status & UI
    public status(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '📱', 'STATUS', message, ...args);
    }

    // ===== STANDARD LOGGING-METHODEN =====

    public info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, 'ℹ️', 'INFO', message, ...args);
    }

    public success(message: string, ...args: any[]): void {
        this.log(LogLevel.SUCCESS, '✅', 'SUCCESS', message, ...args);
    }

    public warning(message: string, ...args: any[]): void {
        this.log(LogLevel.WARNING, '⚠️', 'WARNING', message, ...args);
    }

    public error(message: string, ...args: any[]): void {
        this.log(LogLevel.ERROR, '❌', 'ERROR', message, ...args);
    }

    public webgpu(message: string, ...args: any[]): void {
        this.log(LogLevel.ERROR, '⚠️', 'WEBGPU', message, ...args);
    }

    // ===== SPEZIELLE FORMATIERUNGEN =====

    public logCacheStatistics(frameNum: number, stats: {
        totalPixels: number;
        cacheHits: number;
        cacheMisses: number;
    }): void {
        const { totalPixels, cacheHits, cacheMisses } = stats;
        const hitRate = totalPixels > 0 ? (cacheHits / totalPixels * 100).toFixed(1) : '0';

        // Nur eine kompakte Cache-Statistik ausgeben
        this.cacheStats(frameNum, `Hit Rate: ${hitRate}% (${cacheHits.toLocaleString()}/${totalPixels.toLocaleString()})`);

        if (cacheHits > 0 && parseFloat(hitRate) > 90) {
            this.cacheStats(frameNum, `🚀 Cache funktioniert optimal!`);
        }
    }

    public logPixelSample(step: number, pixels: Array<{
        index: number;
        r: number;
        g: number;
        b: number;
        valid: number;
    }>): void {
        // Nur ausgeben wenn nicht im Minimal Mode
        if (this.minimalMode) return;

        this.debug(`\n🔍 [DEBUG STEP ${step}] Cache-Details:`);
        this.debug('📊 Sample der ersten 10 Pixel:');

        pixels.forEach(pixel => {
            this.debug(`  Pixel ${pixel.index}: R=${pixel.r}, G=${pixel.g}, B=${pixel.b}, Valid=${pixel.valid}`);
        });
    }

    public logOverallStatistics(step: number, totalPixels: number, validPixels: number, invalidPixels: number): void {
        // Nur ausgeben wenn nicht im Minimal Mode
        if (this.minimalMode) return;

        const hitRate = totalPixels > 0 ? (validPixels / totalPixels * 100).toFixed(1) : '0';

        this.debug(`📈 Gesamtstatistik:`);
        this.debug(`  Total Pixels: ${totalPixels.toLocaleString()}`);
        this.debug(`  Valid Pixels: ${validPixels.toLocaleString()} (${hitRate}%)`);
        this.debug(`  Invalid Pixels: ${invalidPixels.toLocaleString()}`);
    }
}