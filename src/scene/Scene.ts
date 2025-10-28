import * as THREE from 'three';
import { Logger } from '../utils/Logger';

export interface RaytracerSphere {
    center: { x: number; y: number; z: number };
    radius: number;
    color: { r: number; g: number; b: number };
    metallic: number;
}

export interface RaytracerLight {
    position: { x: number; y: number; z: number };
    color: { r: number; g: number; b: number };
    intensity: number;
}

/**
 * Scene - Three.js Szenen-Management mit Animation
 */
export class Scene {
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private logger: Logger;

    private meshes: THREE.Mesh[] = [];
    private lights: THREE.Light[] = [];
    private ambientLightIntensity: number = 0.2;

    private rotationRadius: number = 25;
    private cameraHeight: number = 10;

    // Test-Kugeln für Performance-Tests
    private testSpheres: number[] = [];

    // ===== ANIMATION SYSTEM =====
    private animationTime: number = 0;
    private animationSpeed: number = 1.0;
    private animatedSpheres: Set<number> = new Set();
    private isAnimationActive: boolean = false;
    private animationStartTime: number = 0;

    constructor() {
        this.logger = Logger.getInstance();
    }

    public initialize(): void {
        this.logger.init('Erstelle Three.js Szene...');

        this.createScene();
        this.createCamera();

        // 500 Kugeln Grid erstellen
        this.setup500SphereGrid();

        this.logSceneInfo();
        this.logger.success('Three.js Szene erstellt');
    }

    private createScene(): void {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.logger.init('Leere Three.js Szene erstellt');
    }

    private createCamera(): void {
        this.camera = new THREE.PerspectiveCamera(60, 1.0, 0.1, 100);
        this.camera.position.set(0, this.cameraHeight, this.rotationRadius);
        this.camera.lookAt(0, 0, 0);
        this.logger.init(`Kamera erstellt: FOV=60°, Position=(0, ${this.cameraHeight}, ${this.rotationRadius})`);
    }

    /**
     * Erstelle 500 Kugeln Grid (25x20)
     */
    /**
  * Erstelle massive BVH-Test-Szene (korrigierte Version)
  */
    private setup500SphereGrid(): void {
        this.clearSpheres();
        this.logger.init('Erstelle massive BVH-Test-Szene...');

        const SPHERE_COUNT = 400;
        const WORLD_SIZE = 400;
        let validSpheres = 0;
        let invalidSpheres = 0;

        // Debug: Math.random() testen
        console.log('Math.random() test:', Math.random(), Math.random(), Math.random());

        for (let i = 0; i < SPHERE_COUNT; i++) {
            // Schritt-für-Schritt Validierung
            const randomX = Math.random();
            const randomY = Math.random();
            const randomZ = Math.random();

            if (!isFinite(randomX) || !isFinite(randomY) || !isFinite(randomZ)) {
                console.error(`Math.random() defekt bei ${i}: ${randomX}, ${randomY}, ${randomZ}`);
                invalidSpheres++;
                continue;
            }

            const x = (randomX - 0.5) * WORLD_SIZE;
            const y = randomY * 20 + 2; // 2 bis 22
            const z = (randomZ - 0.5) * WORLD_SIZE;

            if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
                console.error(`Position-Berechnung defekt bei ${i}: ${x}, ${y}, ${z}`);
                invalidSpheres++;
                continue;
            }

            // Sphere erstellen mit Validierung
            const radius = 0.3 + Math.random() * 0.4;
            const hue = i / SPHERE_COUNT;

            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 12, 12),
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setHSL(hue, 0.8, 0.6),
                    metalness: Math.random() > 0.8 ? 0.9 : 0.1,
                    roughness: 0.3 + Math.random() * 0.4
                })
            );

            sphere.position.set(x, y, z);
            sphere.name = `MassiveSphere_${validSpheres}`;
            sphere.userData.originalPosition = { x, y, z };

            this.scene.add(sphere);
            this.meshes.push(sphere);
            validSpheres++;

            if (i % 200 === 0) {
                console.log(`${i}/${SPHERE_COUNT} versucht, ${validSpheres} erstellt`);
            }
        }

        // Beleuchtung und Kamera-Setup...
        const mainLight = new THREE.PointLight(0xffffff, 2.0, WORLD_SIZE * 2);
        mainLight.position.set(0, WORLD_SIZE * 0.6, 0);
        this.scene.add(mainLight);
        this.lights.push(mainLight);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
        this.scene.add(ambientLight);
        this.lights.push(ambientLight);

        // Kamera für 1000+ Spheres
        this.camera.position.set(0, 60, 80);
        this.camera.lookAt(0, 10, 0);
        this.camera.fov = 75;
        this.camera.far = 300;
        this.camera.updateProjectionMatrix();

        this.logger.success(`${this.meshes.length} Spheres über ${WORLD_SIZE}x${WORLD_SIZE} erstellt`);
    }

    /**
     * Farbe für 500er Grid
     */
    private get500GridColor(col: number, row: number, totalCols: number, totalRows: number): number {
        const t = (col / totalCols + row / totalRows) / 2;
        const r = Math.floor(Math.sin(t * Math.PI * 2) * 127 + 128);
        const g = Math.floor(Math.sin(t * Math.PI * 2 + 2) * 127 + 128);
        const b = Math.floor(Math.sin(t * Math.PI * 2 + 4) * 127 + 128);
        return (r << 16) | (g << 8) | b;
    }

    // ===== ANIMATION METHODS =====

    /**
     * Starte einfache Animation für Test
     */
    public startSimpleAnimation(): void {
        if (this.isAnimationActive) {
            this.logger.info('Animation bereits aktiv');
            return;
        }

        // Wähle 3 zufällige Kugeln für Animation
        const animationIndices: number[] = [];
        for (let i = 0; i < 3; i++) {
            let index: number;
            do {
                index = Math.floor(Math.random() * this.meshes.length);
            } while (animationIndices.includes(index));
            animationIndices.push(index);
        }

        this.animatedSpheres = new Set(animationIndices);
        this.isAnimationActive = true;
        this.animationStartTime = performance.now();
        this.animationTime = 0;

        this.logger.success(`Animation gestartet für ${this.animatedSpheres.size} Kugeln`);
    }

    /**
     * Animation stoppen und Positionen zurücksetzen
     */
    public stopAnimation(): void {
        if (!this.isAnimationActive) {
            this.logger.info('Keine Animation aktiv');
            return;
        }

        // Alle animierten Kugeln zurücksetzen
        this.animatedSpheres.forEach(index => {
            const sphere = this.meshes[index];
            const original = sphere.userData.originalPosition;
            sphere.position.set(original.x, original.y, original.z);

        });

        this.isAnimationActive = false;
        this.animatedSpheres.clear();
        this.animationTime = 0;

        this.logger.success('Animation gestoppt und Positionen zurückgesetzt');
    }

    /**
     * Animation um einen Frame vorwärts bewegen
     */
    public updateAnimation(deltaTimeMs?: number): boolean {
        if (!this.isAnimationActive || this.animatedSpheres.size === 0) {
            return false;
        }

        // Zeit berechnen
        const currentTime = performance.now();
        if (deltaTimeMs === undefined) {
            deltaTimeMs = currentTime - this.animationStartTime;
        }

        this.animationTime = (deltaTimeMs * 0.001) * this.animationSpeed; // In Sekunden umwandeln

        let hasMovement = false;

        // Animierte Kugeln bewegen
        this.animatedSpheres.forEach(index => {
            const sphere = this.meshes[index];
            const original = sphere.userData.originalPosition;

            // Einfache Sinus-Animation in Y-Richtung
            const amplitude = 2.0; // Bewegungsausschlag
            const frequency = 1.0 + (index * 0.1); // Leicht unterschiedliche Frequenzen

            const oldY = sphere.position.y;
            const newY = original.y + Math.sin(this.animationTime * frequency) * amplitude;

            sphere.position.y = newY;

            // Prüfe ob sich Position signifikant geändert hat
            if (Math.abs(newY - oldY) > 0.01) {
                hasMovement = true;
            }
        });

        return hasMovement;
    }

    /**
     * Ist Animation aktiv?
     */
    public isAnimating(): boolean {
        return this.isAnimationActive;
    }

    /**
     * Animation-Geschwindigkeit setzen
     */
    public setAnimationSpeed(speed: number): void {
        this.animationSpeed = Math.max(0.1, speed);
        this.logger.info(`Animation-Geschwindigkeit: ${this.animationSpeed}x`);
    }

    /**
     * Aktuelle animierte Kugeln-Indizes abrufen
     */
    public getAnimatedSphereIndices(): number[] {
        return Array.from(this.animatedSpheres);
    }

    // ===== BESTEHENDE METHODS (unverändert) =====

    /**
     * Bewege 2 zufällige Kugeln für Performance-Test
     */
    public moveTwoRandomSpheres(): void {
        if (this.meshes.length < 2) {
            this.logger.error('Nicht genug Kugeln für Test');
            return;
        }

        // 2 zufällige Indizes auswählen
        const index1 = Math.floor(Math.random() * this.meshes.length);
        let index2 = Math.floor(Math.random() * this.meshes.length);

        // Sicherstellen, dass index2 != index1
        while (index2 === index1) {
            index2 = Math.floor(Math.random() * this.meshes.length);
        }

        const sphere1 = this.meshes[index1];
        const sphere2 = this.meshes[index2];

        // Kugeln um +5 Y bewegen
        sphere1.position.y += 2;
        sphere2.position.y += 2;

        // Test-Kugeln speichern für Reset
        this.testSpheres = [index1, index2];

        this.logger.info(`Test-Kugeln verschoben: ${sphere1.name} und ${sphere2.name} um +5 Y`);
    }

    /**
     * Test-Kugeln zurücksetzen
     */
    public resetTestSpheres(): void {
        if (this.testSpheres.length === 0) {
            this.logger.info('Keine Test-Kugeln zu resetten');
            return;
        }

        this.testSpheres.forEach(index => {
            if (index < this.meshes.length) {
                this.meshes[index].position.y -= 5;
            }
        });

        this.logger.info(`${this.testSpheres.length} Test-Kugeln zurückgesetzt`);
        this.testSpheres = [];
    }

    // ===== CORE API METHODEN =====

    public getSpheresData(): Float32Array {
        const maxSpheres = 1000;
        const floatsPerSphere = 8;
        const data = new Float32Array(maxSpheres * floatsPerSphere);

        this.meshes.forEach((mesh, index) => {
            if (index >= maxSpheres) return;

            const geometry = mesh.geometry as THREE.SphereGeometry;
            const material = mesh.material as THREE.MeshStandardMaterial;

            const radius = geometry.parameters.radius * Math.max(
                mesh.scale.x,
                mesh.scale.y,
                mesh.scale.z
            );

            const color = material.color;
            const metallic = material.metalness;
            const offset = index * floatsPerSphere;

            const worldPos = new THREE.Vector3();
            mesh.getWorldPosition(worldPos);

            data[offset + 0] = worldPos.x;
            data[offset + 1] = worldPos.y;
            data[offset + 2] = worldPos.z;
            data[offset + 3] = radius;
            data[offset + 4] = color.r;
            data[offset + 5] = color.g;
            data[offset + 6] = color.b;
            data[offset + 7] = metallic;
        });

        return data;
    }

    public getPrimaryLightPosition(): { x: number; y: number; z: number } {
        const light = this.lights.find(l => l instanceof THREE.PointLight) as THREE.PointLight;
        if (light) {
            const worldPos = new THREE.Vector3();
            light.getWorldPosition(worldPos);
            return { x: worldPos.x, y: worldPos.y, z: worldPos.z };
        }
        return { x: 10, y: 10, z: 10 };
    }

    public getAmbientIntensity(): number {
        return this.ambientLightIntensity;
    }

    public getSphereCount(): number {
        return this.meshes.length;
    }

    public updateCameraAspect(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    public getCameraData(): Float32Array {
        const lookAtTarget = new THREE.Vector3(0, 0, 0);
        this.camera.getWorldDirection(lookAtTarget);
        lookAtTarget.add(this.camera.position);

        return new Float32Array([
            this.camera.position.x,
            this.camera.position.y,
            this.camera.position.z,
            0,
            lookAtTarget.x,
            lookAtTarget.y,
            lookAtTarget.z,
            0
        ]);
    }

    public getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    public getThreeScene(): THREE.Scene {
        return this.scene;
    }

    // ===== UTILITY METHODEN =====

    public clearSpheres(): void {
        this.meshes.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
        });
        this.meshes = [];
        this.testSpheres = [];
        this.animatedSpheres.clear();
        this.isAnimationActive = false;
    }

    private logSceneInfo(): void {
        this.logger.info('=== SZENEN-INFORMATION ===');
        this.logger.info(`  Kamera Position: (${this.camera.position.x}, ${this.camera.position.y}, ${this.camera.position.z})`);
        this.logger.info(`  Kugeln: ${this.meshes.length}`);
        this.logger.info(`  Lichter: ${this.lights.length}`);
        this.logger.info('========================');
    }

    public cleanup(): void {
        this.meshes.forEach(mesh => {
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
        });

        this.scene.clear();

        this.meshes = [];
        this.lights = [];
        this.testSpheres = [];
        this.animatedSpheres.clear();
        this.isAnimationActive = false;

        this.logger.init('Szenen-Ressourcen aufgeräumt');
    }
}