// Performance Tests für Cache + Selektive Invalidierung

import { WebGPURaytracerApp } from '../core/WebGPURaytracerApp';

/**
 * Setup alle Performance-Tests
 */
export function setupPerformanceTests(app: WebGPURaytracerApp): void {

    // ===== TEST 1: CACHE-EFFEKTIVITÄT - STATISCHE SZENE =====
    (window as any).testStaticScene = async () => {
        console.log('\n╔═══════════════════════════════════════╗');
        console.log('  ║  TEST 1: Cache-Effektivität           ║');
        console.log('  ║  Statische Szene (keine Bewegung)     ║');
        console.log('  ╚═══════════════════════════════════════╝\n');

        // Cache resetten für sauberen Test
        app.resetCache();

        const frameTimes: number[] = [];
        const frameCount = 10;

        console.log('📊 Rendere 10 Frames ohne Bewegung...\n');

        for (let i = 0; i < frameCount; i++) {
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            frameTimes.push(frameTime);

            const speedup = i > 0 ? (frameTimes[0] / frameTime).toFixed(1) : '1.0';
            const status = i === 0 ? '(Cache-Miss)' : '(Cache-Hit)';

            console.log(`Frame ${i + 1}: ${frameTime.toFixed(2)}ms ${status} ${i > 0 ? `→ ${speedup}x schneller` : ''}`);

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Auswertung
        const firstFrame = frameTimes[0];
        const cachedFrames = frameTimes.slice(1);
        const avgCached = cachedFrames.reduce((a, b) => a + b, 0) / cachedFrames.length;
        const speedup = firstFrame / avgCached;

        console.log('\n─────────────────────────────────────');
        console.log('📈 ERGEBNIS:');
        console.log(`├─ Frame 1 (kein Cache): ${firstFrame.toFixed(2)}ms`);
        console.log(`├─ Durchschnitt (Frame 2-10): ${avgCached.toFixed(2)}ms`);
        console.log(`└─ Speedup: ${speedup.toFixed(1)}x schneller`);

        if (speedup > 10) {
            console.log('\n🚀 EXZELLENT: Cache funktioniert perfekt!');
        } else if (speedup > 5) {
            console.log('\n✅ GUT: Cache zeigt deutliche Verbesserung');
        } else {
            console.log('\n⚠️ ACHTUNG: Cache-Speedup niedriger als erwartet');
        }
    };

    // ===== TEST 2: SELEKTIVE INVALIDIERUNG - EINE SPHERE =====
    (window as any).testSingleSphere = async () => {
        console.log('\n╔═══════════════════════════════════════╗');
        console.log('║  TEST 2: Selektive Invalidierung     ║');
        console.log('║  Animation einer einzelnen Sphere    ║');
        console.log('╚═══════════════════════════════════════╝\n');

        // Cache resetten
        app.resetCache();

        // Erste Frame für Cache-Aufbau
        await app.renderFrame();
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('📊 Starte Animation von 1 Sphere...\n');

        // Animation starten - nur 1 Sphere
        app.scene.startSimpleAnimation(1);

        const frameTimes: number[] = [];
        const invalidationData: any[] = [];

        for (let i = 0; i < 3; i++) {
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            frameTimes.push(frameTime);

            // Hole Invalidierungs-Statistiken
            const invalidStats = app.getBufferManager().getInvalidationStats();
            invalidationData.push(invalidStats);

            const pixelsInvalidated = invalidStats?.lastPixelsInvalidated || 0;
            const totalPixels = 800 * 600; // Canvas-Größe
            const percentage = (pixelsInvalidated / totalPixels * 100).toFixed(1);

            console.log(`Frame ${i + 1}: ${frameTime.toFixed(2)}ms | Invalidiert: ${pixelsInvalidated} pixels (${percentage}%)`);

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Animation stoppen
        app.scene.stopAnimation();

        // Auswertung
        const avgTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        const avgInvalidated = invalidationData.reduce((a, b) =>
            a + (b?.lastPixelsInvalidated || 0), 0) / invalidationData.length;
        const totalPixels = 800 * 600;
        const avgPercentage = (avgInvalidated / totalPixels * 100);

        console.log('\n─────────────────────────────────────');
        console.log('📈 ERGEBNIS:');
        console.log(`├─ Durchschnittliche Frame-Zeit: ${avgTime.toFixed(2)}ms`);
        console.log(`├─ Durchschnittlich invalidiert: ${avgInvalidated.toFixed(0)} pixels`);
        console.log(`└─ Durchschnittlich: ${avgPercentage.toFixed(1)}% des Bildes`);

        if (avgPercentage < 10) {
            console.log('\n🎯 PERFEKT: Nur kleine Region invalidiert!');
        } else if (avgPercentage < 30) {
            console.log('\n✅ GUT: Selektive Invalidierung funktioniert');
        } else {
            console.log('\n⚠️ ACHTUNG: Zu viel wird invalidiert');
        }
    };

    // ===== TEST 3: VERGLEICH - SELEKTIV VS. KOMPLETT =====
    (window as any).testSelectiveVsFull = async () => {
        console.log('\n╔═══════════════════════════════════════╗');
        console.log('║  TEST 3: Selektiv vs. Komplett       ║');
        console.log('║  Performance-Vergleich                ║');
        console.log('╚═══════════════════════════════════════╝\n');

        const frameCount = 10;

        // ===== TEIL A: MIT SELEKTIVER INVALIDIERUNG =====
        console.log('🎯 Teil A: MIT selektiver Invalidierung\n');

        app.resetCache();
        await app.renderFrame(); // Cache aufbauen
        await new Promise(resolve => setTimeout(resolve, 100));

        app.scene.startSimpleAnimation(10); // ⚡ FIX: Nur 10 Spheres animieren statt alle 400!

        const selectiveTimes: number[] = [];
        const selectiveInvalidated: number[] = [];

        for (let i = 0; i < frameCount; i++) {
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            selectiveTimes.push(frameTime);

            const invalidStats = app.getBufferManager().getInvalidationStats();
            const pixelsInvalidated = invalidStats?.lastPixelsInvalidated || 0;
            selectiveInvalidated.push(pixelsInvalidated);

            console.log(`  Frame ${i + 1}: ${frameTime.toFixed(2)}ms`);

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        app.scene.stopAnimation();

        const selectiveAvg = selectiveTimes.reduce((a, b) => a + b, 0) / selectiveTimes.length;
        const selectivePixelsAvg = selectiveInvalidated.reduce((a, b) => a + b, 0) / selectiveInvalidated.length;

        console.log(`\n  → Durchschnitt: ${selectiveAvg.toFixed(2)}ms`);
        console.log(`  → Invalidiert: ${selectivePixelsAvg.toFixed(0)} pixels\n`);

        // ===== TEIL B: KOMPLETTE INVALIDIERUNG (SIMULIERT) =====
        console.log('💥 Teil B: OHNE selektive Invalidierung (kompletter Reset)\n');

        const fullInvalidationTimes: number[] = [];

        for (let i = 0; i < frameCount; i++) {
            // Cache komplett resetten (simuliert keine selektive Invalidierung)
            app.resetCache();

            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            fullInvalidationTimes.push(frameTime);

            console.log(`  Frame ${i + 1}: ${frameTime.toFixed(2)}ms`);

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        const fullAvg = fullInvalidationTimes.reduce((a, b) => a + b, 0) / fullInvalidationTimes.length;

        console.log(`\n  → Durchschnitt: ${fullAvg.toFixed(2)}ms`);
        console.log(`  → Invalidiert: ${(800 * 600)} pixels (100%)\n`);

        // ===== VERGLEICH =====
        const speedup = fullAvg / selectiveAvg;
        const totalPixels = 800 * 600;
        const selectivePercentage = (selectivePixelsAvg / totalPixels * 100);

        console.log('─────────────────────────────────────');
        console.log('📊 VERGLEICH:');
        console.log(`├─ Selektiv: ${selectiveAvg.toFixed(2)}ms (${selectivePercentage.toFixed(1)}% invalidiert)`);
        console.log(`├─ Komplett: ${fullAvg.toFixed(2)}ms (100% invalidiert)`);
        console.log(`└─ Speedup: ${speedup.toFixed(1)}x schneller`);

        if (speedup > 3) {
            console.log('\n🚀 EXZELLENT: Selektive Invalidierung ist >3x schneller!');
        } else if (speedup > 2) {
            console.log('\n✅ GUT: Selektive Invalidierung zeigt deutlichen Vorteil');
        } else {
            console.log('\n⚠️ ACHTUNG: Speedup niedriger als erwartet');
        }
    };

    // ===== TEST 4: WORST-CASE - KAMERA-BEWEGUNG =====
    (window as any).testCameraMovement = async () => {
        console.log('\n╔═══════════════════════════════════════╗');
        console.log('║  TEST 4: Worst-Case Szenario         ║');
        console.log('║  Kamera-Bewegung (100% Invalidierung)║');
        console.log('╚═══════════════════════════════════════╝\n');

        app.resetCache();

        // Cache aufbauen
        await app.renderFrame();
        const cacheTime = performance.now();
        await app.renderFrame();
        const cachedFrameTime = performance.now() - cacheTime;

        console.log(`📊 Baseline (mit Cache): ${cachedFrameTime.toFixed(2)}ms\n`);

        console.log('🎥 Bewege Kamera (sollte kompletten Cache invalidieren)...\n');

        const camera = app.scene.getCamera();
        const originalPos = camera.position.clone();

        const frameTimes: number[] = [];

        for (let i = 0; i < 5; i++) {
            // Kamera leicht bewegen
            camera.position.x += 0.1;
            camera.lookAt(0, 0, 0);

            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            frameTimes.push(frameTime);

            console.log(`Frame ${i + 1}: ${frameTime.toFixed(2)}ms`);

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Kamera zurücksetzen
        camera.position.copy(originalPos);
        camera.lookAt(0, 0, 0);

        const avgTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;

        console.log('\n─────────────────────────────────────');
        console.log('📈 ERGEBNIS:');
        console.log(`├─ Durchschnittliche Frame-Zeit: ${avgTime.toFixed(2)}ms`);
        console.log(`├─ Baseline (mit Cache): ${cachedFrameTime.toFixed(2)}ms`);
        console.log(`└─ Faktor: ${(avgTime / cachedFrameTime).toFixed(1)}x langsamer`);

        console.log('\n✅ ERWARTUNG: Kamera-Bewegung invalidiert kompletten Cache korrekt');
    };

    // ===== TEST 5: SKALIERUNG - VIELE SPHERES =====
    (window as any).testScaling = async () => {
        console.log('\n╔═══════════════════════════════════════╗');
        console.log('║  TEST 5: Skalierung                  ║');
        console.log('║  1, 3, 10 bewegte Spheres            ║');
        console.log('╚═══════════════════════════════════════╝\n');

        console.log('⚠️ HINWEIS: Dieser Test benötigt manuelle Sphere-Animation');
        console.log('Implementierung folgt mit erweitertem Animation-System\n');

        // Placeholder - benötigt erweiterte Scene API für variable Sphere-Anzahl
        console.log('TODO: Implementierung wenn Scene.animateSpecificSpheres(count) verfügbar ist');
    };

    // ===== UMFASSENDER PERFORMANCE-TEST: ALLE KOMBINATIONEN =====
    (window as any).testFullPerformanceMatrix = async () => {
        console.log('\n╔════════════════════════════════════════════════════╗');
        console.log('║  UMFASSENDER PERFORMANCE-TEST                      ║');
        console.log('║  Teste alle BVH + Cache Kombinationen             ║');
        console.log('╚════════════════════════════════════════════════════╝\n');

        const results: any = {
            noBvhNoCache: null,
            bvhNoCache: null,
            noBvhCache: null,
            bvhCache: null
        };

        const frameCount = 20;
        const warmupFrames = 3;

        // ===== TEST 1: OHNE BVH, OHNE CACHE (BASELINE) =====
        console.log('🔧 TEST 1/4: OHNE BVH, OHNE CACHE (Baseline - Worst Case)');
        app.bufferManager.setBVHEnabled(false);

        const noBvhNoCacheTimes: number[] = [];
        for (let i = 0; i < frameCount + warmupFrames; i++) {
            app.resetCache(); // Kein Cache
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;

            if (i >= warmupFrames) {
                noBvhNoCacheTimes.push(frameTime);
            }

            await new Promise(resolve => setTimeout(resolve, 50));
        }
        results.noBvhNoCache = {
            avg: noBvhNoCacheTimes.reduce((a, b) => a + b) / noBvhNoCacheTimes.length,
            min: Math.min(...noBvhNoCacheTimes),
            max: Math.max(...noBvhNoCacheTimes),
            fps: 1000 / (noBvhNoCacheTimes.reduce((a, b) => a + b) / noBvhNoCacheTimes.length)
        };
        console.log(`  ✅ Durchschnitt: ${results.noBvhNoCache.avg.toFixed(2)}ms (${results.noBvhNoCache.fps.toFixed(1)} FPS)\n`);

        await new Promise(resolve => setTimeout(resolve, 500));

        // ===== TEST 2: MIT BVH, OHNE CACHE =====
        console.log('🔧 TEST 2/4: MIT BVH, OHNE CACHE');
        app.bufferManager.setBVHEnabled(true);

        const bvhNoCacheTimes: number[] = [];
        for (let i = 0; i < frameCount + warmupFrames; i++) {
            app.resetCache(); // Kein Cache
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;

            if (i >= warmupFrames) {
                bvhNoCacheTimes.push(frameTime);
            }

            await new Promise(resolve => setTimeout(resolve, 50));
        }
        results.bvhNoCache = {
            avg: bvhNoCacheTimes.reduce((a, b) => a + b) / bvhNoCacheTimes.length,
            min: Math.min(...bvhNoCacheTimes),
            max: Math.max(...bvhNoCacheTimes),
            fps: 1000 / (bvhNoCacheTimes.reduce((a, b) => a + b) / bvhNoCacheTimes.length)
        };
        console.log(`  ✅ Durchschnitt: ${results.bvhNoCache.avg.toFixed(2)}ms (${results.bvhNoCache.fps.toFixed(1)} FPS)\n`);

        await new Promise(resolve => setTimeout(resolve, 500));

        // ===== TEST 3: OHNE BVH, MIT CACHE + INVALIDIERUNG =====
        console.log('🔧 TEST 3/4: OHNE BVH, MIT CACHE + INVALIDIERUNG');
        app.bufferManager.setBVHEnabled(false);
        app.resetCache();

        // Cache warmup
        for (let i = 0; i < warmupFrames; i++) {
            await app.renderFrame();
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Animation starten
        app.scene.startSimpleAnimation(10);

        const noBvhCacheTimes: number[] = [];
        for (let i = 0; i < frameCount; i++) {
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            noBvhCacheTimes.push(frameTime);

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        app.scene.stopAnimation();

        results.noBvhCache = {
            avg: noBvhCacheTimes.reduce((a, b) => a + b) / noBvhCacheTimes.length,
            min: Math.min(...noBvhCacheTimes),
            max: Math.max(...noBvhCacheTimes),
            fps: 1000 / (noBvhCacheTimes.reduce((a, b) => a + b) / noBvhCacheTimes.length)
        };
        console.log(`  ✅ Durchschnitt: ${results.noBvhCache.avg.toFixed(2)}ms (${results.noBvhCache.fps.toFixed(1)} FPS)\n`);

        await new Promise(resolve => setTimeout(resolve, 500));

        // ===== TEST 4: MIT BVH + CACHE + INVALIDIERUNG (BEST CASE) =====
        console.log('🔧 TEST 4/4: MIT BVH + CACHE + INVALIDIERUNG (Best Case)');
        app.bufferManager.setBVHEnabled(true);
        app.resetCache();

        // Cache warmup
        for (let i = 0; i < warmupFrames; i++) {
            await app.renderFrame();
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Animation starten
        app.scene.startSimpleAnimation(10);

        const bvhCacheTimes: number[] = [];
        for (let i = 0; i < frameCount; i++) {
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            bvhCacheTimes.push(frameTime);

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        app.scene.stopAnimation();

        results.bvhCache = {
            avg: bvhCacheTimes.reduce((a, b) => a + b) / bvhCacheTimes.length,
            min: Math.min(...bvhCacheTimes),
            max: Math.max(...bvhCacheTimes),
            fps: 1000 / (bvhCacheTimes.reduce((a, b) => a + b) / bvhCacheTimes.length)
        };
        console.log(`  ✅ Durchschnitt: ${results.bvhCache.avg.toFixed(2)}ms (${results.bvhCache.fps.toFixed(1)} FPS)\n`);

        // ===== ZUSAMMENFASSUNG =====
        const baseline = results.noBvhNoCache.avg;

        console.log('\n╔═══════════════════════════════════════════════════════════════════════════════╗');
        console.log('║                       PERFORMANCE ZUSAMMENFASSUNG                             ║');
        console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
        console.log('║                                                                               ║');
        console.log('║  Konfiguration               │  Avg Time  │    FPS    │  Speedup  │  Rating  ║');
        console.log('║──────────────────────────────┼────────────┼───────────┼───────────┼─────────║');
        console.log(`║  1. OHNE BVH, OHNE Cache     │  ${results.noBvhNoCache.avg.toFixed(2).padStart(6)}ms  │  ${results.noBvhNoCache.fps.toFixed(1).padStart(6)}  │   1.0x    │  ⚠️ Worst ║`);
        console.log(`║  2. MIT BVH, OHNE Cache      │  ${results.bvhNoCache.avg.toFixed(2).padStart(6)}ms  │  ${results.bvhNoCache.fps.toFixed(1).padStart(6)}  │   ${(baseline / results.bvhNoCache.avg).toFixed(1)}x    │  ${results.bvhNoCache.avg < baseline * 0.5 ? '✅' : '⚡'} Good  ║`);
        console.log(`║  3. OHNE BVH, MIT Cache      │  ${results.noBvhCache.avg.toFixed(2).padStart(6)}ms  │  ${results.noBvhCache.fps.toFixed(1).padStart(6)}  │   ${(baseline / results.noBvhCache.avg).toFixed(1)}x    │  ${results.noBvhCache.avg < baseline * 0.3 ? '✅' : '⚡'} Good  ║`);
        console.log(`║  4. MIT BVH + Cache (Best)   │  ${results.bvhCache.avg.toFixed(2).padStart(6)}ms  │  ${results.bvhCache.fps.toFixed(1).padStart(6)}  │   ${(baseline / results.bvhCache.avg).toFixed(1)}x    │  🚀 Best  ║`);
        console.log('║                                                                               ║');
        console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
        console.log('║                           SPEEDUP ANALYSE                                     ║');
        console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
        console.log(`║  BVH Speedup (ohne Cache):     ${(results.noBvhNoCache.avg / results.bvhNoCache.avg).toFixed(2)}x schneller                                  ║`);
        console.log(`║  Cache Speedup (ohne BVH):     ${(results.noBvhNoCache.avg / results.noBvhCache.avg).toFixed(2)}x schneller                                  ║`);
        console.log(`║  BVH + Cache Speedup:          ${(results.noBvhNoCache.avg / results.bvhCache.avg).toFixed(2)}x schneller (Best!)                           ║`);
        console.log('║                                                                               ║');
        console.log(`║  Synergy Bonus:                ${((results.noBvhNoCache.avg / results.bvhCache.avg) / ((results.noBvhNoCache.avg / results.bvhNoCache.avg) + (results.noBvhNoCache.avg / results.noBvhCache.avg) - 1)).toFixed(2)}x (BVH×Cache > BVH+Cache)                     ║`);
        console.log('╚═══════════════════════════════════════════════════════════════════════════════╝\n');

        // Detailstatistiken
        console.log('📊 DETAILSTATISTIKEN:');
        console.log('────────────────────────────────────────────────────────────────────────────────');
        console.log(`Ohne BVH, Ohne Cache:  Min: ${results.noBvhNoCache.min.toFixed(2)}ms (${(1000/results.noBvhNoCache.min).toFixed(1)} FPS), Max: ${results.noBvhNoCache.max.toFixed(2)}ms (${(1000/results.noBvhNoCache.max).toFixed(1)} FPS)`);
        console.log(`Mit BVH, Ohne Cache:   Min: ${results.bvhNoCache.min.toFixed(2)}ms (${(1000/results.bvhNoCache.min).toFixed(1)} FPS), Max: ${results.bvhNoCache.max.toFixed(2)}ms (${(1000/results.bvhNoCache.max).toFixed(1)} FPS)`);
        console.log(`Ohne BVH, Mit Cache:   Min: ${results.noBvhCache.min.toFixed(2)}ms (${(1000/results.noBvhCache.min).toFixed(1)} FPS), Max: ${results.noBvhCache.max.toFixed(2)}ms (${(1000/results.noBvhCache.max).toFixed(1)} FPS)`);
        console.log(`Mit BVH + Cache:       Min: ${results.bvhCache.min.toFixed(2)}ms (${(1000/results.bvhCache.min).toFixed(1)} FPS), Max: ${results.bvhCache.max.toFixed(2)}ms (${(1000/results.bvhCache.max).toFixed(1)} FPS)`);
        console.log('────────────────────────────────────────────────────────────────────────────────\n');

        return results;
    };

    // ===== HELPER: ALLE TESTS AUSFÜHREN =====
    (window as any).runAllTests = async () => {
        console.log('\n╔═══════════════════════════════════════╗');
        console.log('║  ALLE PERFORMANCE-TESTS               ║');
        console.log('╚═══════════════════════════════════════╝');

        await (window as any).testStaticScene();
        await new Promise(resolve => setTimeout(resolve, 500));

        await (window as any).testSingleSphere();
        await new Promise(resolve => setTimeout(resolve, 500));

        await (window as any).testSelectiveVsFull();
        await new Promise(resolve => setTimeout(resolve, 500));

        await (window as any).testCameraMovement();

        console.log('\n╔═══════════════════════════════════════╗');
        console.log('║  ALLE TESTS ABGESCHLOSSEN             ║');
        console.log('╚═══════════════════════════════════════╝\n');
    };
}
