/**
 * 📝 Logger - Einheitliches Logging-System
 * 
 * Bietet kategorisierte Logs mit Emojis und Zeitstempeln
 */

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
    private minimalMode: boolean = true;
    private showFrameDetails: boolean = false; // ← NEU: Frame-Details standardmäßig aus

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

    public setMinimalMode(enabled: boolean): void {
        this.minimalMode = enabled;
    }

    public setShowFrameDetails(enabled: boolean): void {
        this.showFrameDetails = enabled;
    }

    private log(level: LogLevel, emoji: string, category: string, message: string, ...args: any[]): void {
        if (level < this.logLevel) return;

        if (this.minimalMode && this.shouldSkipInMinimalMode(category, message)) {
            return;
        }

        const prefix = `${emoji} [${category}]`;
        console.log(`${prefix} ${message}`, ...args);
    }

    private shouldSkipInMinimalMode(category: string, message: string): boolean {
        // FRAME-Details komplett ausblenden (außer wenn explizit aktiviert)
        if (category.includes('FRAME') && !this.showFrameDetails) {
            return true;
        }

        // Diese Nachrichten IMMER zeigen
        const alwaysShow = [
            'SUCCESS',
            'ERROR'
        ];

        if (alwaysShow.includes(category)) {
            return false;
        }

        // INIT: Nur wichtige Init-Nachrichten
        if (category === 'INIT' && (
            message.includes('Erstelle Three.js Szene') ||
            message.includes('Initialisiere WebGPU') ||
            message.includes('Erstelle GPU-Ressourcen') ||
            message.includes('Erstelle Rendering-Pipelines') ||
            message.includes('Initialisiere Renderer') ||
            message.includes('Rendere ersten Frame')
        )) {
            return false;
        }

        // BUFFER/PIPELINE: Ausblenden
        if (category === 'BUFFER' || category === 'PIPELINE') {
            return true;
        }

        // Alle anderen ausblenden
        return true;
    }

    // ===== KATEGORISIERTE LOGGING-METHODEN =====

    public init(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '🔧', 'INIT', message, ...args);
    }

    public frame(frameNum: number, message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '🎬', `FRAME ${frameNum}`, message, ...args);
    }

    public pipeline(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '⚙️', 'PIPELINE', message, ...args);
    }

    public buffer(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '📦', 'BUFFER', message, ...args);
    }

    public cache(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '💾', 'CACHE', message, ...args);
    }

    public cacheStats(frameNum: number, message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '📊', `CACHE STATS`, message, ...args);
    }

    public debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, '🔍', 'DEBUG', message, ...args);
    }

    public test(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '🧪', 'TEST', message, ...args);
    }

    public status(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, '📱', 'STATUS', message, ...args);
    }

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
        // Cache-Statistiken werden nicht automatisch ausgegeben
        // Nur bei explizitem Aufruf
    }

    public logPixelSample(step: number, pixels: Array<{
        index: number;
        r: number;
        g: number;
        b: number;
        valid: number;
    }>): void {
        // Pixel-Samples nicht ausgeben
    }

    public logOverallStatistics(step: number, totalPixels: number, validPixels: number, invalidPixels: number): void {
        // Overall-Statistiken nicht ausgeben
    }
}