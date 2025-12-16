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

        // Setup Performance Tests
        setupPerformanceTests(app);

        // ===== ANIMATIONS-HELPER FUNKTIONEN =====
        let animationLoopRunning = false;
        let animationFrameId: number | null = null;

        const renderLoop = async () => {
            if (!animationLoopRunning) return;

            await app.renderFrame();
            animationFrameId = requestAnimationFrame(renderLoop);
        };

    } catch (error) {
        logger.error('Fehler beim Starten:', error);
        throw error;
    }
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});
