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
 * 🌍 Scene - Three.js Szenen-Management mit 200 Kugeln in Rechteck-Anordnung
 */
export class Scene {
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private logger: Logger;

    private meshes: THREE.Mesh[] = [];
    private lights: THREE.Light[] = [];
    private ambientLightIntensity: number = 0.2;

    // ===== KAMERA-ANIMATION =====
    private isRotating: boolean = false;
    private rotationAngle: number = 0;
    private rotationSpeed: number = 0.5; // Grad pro Frame
    private rotationRadius: number = 20; // Abstand zur Mitte
    private cameraHeight: number = 10;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * 🚀 Szene initialisieren
     */
    public initialize(): void {
        this.logger.init('Erstelle Three.js Szene...');

        this.createScene();
        this.createCamera();
        this.setupRectangleScene();

        this.logSceneInfo();
        this.logger.success('Three.js Szene erstellt');
    }

    /**
     * 🌍 Leere Szene erstellen
     */
    private createScene(): void {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.logger.init('Leere Three.js Szene erstellt');
    }

    /**
     * 📷 Perspektiv-Kamera erstellen
     */
    private createCamera(): void {
        this.camera = new THREE.PerspectiveCamera(
            60,
            1.0,
            0.1,
            100
        );

        this.camera.position.set(0, this.cameraHeight, this.rotationRadius);
        this.camera.lookAt(0, 0, 0);

        this.logger.init(`Kamera erstellt: FOV=60°, Position=(0, ${this.cameraHeight}, ${this.rotationRadius})`);
    }

    /**
     * 📐 Rechteck-Szene mit 200 Kugeln aufbauen
     */
    private setupRectangleScene(): void {
        this.logger.init('Baue Rechteck-Szene mit 200 Kugeln auf...');

        this.clearSpheres();

        const rows = 2;
        const cols = 2;
        const spacing = 1.2;
        const baseRadius = 0.4;
        const heightAboveGround = 0.5;

        const offsetX = (cols - 1) * spacing / 2;
        const offsetZ = (rows - 1) * spacing / 2;

        let sphereCount = 0;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const position = {
                    x: col * spacing - offsetX,
                    y: heightAboveGround,
                    z: row * spacing - offsetZ
                };

                const color = this.getRectangleColor(col, row, cols, rows);
                const metallic = (col % 3 === 0) ? 0.8 : 0.1;

                const sphere = new THREE.Mesh(
                    new THREE.SphereGeometry(baseRadius, 16, 16),
                    new THREE.MeshStandardMaterial({
                        color,
                        metalness: metallic,
                        roughness: 0.3
                    })
                );

                sphere.position.set(position.x, position.y, position.z);
                sphere.name = `Sphere_${row}_${col}`;

                this.scene.add(sphere);
                this.meshes.push(sphere);

                sphereCount++;
            }
        }

        const pointLight = new THREE.PointLight(0xffffff, 1.0);
        pointLight.position.set(10, 10, 10);
        pointLight.name = 'Main Light';
        this.scene.add(pointLight);
        this.lights.push(pointLight);

        const ambientLight = new THREE.AmbientLight(0xffffff, this.ambientLightIntensity);
        ambientLight.name = 'Ambient Light';
        this.scene.add(ambientLight);
        this.lights.push(ambientLight);

        this.logger.success(`Rechteck-Szene aufgebaut: ${sphereCount} Kugeln (${cols}x${rows}), ${this.lights.length} Lights`);
    }

    /**
     * 🎨 Farbe für Rechteck-Position berechnen
     */
    private getRectangleColor(col: number, row: number, totalCols: number, totalRows: number): number {
        const t = (col / totalCols + row / totalRows) / 2;

        const r = Math.floor(Math.sin(t * Math.PI) * 127 + 128);
        const g = Math.floor(Math.sin(t * Math.PI + 2) * 127 + 128);
        const b = Math.floor(Math.sin(t * Math.PI + 4) * 127 + 128);

        return (r << 16) | (g << 8) | b;
    }

    /**
     * ✨ Kugel zur Szene hinzufügen
     */
    public addSphere(
        position: { x: number; y: number; z: number },
        radius: number,
        color: number,
        metalness: number = 0.0,
        roughness: number = 1.0,
        name?: string
    ): THREE.Mesh {
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 32, 32),
            new THREE.MeshStandardMaterial({
                color,
                metalness,
                roughness
            })
        );

        sphere.position.set(position.x, position.y, position.z);
        sphere.name = name || `Sphere ${this.meshes.length}`;

        this.scene.add(sphere);
        this.meshes.push(sphere);

        return sphere;
    }

    /**
     * 🔲 Generiere ein neues Grid
     */
    public generateSphereGrid(
        gridSize: number,
        spacing: number = 3.0,
        baseRadius: number = 0.3
    ): void {
        this.logger.info(`Generiere ${gridSize}³ = ${gridSize * gridSize * gridSize} Kugeln Grid...`);

        this.clearSpheres();

        const offset = (gridSize - 1) * spacing / 2;

        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                for (let z = 0; z < gridSize; z++) {
                    const position = {
                        x: x * spacing - offset,
                        y: y * spacing - offset,
                        z: z * spacing - offset
                    };

                    const radius = baseRadius + (x + y + z) * 0.01;
                    const color = this.getGridColor(
                        x, y, z,
                        { x: gridSize, y: gridSize, z: gridSize }
                    );
                    const metallic = (x % 2 === 0 && y % 2 === 0) ? 0.9 : 0.1;

                    this.addSphere(
                        position,
                        radius,
                        color,
                        metallic,
                        0.2,
                        `Grid_${x}_${y}_${z}`
                    );
                }
            }
        }

        this.logger.success(`Grid erstellt: ${this.meshes.length} Kugeln`);
    }

    /**
     * 🎨 Farbe für Grid-Position berechnen
     */
    private getGridColor(x: number, y: number, z: number, gridSize: { x: number; y: number; z: number }): number {
        const r = Math.floor((x / gridSize.x) * 255);
        const g = Math.floor((y / gridSize.y) * 255);
        const b = Math.floor((z / gridSize.z) * 255);

        return (r << 16) | (g << 8) | b;
    }

    /**
     * 🔲 Generiere Wand aus Kugeln
     */
    public generateSphereWall(width: number, height: number): void {
        this.logger.info(`Generiere ${width}x${height} = ${width * height} Kugeln Wand...`);

        this.clearSpheres();

        const spacing = 1.5;
        const baseRadius = 0.4;
        const offsetX = (width - 1) * spacing / 2;
        const offsetY = (height - 1) * spacing / 2;

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                const position = {
                    x: x * spacing - offsetX,
                    y: y * spacing - offsetY,
                    z: 0
                };

                const color = this.getRectangleColor(x, y, width, height);
                const metallic = (x % 2 === 0 && y % 2 === 0) ? 0.8 : 0.1;

                this.addSphere(
                    position,
                    baseRadius,
                    color,
                    metallic,
                    0.3,
                    `Wall_${x}_${y}`
                );
            }
        }

        this.logger.success(`Wand erstellt: ${this.meshes.length} Kugeln`);
    }

    /**
     * 🔄 Kugeln für Raytracer extrahieren
     */
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

    /**
     * 💡 Primary Light Position für GPU
     */
    public getPrimaryLightPosition(): { x: number; y: number; z: number } {
        const light = this.lights.find(l => l instanceof THREE.PointLight) as THREE.PointLight;
        if (light) {
            const worldPos = new THREE.Vector3();
            light.getWorldPosition(worldPos);
            return { x: worldPos.x, y: worldPos.y, z: worldPos.z };
        }
        return { x: 10, y: 10, z: 10 };
    }

    /**
     * 💡 Ambient Light Stärke abrufen
     */
    public getAmbientIntensity(): number {
        return this.ambientLightIntensity;
    }

    /**
     * 📊 Anzahl der Kugeln
     */
    public getSphereCount(): number {
        return this.meshes.length;
    }

    /**
     * 🧹 Alle Kugeln entfernen
     */
    public clearSpheres(): void {
        this.meshes.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
        });
        this.meshes = [];
    }

    /**
     * 📐 Kamera-Aspect-Ratio aktualisieren
     */
    public updateCameraAspect(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    /**
     * 📊 Kamera-Daten für GPU-Buffer abrufen
     */
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

    /**
     * 🎬 Kamera-Rotation starten
     */
    public startCameraRotation(): void {
        this.isRotating = true;
        this.logger.info('🎬 Kamera-Rotation gestartet');
    }

    /**
     * ⏸️ Kamera-Rotation stoppen
     */
    public stopCameraRotation(): void {
        this.isRotating = false;
        this.logger.info('⏸️ Kamera-Rotation gestoppt');
    }

    /**
     * 🔄 Kamera-Position aktualisieren (einmal pro Frame aufrufen)
     */
    public updateCamera(): boolean {
        if (!this.isRotating) {
            return false;
        }

        this.rotationAngle += this.rotationSpeed;
        if (this.rotationAngle >= 360) {
            this.rotationAngle -= 360;
        }

        const angleInRadians = (this.rotationAngle * Math.PI) / 180;
        const x = Math.sin(angleInRadians) * this.rotationRadius;
        const z = Math.cos(angleInRadians) * this.rotationRadius;

        this.camera.position.set(x, this.cameraHeight, z);
        this.camera.lookAt(0, 0, 0);

        return true;
    }

    /**
     * 🎥 Rotation-Status abrufen
     */
    public isRotationActive(): boolean {
        return this.isRotating;
    }

    /**
     * ⚙️ Rotations-Geschwindigkeit ändern
     */
    public setRotationSpeed(speed: number): void {
        this.rotationSpeed = speed;
        this.logger.info(`Rotations-Geschwindigkeit: ${speed}°/Frame`);
    }

    /**
     * 📷 Kamera abrufen
     */
    public getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    /**
     * 🌍 Three.js Szene abrufen
     */
    public getThreeScene(): THREE.Scene {
        return this.scene;
    }

    /**
     * 📋 Szenen-Informationen loggen
     */
    private logSceneInfo(): void {
        this.logger.info('=== SZENEN-INFORMATION ===');
        this.logger.info(`  Kamera Position: (${this.camera.position.x}, ${this.camera.position.y}, ${this.camera.position.z})`);
        this.logger.info(`  Kugeln: ${this.meshes.length}`);
        this.logger.info(`  Lichter: ${this.lights.length}`);
        this.logger.info('========================');
    }

    /**
     * 🧹 Ressourcen aufräumen
     */
    public cleanup(): void {
        this.meshes.forEach(mesh => {
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
        });

        this.scene.clear();

        this.meshes = [];
        this.lights = [];

        this.logger.init('Szenen-Ressourcen aufgeräumt');
    }
}