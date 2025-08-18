import { Logger } from './Logger';
import { STATUS_CLASSES } from './Constants';

/**
 * 📱 StatusDisplay - UI Status Management
 * 
 * Verwaltet Status-Updates im UI und synchronisiert mit Logging
 */
export class StatusDisplay {
    private statusElement: HTMLElement;
    private logger: Logger;

    constructor(elementId: string) {
        this.logger = Logger.getInstance();

        const element = document.getElementById(elementId);
        if (!element) {
            throw new Error(`Status-Element mit ID '${elementId}' nicht gefunden`);
        }
        this.statusElement = element;
    }

    /**
     * 📝 Informations-Status anzeigen
     */
    public showInfo(message: string): void {
        this.updateStatus(message, STATUS_CLASSES.INFO);
        this.logger.status(message);
    }

    /**
     * ✅ Erfolgs-Status anzeigen
     */
    public showSuccess(message: string): void {
        this.updateStatus(message, STATUS_CLASSES.SUCCESS);
        this.logger.status(message);
    }

    /**
     * ❌ Fehler-Status anzeigen
     */
    public showError(message: string): void {
        this.updateStatus(message, STATUS_CLASSES.ERROR);
        this.logger.status(message);
    }

    /**
     * ⚠️ Warnung-Status anzeigen
     */
    public showWarning(message: string): void {
        this.updateStatus(message, STATUS_CLASSES.WARNING);
        this.logger.status(message);
    }

    /**
     * 🔄 Status aktualisieren
     */
    private updateStatus(message: string, className: string): void {
        this.statusElement.textContent = message;
        this.statusElement.className = `status ${className}`;
    }

    /**
     * 📊 Cache-Statistiken als Status anzeigen
     */
    public showCacheStats(frameCount: number, hitRate: number): void {
        const message = `Frame ${frameCount} - Cache Hit Rate: ${hitRate.toFixed(1)}%`;
        this.showInfo(message);
    }

    /**
     * 🎬 Frame-Info als Status anzeigen
     */
    public showFrameInfo(frameCount: number, renderTime?: number): void {
        let message = `Frame ${frameCount}`;
        if (renderTime !== undefined) {
            message += ` - Render Zeit: ${renderTime.toFixed(2)}ms`;
        }
        this.showInfo(message);
    }
}