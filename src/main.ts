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

        // ═══════════════════════════════════════════════════════════
        // STANDARD-KOMMANDOS
        // ═══════════════════════════════════════════════════════════

        (window as any).renderFrame = async () => {
            const startTime = performance.now();
            await app.renderFrame();
            const renderTime = performance.now() - startTime;
            console.log(`🎬 Frame: ${renderTime.toFixed(1)}ms`);
        };

        // ═══════════════════════════════════════════════════════════
        // SUPERSAMPLING-KOMMANDOS
        // ═══════════════════════════════════════════════════════════

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

        // ═══════════════════════════════════════════════════════════
        // CACHE-KOMMANDOS
        // ═══════════════════════════════════════════════════════════

        (window as any).testCache = async () => {
            console.log('\n📊 Cache-Test:');
            const time1 = performance.now();
            await app.renderFrame();
            const renderTime1 = performance.now() - time1;

            await app.showCacheStatistics();

            const time2 = performance.now();
            await app.renderFrame();
            const renderTime2 = performance.now() - time2;

            await app.showCacheStatistics();

            const speedup = renderTime1 / renderTime2;
            console.log(`\n📈 Ergebnis: ${renderTime1.toFixed(1)}ms -> ${renderTime2.toFixed(1)}ms (${speedup.toFixed(1)}x)`);

            if (speedup > 1.5) {
                console.log('✅ Cache funktioniert!');
            } else {
                console.log('⚠️ Cache-Speedup gering');
            }
        };

        (window as any).testCacheProper = async () => {
            console.log('\n=== 🔍 Detaillierter Cache-Test ===\n');

            // 1. Vorbereitung
            console.log('🧹 Bereite Test vor...');
            app.resetCache();
            app.resetAccumulation();
            await new Promise(r => setTimeout(r, 200));

            // 2. Erster Frame - OHNE Cache (Cold Start)
            console.log('\n❄️  FRAME 1 (COLD - kein Cache):');
            console.log('   Status: Alle Pixel müssen berechnet werden');

            const time1Start = performance.now();
            await app.renderFrame();
            const time1 = performance.now() - time1Start;

            console.log(`   ⏱️  Zeit: ${time1.toFixed(2)}ms`);
            await app.showCacheStatistics();

            await new Promise(r => setTimeout(r, 200));

            // 3. Zweiter Frame - MIT Cache (Warm)
            console.log('\n🔥 FRAME 2 (WARM - aus Cache):');
            console.log('   Status: Alle Pixel sollten aus Cache kommen');

            const time2Start = performance.now();
            await app.renderFrame();
            const time2 = performance.now() - time2Start;

            console.log(`   ⏱️  Zeit: ${time2.toFixed(2)}ms`);
            await app.showCacheStatistics();

            // 4. Auswertung
            console.log('\n' + '='.repeat(50));
            console.log('📊 ERGEBNIS:');
            console.log('='.repeat(50));
            console.log(`Frame 1 (ohne Cache): ${time1.toFixed(2)}ms`);
            console.log(`Frame 2 (mit Cache):  ${time2.toFixed(2)}ms`);

            const speedup = time1 / time2;
            const saved = time1 - time2;
            const savedPercent = (saved / time1 * 100).toFixed(1);

            console.log(`Speedup:              ${speedup.toFixed(2)}x`);
            console.log(`Zeit gespart:         ${saved.toFixed(2)}ms (${savedPercent}%)`);

            console.log('='.repeat(50));

            if (speedup > 2.0) {
                console.log('\n🎉 Cache funktioniert AUSGEZEICHNET! 🚀');
            } else if (speedup > 1.3) {
                console.log('\n✅ Cache funktioniert gut!');
            } else if (speedup > 1.05) {
                console.log('\n⚠️  Cache funktioniert, aber Speedup ist gering');
                console.log('    (GPU-Cache oder einfache Szene könnte Effekt reduzieren)');
            } else {
                console.log('\n❌ Cache scheint nicht zu funktionieren');
                console.log('    Beide Frames sind gleich schnell');
            }
        };

        (window as any).resetCache = () => {
            console.log('🗑️  Cache reset');
            app.resetCache();
        };

        (window as any).checkCache = async () => {
            console.log('\n📊 Cache-Status:');
            await app.showCacheStatistics();
        };

        // ═══════════════════════════════════════════════════════════
        // COMMAND-LISTE AUSGEBEN
        // ═══════════════════════════════════════════════════════════

        console.log('\n' + '='.repeat(60));
        console.log('🎮 WebGPU Raytracer - Kommandos');
        console.log('='.repeat(60));

        console.log('\n📷 Basis:');
        console.log('  renderFrame()              - Einzelnen Frame rendern');

        console.log('\n✨ Supersampling (Anti-Aliasing):');
        console.log('  quickSupersampling()       - 4x AA (schnell)');
        console.log('  highQualitySupersampling() - 16x AA (empfohlen)');
        console.log('  extremeSupersampling()     - 64x AA (sehr langsam)');
        console.log('  resetAccumulation()        - Samples zurücksetzen');
        console.log('  compareQuality()           - Vorher/Nachher Demo');

        console.log('\n💾 Cache-System:');
        console.log('  testCacheProper()          - Detaillierter Cache-Test ⭐');
        console.log('  testCache()                - Schneller Cache-Test');
        console.log('  resetCache()               - Cache leeren');
        console.log('  checkCache()               - Cache-Status anzeigen');

        console.log('\n' + '='.repeat(60));
        console.log('💡 Tipp: Starte mit "testCacheProper()" um zu sehen ob');
        console.log('   der Cache funktioniert!');
        console.log('='.repeat(60) + '\n');

        logger.success('✅ Raytracer bereit! Tippe "testCacheProper()" in der Console.');

    } catch (error) {
        logger.error('Fehler:', error);
        throw error;
    }
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});