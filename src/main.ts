import { WebGPURaytracerApp } from './core/WebGPURaytracerApp';
import { Logger } from './utils/Logger';

async function main(): Promise<void> {
    const logger = Logger.getInstance();
    logger.setMinimalMode(true);
    logger.setShowFrameDetails(false);

    try {
        logger.success('🚀 Starte WebGPU Raytracer mit 200 Kugeln...');

        const app = new WebGPURaytracerApp();
        await app.initialize();

        (window as any).app = app;

        // ═══════════════════════════════════════════════════════════
        // AUTOMATISCHER PERFORMANCE-TEST DEAKTIVIERT FÜR CACHE-DEBUG
        // ═══════════════════════════════════════════════════════════

        console.log('\n' + '='.repeat(70));
        console.log('🔧 CACHE-DEBUG MODUS - AUTOMATISCHER TEST DEAKTIVIERT');
        console.log('='.repeat(70));
        console.log('Render den ersten Frame manuell mit: renderFrame()');
        console.log('='.repeat(70) + '\n');

        // Kurz warten für Initialisierung
        await new Promise(r => setTimeout(r, 500));

        // AUTOMATISCHE TESTS AUSKOMMENTIERT:
        // await app.resetCache();
        // app.resetAccumulation();
        // await new Promise(r => setTimeout(r, 200));

        // const time1Start = performance.now();
        // await app.renderFrame();  // ← Dieser Frame zeigt die Kugel
        // const time1 = performance.now() - time1Start;

        // await new Promise(r => setTimeout(r, 200));

        // const time2Start = performance.now();
        // await app.renderFrame();  // ← Dieser Frame lässt die Kugel verschwinden
        // const time2 = performance.now() - time2Start;

        logger.success('✅ App initialisiert - bereit für manuelle Cache-Tests!');
        logger.success('📊 Performance-Display verfügbar');

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

        (window as any).resetCache = async () => {
            console.log('🗑️  Cache reset');
            await app.resetCache();
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
                const cameraMoved = app.scene.updateCamera();

                if (cameraMoved) {
                    const newCameraData = app.scene.getCameraData();
                    app.getBufferManager().updateCameraData(newCameraData);
                }

                await app.renderFrame();

                await new Promise(r => setTimeout(r, 16));

                if (i % 90 === 0 && i > 0) {
                    const stats = app.getPerformanceMonitor().getStats();
                    console.log(`Frame ${i}/${maxFrames} | FPS: ${stats.fps.current.toFixed(1)} | Cache: ${stats.cache.hitRate.toFixed(0)}%`);
                }

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

        // ═══════════════════════════════════════════════════════════
        // CACHE-DEBUG KOMMANDOS
        // ═══════════════════════════════════════════════════════════

        (window as any).debugCacheBug = async () => {
            console.log('\n=== CACHE-BUG DEBUG ===');

            // 1. Cache zurücksetzen
            console.log('1. Cache reset...');
            await app.resetCache();

            // 2. Ersten Frame rendern
            console.log('2. Erster Frame...');
            await app.renderFrame();
            console.log('   -> Ist die Kugel da?');

            // 3. Cache-Statistiken nach erstem Frame
            await app.showCacheStatistics();

            // 4. Zweiten Frame rendern (hier verschwindet die Kugel)
            console.log('3. Zweiter Frame...');
            await app.renderFrame();
            console.log('   -> Ist die Kugel noch da?');

            // 5. Cache-Statistiken nach zweitem Frame
            await app.showCacheStatistics();

            console.log('\nCache-Debug abgeschlossen. Vergleiche die Hit-Rates.');
        };

        (window as any).debugCameraRotation = () => {
            console.log('\n=== KAMERA-ROTATION DEBUG ===');

            const scene = app.scene;

            console.log('Vor Rotation aktivieren:');
            console.log('  isRotating:', scene.isRotationActive());
            console.log('  Position:', scene.getCamera().position);

            scene.startCameraRotation();

            console.log('Nach Rotation aktivieren:');
            console.log('  isRotating:', scene.isRotationActive());

            // Mehrere Updates testen
            for (let i = 0; i < 5; i++) {
                const moved = scene.updateCamera();
                const pos = scene.getCamera().position;
                console.log(`Update ${i + 1}: moved=${moved}, pos=(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
            }
        };

        // CACHE-TEST KOMMANDOS
        (window as any).verifyBufferSizes = () => {
            if (!app) {
                console.error('App nicht verfügbar. Stelle sicher, dass die App gestartet ist.');
                return;
            }

            console.log('\n' + '='.repeat(80));
            console.log('🔍 BUFFER-GRÖSSEN VERIFIKATION');
            console.log('='.repeat(80));

            const canvas = document.getElementById('canvas') as HTMLCanvasElement;
            const width = canvas.width;
            const height = canvas.height;
            const totalPixels = width * height;

            console.log(`\n📐 Canvas-Dimensionen:`);
            console.log(`  Breite: ${width}px`);
            console.log(`  Höhe: ${height}px`);
            console.log(`  Pixel gesamt: ${totalPixels.toLocaleString()}`);

            console.log(`\n💾 Cache-Buffer Analyse:`);
            try {
                const bufferManager = app.getBufferManager();
                const cacheBuffer = bufferManager.getCacheBuffer();

                const expectedCacheSize = totalPixels * 6 * 4;
                const actualCacheSize = cacheBuffer.size;

                console.log(`  Erwartete Größe: ${expectedCacheSize.toLocaleString()} bytes (6 float32/pixel)`);
                console.log(`  Tatsächliche Größe: ${actualCacheSize.toLocaleString()} bytes`);
                console.log(`  Verhältnis: ${(actualCacheSize / expectedCacheSize * 100).toFixed(1)}%`);
                console.log(`  Status: ${expectedCacheSize === actualCacheSize ? '✅ KORREKT' : '❌ FALSCH'}`);

                if (expectedCacheSize !== actualCacheSize) {
                    console.log(`  🔧 Differenz: ${Math.abs(actualCacheSize - expectedCacheSize).toLocaleString()} bytes`);

                    const bytesPerPixel = actualCacheSize / totalPixels;
                    const componentsPerPixel = bytesPerPixel / 4;
                    console.log(`  📊 Tatsächlich: ${bytesPerPixel} bytes/pixel = ${componentsPerPixel} float32/pixel`);
                }

            } catch (error: any) {
                console.error('❌ Fehler beim Prüfen des Cache-Buffers:', error?.message || error);
            }

            console.log(`\n🎨 Accumulation-Buffer Analyse:`);
            try {
                const bufferManager = app.getBufferManager();
                const accumulationBuffer = bufferManager.getAccumulationBuffer();

                const expectedAccSize = totalPixels * 4 * 4;
                const actualAccSize = accumulationBuffer.size;

                console.log(`  Erwartete Größe: ${expectedAccSize.toLocaleString()} bytes (4 float32/pixel)`);
                console.log(`  Tatsächliche Größe: ${actualAccSize.toLocaleString()} bytes`);
                console.log(`  Status: ${expectedAccSize === actualAccSize ? '✅ KORREKT' : '❌ FALSCH'}`);

            } catch (error: any) {
                console.error('❌ Fehler beim Prüfen des Accumulation-Buffers:', error?.message || error);
            }

            console.log(`\n📦 Andere Buffer:`);
            try {
                const bufferManager = app.getBufferManager();

                console.log(`  Kamera-Buffer: ${bufferManager.getCameraBuffer().size} bytes`);
                console.log(`  Spheres-Buffer: ${bufferManager.getSpheresBuffer().size} bytes`);
                console.log(`  RenderInfo-Buffer: ${bufferManager.getRenderInfoBuffer().size} bytes`);
                console.log(`  SceneConfig-Buffer: ${bufferManager.getSceneConfigBuffer().size} bytes`);

            } catch (error: any) {
                console.error('❌ Fehler beim Prüfen anderer Buffer:', error?.message || error);
            }

            console.log('\n' + '='.repeat(80));
            console.log('🏁 BUFFER-VERIFIKATION ABGESCHLOSSEN');
            console.log('='.repeat(80));
        };

        (window as any).testShaderCompatibility = async () => {
            if (!app) {
                console.error('App nicht verfügbar');
                return;
            }

            console.log('\n' + '='.repeat(80));
            console.log('🔬 SHADER-KOMPATIBILITÄT TEST');
            console.log('='.repeat(80));

            try {
                console.log('\n1️⃣ Cache zurücksetzen...');
                await app.resetCache();

                console.log('\n2️⃣ Test-Frame rendern...');
                await app.renderFrame();
                console.log('  Frame gerendert');

                console.log('\n3️⃣ Cache-Statistiken analysieren...');
                await app.showCacheStatistics();

                console.log('\n4️⃣ Cache-Performance testen...');

                await app.resetCache();

                const startTime1 = performance.now();
                await app.renderFrame();
                const time1 = performance.now() - startTime1;

                const startTime2 = performance.now();
                await app.renderFrame();
                const time2 = performance.now() - startTime2;

                const speedup = time1 / time2;

                console.log(`  Frame 1 (cold): ${time1.toFixed(2)}ms`);
                console.log(`  Frame 2 (cached): ${time2.toFixed(2)}ms`);
                console.log(`  Speedup: ${speedup.toFixed(2)}x`);
                console.log(`  Cache-Status: ${speedup > 1.1 ? '✅ Funktioniert' : '⚠️ Suboptimal'}`);

            } catch (error: any) {
                console.error('❌ Shader-Kompatibilität Test fehlgeschlagen:', error?.message || error);
            }

            console.log('\n' + '='.repeat(80));
            console.log('🏁 SHADER-TEST ABGESCHLOSSEN');
            console.log('='.repeat(80));
        };

        (window as any).cachePerformanceTest = async (iterations = 10) => {
            if (!app) {
                console.error('App nicht verfügbar');
                return;
            }

            console.log('\n' + '='.repeat(70));
            console.log(`🚀 CACHE-PERFORMANCE TEST: ${iterations} Iterationen`);
            console.log('='.repeat(70));

            const results = {
                coldTimes: [] as number[],
                warmTimes: [] as number[],
                hitRates: [] as number[]
            };

            for (let i = 0; i < iterations; i++) {
                console.log(`\n--- Iteration ${i + 1}/${iterations} ---`);

                await app.resetCache();

                const startTimeCold = performance.now();
                await app.renderFrame();
                const coldTime = performance.now() - startTimeCold;
                results.coldTimes.push(coldTime);

                const startTimeWarm = performance.now();
                await app.renderFrame();
                const warmTime = performance.now() - startTimeWarm;
                results.warmTimes.push(warmTime);

                const performanceMonitor = app.getPerformanceMonitor();
                const stats = performanceMonitor.getStats();
                results.hitRates.push(stats.cache.hitRate);

                console.log(`Cold: ${coldTime.toFixed(2)}ms, Warm: ${warmTime.toFixed(2)}ms, Hit Rate: ${stats.cache.hitRate.toFixed(1)}%`);

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const avgCold = results.coldTimes.reduce((a, b) => a + b, 0) / results.coldTimes.length;
            const avgWarm = results.warmTimes.reduce((a, b) => a + b, 0) / results.warmTimes.length;
            const avgHitRate = results.hitRates.reduce((a, b) => a + b, 0) / results.hitRates.length;
            const avgSpeedup = avgCold / avgWarm;

            console.log('\n' + '='.repeat(50));
            console.log('📊 PERFORMANCE ANALYSE:');
            console.log('='.repeat(50));
            console.log(`Ø Cold Frame Zeit:     ${avgCold.toFixed(2)}ms`);
            console.log(`Ø Warm Frame Zeit:     ${avgWarm.toFixed(2)}ms`);
            console.log(`Ø Cache Hit Rate:      ${avgHitRate.toFixed(1)}%`);
            console.log(`Ø Speedup:             ${avgSpeedup.toFixed(2)}x`);
            console.log('='.repeat(50));

            let rating = '';
            if (avgSpeedup > 2.0 && avgHitRate > 80) {
                rating = '🏆 AUSGEZEICHNET';
            } else if (avgSpeedup > 1.5 && avgHitRate > 60) {
                rating = '✅ GUT';
            } else if (avgSpeedup > 1.2 && avgHitRate > 40) {
                rating = '⚠️ AKZEPTABEL';
            } else {
                rating = '❌ PROBLEMATISCH';
            }

            console.log(`\nCache-Performance: ${rating}`);

            return {
                avgCold,
                avgWarm,
                avgHitRate,
                avgSpeedup,
                rating
            };
        };

        console.log('\n💡 Verfügbare Commands:');
        console.log('   renderFrame()          - Einzelnen Frame rendern');
        console.log('   togglePerf()           - Performance-Display ein/aus');
        console.log('   resetCache()           - Cache leeren');
        console.log('   benchmark(100)         - 100 Frames Benchmark');
        console.log('\n🎬 Kamera-Animation:');
        console.log('   rotateCamera()         - Kamera-Rotation starten');
        console.log('   stopCamera()           - Rotation stoppen');
        console.log('   setSpeed(1.0)          - Geschwindigkeit ändern');
        console.log('   renderLoop(360)        - 360 Frames mit Rotation');
        console.log('\n🔧 Cache-Debug:');
        console.log('   debugCacheBug()        - Systematischer Cache-Test');
        console.log('   debugCameraRotation()  - Kamera-Bewegung testen');
        console.log('   verifyBufferSizes()    - Buffer-Größen prüfen');
        console.log('   testShaderCompatibility() - Shader-Cache-Test');
        console.log('   cachePerformanceTest(5) - Performance-Test\n');

    } catch (error: any) {
        logger.error('Fehler:', error);
        throw error;
    }
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});