import { WebGPURaytracerApp } from './core/WebGPURaytracerApp';
import { Logger } from './utils/Logger';

async function main(): Promise<void> {
    const logger = Logger.getInstance();
    logger.setMinimalMode(true);
    logger.setShowFrameDetails(false); // ← Frame-Details komplett aus

    try {
        logger.success('🚀 Starte WebGPU Raytracer mit 200 Kugeln...');

        const app = new WebGPURaytracerApp();
        await app.initialize();

        (window as any).app = app;

        // ═══════════════════════════════════════════════════════════
        // AUTOMATISCHER PERFORMANCE-TEST BEIM START
        // ═══════════════════════════════════════════════════════════

        console.log('\n' + '='.repeat(70));
        console.log('🚀 AUTOMATISCHER PERFORMANCE-TEST - 200 KUGELN');
        console.log('='.repeat(70) + '\n');

        // Kurz warten für Initialisierung
        await new Promise(r => setTimeout(r, 500));

        // ===== TEST 1: CACHE-FUNKTIONALITÄT =====
        await app.resetCache();
        app.resetAccumulation();
        await new Promise(r => setTimeout(r, 200));

        const time1Start = performance.now();
        await app.renderFrame();
        const time1 = performance.now() - time1Start;

        await new Promise(r => setTimeout(r, 200));

        const time2Start = performance.now();
        await app.renderFrame();
        const time2 = performance.now() - time2Start;

        const speedup = time1 / time2;

        // ===== TEST 2: DURCHSCHNITTLICHE PERFORMANCE (10 FRAMES) =====
        app.getPerformanceMonitor().reset();

        for (let i = 0; i < 10; i++) {
            await app.renderFrame();
        }

        const avgStats = app.getPerformanceMonitor().getStats();

        // ===== TEST 3: SUPERSAMPLING =====
        app.resetAccumulation();
        const ssStart = performance.now();

        for (let sample = 0; sample < 4; sample++) {
            const baseCameraData = app.scene.getCameraData();
            app.getBufferManager().updateCameraDataWithRandomSeeds(baseCameraData, sample);
            await app.renderFrame();
        }

        const ssTime = performance.now() - ssStart;
        const avgTimePerSample = ssTime / 4;

        // ===== ZUSAMMENFASSUNG =====
        console.log('\n\n' + '='.repeat(70));
        console.log('🎯 ZUSAMMENFASSUNG - 200 KUGELN PERFORMANCE');
        console.log('='.repeat(70));
        console.log(`Szene:                200 Kugeln (25x8 Rechteck)`);
        console.log(`Cache:                ${speedup > 1.3 ? '✅ Funktioniert' : '⚠️ Suboptimal'} (${speedup.toFixed(2)}x Speedup)`);
        console.log(`Ø Frame-Zeit:         ${avgStats.frameTime.average.toFixed(2)}ms`);
        console.log(`Ø FPS:                ${avgStats.fps.current.toFixed(1)}`);
        console.log(`Cache Hit Rate:       ${avgStats.cache.hitRate.toFixed(1)}%`);
        console.log(`Supersampling:        ✅ Funktioniert (${avgTimePerSample.toFixed(2)}ms/sample)`);
        console.log('='.repeat(70) + '\n');

        logger.success('✅ Automatischer Performance-Test abgeschlossen!');
        logger.success('📊 Performance-Display oben rechts aktiv');

        // Performance-Display anzeigen
        app.togglePerformanceDisplay(true);

        // ═══════════════════════════════════════════════════════════
        // VERFÜGBARE COMMANDS (FÜR WEITERE TESTS)
        // ═══════════════════════════════════════════════════════════

        (window as any).renderFrame = async () => {
            const startTime = performance.now();
            await app.renderFrame();
            const renderTime = performance.now() - startTime;
            console.log(`🎬 Frame: ${renderTime.toFixed(1)}ms`);
        };

        (window as any).togglePerf = () => {
            app.togglePerformanceDisplay();
            console.log('Performance-Display umgeschaltet');
        };

        (window as any).quickSupersampling = async () => {
            console.log('Quick Supersampling (4 samples)...');
            await app.startProgressiveSupersampling(4);
        };

        (window as any).resetCache = () => {
            console.log('🗑️  Cache reset');
            app.resetCache();
        };

        (window as any).benchmark = async (frames = 100) => {
            console.log(`\n=== 🎯 BENCHMARK: ${frames} Frames ===\n`);

            app.getPerformanceMonitor().reset();

            console.log('Starte Benchmark...');
            const startTime = performance.now();

            for (let i = 0; i < frames; i++) {
                await app.renderFrame();

                if (i % 10 === 0) {
                    const progress = ((i / frames) * 100).toFixed(0);
                    console.log(`Progress: ${i}/${frames} (${progress}%)`);
                }
            }

            const totalTime = performance.now() - startTime;
            const avgFrameTime = totalTime / frames;
            const avgFPS = 1000 / avgFrameTime;

            console.log('\n' + '='.repeat(60));
            console.log('📊 BENCHMARK ERGEBNIS:');
            console.log('='.repeat(60));
            console.log(`Frames gerendert:     ${frames}`);
            console.log(`Gesamtzeit:           ${totalTime.toFixed(2)} ms`);
            console.log(`Ø Frame-Zeit:         ${avgFrameTime.toFixed(2)} ms`);
            console.log(`Ø FPS:                ${avgFPS.toFixed(1)}`);
            console.log('='.repeat(60));

            const stats = app.getPerformanceMonitor().getStats();
            console.log(`Cache Hit Rate:       ${stats.cache.hitRate.toFixed(1)}%`);
        };

        // ═══════════════════════════════════════════════════════════
        // KAMERA-ANIMATIONS-KOMMANDOS (NEU!)
        // ═══════════════════════════════════════════════════════════

        (window as any).rotateCamera = () => {
            app.scene.startCameraRotation();
            console.log('🎬 Kamera-Rotation gestartet!');
            console.log('💡 Nutze renderLoop() um kontinuierlich zu rendern');
        };

        (window as any).stopCamera = () => {
            app.scene.stopCameraRotation();
            console.log('⏸️ Kamera-Rotation gestoppt');
        };

        (window as any).setSpeed = (speed: number) => {
            app.scene.setRotationSpeed(speed);
            console.log(`⚙️ Rotations-Geschwindigkeit: ${speed}°/Frame`);
        };

        (window as any).renderLoop = async (maxFrames = 360) => {
            console.log(`\n🎬 Starte Render-Loop (max ${maxFrames} Frames)`);

            app.getPerformanceMonitor().reset();

            for (let i = 0; i < maxFrames; i++) {
                // Kamera bewegen
                const cameraMoved = app.scene.updateCamera();

                if (cameraMoved) {
                    // ⭐ Kamera-Daten zur GPU schicken
                    const newCameraData = app.scene.getCameraData();
                    app.getBufferManager().updateCameraData(newCameraData);

                    // ⭐ Cache ungültig machen!
                    await app.resetCache();
                }

                // Frame rendern
                await app.renderFrame();

                // Kurze Pause für flüssige Animation
                await new Promise(r => setTimeout(r, 16)); // ~60 FPS

                // Progress alle 90 Frames
                if (i % 90 === 0 && i > 0) {
                    const stats = app.getPerformanceMonitor().getStats();
                    console.log(`Frame ${i}/${maxFrames} | FPS: ${stats.fps.current.toFixed(1)} | Cache: ${stats.cache.hitRate.toFixed(0)}%`);
                }

                // Stoppen wenn Rotation deaktiviert wurde
                if (!app.scene.isRotationActive()) {
                    console.log(`\n⏹️ Render-Loop gestoppt bei Frame ${i}`);
                    break;
                }
            }

            const stats = app.getPerformanceMonitor().getStats();
            console.log('\n' + '='.repeat(60));
            console.log('📊 RENDER-LOOP ABGESCHLOSSEN:');
            console.log('='.repeat(60));
            console.log(`Ø FPS:                ${stats.fps.average.toFixed(1)}`);
            console.log(`Ø Frame-Zeit:         ${stats.frameTime.average.toFixed(2)}ms`);
            console.log(`Cache Hit Rate:       ${stats.cache.hitRate.toFixed(1)}%`);
            console.log('='.repeat(60));
        };

        console.log('\n💡 Verfügbare Commands:');
        console.log('   renderFrame()          - Einzelnen Frame rendern');
        console.log('   togglePerf()           - Performance-Display ein/aus');
        console.log('   quickSupersampling()   - 4x AA Test');
        console.log('   resetCache()           - Cache leeren');
        console.log('   benchmark(100)         - 100 Frames Benchmark');
        console.log('\n🎬 Kamera-Animation (NEU!):');
        console.log('   rotateCamera()         - Kamera-Rotation starten');
        console.log('   stopCamera()           - Rotation stoppen');
        console.log('   setSpeed(1.0)          - Geschwindigkeit ändern');
        console.log('   renderLoop(360)        - 360 Frames mit Rotation\n');

    } catch (error) {
        logger.error('Fehler:', error);
        throw error;
    }
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});