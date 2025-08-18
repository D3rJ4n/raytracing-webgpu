import { WebGPURaytracerApp } from './core/WebGPURaytracerApp';
import { Logger } from './utils/Logger';

/**
 * 🎯 Haupteinstiegspunkt - WebGPU Raytracer mit Cache
 */

async function main(): Promise<void> {
    const logger = Logger.getInstance();

    // === MINIMAL MODE AKTIVIEREN ===
    logger.setMinimalMode(true);

    try {
        logger.success('🚀 Starte WebGPU Raytracer...');

        // App-Instanz erstellen
        const app = new WebGPURaytracerApp();

        // Vollständige Initialisierung
        await app.initialize();

        // === EINFACHE CACHE-ÜBERWACHUNG ===

        // Globale Funktionen für Console-Testing
        (window as any).app = app;
        (window as any).testCache = async () => {
            console.log('\n🧪 Cache-Test:');

            // Frame 1: Ohne Cache
            const time1 = performance.now();
            await app.renderFrame();
            const renderTime1 = performance.now() - time1;

            // Cache-Status prüfen (kompakt)
            await app.showCacheStatistics();

            // Frame 2: Mit Cache
            const time2 = performance.now();
            await app.renderFrame();
            const renderTime2 = performance.now() - time2;

            // Cache-Status prüfen (kompakt)
            await app.showCacheStatistics();

            // Kurzes Ergebnis
            const speedup = renderTime1 / renderTime2;
            console.log(`📊 Ergebnis: ${renderTime1.toFixed(1)}ms → ${renderTime2.toFixed(1)}ms (${speedup.toFixed(1)}x)`);

            if (speedup > 1.5) {
                console.log('✅ Cache funktioniert!');
            } else {
                console.log('ℹ️ Cache-Effekt minimal (sehr schnelle GPU)');
            }
        };

        (window as any).resetCache = () => {
            console.log('🔄 Cache reset');
            app.resetCache();
        };

        (window as any).renderFrame = async () => {
            const startTime = performance.now();
            await app.renderFrame();
            const renderTime = performance.now() - startTime;
            const status = app.getStatus();
            console.log(`🎬 Frame ${status.frameCount}: ${renderTime.toFixed(1)}ms`);
        };

        (window as any).checkCache = async () => {
            await app.showCacheStatistics();
        };

        // Automatischer Test (verkürzt)
        setTimeout(async () => {
            console.log('\n🎯 Commands: testCache() | renderFrame() | resetCache() | checkCache()');

            setTimeout(async () => {
                await (window as any).testCache();
            }, 1000);

        }, 500);

        logger.success('✅ Raytracer bereit!');

    } catch (error) {
        logger.error('❌ Fehler:', error);
        throw error;
    }
}

// App starten
main().catch(error => {
    console.error('💥 Kritischer Fehler:', error);
});