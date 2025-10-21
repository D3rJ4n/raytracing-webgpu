// src/main.ts - Erweitert um Shadow-Cache Tests

import { WebGPURaytracerApp } from './core/WebGPURaytracerApp';
import { Logger } from './utils/Logger';
import { cacheTest } from './tests/CacheTest';

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

        // NEU: Shadow-Cache Tests initialisieren
        cacheTest(app);

        logger.success('✅ Raytracer gestartet!');
        console.log(`📊 Szene: ${app.scene.getSphereCount()} Kugeln automatisch erstellt`);

        // NEU: Zeige verfügbare Test-Kommandos
        console.log('\n🧪 SHADOW-CACHE TESTS VERFÜGBAR:');
        console.log('   testShadowCache() - Vollständiger Invalidation-Test');
        console.log('   analyzeShadowPixels([{x:400,y:300}]) - Analysiere spezifische Pixel');
        console.log('   runQuickCacheTest() - Schneller Cache-Test');
        console.log('   app.pixelCache.debugCacheContents(50) - Debug Cache-Inhalte');

    } catch (error) {
        logger.error('Fehler beim Starten:', error);
        throw error;
    }
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});