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

        // ===== ANIMATIONS-HELPER FUNKTIONEN =====
        let animationLoopRunning = false;
        let animationFrameId: number | null = null;

        const renderLoop = async () => {
            if (!animationLoopRunning) return;

            await app.renderFrame();
            animationFrameId = requestAnimationFrame(renderLoop);
        };

        (window as any).startAnimation = async (count?: number) => {
            const sphereCount = count || 10;

            console.log(`🎬 Starte Animation für ${sphereCount} Kugeln...`);

            // WICHTIG: Kamera näher an die erste Sphere bewegen für bessere Sichtbarkeit!
            const camera = app.scene.getCamera();
            const firstSphere = app.scene.getThreeScene().children.find(obj => obj.name?.startsWith('TestSphere_0'));

            if (firstSphere) {
                // Kamera 10 Einheiten vor der Sphere positionieren
                const spherePos = firstSphere.position;
                camera.position.set(spherePos.x, spherePos.y, spherePos.z + 10);
                camera.lookAt(spherePos);
                camera.updateProjectionMatrix();
                console.log(`📷 Kamera auf Sphere 0 fokussiert: pos=(${spherePos.x.toFixed(2)}, ${spherePos.y.toFixed(2)}, ${spherePos.z.toFixed(2)})`);
            }

            // WICHTIG: Cache zurücksetzen und EINEN Frame rendern BEVOR Animation startet!
            console.log(`🔄 Schritt 1: Reset Cache`);
            app.resetCache();

            console.log(`🎨 Schritt 2: Render initial frame (Cache füllen)`);
            await app.renderFrame();

            console.log(`🚀 Schritt 3: Start Animation`);
            app.scene.startSimpleAnimation(sphereCount);

            if (!animationLoopRunning) {
                animationLoopRunning = true;
                renderLoop();
                console.log(`✅ Animation & Render-Loop gestartet für ${sphereCount} Kugeln`);
            } else {
                console.log(`✅ Animation gestartet für ${sphereCount} Kugeln (Loop läuft bereits)`);
            }
        };

        (window as any).stopAnimation = () => {
            app.scene.stopAnimation();
            animationLoopRunning = false;
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            console.log(`⏸️  Animation & Render-Loop gestoppt`);
        };

        (window as any).resetCache = () => {
            app.resetCache();
            console.log(`🔄 Cache zurückgesetzt`);
        };

        console.log(`\n📌 Verfügbare Funktionen:`);
        console.log(`  startAnimation(count) - Starte Animation & Render-Loop (default: 10 Kugeln)`);
        console.log(`  stopAnimation()       - Stoppe Animation & Render-Loop`);
        console.log(`  resetCache()          - Cache zurücksetzen\n`);

        // Performance-Tests registrieren
        setupPerformanceTests(app);

    } catch (error) {
        logger.error('Fehler beim Starten:', error);
        throw error;
    }
}

main().catch(error => {
    console.error('Kritischer Fehler:', error);
});
