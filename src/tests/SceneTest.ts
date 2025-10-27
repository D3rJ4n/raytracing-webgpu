// src/tests/SceneTest.ts - Clean BVH Tests Only

import type { WebGPURaytracerApp } from '../core/WebGPURaytracerApp';

declare global {
    interface Window {
        testBVH: () => Promise<void>;
        testBVHvLinear: () => Promise<void>;
        bvhInfo: () => void;
        enableBVH: () => void;
        disableBVH: () => void;
    }
}

export function sceneTests(app: WebGPURaytracerApp): void {

    // ===== BVH PERFORMANCE TEST =====
    window.testBVH = async () => {
        console.clear(); // Clear old console output
        console.log('\n🧪 === BVH PERFORMANCE TEST ===');

        const bufferManager = app.getBufferManager();

        if (!bufferManager.isBVHEnabled()) {
            console.log('❌ BVH ist deaktiviert');
            console.log('💡 Lösung: enableBVH() eingeben');
            return;
        }

        console.log('🌳 BVH ist aktiviert - starte Test...');

        // Reset für sauberen Test
        app.resetCache();
        await new Promise(resolve => setTimeout(resolve, 100));

        const frameTimes: number[] = [];

        console.log('\n📊 Rendering 10 Test-Frames...');
        for (let i = 0; i < 10; i++) {
            const start = performance.now();
            await app.renderFrame();
            await app.getBufferManager().getDevice().queue.onSubmittedWorkDone();
            const frameTime = performance.now() - start;
            frameTimes.push(frameTime);

            console.log(`  Frame ${i + 1}: ${frameTime.toFixed(1)}ms`);
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        const avgTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        const minTime = Math.min(...frameTimes);
        const maxTime = Math.max(...frameTimes);
        const fps = 1000 / avgTime;

        console.log('\n🎯 === RESULTS ===');
        console.log(`Average: ${avgTime.toFixed(1)}ms (${fps.toFixed(1)} FPS)`);
        console.log(`Best: ${minTime.toFixed(1)}ms (${(1000 / minTime).toFixed(1)} FPS)`);
        console.log(`Worst: ${maxTime.toFixed(1)}ms (${(1000 / maxTime).toFixed(1)} FPS)`);

        // BVH Statistiken
        const bvhStats = bufferManager.getBVHStats();
        if (bvhStats) {
            console.log(`\n🌳 BVH Stats:`);
            console.log(`  Nodes: ${bvhStats.nodeCount} | Depth: ${bvhStats.maxDepth}`);
            console.log(`  Expected speedup: ${bvhStats.estimatedSpeedup.toFixed(1)}x`);
        }

        // Performance Rating
        if (fps > 60) {
            console.log('🚀 EXCELLENT: >60 FPS - BVH funktioniert perfekt!');
        } else if (fps > 30) {
            console.log('✅ GOOD: >30 FPS - BVH funktioniert gut');
        } else if (fps > 15) {
            console.log('⚠️ OK: >15 FPS - BVH funktioniert');
        } else {
            console.log('❌ SLOW: <15 FPS - BVH Problem?');
        }
    };

    // ===== BVH vs LINEAR COMPARISON =====
    window.testBVHvLinear = async () => {
        console.clear();
        console.log('\n🧪 === BVH vs LINEAR COMPARISON ===');

        const bufferManager = app.getBufferManager();

        // Test 1: Mit BVH
        console.log('\n🌳 Phase 1: Testing WITH BVH...');
        bufferManager.setBVHEnabled(true);
        app.resetCache();
        await new Promise(resolve => setTimeout(resolve, 200));

        const bvhTimes: number[] = [];
        for (let i = 0; i < 5; i++) {
            const start = performance.now();
            await app.renderFrame();
            await app.getBufferManager().getDevice().queue.onSubmittedWorkDone();
            const time = performance.now() - start;
            bvhTimes.push(time);
            console.log(`  BVH Frame ${i + 1}: ${time.toFixed(1)}ms`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Test 2: Ohne BVH (Linear)
        console.log('\n📈 Phase 2: Testing WITHOUT BVH (Linear mode)...');
        bufferManager.setBVHEnabled(false);
        app.resetCache();
        await new Promise(resolve => setTimeout(resolve, 200));

        const linearTimes: number[] = [];
        for (let i = 0; i < 5; i++) {
            const start = performance.now();
            await app.renderFrame();
            await app.getBufferManager().getDevice().queue.onSubmittedWorkDone();
            const time = performance.now() - start;
            linearTimes.push(time);
            console.log(`  Linear Frame ${i + 1}: ${time.toFixed(1)}ms`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // BVH wieder aktivieren
        bufferManager.setBVHEnabled(true);
        console.log('\n🔄 BVH wieder aktiviert');

        // Ergebnisse berechnen
        const bvhAvg = bvhTimes.reduce((a, b) => a + b, 0) / bvhTimes.length;
        const linearAvg = linearTimes.reduce((a, b) => a + b, 0) / linearTimes.length;
        const speedup = linearAvg / bvhAvg;
        const bvhFPS = 1000 / bvhAvg;
        const linearFPS = 1000 / linearAvg;

        console.log('\n🏆 === FINAL COMPARISON ===');
        console.log(`BVH:    ${bvhAvg.toFixed(1)}ms  (${bvhFPS.toFixed(1)} FPS)`);
        console.log(`Linear: ${linearAvg.toFixed(1)}ms  (${linearFPS.toFixed(1)} FPS)`);
        console.log(`\n🚀 BVH SPEEDUP: ${speedup.toFixed(1)}x FASTER`);

        // Performance Assessment
        if (speedup > 20) {
            console.log('🎯 AMAZING: BVH ist >20x schneller! Perfekt!');
        } else if (speedup > 10) {
            console.log('🚀 EXCELLENT: BVH ist >10x schneller!');
        } else if (speedup > 5) {
            console.log('✅ GOOD: BVH ist >5x schneller');
        } else if (speedup > 2) {
            console.log('⚠️ OK: BVH ist >2x schneller');
        } else {
            console.log('❌ PROBLEM: BVH Speedup zu gering');
        }

        console.log(`\n📊 Mit ${app.scene.getSphereCount()} Kugeln sollte BVH ~50x schneller sein`);
    };

    // ===== BVH INFORMATION =====
    window.bvhInfo = () => {
        console.clear();
        console.log('\n📋 === BVH SYSTEM INFO ===');

        const bufferManager = app.getBufferManager();
        const sphereCount = app.scene.getSphereCount();

        if (!bufferManager.isBVHEnabled()) {
            console.log('❌ BVH Status: DEAKTIVIERT');
            console.log('💡 Aktivieren mit: enableBVH()');
            console.log(`📊 Aktuelle Performance: Linear O(${sphereCount}) tests per ray`);
            return;
        }

        const bvhStats = bufferManager.getBVHStats();
        if (!bvhStats) {
            console.log('❌ BVH aktiviert, aber keine Statistiken verfügbar');
            return;
        }

        console.log('✅ BVH Status: AKTIV');
        console.log('\n🌳 BVH Struktur:');
        console.log(`  ├─ Total Nodes: ${bvhStats.nodeCount}`);
        console.log(`  ├─ Leaf Nodes: ${bvhStats.leafCount}`);
        console.log(`  ├─ Max Depth: ${bvhStats.maxDepth}`);
        console.log(`  └─ Memory Usage: ${bvhStats.memoryUsageKB.toFixed(1)} KB`);

        console.log('\n📊 Performance:');
        console.log(`  ├─ Spheres: ${sphereCount}`);
        console.log(`  ├─ Linear tests/ray: ${sphereCount}`);
        console.log(`  ├─ BVH tests/ray: ~${Math.log2(sphereCount).toFixed(1)}`);
        console.log(`  └─ Expected speedup: ${bvhStats.estimatedSpeedup.toFixed(1)}x`);

        const theoreticalSpeedup = sphereCount / Math.log2(sphereCount);
        console.log(`\n🎯 Theoretical maximum: ${theoreticalSpeedup.toFixed(1)}x speedup`);
    };

    // ===== HELPER FUNCTIONS =====
    window.enableBVH = () => {
        app.getBufferManager().setBVHEnabled(true);
        console.log('🌳 BVH aktiviert - teste mit testBVH()');
    };

    window.disableBVH = () => {
        app.getBufferManager().setBVHEnabled(false);
        console.log('📈 BVH deaktiviert - läuft linear');
    };

    // Zeige verfügbare Funktionen
    console.log('\n🧪 BVH TEST FUNCTIONS:');
    console.log('  testBVH() - BVH Performance Test');
    console.log('  testBVHvLinear() - BVH vs Linear Vergleich');
    console.log('  bvhInfo() - BVH System Information');
    console.log('  enableBVH() / disableBVH() - BVH an/aus');
}