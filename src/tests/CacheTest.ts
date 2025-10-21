// src/tests/MinimalCacheTest.ts - Kompakter Cache Performance Test

import type { WebGPURaytracerApp } from '../core/WebGPURaytracerApp';

// TypeScript-Deklaration für globale Funktion
declare global {
    interface Window {
        testCache: () => Promise<void>;
    }
}

export function cacheTest(app: WebGPURaytracerApp): void {

    window.testCache = async () => {
        console.log('\n=== SHADOW-CACHE PERFORMANCE TEST ===');

        // 1. Cache Reset & Baseline
        app.pixelCache.reset();
        console.log('✅ Cache zurückgesetzt');

        // 2. Erste Messung - Cache Build
        const start1 = performance.now();
        await app.renderFrame();
        const buildTime = performance.now() - start1;

        await app.pixelCache.readStatistics();
        const stats1 = app.pixelCache.getStatistics();

        console.log(`🎬 Cache Build: ${buildTime.toFixed(1)}ms - Hit Rate: ${stats1.hitRate.toFixed(1)}%`);

        // 3. Zweite Messung - Cache Usage
        const start2 = performance.now();
        await app.renderFrame();
        const useTime = performance.now() - start2;

        await app.pixelCache.readStatistics();
        const stats2 = app.pixelCache.getStatistics();

        console.log(`⚡ Cache Usage: ${useTime.toFixed(1)}ms - Hit Rate: ${stats2.hitRate.toFixed(1)}%`);

        // 4. Performance Verbesserung
        const improvement = buildTime > 0 ? ((buildTime - useTime) / buildTime * 100) : 0;
        console.log(`📈 Performance: ${improvement.toFixed(1)}% schneller mit Cache`);

        // 5. Objekt-Bewegung Test
        console.log('\n--- BEWEGUNG TEST ---');

        app.scene.moveTwoRandomSpheres();

        const start3 = performance.now();
        await app.renderFrame();
        const moveTime = performance.now() - start3;

        await app.pixelCache.readStatistics();
        const stats3 = app.pixelCache.getStatistics();

        console.log(`🔄 Nach Bewegung: ${moveTime.toFixed(1)}ms - Hit Rate: ${stats3.hitRate.toFixed(1)}%`);

        app.scene.resetTestSpheres();

        // 6. Zusammenfassung
        console.log('\n--- ZUSAMMENFASSUNG ---');

        if (stats2.hitRate > 95) {
            console.log('✅ Cache funktioniert PERFEKT');
        } else if (stats2.hitRate > 80) {
            console.log('⚠️ Cache funktioniert OK');
        } else {
            console.log('❌ Cache hat Probleme');
        }

        const efficiency = app.pixelCache.evaluateEfficiency();
        console.log(`📊 Effizienz: ${efficiency.rating} - ${efficiency.message}`);

        // 7. Shadow-Cache Daten prüfen
        console.log('\n--- SHADOW-CACHE SAMPLE ---');
        const samplePixels = [
            { x: 400, y: 300 }, // Sphere Bereich
            { x: 100, y: 500 }  // Ground Bereich
        ];

        for (const pixel of samplePixels) {
            await analyzeSamplePixel(app, pixel);
        }
    };

    // Hilfsfunktion für Pixel-Analyse
    async function analyzeSamplePixel(app: WebGPURaytracerApp, pixel: { x: number, y: number }): Promise<void> {
        try {
            const buffer = app.bufferManager.getCacheBuffer();
            const stagingBuffer = app.bufferManager.getDevice().createBuffer({
                size: 28, // 7 float32
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });

            const pixelIndex = pixel.y * 800 + pixel.x;
            const offset = pixelIndex * 28; // 7 * 4 bytes

            const commandEncoder = app.bufferManager.getDevice().createCommandEncoder();
            commandEncoder.copyBufferToBuffer(buffer, offset, stagingBuffer, 0, 28);
            app.bufferManager.getDevice().queue.submit([commandEncoder.finish()]);

            await app.bufferManager.getDevice().queue.onSubmittedWorkDone();
            await stagingBuffer.mapAsync(GPUMapMode.READ);

            const data = new Float32Array(stagingBuffer.getMappedRange());

            const sphereIndex = data[0];
            const shadowFactor = data[5];
            const valid = data[6];

            let type = '';
            if (valid === 0) type = 'INVALID';
            else if (sphereIndex === -1) type = 'BACKGROUND';
            else if (sphereIndex === -2) type = 'GROUND';
            else type = `SPHERE_${Math.floor(sphereIndex)}`;

            const shadowStatus = shadowFactor <= 0.3 ? 'SCHATTEN' : 'LICHT';

            console.log(`  Pixel (${pixel.x},${pixel.y}): ${type} - ${shadowStatus} (${shadowFactor.toFixed(2)})`);

            stagingBuffer.unmap();
            stagingBuffer.destroy();

        } catch (error) {
            console.log(`  Pixel (${pixel.x},${pixel.y}): Fehler beim Lesen`);
        }
    }

    console.log('✅ Minimaler Cache Test verfügbar:');
    console.log('   testCache() - Kompletter Performance & Funktions-Test');
}