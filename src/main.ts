// src/main.ts - WebGPU Raytracer Entry Point

import { WebGPURaytracerApp } from './core/WebGPURaytracerApp';
import { Logger } from './utils/Logger';
import { setupPerformanceTests } from './tests/PerformanceTests';

async function main(): Promise<void> {
    const logger = Logger.getInstance();
    logger.setMinimalMode(true);

    try {
        logger.success('🚀 Starte WebGPU Raytracer...');

        const app = new WebGPURaytracerApp();
        await app.initialize();

        // App global verfügbar machen für Debugging
        (window as any).app = app;

        // Performance-Tests registrieren
        setupPerformanceTests(app);

        logger.success('✅ Raytracer gestartet!');
        console.log(`📊 Szene: ${app.scene.getSphereCount()} Kugeln geladen`);
        console.log('\n📊 Performance-Tests verfügbar:');
        console.log('  • testStaticScene() - Cache-Effektivität (statische Szene)');
        console.log('  • testSingleSphere() - Selektive Invalidierung (Animation)');
        console.log('  • testSelectiveVsFull() - Vergleich selektiv vs. komplett');
        console.log('  • testCameraMovement() - Worst-Case (Kamera-Bewegung)');
        console.log('  • testFullPerformanceMatrix() - ⭐ VOLLSTÄNDIGER TEST (alle BVH+Cache Kombinationen)');
        console.log('  • runAllTests() - Alle Tests nacheinander ausführen');
        console.log('\n🔬 BVH Skalierungs-Tests:');
        console.log('  • testBVHScaling() - ⭐ BVH-Test (200-580 Kugeln in 20er-Schritten, erwartet O(log n))');
        console.log('  • testLinearScaling() - ⭐ Linearer Test (50-430 Kugeln in 20er-Schritten, erwartet O(n))\n');

    } catch (error) {
        logger.error('Fehler beim Starten:', error);
        throw error;
    }
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});
