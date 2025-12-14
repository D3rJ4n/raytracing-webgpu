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
        console.log(`Ohne BVH, Ohne Cache:  Min: ${results.noBvhNoCache.min.toFixed(2)}ms (${(1000 / results.noBvhNoCache.min).toFixed(1)} FPS), Max: ${results.noBvhNoCache.max.toFixed(2)}ms (${(1000 / results.noBvhNoCache.max).toFixed(1)} FPS)`);
        console.log(`Mit BVH, Ohne Cache:   Min: ${results.bvhNoCache.min.toFixed(2)}ms (${(1000 / results.bvhNoCache.min).toFixed(1)} FPS), Max: ${results.bvhNoCache.max.toFixed(2)}ms (${(1000 / results.bvhNoCache.max).toFixed(1)} FPS)`);
        console.log(`Ohne BVH, Mit Cache:   Min: ${results.noBvhCache.min.toFixed(2)}ms (${(1000 / results.noBvhCache.min).toFixed(1)} FPS), Max: ${results.noBvhCache.max.toFixed(2)}ms (${(1000 / results.noBvhCache.max).toFixed(1)} FPS)`);
        console.log(`Mit BVH + Cache:       Min: ${results.bvhCache.min.toFixed(2)}ms (${(1000 / results.bvhCache.min).toFixed(1)} FPS), Max: ${results.bvhCache.max.toFixed(2)}ms (${(1000 / results.bvhCache.max).toFixed(1)} FPS)`);
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

    // ===== BVH SKALIERUNGS-TEST: MIT BVH =====
    (window as any).testBVHScaling = async () => {
        console.log('\n╔════════════════════════════════════════════════════════════════════╗');
        console.log('║  BVH SKALIERUNGS-TEST (MIT BVH)                                    ║');
        console.log('║  Start: 200 Kugeln, +50 pro Durchgang, 10 Durchgänge             ║');
        console.log('║  Je 100 Render-Durchläufe pro Kugel-Anzahl                       ║');
        console.log('║  Cache wird vor JEDEM Frame resettet (reines BVH-Testing)        ║');
        console.log('╚════════════════════════════════════════════════════════════════════╝\n');

        const startSpheres = 200;
        const sphereIncrement = 50;
        const iterations = 10;
        const framesPerIteration = 100;

        const results: Array<{
            sphereCount: number;
            avgTime: number;
            minTime: number;
            maxTime: number;
            fps: number;
        }> = [];

        // BVH aktivieren
        app.bufferManager.setBVHEnabled(true);
        app.resetCache();
        console.log('✅ BVH aktiviert\n');

        for (let iter = 0; iter < iterations; iter++) {
            const sphereCount = startSpheres + (iter * sphereIncrement);
            console.log(`\n🔧 Iteration ${iter + 1}/${iterations}: ${sphereCount} Kugeln`);
            app.resetCache();
            // Szene mit neuer Kugel-Anzahl erstellen
            app.scene.createDynamicSphereScene(sphereCount);


            // ⚡ DEBUG: Verifiziere dass BVH aktiviert ist und korrekte Sphere-Count
            const actualSphereCount = app.scene.getSphereCount();
            const bvhEnabled = app.bufferManager.isBVHEnabled();
            console.log(`  📊 Verifizierung: ${actualSphereCount} Spheres in Scene, BVH: ${bvhEnabled ? '✅ Aktiviert (korrekt)' : '❌ DEAKTIVIERT (FEHLER!)'}`);

            // Warmup: 3 Frames
            for (let i = 0; i < 3; i++) {
                await app.renderFrame();
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // 50 Render-Durchläufe
            const frameTimes: number[] = [];
            for (let frame = 0; frame < framesPerIteration; frame++) {
                app.resetCache(); // Jeder Frame ohne Cache (reines BVH-Testing)
                const start = performance.now();
                await app.renderFrame();
                const frameTime = performance.now() - start;
                frameTimes.push(frameTime);

                if (frame % 10 === 0) {
                    console.log(`  Frame ${frame + 1}/${framesPerIteration}: ${frameTime.toFixed(2)}ms`);
                }

                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Statistiken berechnen
            const avgTime = frameTimes.reduce((a, b) => a + b) / frameTimes.length;
            const minTime = Math.min(...frameTimes);
            const maxTime = Math.max(...frameTimes);
            const fps = 1000 / avgTime;

            results.push({
                sphereCount,
                avgTime,
                minTime,
                maxTime,
                fps
            });

            console.log(`  ✅ Durchschnitt: ${avgTime.toFixed(2)}ms (${fps.toFixed(1)} FPS)`);
            console.log(`     Min: ${minTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);

            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Zusammenfassung
        console.log('\n╔═════════════════════════════════════════════════════════════════╗');
        console.log('║                   BVH SKALIERUNGS-ZUSAMMENFASSUNG                 ║');
        console.log('╠═══════════════════════════════════════════════════════════════════╣');
        console.log('║  Kugeln  │  Avg Time  │    FPS    │  Min Time  │  Max Time        ║');
        console.log('║──────────┼────────────┼───────────┼────────────┼──────────────────║');

        results.forEach((result) => {
            const spheres = result.sphereCount.toString().padStart(6);
            const avg = result.avgTime.toFixed(2).padStart(8);
            const fps = result.fps.toFixed(1).padStart(7);
            const min = result.minTime.toFixed(2).padStart(8);
            const max = result.maxTime.toFixed(2).padStart(8);

            console.log(`║  ${spheres}  │  ${avg}ms  │  ${fps}  │  ${min}ms  │  ${max}ms    ║`);
        });

        console.log('╚════════════════════════════════════════════════════════════════════╝\n');

        // Komplexitäts-Analyse
        const firstResult = results[0];
        const lastResult = results[results.length - 1];
        const sphereRatio = lastResult.sphereCount / firstResult.sphereCount;
        const timeRatio = lastResult.avgTime / firstResult.avgTime;
        const logRatio = Math.log(lastResult.sphereCount) / Math.log(firstResult.sphereCount);

        console.log('📊 KOMPLEXITÄTS-ANALYSE:');
        console.log('────────────────────────────────────────────────────────────────────────');
        console.log(`Kugeln: ${firstResult.sphereCount} → ${lastResult.sphereCount} (${sphereRatio.toFixed(2)}x mehr)`);
        console.log(`Zeit: ${firstResult.avgTime.toFixed(2)}ms → ${lastResult.avgTime.toFixed(2)}ms (${timeRatio.toFixed(2)}x länger)`);
        console.log(`Erwarteter O(log n) Faktor: ${logRatio.toFixed(2)}x`);
        console.log(`Tatsächlicher Faktor: ${timeRatio.toFixed(2)}x`);

        if (timeRatio < logRatio * 1.2) {
            console.log('\n🚀 EXZELLENT: Logarithmische Komplexität bestätigt! (BVH funktioniert perfekt)');
        } else if (timeRatio < sphereRatio * 0.5) {
            console.log('\n✅ GUT: Sub-lineare Komplexität (besser als O(n))');
        } else if (timeRatio < sphereRatio) {
            console.log('\n⚠️ WARNUNG: Annähernd linear (BVH-Vorteil nicht optimal)');
        } else {
            console.log('\n❌ PROBLEM: Schlechter als linear (BVH möglicherweise defekt)');
        }

        console.log('────────────────────────────────────────────────────────────────────────\n');

        return results;
    };

    // ===== CACHE SKALIERUNGS-TEST: MIT CACHE =====
    (window as any).testCacheScaling = async () => {
        console.log('\n╔════════════════════════════════════════════════════════════════════╗');
        console.log('║  CACHE SKALIERUNGS-TEST (MIT CACHE)                                ║');
        console.log('║  Start: 200 Kugeln, +50 pro Durchgang, 10 Durchgänge             ║');
        console.log('║  Je 100 Render-Durchläufe pro Kugel-Anzahl                       ║');
        console.log('║  Statische Szene - Cache bleibt aktiv (reines Cache-Testing)     ║');
        console.log('║  Cache wird NUR bei neuer Kugelanzahl resettet                   ║');
        console.log('╚════════════════════════════════════════════════════════════════════╝\n');

        const startSpheres = 200;
        const sphereIncrement = 50;
        const iterations = 10;
        const framesPerIteration = 100;
        const warmupFrames = 3;

        const results: Array<{
            sphereCount: number;
            avgTime: number;
            minTime: number;
            maxTime: number;
            fps: number;
        }> = [];

        // BVH aktivieren (Cache nutzt auch BVH)
        app.bufferManager.setBVHEnabled(true);
        console.log('✅ BVH + Cache aktiviert\n');

        for (let iter = 0; iter < iterations; iter++) {
            const sphereCount = startSpheres + (iter * sphereIncrement);
            console.log(`\n🔧 Iteration ${iter + 1}/${iterations}: ${sphereCount} Kugeln`);

            // WICHTIG: Szene mit neuer Kugel-Anzahl erstellen
            app.scene.createDynamicSphereScene(sphereCount);

            // WICHTIG: Cache resetten bei neuer Kugelanzahl (Geometrie-Änderung)
            app.resetCache();

            // Verifizierung
            const actualSphereCount = app.scene.getSphereCount();
            const bvhEnabled = app.bufferManager.isBVHEnabled();
            console.log(`  📊 Verifizierung: ${actualSphereCount} Spheres in Scene, BVH: ${bvhEnabled ? '✅' : '❌'}`);

            // Warmup: Cache aufbauen + BVH wird hier gebaut (nicht in Messzeit!)
            console.log(`  🔥 Warmup: Cache aufbauen (${warmupFrames} Frames, NICHT in Messzeit)...`);
            for (let i = 0; i < warmupFrames; i++) {
                await app.renderFrame();
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            console.log(`  ✅ Warmup abgeschlossen - Cache ist warm, BVH gebaut\n`);

            // 100 Render-Durchläufe mit warmem Cache (KEINE Geometrie-Änderungen!)
            const frameTimes: number[] = [];

            for (let frame = 0; frame < framesPerIteration; frame++) {
                // WICHTIG: Cache NICHT resetten - das ist der Cache-Test!
                const start = performance.now();
                await app.renderFrame();
                const frameTime = performance.now() - start;
                frameTimes.push(frameTime);

                if (frame % 10 === 0) {
                    console.log(`  Frame ${frame + 1}/${framesPerIteration}: ${frameTime.toFixed(2)}ms`);
                }

                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Statistiken berechnen
            const avgTime = frameTimes.reduce((a, b) => a + b) / frameTimes.length;
            const minTime = Math.min(...frameTimes);
            const maxTime = Math.max(...frameTimes);
            const fps = 1000 / avgTime;

            results.push({
                sphereCount,
                avgTime,
                minTime,
                maxTime,
                fps
            });

            console.log(`  ✅ Durchschnitt: ${avgTime.toFixed(2)}ms (${fps.toFixed(1)} FPS)`);
            console.log(`     Min: ${minTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);

            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Zusammenfassung
        console.log('\n╔═════════════════════════════════════════════════════════════════╗');
        console.log('║                   CACHE SKALIERUNGS-ZUSAMMENFASSUNG               ║');
        console.log('╠═══════════════════════════════════════════════════════════════════╣');
        console.log('║  Kugeln  │  Avg Time  │    FPS    │  Min Time  │  Max Time        ║');
        console.log('║──────────┼────────────┼───────────┼────────────┼──────────────────║');

        results.forEach((result) => {
            const spheres = result.sphereCount.toString().padStart(6);
            const avg = result.avgTime.toFixed(2).padStart(8);
            const fps = result.fps.toFixed(1).padStart(7);
            const min = result.minTime.toFixed(2).padStart(8);
            const max = result.maxTime.toFixed(2).padStart(8);

            console.log(`║  ${spheres}  │  ${avg}ms  │  ${fps}  │  ${min}ms  │  ${max}ms    ║`);
        });

        console.log('╚════════════════════════════════════════════════════════════════════╝\n');

        // Cache-Effizienz-Analyse
        const firstResult = results[0];
        const lastResult = results[results.length - 1];
        const sphereRatio = lastResult.sphereCount / firstResult.sphereCount;
        const timeRatio = lastResult.avgTime / firstResult.avgTime;

        console.log('📊 CACHE-EFFIZIENZ-ANALYSE:');
        console.log('────────────────────────────────────────────────────────────────────────');
        console.log(`Kugeln: ${firstResult.sphereCount} → ${lastResult.sphereCount} (${sphereRatio.toFixed(2)}x mehr)`);
        console.log(`Zeit: ${firstResult.avgTime.toFixed(2)}ms → ${lastResult.avgTime.toFixed(2)}ms (${timeRatio.toFixed(2)}x Faktor)`);
        console.log(`Erwartung: ~1.0x (Cache sollte Performance konstant halten)`);

        if (timeRatio < 1.2) {
            console.log('\n🚀 EXZELLENT: Performance nahezu konstant! (Cache funktioniert perfekt)');
            console.log('   Bei statischer Szene ist die Kugel-Anzahl irrelevant - Cache macht alles!');
        } else if (timeRatio < 1.5) {
            console.log('\n✅ SEHR GUT: Minimale Performance-Degradierung trotz mehr Kugeln');
        } else if (timeRatio < 2.0) {
            console.log('\n⚠️ OK: Moderater Performance-Verlust bei mehr Kugeln');
        } else {
            console.log('\n❌ PROBLEM: Signifikanter Performance-Verlust (Cache möglicherweise ineffizient)');
        }

        console.log('────────────────────────────────────────────────────────────────────────\n');

        return results;
    };

    // ===== LINEARER SKALIERUNGS-TEST: OHNE BVH =====
    (window as any).testLinearScaling = async () => {
        console.log('\n╔════════════════════════════════════════════════════════════════════╗');
        console.log('║  LINEARER SKALIERUNGS-TEST (OHNE BVH)                              ║');
        console.log('║  Start: 200 Kugeln, +50 pro Durchgang, 10 Durchgänge             ║');
        console.log('║  Je 100 Render-Durchläufe pro Kugel-Anzahl                       ║');
        console.log('║  Cache wird vor JEDEM Frame resettet (reines lineares Rendering) ║');
        console.log('╚════════════════════════════════════════════════════════════════════╝\n');

        const startSpheres = 500;
        const sphereIncrement = 50;
        const iterations = 10;
        const framesPerIteration = 100;

        const results: Array<{
            sphereCount: number;
            avgTime: number;
            minTime: number;
            maxTime: number;
            fps: number;
        }> = [];

        // BVH deaktivieren
        app.bufferManager.setBVHEnabled(false);
        console.log('✅ BVH deaktiviert (lineares Rendering)\n');

        for (let iter = 0; iter < iterations; iter++) {
            const sphereCount = startSpheres + (iter * sphereIncrement);
            console.log(`\n🔧 Iteration ${iter + 1}/${iterations}: ${sphereCount} Kugeln`);

            // Szene mit neuer Kugel-Anzahl erstellen
            app.scene.createDynamicSphereScene(sphereCount);
            app.resetCache();

            // ⚡ DEBUG: Verifiziere dass BVH deaktiviert ist und korrekte Sphere-Count
            const actualSphereCount = app.scene.getSphereCount();
            const bvhEnabled = app.bufferManager.isBVHEnabled();
            console.log(`  📊 Verifizierung: ${actualSphereCount} Spheres in Scene, BVH: ${bvhEnabled ? '✅ AKTIVIERT (FEHLER!)' : '❌ Deaktiviert (korrekt)'}`);

            // Warmup: 3 Frames
            for (let i = 0; i < 3; i++) {
                await app.renderFrame();
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // 50 Render-Durchläufe
            const frameTimes: number[] = [];
            for (let frame = 0; frame < framesPerIteration; frame++) {
                app.resetCache(); // Jeder Frame ohne Cache (reines lineares Testing)
                const start = performance.now();
                await app.renderFrame();
                const frameTime = performance.now() - start;
                frameTimes.push(frameTime);

                if (frame % 10 === 0) {
                    console.log(`  Frame ${frame + 1}/${framesPerIteration}: ${frameTime.toFixed(2)}ms`);
                }

                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Statistiken berechnen
            const avgTime = frameTimes.reduce((a, b) => a + b) / frameTimes.length;
            const minTime = Math.min(...frameTimes);
            const maxTime = Math.max(...frameTimes);
            const fps = 1000 / avgTime;

            results.push({
                sphereCount,
                avgTime,
                minTime,
                maxTime,
                fps
            });

            console.log(`  ✅ Durchschnitt: ${avgTime.toFixed(2)}ms (${fps.toFixed(1)} FPS)`);
            console.log(`     Min: ${minTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);

            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Zusammenfassung
        console.log('\n╔═════════════════════════════════════════════════════════════════╗');
        console.log('║                LINEARER SKALIERUNGS-ZUSAMMENFASSUNG             ║');
        console.log('╠═════════════════════════════════════════════════════════════════╣');
        console.log('║  Kugeln  │  Avg Time  │    FPS    │  Min Time  │  Max Time    ║');
        console.log('║──────────┼────────────┼───────────┼────────────┼──────────────║');

        results.forEach((result) => {
            const spheres = result.sphereCount.toString().padStart(6);
            const avg = result.avgTime.toFixed(2).padStart(8);
            const fps = result.fps.toFixed(1).padStart(7);
            const min = result.minTime.toFixed(2).padStart(8);
            const max = result.maxTime.toFixed(2).padStart(8);

            console.log(`║  ${spheres}  │  ${avg}ms  │  ${fps}  │  ${min}ms  │  ${max}ms    ║`);
        });

        console.log('╚═════════════════════════════════════════════════════════════════╝\n');

        // Linearitäts-Analyse
        const firstResult = results[0];
        const lastResult = results[results.length - 1];
        const sphereRatio = lastResult.sphereCount / firstResult.sphereCount;
        const timeRatio = lastResult.avgTime / firstResult.avgTime;

        console.log('📊 LINEARITÄTS-ANALYSE:');
        console.log('────────────────────────────────────────────────────────────────────────');
        console.log(`Kugeln: ${firstResult.sphereCount} → ${lastResult.sphereCount} (${sphereRatio.toFixed(2)}x mehr)`);
        console.log(`Zeit: ${firstResult.avgTime.toFixed(2)}ms → ${lastResult.avgTime.toFixed(2)}ms (${timeRatio.toFixed(2)}x länger)`);
        console.log(`Erwarteter linearer Faktor: ${sphereRatio.toFixed(2)}x`);
        console.log(`Tatsächlicher Faktor: ${timeRatio.toFixed(2)}x`);
        console.log(`Abweichung: ${((timeRatio / sphereRatio - 1) * 100).toFixed(1)}%`);

        if (Math.abs(timeRatio / sphereRatio - 1) < 0.15) {
            console.log('\n✅ PERFEKT: Lineare Komplexität O(n) bestätigt!');
        } else if (timeRatio < sphereRatio) {
            console.log('\n🚀 ÜBERRASCHUNG: Besser als linear (möglicherweise GPU-Caching)');
        } else {
            console.log('\n⚠️ HINWEIS: Schlechter als linear (möglicherweise Overhead oder Cache-Effekte)');
        }

        console.log('────────────────────────────────────────────────────────────────────────\n');

        return results;
    };

    // ===== UMFASSENDE TEST-SUITE: STATISCH, MOVED, ANIMIERT =====
    (window as any).testComprehensive = async () => {
        console.log('\n╔════════════════════════════════════════════════════════════════════╗');
        console.log('║  UMFASSENDE TEST-SUITE                                             ║');
        console.log('║  Kategorie 1: Statisches Bild                                      ║');
        console.log('║  Kategorie 2: Moved Spheres (2 Kugeln einmalig verschieben)      ║');
        console.log('║  Kategorie 3: Animierte Spheres (2 Kugeln kontinuierlich)        ║');
        console.log('╚════════════════════════════════════════════════════════════════════╝\n');

        const allResults: any = {};
        const frameCount = 20;
        const warmupFrames = 3;

        // ===== KATEGORIE 1: STATISCHES BILD =====
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║  KATEGORIE 1: STATISCHES BILD (keine Bewegung)              ║');
        console.log('╚══════════════════════════════════════════════════════════════╝\n');

        // Test 1.1: Ohne BVH, Ohne Cache
        console.log('🔧 Test 1.1: OHNE BVH, OHNE Cache (Statisch)');
        app.bufferManager.setBVHEnabled(false);

        const static_noBvhNoCache: number[] = [];
        for (let i = 0; i < frameCount + warmupFrames; i++) {
            app.resetCache(); // Cache vor JEDEM Frame resetten
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            if (i >= warmupFrames) static_noBvhNoCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        allResults.static_noBvhNoCache = {
            avg: static_noBvhNoCache.reduce((a, b) => a + b) / static_noBvhNoCache.length,
            min: Math.min(...static_noBvhNoCache),
            max: Math.max(...static_noBvhNoCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.static_noBvhNoCache.avg.toFixed(2)}ms\n`);

        // Test 1.2: Mit BVH, Ohne Cache
        console.log('🔧 Test 1.2: MIT BVH, OHNE Cache (Statisch)');
        app.bufferManager.setBVHEnabled(true); // BVH wird hier gebaut

        const static_bvhNoCache: number[] = [];
        for (let i = 0; i < frameCount + warmupFrames; i++) {
            app.resetCache(); // Cache vor JEDEM Frame resetten
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            if (i >= warmupFrames) static_bvhNoCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        allResults.static_bvhNoCache = {
            avg: static_bvhNoCache.reduce((a, b) => a + b) / static_bvhNoCache.length,
            min: Math.min(...static_bvhNoCache),
            max: Math.max(...static_bvhNoCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.static_bvhNoCache.avg.toFixed(2)}ms\n`);

        // Test 1.3: Ohne BVH, Mit Cache (KEIN Reset zwischen Frames!)
        console.log('🔧 Test 1.3: OHNE BVH, MIT Cache (Statisch)');
        app.bufferManager.setBVHEnabled(false);
        // KEIN app.resetCache() - Cache bleibt von Test 1.2 erhalten und baut sich auf!

        const static_noBvhCache: number[] = [];
        for (let i = 0; i < warmupFrames; i++) {
            await app.renderFrame();
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        for (let i = 0; i < frameCount; i++) {
            const start = performance.now();
            await app.renderFrame(); // Cache bleibt erhalten!
            const frameTime = performance.now() - start;
            static_noBvhCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        allResults.static_noBvhCache = {
            avg: static_noBvhCache.reduce((a, b) => a + b) / static_noBvhCache.length,
            min: Math.min(...static_noBvhCache),
            max: Math.max(...static_noBvhCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.static_noBvhCache.avg.toFixed(2)}ms\n`);

        // Test 1.4: Mit BVH, Mit Cache (KEIN Reset zwischen Frames!)
        console.log('🔧 Test 1.4: MIT BVH, MIT Cache (Statisch)');
        app.bufferManager.setBVHEnabled(true); // BVH muss NICHT neu gebaut werden (keine Geometrie-Änderung!)
        // KEIN app.resetCache() - Cache bleibt erhalten!

        const static_bvhCache: number[] = [];
        for (let i = 0; i < warmupFrames; i++) {
            await app.renderFrame();
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        for (let i = 0; i < frameCount; i++) {
            const start = performance.now();
            await app.renderFrame(); // Cache bleibt erhalten!
            const frameTime = performance.now() - start;
            static_bvhCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        allResults.static_bvhCache = {
            avg: static_bvhCache.reduce((a, b) => a + b) / static_bvhCache.length,
            min: Math.min(...static_bvhCache),
            max: Math.max(...static_bvhCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.static_bvhCache.avg.toFixed(2)}ms\n`);

        await new Promise(resolve => setTimeout(resolve, 500));

        // ===== KATEGORIE 2: MOVED SPHERES (2 Kugeln einmalig verschieben) =====
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║  KATEGORIE 2: MOVED SPHERES (2 Kugeln einmalig verschieben) ║');
        console.log('╚══════════════════════════════════════════════════════════════╝\n');

        // Funktion zum Verschieben von 2 Kugeln
        const moveTwoSpheres = () => {
            const sphere0 = app.scene.getThreeScene().children.find(obj => obj.name.includes('TestSphere_0'));
            const sphere1 = app.scene.getThreeScene().children.find(obj => obj.name.includes('TestSphere_1'));
            if (sphere0) {
                sphere0.position.x += 1.0;
                console.log('✅ Sphere 0 verschoben zu x=' + sphere0.position.x);
            } else {
                console.warn('❌ Sphere 0 nicht gefunden!');
            }
            if (sphere1) {
                sphere1.position.z += 1.0;
                console.log('✅ Sphere 1 verschoben zu z=' + sphere1.position.z);
            } else {
                console.warn('❌ Sphere 1 nicht gefunden!');
            }
        };

        // Test 2.1: Ohne BVH, Ohne Cache (Moved)
        console.log('🔧 Test 2.1: OHNE BVH, OHNE Cache (2 Kugeln moved)');
        app.bufferManager.setBVHEnabled(false);

        const moved_noBvhNoCache: number[] = [];
        for (let i = 0; i < frameCount + warmupFrames; i++) {
            if (i === warmupFrames) moveTwoSpheres(); // Verschiebe NACH warmup
            app.resetCache(); // Cache vor jedem Frame resetten
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            if (i >= warmupFrames) moved_noBvhNoCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        allResults.moved_noBvhNoCache = {
            avg: moved_noBvhNoCache.reduce((a, b) => a + b) / moved_noBvhNoCache.length,
            min: Math.min(...moved_noBvhNoCache),
            max: Math.max(...moved_noBvhNoCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.moved_noBvhNoCache.avg.toFixed(2)}ms\n`);

        // Test 2.2: Mit BVH, Ohne Cache (Moved)
        console.log('🔧 Test 2.2: MIT BVH, OHNE Cache (2 Kugeln moved)');
        // Spheres zurücksetzen (NICHT clearSpheres/initialize wegen WebGPU Memory!)
        app.scene.resetAllSpheresToOriginalPositions();

        app.bufferManager.setBVHEnabled(true); // BVH wird hier gebaut

        const moved_bvhNoCache: number[] = [];
        for (let i = 0; i < frameCount + warmupFrames; i++) {
            if (i === warmupFrames) moveTwoSpheres(); // BVH wird nach Move NEU GEBAUT (geometry change!)
            app.resetCache(); // Cache vor jedem Frame resetten
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            if (i >= warmupFrames) moved_bvhNoCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        allResults.moved_bvhNoCache = {
            avg: moved_bvhNoCache.reduce((a, b) => a + b) / moved_bvhNoCache.length,
            min: Math.min(...moved_bvhNoCache),
            max: Math.max(...moved_bvhNoCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.moved_bvhNoCache.avg.toFixed(2)}ms\n`);

        // Test 2.3: Ohne BVH, Mit Cache (Moved)
        console.log('🔧 Test 2.3: OHNE BVH, MIT Cache (2 Kugeln moved)');
        // Spheres zurücksetzen
        app.scene.resetAllSpheresToOriginalPositions();

        app.bufferManager.setBVHEnabled(false);
        // KEIN app.resetCache() - Cache bleibt erhalten!

        // Warmup MIT Cache
        for (let i = 0; i < warmupFrames; i++) {
            await app.renderFrame();
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        moveTwoSpheres(); // Verschiebe → Cache wird selektiv invalidiert

        const moved_noBvhCache: number[] = [];
        for (let i = 0; i < frameCount; i++) {
            const start = performance.now();
            await app.renderFrame(); // Cache bleibt erhalten (außer invalidierte Bereiche)
            const frameTime = performance.now() - start;
            moved_noBvhCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        allResults.moved_noBvhCache = {
            avg: moved_noBvhCache.reduce((a, b) => a + b) / moved_noBvhCache.length,
            min: Math.min(...moved_noBvhCache),
            max: Math.max(...moved_noBvhCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.moved_noBvhCache.avg.toFixed(2)}ms\n`);

        // Test 2.4: Mit BVH, Mit Cache (Moved)
        console.log('🔧 Test 2.4: MIT BVH, MIT Cache (2 Kugeln moved)');
        // Spheres zurücksetzen
        app.scene.resetAllSpheresToOriginalPositions();

        app.bufferManager.setBVHEnabled(true);
        // KEIN app.resetCache() - Cache bleibt erhalten!

        // Warmup MIT Cache
        for (let i = 0; i < warmupFrames; i++) {
            await app.renderFrame();
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        moveTwoSpheres(); // BVH wird neu gebaut, Cache selektiv invalidiert

        const moved_bvhCache: number[] = [];
        for (let i = 0; i < frameCount; i++) {
            const start = performance.now();
            await app.renderFrame(); // Cache bleibt erhalten
            const frameTime = performance.now() - start;
            moved_bvhCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        allResults.moved_bvhCache = {
            avg: moved_bvhCache.reduce((a, b) => a + b) / moved_bvhCache.length,
            min: Math.min(...moved_bvhCache),
            max: Math.max(...moved_bvhCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.moved_bvhCache.avg.toFixed(2)}ms\n`);

        await new Promise(resolve => setTimeout(resolve, 500));

        // ===== KATEGORIE 3: ANIMIERTE SPHERES (2 Kugeln) =====
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║  KATEGORIE 3: ANIMIERTE SPHERES (2 Kugeln kontinuierlich)   ║');
        console.log('╚══════════════════════════════════════════════════════════════╝\n');

        // Spheres zurücksetzen für Animation-Tests
        app.scene.resetAllSpheresToOriginalPositions();

        // Test 3.1: Ohne BVH, Ohne Cache, Animation
        console.log('🔧 Test 3.1: OHNE BVH, OHNE Cache (Animiert - 2 Kugeln)');
        app.bufferManager.setBVHEnabled(false);

        app.scene.startSimpleAnimation(2);

        const anim_noBvhNoCache: number[] = [];
        for (let i = 0; i < frameCount + warmupFrames; i++) {
            app.resetCache(); // Cache vor jedem Frame resetten
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            if (i >= warmupFrames) anim_noBvhNoCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        app.scene.stopAnimation();

        allResults.anim_noBvhNoCache = {
            avg: anim_noBvhNoCache.reduce((a, b) => a + b) / anim_noBvhNoCache.length,
            min: Math.min(...anim_noBvhNoCache),
            max: Math.max(...anim_noBvhNoCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.anim_noBvhNoCache.avg.toFixed(2)}ms\n`);

        // Test 3.2: Mit BVH, Ohne Cache, Animation
        console.log('🔧 Test 3.2: MIT BVH, OHNE Cache (Animiert - 2 Kugeln)');
        app.bufferManager.setBVHEnabled(true); // BVH wird hier gebaut

        app.scene.startSimpleAnimation(2);

        const anim_bvhNoCache: number[] = [];
        for (let i = 0; i < frameCount + warmupFrames; i++) {
            app.resetCache(); // Cache vor jedem Frame resetten
            const start = performance.now();
            await app.renderFrame(); // BVH wird JEDEN Frame neu gebaut (geometry changes!)
            const frameTime = performance.now() - start;
            if (i >= warmupFrames) anim_bvhNoCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        app.scene.stopAnimation();

        allResults.anim_bvhNoCache = {
            avg: anim_bvhNoCache.reduce((a, b) => a + b) / anim_bvhNoCache.length,
            min: Math.min(...anim_bvhNoCache),
            max: Math.max(...anim_bvhNoCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.anim_bvhNoCache.avg.toFixed(2)}ms\n`);

        // Test 3.3: Ohne BVH, Mit Cache, Animation
        console.log('🔧 Test 3.3: OHNE BVH, MIT Cache (Animiert - 2 Kugeln)');
        app.bufferManager.setBVHEnabled(false);
        // KEIN app.resetCache() - Cache bleibt erhalten!

        for (let i = 0; i < warmupFrames; i++) {
            await app.renderFrame();
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        app.scene.startSimpleAnimation(2);  // Nur 2 Kugeln animieren!

        const anim_noBvhCache: number[] = [];
        for (let i = 0; i < frameCount; i++) {
            const start = performance.now();
            await app.renderFrame(); // Cache wird selektiv invalidiert bei Bewegung
            const frameTime = performance.now() - start;
            anim_noBvhCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        app.scene.stopAnimation();

        allResults.anim_noBvhCache = {
            avg: anim_noBvhCache.reduce((a, b) => a + b) / anim_noBvhCache.length,
            min: Math.min(...anim_noBvhCache),
            max: Math.max(...anim_noBvhCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.anim_noBvhCache.avg.toFixed(2)}ms\n`);

        // Test 3.4: Mit BVH, Mit Cache, Animation
        console.log('🔧 Test 3.4: MIT BVH, MIT Cache (Animiert - 2 Kugeln)');
        app.bufferManager.setBVHEnabled(true);
        // KEIN app.resetCache() - Cache bleibt erhalten!

        for (let i = 0; i < warmupFrames; i++) {
            await app.renderFrame();
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        app.scene.startSimpleAnimation(2);

        const anim_bvhCache: number[] = [];
        for (let i = 0; i < frameCount; i++) {
            const start = performance.now();
            await app.renderFrame(); // BVH wird neu gebaut + Cache selektiv invalidiert
            const frameTime = performance.now() - start;
            anim_bvhCache.push(frameTime);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        app.scene.stopAnimation();

        allResults.anim_bvhCache = {
            avg: anim_bvhCache.reduce((a, b) => a + b) / anim_bvhCache.length,
            min: Math.min(...anim_bvhCache),
            max: Math.max(...anim_bvhCache)
        };
        console.log(`  ✅ Durchschnitt: ${allResults.anim_bvhCache.avg.toFixed(2)}ms\n`);

        // ===== ZUSAMMENFASSUNG =====
        console.log('\n╔═══════════════════════════════════════════════════════════════════════════════╗');
        console.log('║                       UMFASSENDE TEST-ZUSAMMENFASSUNG                         ║');
        console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
        console.log('║  KATEGORIE 1: STATISCHES BILD                                                 ║');
        console.log(`║    1.1 Ohne BVH, Ohne Cache:  ${allResults.static_noBvhNoCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.static_noBvhNoCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.static_noBvhNoCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log(`║    1.2 Mit BVH, Ohne Cache:   ${allResults.static_bvhNoCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.static_bvhNoCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.static_bvhNoCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log(`║    1.3 Ohne BVH, Mit Cache:   ${allResults.static_noBvhCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.static_noBvhCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.static_noBvhCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log(`║    1.4 Mit BVH, Mit Cache:    ${allResults.static_bvhCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.static_bvhCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.static_bvhCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log('║                                                                               ║');
        console.log('║  KATEGORIE 2: MOVED SPHERES (2 Kugeln einmalig verschieben)                  ║');
        console.log(`║    2.1 Ohne BVH, Ohne Cache:  ${allResults.moved_noBvhNoCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.moved_noBvhNoCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.moved_noBvhNoCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log(`║    2.2 Mit BVH, Ohne Cache:   ${allResults.moved_bvhNoCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.moved_bvhNoCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.moved_bvhNoCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log(`║    2.3 Ohne BVH, Mit Cache:   ${allResults.moved_noBvhCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.moved_noBvhCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.moved_noBvhCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log(`║    2.4 Mit BVH, Mit Cache:    ${allResults.moved_bvhCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.moved_bvhCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.moved_bvhCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log('║                                                                               ║');
        console.log('║  KATEGORIE 3: ANIMIERTE SPHERES (2 Kugeln kontinuierlich)                    ║');
        console.log(`║    3.1 Ohne BVH, Ohne Cache:  ${allResults.anim_noBvhNoCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.anim_noBvhNoCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.anim_noBvhNoCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log(`║    3.2 Mit BVH, Ohne Cache:   ${allResults.anim_bvhNoCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.anim_bvhNoCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.anim_bvhNoCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log(`║    3.3 Ohne BVH, Mit Cache:   ${allResults.anim_noBvhCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.anim_noBvhCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.anim_noBvhCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log(`║    3.4 Mit BVH, Mit Cache:    ${allResults.anim_bvhCache.avg.toFixed(2).padStart(7)}ms (Min: ${allResults.anim_bvhCache.min.toFixed(2).padStart(7)}ms, Max: ${allResults.anim_bvhCache.max.toFixed(2).padStart(7)}ms)  ║`);
        console.log('╚═══════════════════════════════════════════════════════════════════════════════╝\n');

        return allResults;
    };

    // ===== HAUPTÜBERSICHT: ALLE VERFÜGBAREN TESTS =====
    console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║                    VERFÜGBARE PERFORMANCE-TESTS                       ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════╣');
    console.log('║  📊 SKALIERUNGS-TESTS (Sphere-Anzahl vs. Performance):               ║');
    console.log('║     • testLinearScaling()  - Linearer Rendering-Test (ohne BVH)      ║');
    console.log('║     • testBVHScaling()     - BVH-Skalierungstest (mit BVH)           ║');
    console.log('║     • testCacheScaling()   - Cache-Effizienztest (statisch)          ║');
    console.log('║                                                                       ║');
    console.log('║  🎯 CACHE-TESTS (Einzelne Features):                                 ║');
    console.log('║     • testStaticScene()    - Cache-Effektivität (statisch)           ║');
    console.log('║     • testSingleSphere()   - Single-Sphere Bewegung                  ║');
    console.log('║     • testSelectiveVsFull()- Selektive vs. Komplette Invalidierung   ║');
    console.log('║     • testCameraMovement() - Kamera-Bewegung Cache-Impact            ║');
    console.log('║                                                                       ║');
    console.log('║  🔬 KOMPLETTE SUITE:                                                  ║');
    console.log('║     • testAllScenarios()   - Alle Szenarien (12 Tests)               ║');
    console.log('║     • runAllTests()        - Alle Cache-Tests nacheinander           ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');
}
