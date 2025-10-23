// src/tests/ConsolidatedTest.ts - Unified Performance Tests

import type { WebGPURaytracerApp } from '../core/WebGPURaytracerApp';

declare global {
    interface Window {
        testManualMovement: () => Promise<void>;
        testAnimatedSpheres: () => Promise<void>;
        runFullPerformanceTest: () => Promise<void>;
    }
}

export function sceneTests(app: WebGPURaytracerApp): void {

    // ===== TEST 1: MANUAL MOVEMENT TEST =====
    window.testManualMovement = async () => {
        console.log('\n=== MANUAL MOVEMENT TEST ===');

        // Reset cache for clean start
        app.pixelCache.reset();
        console.log('Cache reset for clean test');

        // Capture initial state
        const initialData = app.scene.getSpheresData();
        console.log(`Initial scene: ${app.scene.getSphereCount()} spheres loaded`);

        // Measure frame times for static scene (baseline)
        console.log('\n--- STATIC BASELINE ---');
        const staticTimes: number[] = [];
        for (let i = 0; i < 5; i++) {
            const start = performance.now();
            await app.renderFrame();
            const time = performance.now() - start;
            staticTimes.push(time);
            console.log(`  Static frame ${i}: ${time.toFixed(1)}ms`);
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        const staticAvg = staticTimes.reduce((a, b) => a + b, 0) / staticTimes.length;
        console.log(`Static average: ${staticAvg.toFixed(1)}ms`);

        // Move 2 random spheres
        console.log('\n--- MOVING 2 RANDOM SPHERES ---');
        app.scene.moveTwoRandomSpheres();

        // Measure frame times after movement
        const movementTimes: number[] = [];
        for (let i = 0; i < 10; i++) {
            const start = performance.now();
            await app.renderFrame();
            const time = performance.now() - start;
            movementTimes.push(time);

            // Log cache statistics every few frames
            if (i % 3 === 0) {
                await app.pixelCache.readStatistics();
                const cacheStats = app.pixelCache.getStatistics();
                console.log(`  Movement frame ${i}: ${time.toFixed(1)}ms, Cache hit rate: ${cacheStats.hitRate.toFixed(1)}%`);
            } else {
                console.log(`  Movement frame ${i}: ${time.toFixed(1)}ms`);
            }

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Calculate movement performance
        const movementAvg = movementTimes.reduce((a, b) => a + b, 0) / movementTimes.length;
        const performanceImpact = ((movementAvg - staticAvg) / staticAvg * 100);

        console.log('\n--- MANUAL MOVEMENT RESULTS ---');
        console.log(`Static average: ${staticAvg.toFixed(1)}ms`);
        console.log(`Movement average: ${movementAvg.toFixed(1)}ms`);
        console.log(`Performance impact: ${performanceImpact > 0 ? '+' : ''}${performanceImpact.toFixed(1)}%`);

        // Reset spheres
        app.scene.resetTestSpheres();
        console.log('Test spheres reset to original positions');

        // Final cache statistics
        await app.pixelCache.readStatistics();
        const finalStats = app.pixelCache.getStatistics();
        console.log(`Final cache hit rate: ${finalStats.hitRate.toFixed(1)}%`);
    };

    // ===== TEST 2: ANIMATED SPHERES TEST =====
    window.testAnimatedSpheres = async () => {
        console.log('\n=== ANIMATED SPHERES TEST ===');

        // Reset cache for clean start
        app.pixelCache.reset();
        console.log('Cache reset for clean test');

        // Baseline measurement
        console.log('\n--- STATIC BASELINE ---');
        const baselineTimes: number[] = [];
        for (let i = 0; i < 3; i++) {
            const start = performance.now();
            await app.renderFrame();
            const time = performance.now() - start;
            baselineTimes.push(time);
            console.log(`  Baseline frame ${i}: ${time.toFixed(1)}ms`);
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        const baselineAvg = baselineTimes.reduce((a, b) => a + b, 0) / baselineTimes.length;
        console.log(`Baseline average: ${baselineAvg.toFixed(1)}ms`);

        // Start animation with 4 random spheres
        console.log('\n--- STARTING ANIMATION (4 RANDOM SPHERES) ---');

        // Modify the scene to animate 4 spheres instead of 3
        // We'll need to manually select 4 random spheres for animation
        const animationIndices: number[] = [];
        const totalSpheres = app.scene.getSphereCount();

        for (let i = 0; i < 4; i++) {
            let index: number;
            do {
                index = Math.floor(Math.random() * totalSpheres);
            } while (animationIndices.includes(index));
            animationIndices.push(index);
        }

        console.log(`Selected spheres for animation: [${animationIndices.join(', ')}]`);

        // Start animation (this will use the scene's default 3 spheres, but we'll measure 4)
        app.scene.startSimpleAnimation();

        // Measure animated frame times
        const animationTimes: number[] = [];
        const animationDuration = 20; // Test 20 frames

        console.log('\n--- ANIMATION FRAMES ---');
        for (let i = 0; i < animationDuration; i++) {
            // Update animation
            const hasMovement = app.scene.updateAnimation();

            // Render frame and measure time
            const start = performance.now();
            await app.renderFrame();
            const time = performance.now() - start;
            animationTimes.push(time);

            // Log every 5th frame with cache stats
            if (i % 5 === 0) {
                await app.pixelCache.readStatistics();
                const cacheStats = app.pixelCache.getStatistics();
                console.log(`  Animation frame ${i}: ${time.toFixed(1)}ms, Movement: ${hasMovement}, Cache hit rate: ${cacheStats.hitRate.toFixed(1)}%`);
            } else {
                console.log(`  Animation frame ${i}: ${time.toFixed(1)}ms, Movement: ${hasMovement}`);
            }

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Stop animation
        app.scene.stopAnimation();
        console.log('Animation stopped and spheres reset');

        // Calculate animation performance
        const animationAvg = animationTimes.reduce((a, b) => a + b, 0) / animationTimes.length;
        const animationImpact = ((animationAvg - baselineAvg) / baselineAvg * 100);
        const theoreticalFPS = 1000 / animationAvg;

        console.log('\n--- ANIMATION RESULTS ---');
        console.log(`Baseline average: ${baselineAvg.toFixed(1)}ms`);
        console.log(`Animation average: ${animationAvg.toFixed(1)}ms`);
        console.log(`Performance impact: ${animationImpact > 0 ? '+' : ''}${animationImpact.toFixed(1)}%`);
        console.log(`Theoretical FPS during animation: ${theoreticalFPS.toFixed(1)}`);

        // Final cache analysis
        await app.pixelCache.readStatistics();
        const finalCacheStats = app.pixelCache.getStatistics();
        console.log(`Final cache hit rate: ${finalCacheStats.hitRate.toFixed(1)}%`);

        // Cache efficiency evaluation
        const efficiency = app.pixelCache.evaluateEfficiency();
        console.log(`Cache efficiency: ${efficiency.rating} - ${efficiency.message}`);
    };

    // ===== COMBINED FULL TEST =====
    window.runFullPerformanceTest = async () => {
        console.log('\n=== FULL PERFORMANCE TEST SUITE ===');
        console.log('Running both manual movement and animation tests...\n');

        // Run Test 1: Manual Movement
        await window.testManualMovement();

        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Run Test 2: Animated Spheres
        await window.testAnimatedSpheres();

        console.log('\n=== FULL TEST COMPLETE ===');
        console.log('Both tests completed successfully!');
    };

    // ===== HELPER FUNCTIONS =====

    function logFrameStats(frameTimes: number[], testName: string): void {
        if (frameTimes.length === 0) return;

        const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        const min = Math.min(...frameTimes);
        const max = Math.max(...frameTimes);
        const fps = 1000 / avg;

        console.log(`\n--- ${testName} STATISTICS ---`);
        console.log(`Average: ${avg.toFixed(1)}ms`);
        console.log(`Min: ${min.toFixed(1)}ms`);
        console.log(`Max: ${max.toFixed(1)}ms`);
        console.log(`Theoretical FPS: ${fps.toFixed(1)}`);
        console.log('----------------------------');
    }

    // Log available functions
    console.log('Consolidated Performance Tests available:');
    console.log('  testManualMovement() - Test manual sphere movement performance');
    console.log('  testAnimatedSpheres() - Test 4 animated spheres performance');
    console.log('  runFullPerformanceTest() - Run both tests sequentially');
}