import { WebGPURaytracerApp } from './core/WebGPURaytracerApp';
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

        logger.success('✅ Raytracer gestartet!');
        console.log(`📊 Szene: ${app.scene.getSphereCount()} Kugeln automatisch erstellt`);

    } catch (error) {
        logger.error('Fehler beim Starten:', error);
        throw error;
    }
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});