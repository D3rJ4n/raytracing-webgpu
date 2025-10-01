import { WebGPURaytracerApp } from './core/WebGPURaytracerApp';
import { Logger } from './utils/Logger';

async function main(): Promise<void> {
    const logger = Logger.getInstance();
    logger.setMinimalMode(true);

    try {
        logger.success('🚀 Starte WebGPU Raytracer mit Supersampling...');

        const app = new WebGPURaytracerApp();
        await app.initialize();

        // Globale Kommandos für Console
        (window as any).app = app;

        // Standard-Kommandos
        (window as any).renderFrame = async () => {
            const startTime = performance.now();
            await app.renderFrame();
            const renderTime = performance.now() - startTime;
            console.log(`🎬 Frame: ${renderTime.toFixed(1)}ms`);
        };

        // NEU: Supersampling-Kommandos
        (window as any).startSupersampling = async (samples = 16) => {
            console.log(`🎨 Starte Progressive Supersampling mit ${samples} samples...`);
            await app.startProgressiveSupersampling(samples);
        };

        (window as any).quickSupersampling = async () => {
            console.log('Quick Supersampling (4 samples)...');
            await app.startProgressiveSupersampling(4);
        };

        (window as any).highQualitySupersampling = async () => {
            console.log('High Quality Supersampling (16 samples)...');
            await app.startProgressiveSupersampling(16);
        };

        (window as any).extremeSupersampling = async () => {
            console.log('Extreme Quality Supersampling (64 samples)...');
            await app.startProgressiveSupersampling(64);
        };

        (window as any).resetAccumulation = () => {
            console.log('Accumulation zurückgesetzt');
            app.resetAccumulation();
        };

        (window as any).compareQuality = async () => {
            console.log('\n=== Qualitätsvergleich ===\n');

            // 1. Single Sample (kein AA)
            console.log('1. Ohne Anti-Aliasing...');
            app.resetAccumulation();
            await app.renderFrame();
            await new Promise(r => setTimeout(r, 1000));

            // 2. Mit 4 Samples
            console.log('2. Mit 4x Supersampling...');
            app.resetAccumulation();
            await app.startProgressiveSupersampling(4);
            await new Promise(r => setTimeout(r, 1000));

            // 3. Mit 16 Samples
            console.log('3. Mit 16x Supersampling...');
            app.resetAccumulation();
            await app.startProgressiveSupersampling(16);

            console.log('\nVergleich abgeschlossen - achte auf die Kanten!');
        };

        // Cache-Kommandos (bestehend)
        (window as any).testCache = async () => {
            console.log('\nCache-Test:');
            const time1 = performance.now();
            await app.renderFrame();
            const renderTime1 = performance.now() - time1;

            await app.showCacheStatistics();

            const time2 = performance.now();
            await app.renderFrame();
            const renderTime2 = performance.now() - time2;

            await app.showCacheStatistics();

            const speedup = renderTime1 / renderTime2;
            console.log(`Ergebnis: ${renderTime1.toFixed(1)}ms -> ${renderTime2.toFixed(1)}ms (${speedup.toFixed(1)}x)`);

            if (speedup > 1.5) {
                console.log('Cache funktioniert!');
            }
        };

        (window as any).resetCache = () => {
            console.log('Cache reset');
            app.resetCache();
        };

        (window as any).checkCache = async () => {
            await app.showCacheStatistics();
        };

        // Info ausgeben
        console.log('\n=== WebGPU Raytracer mit Supersampling ===');
        console.log('\nBasis-Kommandos:');
        console.log('  renderFrame()              - Einzelnen Frame rendern');
        console.log('\nSupersampling:');
        console.log('  quickSupersampling()       - 4x AA (schnell)');
        console.log('  highQualitySupersampling() - 16x AA (empfohlen)');
        console.log('  extremeSupersampling()     - 64x AA (sehr langsam)');
        console.log('  resetAccumulation()        - Samples zurücksetzen');
        console.log('  compareQuality()           - Vorher/Nachher Demo');
        console.log('\nCache:');
        console.log('  testCache()   - Cache-Performance testen');
        console.log('  resetCache()  - Cache leeren');
        console.log('  checkCache()  - Cache-Status anzeigen');

        // Automatischer Demo-Start
        setTimeout(async () => {
            console.log('\nStarte automatische Demo in 2 Sekunden...');
            setTimeout(async () => {
                await (window as any).quickSupersampling();
            }, 2000);
        }, 500);

        logger.success('Raytracer bereit!');

    } catch (error) {
        logger.error('Fehler:', error);
        throw error;
    }
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});