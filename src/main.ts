// src/main.ts - Erweitert um FPS Animation Tests

import { WebGPURaytracerApp } from './core/WebGPURaytracerApp';
import { sceneTests } from './tests/SceneTest';
import { Logger } from './utils/Logger';

async function main(): Promise<void> {
    const logger = Logger.getInstance();
    logger.setMinimalMode(true);
    logger.setShowFrameDetails(false);

    try {
        logger.success('🚀 Starte WebGPU Raytracer...');

        const app = new WebGPURaytracerApp();
        await app.initialize();

        // App global verfügbar machen
        (window as any).app = app;

        // Alle Tests initialisieren
        sceneTests(app);

        logger.success('✅ Raytracer gestartet!');
        console.log(`📊 Szene: ${app.scene.getSphereCount()} Kugeln automatisch erstellt`);

        // Zeige verfügbare Test-Kommandos
        console.log('\n🧪 VERFÜGBARE TESTS:');

        console.log('\n--- CACHE TESTS ---');
        console.log('   testCache() - Cache Performance Test');

        console.log('\n--- ANIMATION TESTS ---');
        console.log('   startAnimation() + animationLoop() - Live Animation');
        console.log('   testAnimationCache() - Animation + Cache Analyse');

        console.log('\n--- FPS TESTS (EMPFOHLEN!) ---');
        console.log('   testAnimationFPS() - FPS-Vergleich statisch vs animiert');
        console.log('   testCacheVsNoCache() - Cache vs No-Cache Performance');
        console.log('   runAnimationBenchmark() - Umfassendes Benchmark');

        console.log('\n--- DEBUG TESTS ---');
        console.log('   checkMovementDetection() - Bewegungs-Erkennung analysieren');
        console.log('   debugCacheInvalidation() - Cache-Invalidierung debuggen');

        console.log('\n🎯 EMPFOHLENER TEST FÜR CACHE-ANIMATION:');
        console.log('   testCacheVsNoCache() - Zeigt echten Cache-Performance-Unterschied!');

    } catch (error) {
        logger.error('Fehler beim Starten:', error);
        throw error;
    }
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});