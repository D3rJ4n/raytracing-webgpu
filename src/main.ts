import { WebGPURaytracerApp } from './core/WebGPURaytracerApp';
import { Logger } from './utils/Logger';

async function main(): Promise<void> {
    const logger = Logger.getInstance();
    logger.setMinimalMode(true);
    logger.setShowFrameDetails(false);

    try {
        logger.success('🚀 Starte WebGPU Raytracer...');

        const app = new WebGPURaytracerApp();
        await app.initialize();

        // App global verfügbar machen
        (window as any).app = app;

        // 🔧 Helper für getSphereCount Kompatibilität
        (app as any).getSphereCount = () => app.scene.getSphereCount();

        // ═══════════════════════════════════════════════════════════
        // 🧪 AUTOMATISCHER PERFORMANCE TEST (ohne Konsole)
        // ═══════════════════════════════════════════════════════════

        logger.success('✅ Raytracer gestartet!');
        console.log(`📊 Szene: ${app.scene.getSphereCount()} Kugeln automatisch erstellt`);

        // Kurz warten und dann automatischen Test starten
        setTimeout(async () => {
            console.log('\n🧪 STARTE AUTOMATISCHEN CACHE-PERFORMANCE TEST');
            console.log('='.repeat(60));

            try {
                // Frame 1: Baseline
                await app.resetCache();
                app.resetAccumulation();
                await new Promise(r => setTimeout(r, 500));

                const frame1Start = performance.now();
                await app.renderFrame();
                const frame1Time = performance.now() - frame1Start;
                console.log(`✅ Frame 1 (Baseline): ${frame1Time.toFixed(2)}ms`);

                await new Promise(r => setTimeout(r, 500));

                // Frame 2: Mit Cache
                const frame2Start = performance.now();
                await app.renderFrame();
                const frame2Time = performance.now() - frame2Start;
                console.log(`✅ Frame 2 (Cached): ${frame2Time.toFixed(2)}ms`);

                const speedup = frame1Time / frame2Time;
                console.log(`📈 Cache-Speedup: ${speedup.toFixed(2)}x`);

                await new Promise(r => setTimeout(r, 1000));

                // 2 zufällige Kugeln bewegen
                app.scene.moveTwoRandomSpheres();
                console.log('🔄 2 zufällige Kugeln um +2 Y verschoben');

                await new Promise(r => setTimeout(r, 500));

                // Frame 3: Partial Update
                const frame3Start = performance.now();
                await app.renderFrame();
                const frame3Time = performance.now() - frame3Start;
                console.log(`✅ Frame 3 (Partial): ${frame3Time.toFixed(2)}ms`);

                const partialVsBaseline = frame1Time / frame3Time;
                console.log(`📈 Partial vs Baseline: ${partialVsBaseline.toFixed(2)}x`);

                // ZUSAMMENFASSUNG
                console.log('\n📊 CACHE-PERFORMANCE ZUSAMMENFASSUNG:');
                console.log(`🎯 Szene: ${app.scene.getSphereCount()} Kugeln`);
                console.log(`⚡ Baseline: ${frame1Time.toFixed(2)}ms`);
                console.log(`🚀 Cached: ${frame2Time.toFixed(2)}ms (${speedup.toFixed(2)}x speedup)`);
                console.log(`🔄 Partial: ${frame3Time.toFixed(2)}ms (${partialVsBaseline.toFixed(2)}x speedup)`);
                console.log(`✅ Cache-Effizienz: ${speedup > 1.2 ? 'SEHR GUT' : speedup > 1.1 ? 'GUT' : 'VERBESSERUNGSBEDARF'}`);
                console.log(`✅ Partial Update: ${partialVsBaseline > 1.1 ? 'FUNKTIONIERT' : 'NICHT OPTIMAL'}`);
                console.log('='.repeat(60));

                // 10 Sekunden warten, dann Test-Kugeln zurücksetzen
                setTimeout(() => {
                    app.scene.resetTestSpheres();
                    console.log('🔄 Test-Kugeln automatisch zurückgesetzt');
                }, 10000);

            } catch (error) {
                console.error('❌ Fehler beim Performance-Test:', error);
            }
        }, 2000); // 2 Sekunden warten nach dem Start

    } catch (error) {
        logger.error('Fehler beim Starten:', error);
        throw error;
    }
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});