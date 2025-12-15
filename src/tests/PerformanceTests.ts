// Performance Tests fuer Linear Scaling

import { WebGPURaytracerApp } from '../core/WebGPURaytracerApp';

export function setupPerformanceTests(app: WebGPURaytracerApp): void {

    /**
     * TEST: Linear Scaling Performance
     * - Start: 200 Kugeln
     * - Ende: 650 Kugeln (10 Schritte a +50 Kugeln)
     * - Pro Schritt: 100 Frames rendern
     * - Cache wird JEDES MAL vor jedem Frame geloescht (100% linear, kein Cache)
     */
    (window as any).testLinearScaling = async () => {
        console.log('\n=======================================================');
        console.log('  LINEAR SCALING PERFORMANCE TEST');
        console.log('  200 -> 650 Kugeln | 100 Frames pro Schritt');
        console.log('=======================================================\n');

        // Stelle sicher, dass BVH fuer den linearen Test deaktiviert ist
        try {
            const bm = app.getBufferManager();
            bm.setBVHEnabled(false);
            console.log('ℹ️ BVH deaktiviert für testLinearScaling');
        } catch (e) {
            // best effort, continue even if not available
        }

        const startSphereCount = 500;
        const endSphereCount = 1400;
        const increment = 100;
        const framesPerStep = 100;
        const steps = (endSphereCount - startSphereCount) / increment + 1; // 10 Schritte

        const stepResults: Array<{
            sphereCount: number;
            avgTime: number;
            minTime: number;
            maxTime: number;
            fps: number;
        }> = [];

        console.log('Start Performance-Test...\n');

        for (let step = 0; step < steps; step++) {
            const sphereCount = startSphereCount + (step * increment);

            console.log(`\n--------------------------------------------------`);
            console.log(`SCHRITT ${step + 1}/${steps}: ${sphereCount} KUGELN`);
            console.log(`--------------------------------------------------`);

            // Szene mit entsprechender Kugel-Anzahl erstellen
            app.scene.createDynamicSphereScene(sphereCount);

            // Kamera positionieren
            const camera = app.scene.getCamera();
            camera.position.set(0, 25, 60);
            camera.lookAt(0, 10, 0);
            camera.updateProjectionMatrix();

            const frameTimes: number[] = [];

            console.log(`Rendere ${framesPerStep} Frames...\n`);

            // 100 Frames rendern
            for (let frame = 0; frame < framesPerStep; frame++) {
                // KRITISCH: Cache VOR JEDEM FRAME loeschen fuer 100% lineare Performance
                app.resetCache();

                // Frame rendern und Zeit messen
                const startTime = performance.now();
                await app.renderFrame();
                const renderTime = performance.now() - startTime;

                frameTimes.push(renderTime);

                // Progress logging (alle 20 Frames)
                if ((frame + 1) % 20 === 0) {
                    console.log(`   Frame ${frame + 1}/${framesPerStep}: ${renderTime.toFixed(2)}ms`);
                }
            }

            // Statistiken fuer diesen Schritt berechnen
            const avgTime = frameTimes.reduce((sum, t) => sum + t, 0) / frameTimes.length;
            const minTime = Math.min(...frameTimes);
            const maxTime = Math.max(...frameTimes);
            const fps = 1000 / avgTime;

            stepResults.push({
                sphereCount,
                avgTime,
                minTime,
                maxTime,
                fps
            });

            console.log(`\nSchritt ${step + 1} abgeschlossen:`);
            console.log(`   AVG: ${avgTime.toFixed(2)}ms | MIN: ${minTime.toFixed(2)}ms | MAX: ${maxTime.toFixed(2)}ms | FPS: ${fps.toFixed(1)}`);
        }

        // =======================================================
        // AUSWERTUNG
        // =======================================================

        console.log('\n\n=======================================================');
        console.log('  FINALE ERGEBNISSE');
        console.log('=======================================================\n');

        // Gesamtstatistiken
        const firstStep = stepResults[0];
        const lastStep = stepResults[stepResults.length - 1];

        console.log('Gesamt-Uebersicht:');
        console.log(`  Start (${firstStep.sphereCount} Kugeln):  AVG ${firstStep.avgTime.toFixed(2)}ms | ${firstStep.fps.toFixed(1)} FPS`);
        console.log(`  Ende  (${lastStep.sphereCount} Kugeln):  AVG ${lastStep.avgTime.toFixed(2)}ms | ${lastStep.fps.toFixed(1)} FPS`);
        console.log(`  Performance-Faktor: ${(lastStep.avgTime / firstStep.avgTime).toFixed(2)}x langsamer\n`);

        // Detaillierte Tabelle
        console.log('Detaillierte Performance-Tabelle:\n');
        console.log('Kugeln | AVG (ms) | MIN (ms) | MAX (ms) |  FPS');
        console.log('-------|----------|----------|----------|------');
        stepResults.forEach(r => {
            console.log(`${String(r.sphereCount).padStart(6)} | ${r.avgTime.toFixed(2).padStart(8)} | ${r.minTime.toFixed(2).padStart(8)} | ${r.maxTime.toFixed(2).padStart(8)} | ${r.fps.toFixed(1).padStart(5)}`);
        });
        console.log('');

        console.log('\nTest abgeschlossen!');
    };

    console.log('Performance Test verfuegbar: testLinearScaling()');

    /**
     * TEST: BVH Scaling Performance
     * - Start: 200 Kugeln
     * - Ende: 650 Kugeln (10 Schritte a +50 Kugeln)
     * - Pro Schritt: 100 Frames rendern
     * - BVH ist AKTIVIERT für alle Frames
     * - Cache wird JEDES MAL vor jedem Frame gelöscht (100% BVH, kein Cache)
     */
    (window as any).testBVHScaling = async () => {
        console.log('\n=======================================================');
        console.log('  BVH SCALING PERFORMANCE TEST');
        console.log('  200 -> 650 Kugeln | 100 Frames pro Schritt');
        console.log('  BVH: ENABLED');
        console.log('=======================================================\n');

        // BVH aktivieren
        const bufferManager = app.getBufferManager();
        bufferManager.setBVHEnabled(true);
        console.log('✅ BVH aktiviert\n');

        const startSphereCount = 500;
        const endSphereCount = 1400;
        const increment = 100;
        const framesPerStep = 100;
        const steps = (endSphereCount - startSphereCount) / increment + 1; // 10 Schritte

        const stepResults: Array<{
            sphereCount: number;
            avgTime: number;
            minTime: number;
            maxTime: number;
            fps: number;
        }> = [];

        console.log('Start Performance-Test...\n');

        for (let step = 0; step < steps; step++) {
            const sphereCount = startSphereCount + (step * increment);

            console.log(`\n--------------------------------------------------`);
            console.log(`SCHRITT ${step + 1}/${steps}: ${sphereCount} KUGELN`);
            console.log(`--------------------------------------------------`);

            // Szene mit entsprechender Kugel-Anzahl erstellen
            app.scene.createDynamicSphereScene(sphereCount);

            // Kamera positionieren
            const camera = app.scene.getCamera();
            camera.position.set(0, 25, 60);
            camera.lookAt(0, 10, 0);
            camera.updateProjectionMatrix();

            const frameTimes: number[] = [];

            console.log(`Rendere ${framesPerStep} Frames...\n`);

            // 100 Frames rendern
            for (let frame = 0; frame < framesPerStep; frame++) {
                // KRITISCH: Cache VOR JEDEM FRAME loeschen fuer 100% BVH Performance
                app.resetCache();

                // Frame rendern und Zeit messen
                const startTime = performance.now();
                await app.renderFrame();
                const renderTime = performance.now() - startTime;

                frameTimes.push(renderTime);

                // Progress logging (alle 20 Frames)
                if ((frame + 1) % 20 === 0) {
                    console.log(`   Frame ${frame + 1}/${framesPerStep}: ${renderTime.toFixed(2)}ms`);
                }
            }

            // Statistiken fuer diesen Schritt berechnen
            const avgTime = frameTimes.reduce((sum, t) => sum + t, 0) / frameTimes.length;
            const minTime = Math.min(...frameTimes);
            const maxTime = Math.max(...frameTimes);
            const fps = 1000 / avgTime;

            stepResults.push({
                sphereCount,
                avgTime,
                minTime,
                maxTime,
                fps
            });

            console.log(`\nSchritt ${step + 1} abgeschlossen:`);
            console.log(`   AVG: ${avgTime.toFixed(2)}ms | MIN: ${minTime.toFixed(2)}ms | MAX: ${maxTime.toFixed(2)}ms | FPS: ${fps.toFixed(1)}`);
        }

        // =======================================================
        // AUSWERTUNG
        // =======================================================

        console.log('\n\n=======================================================');
        console.log('  FINALE ERGEBNISSE (BVH)');
        console.log('=======================================================\n');

        // Gesamtstatistiken
        const firstStep = stepResults[0];
        const lastStep = stepResults[stepResults.length - 1];

        console.log('Gesamt-Uebersicht:');
        console.log(`  Start (${firstStep.sphereCount} Kugeln):  AVG ${firstStep.avgTime.toFixed(2)}ms | ${firstStep.fps.toFixed(1)} FPS`);
        console.log(`  Ende  (${lastStep.sphereCount} Kugeln):  AVG ${lastStep.avgTime.toFixed(2)}ms | ${lastStep.fps.toFixed(1)} FPS`);
        console.log(`  Performance-Faktor: ${(lastStep.avgTime / firstStep.avgTime).toFixed(2)}x langsamer\n`);

        // Detaillierte Tabelle
        console.log('Detaillierte Performance-Tabelle:\n');
        console.log('Kugeln | AVG (ms) | MIN (ms) | MAX (ms) |  FPS');
        console.log('-------|----------|----------|----------|------');
        stepResults.forEach(r => {
            console.log(`${String(r.sphereCount).padStart(6)} | ${r.avgTime.toFixed(2).padStart(8)} | ${r.minTime.toFixed(2).padStart(8)} | ${r.maxTime.toFixed(2).padStart(8)} | ${r.fps.toFixed(1).padStart(5)}`);
        });
        console.log('');

        console.log('\nBVH Test abgeschlossen!');
    };

    console.log('Performance Tests verfuegbar: testLinearScaling(), testBVHScaling()');

    /**
     * TEST: Moving Spheres Invalidation
     * - Erstellt Szene mit N Kugeln
     * - Startet Animation fuer 3 Kugeln
     * - Verwendet Cache (nicht resetten)
     * - Misst wie viele Pixel durch die selektive Invalidierung insgesamt invalidiert werden
     */
    (window as any).testMovingSpheresInvalidation = async () => {
        console.log('\n=======================================================');
        console.log('  MOVING SPHERES INVALIDATION TEST (ANIMATION)');
        console.log('  3 bewegte Kugeln, Cache AN, Messung pro Frame');
        console.log('=======================================================\n');

        const defaultSphereCount = 500;
        const frames = 300;

        // Verwende aktuelle Szene; wenn weniger als 3 Spheres vorhanden, erstelle neue Szene
        const existingCount = app.scene.getSphereCount();
        if (existingCount < 3) {
            app.scene.createDynamicSphereScene(defaultSphereCount);
            const camera = app.scene.getCamera();
            camera.position.set(0, 25, 60);
            camera.lookAt(0, 10, 0);
            camera.updateProjectionMatrix();
        }

        const bm = app.getBufferManager();

        // Reset Invalidation stats but keep cache content (we want per-frame deltas)
        try { bm.resetInvalidationStats(); } catch (e) { }

        // Render one frame to initialize MovementTracker / baseline
        await app.renderFrame();

        // Capture baseline stats
        const baseStats = bm.getInvalidationStats();
        let prevPixels = baseStats.totalPixelsInvalidated ?? 0;
        let prevInvalidations = baseStats.totalInvalidations ?? 0;

        // Start simple animation of first 3 spheres
        app.scene.startSimpleAnimation(3);

        // Data collectors
        const pixelsPerFrame: number[] = [];
        const invalidationsPerFrame: number[] = [];
        const frameTimes: number[] = [];

        console.log(`Starte ${frames} Frames mit 3 animierten Kugeln...`);

        for (let f = 0; f < frames; f++) {
            const t0 = performance.now();
            await app.renderFrame();
            const t = performance.now() - t0;

            const s = bm.getInvalidationStats();
            const pixelsNow = s.totalPixelsInvalidated ?? 0;
            const invalidationsNow = s.totalInvalidations ?? 0;

            const deltaPixels = Math.max(0, pixelsNow - prevPixels);
            const deltaInvalidations = Math.max(0, invalidationsNow - prevInvalidations);

            pixelsPerFrame.push(deltaPixels);
            invalidationsPerFrame.push(deltaInvalidations);
            frameTimes.push(t);

            prevPixels = pixelsNow;
            prevInvalidations = invalidationsNow;
        }

        // Stop animation
        app.scene.stopAnimation();

        // Summarize
        const totalPixels = pixelsPerFrame.reduce((a, b) => a + b, 0);
        const totalInvalids = invalidationsPerFrame.reduce((a, b) => a + b, 0);
        const avgPixels = pixelsPerFrame.length ? (totalPixels / pixelsPerFrame.length) : 0;
        const avgFrameTime = frameTimes.length ? (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length) : 0;

        // Canvas percent
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        const pixelCount = (canvas ? canvas.width * canvas.height : 1);
        const percentTotal = (totalPixels / pixelCount) * 100;

        console.log('\n=== ANIMATION INVALIDATION SUMMARY ===');
        console.log(`Frames: ${frames}`);
        console.log(`Total pixels invalidated (sum of deltas): ${totalPixels}`);
        console.log(`Percent of image invalidated (total): ${percentTotal.toFixed(3)}%`);
        console.log(`Total invalidation ops: ${totalInvalids}`);
        console.log(`Avg pixels/frame invalidated: ${avgPixels.toFixed(1)}`);
        console.log(`Avg frame render time: ${avgFrameTime.toFixed(2)}ms`);

        // Show a small overlay chart of percent invalidated per frame
        try {
            // remove existing overlay
            const existing = document.getElementById('invalidation-overlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'invalidation-overlay';
            overlay.style.position = 'fixed';
            overlay.style.right = '10px';
            overlay.style.top = '10px';
            overlay.style.width = '360px';
            overlay.style.height = '160px';
            overlay.style.background = 'rgba(0,0,0,0.7)';
            overlay.style.color = '#fff';
            overlay.style.zIndex = '9999';
            overlay.style.padding = '8px';
            overlay.style.borderRadius = '6px';
            overlay.style.fontFamily = 'monospace';

            const title = document.createElement('div');
            title.innerText = 'Invalidation % per Frame (last test)';
            title.style.fontSize = '12px';
            title.style.marginBottom = '6px';
            overlay.appendChild(title);

            const chart = document.createElement('canvas');
            chart.width = 340;
            chart.height = 110;
            overlay.appendChild(chart);

            const footer = document.createElement('div');
            footer.style.fontSize = '11px';
            footer.style.marginTop = '6px';
            footer.innerText = `Total ${totalPixels} px / ${percentTotal.toFixed(3)}% | avg/frame ${avgPixels.toFixed(1)} px`;
            overlay.appendChild(footer);

            document.body.appendChild(overlay);

            const ctx = chart.getContext('2d')!;
            ctx.fillStyle = '#222';
            ctx.fillRect(0, 0, chart.width, chart.height);

            // compute percent per frame
            const dataPct = pixelsPerFrame.map(p => (p / pixelCount) * 100);
            const maxPct = Math.max(...dataPct, 0.1);

            ctx.strokeStyle = '#4caf50';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < dataPct.length; i++) {
                const x = (i / Math.max(1, dataPct.length - 1)) * (chart.width - 20) + 10;
                const y = chart.height - 10 - (dataPct[i] / maxPct) * (chart.height - 30);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        } catch (e) {
            console.log('Could not render overlay chart', e);
        }
    };

    /**
     * TEST: Single Movement Invalidation
     * - Einmalige Bewegung von 3 Kugeln
     * - Cache aktiv
     * - Misst total invalidierte Pixel und Prozentsatz des Bildes
     */
    (window as any).testSingleMovementInvalidation = async () => {
        console.log('\n=======================================================');
        console.log('  SINGLE MOVEMENT INVALIDATION TEST');
        console.log('  3 Kugeln werden einmalig verschoben, Cache AN');
        console.log('=======================================================\n');

        const sphereCount = 500;

        // Verwende die aktuelle Szene. Falls weniger als 3 Spheres vorhanden sind,
        // erstelle eine neue Szene mit `sphereCount` Kugeln.
        const existingCount = app.scene.getSphereCount();
        if (existingCount < 3) {
            app.scene.createDynamicSphereScene(sphereCount);
            // Kamera positionieren
            const camera = app.scene.getCamera();
            camera.position.set(0, 25, 60);
            camera.lookAt(0, 10, 0);
            camera.updateProjectionMatrix();
        } else {
            // Nutze die bereits gegebene Szene; optional Kamera beibehalten
            // Ensure world matrices are up-to-date
            app.scene.resetAllSpheresToOriginalPositions();
        }

        const bm = app.getBufferManager();

        // Render one frame to establish baseline positions in MovementTracker / cache
        await app.renderFrame();

        // Capture stats before movement
        const statsBefore = bm.getInvalidationStats();
        const pixelsBefore = statsBefore.totalPixelsInvalidated ?? 0;
        const invalidationsBefore = statsBefore.totalInvalidations ?? 0;

        // Move first 3 spheres once
        app.scene.nudgeSpheres(3, 8);

        // Render one frame which should trigger selective invalidation
        await app.renderFrame();

        // Collect stats after
        const statsAfter = bm.getInvalidationStats();
        const pixelsAfter = statsAfter.totalPixelsInvalidated ?? 0;
        const totalInvalidations = statsAfter.totalInvalidations ?? 0;

        // Delta = invalidation caused by the single movement
        const totalPixelsInvalidated = Math.max(0, pixelsAfter - pixelsBefore);
        const deltaInvalidations = Math.max(0, totalInvalidations - invalidationsBefore);

        // Get canvas size for percentage calculation
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        const pixelCount = (canvas ? canvas.width * canvas.height : 1);
        const percent = (totalPixelsInvalidated / pixelCount) * 100;

        console.log('\n=== SINGLE MOVEMENT INVALIDATION RESULT ===');
        console.log(`Moved spheres: 3`);
        console.log(`Invalidations caused by movement: ${deltaInvalidations}`);
        console.log(`Invalidations (total): ${totalInvalidations}`);
        console.log(`Pixels invalidated by movement: ${totalPixelsInvalidated}`);
        console.log(`Percent of image invalidated: ${percent.toFixed(3)}%`);
        console.log('Test abgeschlossen!');
    };
}
