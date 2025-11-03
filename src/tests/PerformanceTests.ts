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

        app.scene.startSimpleAnimation();

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
