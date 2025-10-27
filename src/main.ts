// src/main.ts - Clean BVH Test Setup

import { WebGPURaytracerApp } from './core/WebGPURaytracerApp';
import { Logger } from './utils/Logger';

async function main(): Promise<void> {
    const logger = Logger.getInstance();
    logger.setMinimalMode(true);
    logger.setShowFrameDetails(false);

    try {
        logger.success('🚀 Starte WebGPU Raytracer mit BVH...');

        const app = new WebGPURaytracerApp();
        await app.initialize();

        // App global verfügbar machen
        (window as any).app = app;

        // Saubere BVH-Tests initialisieren
        setupBVHTests(app);

        logger.success('✅ Raytracer gestartet!');
        console.log(`📊 Szene: ${app.scene.getSphereCount()} Kugeln geladen`);

        // Zeige BVH-Status
        const bufferManager = app.getBufferManager();
        if (bufferManager.isBVHEnabled()) {
            const bvhStats = bufferManager.getBVHStats();
            if (bvhStats) {
                logger.success(`🌳 BVH aktiviert: ${bvhStats.nodeCount} Nodes, ${bvhStats.estimatedSpeedup.toFixed(1)}x Speedup erwartet`);
            }
        } else {
            logger.warning('⚠️ BVH deaktiviert - läuft im linearen Modus');
        }

        console.log('\n🧪 VERFÜGBARE BVH-TESTS:');
        console.log('   testBVH() - BVH Performance Test');
        console.log('   testBVHvLinear() - BVH vs Linear Vergleich');
        console.log('   bvhInfo() - BVH Statistiken anzeigen');

    } catch (error) {
        logger.error('Fehler beim Starten:', error);
        throw error;
    }
}

function setupBVHTests(app: WebGPURaytracerApp): void {

    // ===== TEST 1: BVH PERFORMANCE =====
    (window as any).testBVH = async () => {
        console.log('\n=== BVH PERFORMANCE TEST ===');

        const bufferManager = app.getBufferManager();

        if (!bufferManager.isBVHEnabled()) {
            console.log('❌ BVH ist deaktiviert. Aktiviere BVH in Constants.ts');
            return;
        }

        console.log('🌳 BVH ist aktiviert - starte Performance-Test...');

        // Reset cache for clean test
        app.resetCache();

        const frameTimes: number[] = [];

        console.log('\nRendere 10 Test-Frames mit BVH...');
        for (let i = 0; i < 10; i++) {
            const start = performance.now();
            await app.renderFrame();
            const frameTime = performance.now() - start;
            frameTimes.push(frameTime);

            if (i % 3 === 0) {
                console.log(`  Frame ${i}: ${frameTime.toFixed(1)}ms`);
            }

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        const avgTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        const fps = 1000 / avgTime;

        console.log('\n--- BVH RESULTS ---');
        console.log(`Average frame time: ${avgTime.toFixed(1)}ms`);
        console.log(`Average FPS: ${fps.toFixed(1)}`);

        const bvhStats = bufferManager.getBVHStats();
        if (bvhStats) {
            console.log(`BVH Nodes: ${bvhStats.nodeCount}`);
            console.log(`BVH Depth: ${bvhStats.maxDepth}`);
            console.log(`Expected speedup: ${bvhStats.estimatedSpeedup.toFixed(1)}x`);
        }

        if (fps > 30) {
            console.log('🚀 EXCELLENT: BVH Performance > 30 FPS!');
        } else if (fps > 15) {
            console.log('✅ GOOD: BVH Performance > 15 FPS');
        } else {
            console.log('⚠️ SLOW: BVH Performance < 15 FPS');
        }
    };

    // ===== TEST 2: BVH vs LINEAR VERGLEICH =====
    (window as any).testBVHvLinear = async () => {
        console.log('\n=== BVH vs LINEAR COMPARISON ===');

        const bufferManager = app.getBufferManager();

        // Test 1: Mit BVH
        console.log('\n🌳 Testing WITH BVH...');
        bufferManager.setBVHEnabled(true);
        app.resetCache();

        const bvhTimes: number[] = [];
        for (let i = 0; i < 5; i++) {
            const start = performance.now();
            await app.renderFrame();
            const time = performance.now() - start;
            bvhTimes.push(time);
            console.log(`  BVH Frame ${i}: ${time.toFixed(1)}ms`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Test 2: Ohne BVH (Linear)
        console.log('\n📈 Testing WITHOUT BVH (Linear)...');
        bufferManager.setBVHEnabled(false);
        app.resetCache();

        const linearTimes: number[] = [];
        for (let i = 0; i < 5; i++) {
            const start = performance.now();
            await app.renderFrame();
            const time = performance.now() - start;
            linearTimes.push(time);
            console.log(`  Linear Frame ${i}: ${time.toFixed(1)}ms`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // BVH wieder aktivieren
        bufferManager.setBVHEnabled(true);

        // Ergebnisse
        const bvhAvg = bvhTimes.reduce((a, b) => a + b, 0) / bvhTimes.length;
        const linearAvg = linearTimes.reduce((a, b) => a + b, 0) / linearTimes.length;
        const speedup = linearAvg / bvhAvg;

        console.log('\n--- COMPARISON RESULTS ---');
        console.log(`BVH average: ${bvhAvg.toFixed(1)}ms (${(1000 / bvhAvg).toFixed(1)} FPS)`);
        console.log(`Linear average: ${linearAvg.toFixed(1)}ms (${(1000 / linearAvg).toFixed(1)} FPS)`);
        console.log(`BVH Speedup: ${speedup.toFixed(1)}x faster`);

        if (speedup > 10) {
            console.log('🚀 AMAZING: BVH ist >10x schneller!');
        } else if (speedup > 5) {
            console.log('🎯 EXCELLENT: BVH ist >5x schneller!');
        } else if (speedup > 2) {
            console.log('✅ GOOD: BVH ist >2x schneller');
        } else {
            console.log('⚠️ ISSUE: BVH Speedup zu gering');
        }
    };

    // ===== TEST 3: BVH INFO =====
    (window as any).bvhInfo = () => {
        console.log('\n=== BVH INFORMATION ===');

        const bufferManager = app.getBufferManager();

        if (!bufferManager.isBVHEnabled()) {
            console.log('❌ BVH ist deaktiviert');
            console.log('💡 Aktiviere BVH in Constants.ts: BVH_CONFIG.ENABLED = true');
            return;
        }

        const bvhStats = bufferManager.getBVHStats();
        if (!bvhStats) {
            console.log('❌ Keine BVH-Statistiken verfügbar');
            return;
        }

        console.log('🌳 BVH STATUS: AKTIV ✅');
        console.log(`├─ Nodes: ${bvhStats.nodeCount}`);
        console.log(`├─ Leafs: ${bvhStats.leafCount}`);
        console.log(`├─ Max Depth: ${bvhStats.maxDepth}`);
        console.log(`├─ Memory: ${bvhStats.memoryUsageKB.toFixed(1)} KB`);
        console.log(`└─ Expected Speedup: ${bvhStats.estimatedSpeedup.toFixed(1)}x`);

        const sphereCount = app.scene.getSphereCount();
        console.log(`\n📊 EFFICIENCY:`);
        console.log(`├─ Linear tests per ray: ${sphereCount}`);
        console.log(`├─ BVH tests per ray: ~${Math.log2(sphereCount).toFixed(1)}`);
        console.log(`└─ Theoretical speedup: ${(sphereCount / Math.log2(sphereCount)).toFixed(1)}x`);
    };

    // ===== HELPER: BVH AKTIVIEREN =====
    (window as any).enableBVH = () => {
        const bufferManager = app.getBufferManager();
        bufferManager.setBVHEnabled(true);
        console.log('🌳 BVH aktiviert');
    };

    // ===== HELPER: BVH DEAKTIVIEREN =====
    (window as any).disableBVH = () => {
        const bufferManager = app.getBufferManager();
        bufferManager.setBVHEnabled(false);
        console.log('📈 BVH deaktiviert (linear mode)');
    };
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});