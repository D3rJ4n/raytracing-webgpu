/**
 * ConsoleDisplay - Schönes formatiertes Console-Layout für App-Informationen
 */

import { WebGPURaytracerApp } from '../core/WebGPURaytracerApp';

export class ConsoleDisplay {
    private static readonly COLORS = {
        reset: '\x1b[0m',
        bright: '\x1b[1m',
        dim: '\x1b[2m',

        // Foreground colors
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',

        // Background colors
        bgBlack: '\x1b[40m',
        bgBlue: '\x1b[44m',
        bgCyan: '\x1b[46m',
    };

    /**
     * Zeigt eine schöne formatierte Übersicht der App-Initialisierung
     */
    public static showInitializationSummary(app: WebGPURaytracerApp): void {
        console.clear();

        // Header
        console.log('\n');
        console.log(`%c╔════════════════════════════════════════════════════════════════╗`,
            'color: #00838F; font-weight: bold; font-size: 14px;');
        console.log(`%c║        ⚡ WEBGPU RAYTRACER - INITIALIZATION COMPLETE ⚡        ║`,
            'color: #00838F; font-weight: bold; font-size: 14px;');
        console.log(`%c╚════════════════════════════════════════════════════════════════╝`,
            'color: #00838F; font-weight: bold; font-size: 14px;');
        console.log('\n');

        // Scene Information
        console.log('%c┌─ 🎬 SCENE CONFIGURATION ─────────────────────────────────────┐',
            'color: #2E7D32; font-weight: bold;');

        const sphereCount = app.scene.getSphereCount();
        const camera = app.scene.getCamera();
        const cameraPos = camera.position;

        console.log(`%c│ %cSpheres:%c ${sphereCount.toString().padEnd(48)} %c│`,
            'color: #2E7D32', 'color: #000; font-weight: bold', 'color: #1B5E20', 'color: #2E7D32');
        console.log(`%c│ %cCamera Position:%c (${cameraPos.x.toFixed(1)}, ${cameraPos.y.toFixed(1)}, ${cameraPos.z.toFixed(1)})`.padEnd(70) + `%c│`,
            'color: #2E7D32', 'color: #000; font-weight: bold', 'color: #1B5E20', 'color: #2E7D32');
        console.log(`%c│ %cField of View:%c ${camera.fov}°`.padEnd(70) + `%c│`,
            'color: #2E7D32', 'color: #000; font-weight: bold', 'color: #1B5E20', 'color: #2E7D32');

        console.log('%c└───────────────────────────────────────────────────────────────┘',
            'color: #2E7D32; font-weight: bold;');
        console.log('\n');

        // WebGPU Information
        console.log('%c┌─ 🎮 WEBGPU CONFIGURATION ────────────────────────────────────┐',
            'color: #1565C0; font-weight: bold;');

        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        console.log(`%c│ %cCanvas Size:%c ${canvas.width}x${canvas.height}`.padEnd(70) + `%c│`,
            'color: #1565C0', 'color: #000; font-weight: bold', 'color: #0D47A1', 'color: #1565C0');
        console.log(`%c│ %cDevice:%c Initialized`.padEnd(70) + `%c│`,
            'color: #1565C0', 'color: #000; font-weight: bold', 'color: #0D47A1', 'color: #1565C0');
        console.log(`%c│ %cCompute Pipeline:%c Ready`.padEnd(70) + `%c│`,
            'color: #1565C0', 'color: #000; font-weight: bold', 'color: #0D47A1', 'color: #1565C0');
        console.log(`%c│ %cRender Pipeline:%c Ready`.padEnd(70) + `%c│`,
            'color: #1565C0', 'color: #000; font-weight: bold', 'color: #0D47A1', 'color: #1565C0');

        console.log('%c└───────────────────────────────────────────────────────────────┘',
            'color: #1565C0; font-weight: bold;');
        console.log('\n');

        // Features & Systems
        console.log('%c┌─ ⚙️  SYSTEMS & FEATURES ──────────────────────────────────────┐',
            'color: #E65100; font-weight: bold;');

        const bvhEnabled = app.getBufferManager().isBVHEnabled();
        console.log(`%c│ %c✓ Pixel Cache:%c Enabled & Initialized`.padEnd(70) + `%c│`,
            'color: #E65100', 'color: #2E7D32; font-weight: bold', 'color: #BF360C', 'color: #E65100');
        console.log(`%c│ %c${bvhEnabled ? '✓' : '✗'} BVH Acceleration:%c ${bvhEnabled ? 'Enabled' : 'Disabled'}`.padEnd(70) + `%c│`,
            'color: #E65100', `color: ${bvhEnabled ? '#2E7D32' : '#666'}; font-weight: bold`, 'color: #BF360C', 'color: #E65100');
        console.log(`%c│ %c✓ Camera Controller:%c Active (WASD/E/Q)`.padEnd(70) + `%c│`,
            'color: #E65100', 'color: #2E7D32; font-weight: bold', 'color: #BF360C', 'color: #E65100');
        console.log(`%c│ %c✓ Sphere Editor:%c Active (Mouse Drag)`.padEnd(70) + `%c│`,
            'color: #E65100', 'color: #2E7D32; font-weight: bold', 'color: #BF360C', 'color: #E65100');
        console.log(`%c│ %c✓ Selective Invalidation:%c Active`.padEnd(70) + `%c│`,
            'color: #E65100', 'color: #2E7D32; font-weight: bold', 'color: #BF360C', 'color: #E65100');

        console.log('%c└───────────────────────────────────────────────────────────────┘',
            'color: #E65100; font-weight: bold;');
        console.log('\n');

        // Global Variables
        console.log('%c┌─ 🌐 GLOBAL VARIABLES ─────────────────────────────────────────┐',
            'color: #5D4037; font-weight: bold;');

        console.log(`%c│ %capp%c              Main application instance`.padEnd(70) + `%c│`,
            'color: #5D4037', 'color: #000; font-weight: bold', 'color: #3E2723', 'color: #5D4037');
        console.log(`%c│ %capp.scene%c        Scene management & sphere data`.padEnd(70) + `%c│`,
            'color: #5D4037', 'color: #000; font-weight: bold', 'color: #3E2723', 'color: #5D4037');
        console.log(`%c│ %capp.pixelCache%c   Pixel cache instance`.padEnd(70) + `%c│`,
            'color: #5D4037', 'color: #000; font-weight: bold', 'color: #3E2723', 'color: #5D4037');

        console.log('%c└───────────────────────────────────────────────────────────────┘',
            'color: #5D4037; font-weight: bold;');
        console.log('\n');

        // Controls
        console.log('%c┌─ 🎮 CONTROLS ─────────────────────────────────────────────────┐',
            'color: #37474F; font-weight: bold;');

        const controls = [
            { key: 'W/A/S/D', action: 'Move camera (forward/left/back/right)' },
            { key: 'E/Q', action: 'Move camera (up/down)' },
            { key: 'Mouse Drag', action: 'Move sphere in view plane' },
            { key: 'Double Click', action: 'Open sphere editor UI' },
            { key: 'Mouse Wheel', action: 'Change sphere radius (when selected)' }
        ];

        controls.forEach(ctrl => {
            console.log(`%c│ %c${ctrl.key.padEnd(15)}%c ${ctrl.action}`.padEnd(70) + `%c│`,
                'color: #37474F', 'color: #000; font-weight: bold', 'color: #263238', 'color: #37474F');
        });

        console.log('%c└───────────────────────────────────────────────────────────────┘',
            'color: #37474F; font-weight: bold;');
        console.log('\n');

        // Performance Tests
        console.log('%c┌─ 🧪 PERFORMANCE TESTS ────────────────────────────────────────┐',
            'color: #6A1B9A; font-weight: bold;');

        const tests = [
            { name: 'testLinearScaling()', desc: 'Linear scaling (500-1400 Kugeln, kein Cache)' },
            { name: 'testCacheScaling()', desc: 'Cache scaling (500-1400 Kugeln, Cache aktiv)' },
            { name: 'testBVHScaling()', desc: 'BVH scaling (500-1400 Kugeln, BVH aktiv)' },
            { name: 'testSingleMovementInvalidation()', desc: 'Einmalige Bewegung von 3 Kugeln' },
            { name: 'testMovingSpheresInvalidation()', desc: 'Animation von 3 Kugeln (300 Frames)' }
        ];

        tests.forEach(test => {
            console.log(`%c│  %c• ${test.name}`.padEnd(72) + `%c│`,
                'color: #6A1B9A', 'color: #4A148C; font-weight: bold', 'color: #6A1B9A');
            console.log(`%c│    %c${test.desc}`.padEnd(72) + `%c│`,
                'color: #6A1B9A', 'color: #7B1FA2', 'color: #6A1B9A');
        });

        console.log('%c└───────────────────────────────────────────────────────────────┘',
            'color: #6A1B9A; font-weight: bold;');
        console.log('\n');

        // Cache-Visualisierung
        console.log('%c┌─ 🔍 CACHE-VISUALISIERUNG ──────────────────────────────────────┐',
            'color: #00695C; font-weight: bold;');

        const visTests = [
            { name: 'cacheVisOn()', desc: 'Startet Rot/Grün Cache-Visualisierung' },
        ];

        visTests.forEach(test => {
            console.log(`%c│  %c• ${test.name}`.padEnd(72) + `%c│`,
                'color: #00695C', 'color: #004D40; font-weight: bold', 'color: #00695C');
            console.log(`%c│    %c${test.desc}`.padEnd(72) + `%c│`,
                'color: #00695C', 'color: #00796B', 'color: #00695C');
        });

        console.log('%c└───────────────────────────────────────────────────────────────┘',
            'color: #00695C; font-weight: bold;');
        console.log('\n');

        // Footer
        console.log('%c═══════════════════════════════════════════════════════════════',
            'color: #00838F; font-weight: bold;');
        console.log('%c             ✓ Initialization complete - Ready to render!',
            'color: #2E7D32; font-weight: bold;');
        console.log('%c═══════════════════════════════════════════════════════════════',
            'color: #00838F; font-weight: bold;');
        console.log('\n');
    }

    /**
     * Zeigt eine kompakte Live-Status Nachricht
     */
    public static showStatus(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
        const icons = {
            info: 'ℹ️',
            success: '✓',
            warning: '⚠️',
            error: '✗'
        };

        const colors = {
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FF9800',
            error: '#f44336'
        };

        console.log(`%c${icons[type]} ${message}`, `color: ${colors[type]}; font-weight: bold;`);
    }
}
