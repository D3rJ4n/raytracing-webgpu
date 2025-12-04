// src/cache/ScreenProjection.ts

export interface ScreenBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface Vector3D {
    x: number;
    y: number;
    z: number;
}

export interface CameraParams {
    position: Vector3D;
    lookAt: Vector3D;
    fov: number; // in Radiant
    aspect: number;
}

export class ScreenProjection {
    private canvasWidth: number;
    private canvasHeight: number;
    private currentCamera: CameraParams | null = null;

    // Cache für häufig verwendete Berechnungen
    private projectionMatrixCache: {
        camera: CameraParams | null;
        forward: Vector3D;
        right: Vector3D;
        up: Vector3D;
        halfWidth: number;
        halfHeight: number;
    } = {
            camera: null,
            forward: { x: 0, y: 0, z: 0 },
            right: { x: 0, y: 0, z: 0 },
            up: { x: 0, y: 0, z: 0 },
            halfWidth: 0,
            halfHeight: 0
        };

    constructor(canvasWidth: number, canvasHeight: number) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
    }

    /**
     * Aktualisiere Kamera-Parameter
     */
    public updateCamera(camera: CameraParams): void {
        this.currentCamera = { ...camera };
        this.updateProjectionCache();
    }

    /**
     * Sphere zu Bildschirm-Bounding-Box projizieren
     */
    public sphereToScreenBounds(position: Vector3D, radius: number): ScreenBounds {
        if (!this.currentCamera) {
            // Fallback: Gesamter Bildschirm
            return {
                minX: 0,
                minY: 0,
                maxX: this.canvasWidth - 1,
                maxY: this.canvasHeight - 1
            };
        }

        // 1. Sphere-Center zu Camera-Space transformieren
        const sphereInCameraSpace = this.worldToCameraSpace(position);

        // 2. Frustum Culling - Sphere komplett hinter Kamera
        if (sphereInCameraSpace.z + radius < 0.1) {
            return this.emptyBounds();
        }

        // 3. Sphere komplett vor Kamera aber sehr weit weg
        if (sphereInCameraSpace.z - radius > 1000) {
            return this.emptyBounds();
        }

        // 4. Sphere-Bounding-Box in Screen-Space berechnen
        return this.calculateScreenBounds(sphereInCameraSpace, radius);
    }

    /**
     * World-Space zu Camera-Space Transformation
     */
    private worldToCameraSpace(worldPos: Vector3D): Vector3D {
        const cache = this.projectionMatrixCache;
        const cameraPos = this.currentCamera!.position;

        // Vektor von Kamera zu Punkt
        const worldToCameraVec = {
            x: worldPos.x - cameraPos.x,
            y: worldPos.y - cameraPos.y,
            z: worldPos.z - cameraPos.z
        };

        // In Camera-Space transformieren
        return {
            x: this.dot(worldToCameraVec, cache.right),
            y: this.dot(worldToCameraVec, cache.up),
            z: this.dot(worldToCameraVec, cache.forward)
        };
    }

    /**
     * Screen-Space Bounding Box berechnen
     */
    private calculateScreenBounds(cameraSpacePos: Vector3D, radius: number): ScreenBounds {
        const cache = this.projectionMatrixCache;

        // Sphere kann die Kamera schneiden
        if (cameraSpacePos.z - radius < 0.1) {
            // Konservative Schätzung: Großer Bereich
            return this.conservativeBounds(cameraSpacePos, radius);
        }

        // Normale perspektivische Projektion
        const depth = cameraSpacePos.z;


        // Sphere-Center projizieren
        const screenCenterX = (cameraSpacePos.x / depth / cache.halfWidth + 1.0) * 0.5 * this.canvasWidth;
        const screenCenterY = (-cameraSpacePos.y / depth / cache.halfHeight + 1.0) * 0.5 * this.canvasHeight;

        // Screen-Space Radius berechnen
        const screenRadius = (radius / depth) * (cache.halfHeight * this.canvasHeight * 0.5);

        // Bounding Box
        return {
            minX: Math.max(0, Math.floor(screenCenterX - screenRadius)),
            minY: Math.max(0, Math.floor(screenCenterY - screenRadius)),
            maxX: Math.min(this.canvasWidth - 1, Math.ceil(screenCenterX + screenRadius)),
            maxY: Math.min(this.canvasHeight - 1, Math.ceil(screenCenterY + screenRadius))
        };
    }

    /**
     * Konservative Bounds für Spheres die die Kamera schneiden
     */
    private conservativeBounds(cameraSpacePos: Vector3D, radius: number): ScreenBounds {
        // Wenn Sphere sehr nah oder schneidet Kamera: großzügiger Bereich
        const conservativeRadius = Math.min(this.canvasWidth, this.canvasHeight) * 0.25;

        // Grober Screen-Center (ohne Depth-Division)
        const roughCenterX = this.canvasWidth * 0.5;
        const roughCenterY = this.canvasHeight * 0.5;

        return {
            minX: Math.max(0, Math.floor(roughCenterX - conservativeRadius)),
            minY: Math.max(0, Math.floor(roughCenterY - conservativeRadius)),
            maxX: Math.min(this.canvasWidth - 1, Math.ceil(roughCenterX + conservativeRadius)),
            maxY: Math.min(this.canvasHeight - 1, Math.ceil(roughCenterY + conservativeRadius))
        };
    }

    /**
     * Projektions-Cache aktualisieren
     */
    private updateProjectionCache(): void {
        if (!this.currentCamera) return;

        const camera = this.currentCamera;
        const cache = this.projectionMatrixCache;

        // Forward Vector
        cache.forward = this.normalize({
            x: camera.lookAt.x - camera.position.x,
            y: camera.lookAt.y - camera.position.y,
            z: camera.lookAt.z - camera.position.z
        });

        // Right Vector (Cross product: world_up × forward)
        const worldUp = { x: 0, y: 1, z: 0 };
        cache.right = this.normalize(this.cross(worldUp, cache.forward));

        // Up Vector (Cross product: forward × right)
        cache.up = this.cross(cache.forward, cache.right);

        // Frustum Dimensionen
        cache.halfHeight = Math.tan(camera.fov * 0.5);
        cache.halfWidth = cache.halfHeight * camera.aspect;

        cache.camera = { ...camera };
    }

    /**
     * Leere Bounds (nicht sichtbar)
     */
    private emptyBounds(): ScreenBounds {
        return {
            minX: 0,
            minY: 0,
            maxX: -1, // Ungültige Bounds
            maxY: -1
        };
    }

    /**
     * Prüfen ob Bounds gültig sind
     */
    public isValidBounds(bounds: ScreenBounds): boolean {
        return bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY;
    }

    /**
     * Bounds-Fläche berechnen
     */
    public calculateBoundsArea(bounds: ScreenBounds): number {
        if (!this.isValidBounds(bounds)) return 0;
        return (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
    }

    /**
     * Zwei Bounds vereinigen
     */
    public unionBounds(bounds1: ScreenBounds, bounds2: ScreenBounds): ScreenBounds {
        if (!this.isValidBounds(bounds1)) return bounds2;
        if (!this.isValidBounds(bounds2)) return bounds1;

        return {
            minX: Math.min(bounds1.minX, bounds2.minX),
            minY: Math.min(bounds1.minY, bounds2.minY),
            maxX: Math.max(bounds1.maxX, bounds2.maxX),
            maxY: Math.max(bounds1.maxY, bounds2.maxY)
        };
    }

    /**
     * Bounds um Padding erweitern
     */
    public expandBounds(bounds: ScreenBounds, padding: number): ScreenBounds {
        if (!this.isValidBounds(bounds)) return bounds;

        return {
            minX: Math.max(0, bounds.minX - padding),
            minY: Math.max(0, bounds.minY - padding),
            maxX: Math.min(this.canvasWidth - 1, bounds.maxX + padding),
            maxY: Math.min(this.canvasHeight - 1, bounds.maxY + padding)
        };
    }

    /**
     * Mehrere Bounds vereinigen
     */
    public unionMultipleBounds(boundsArray: ScreenBounds[]): ScreenBounds {
        if (boundsArray.length === 0) {
            return this.emptyBounds();
        }

        let result = boundsArray[0];
        for (let i = 1; i < boundsArray.length; i++) {
            result = this.unionBounds(result, boundsArray[i]);
        }
        return result;
    }

    /**
     * Debug-Info für Projektion
     */
    public getProjectionInfo(position: Vector3D, radius: number): {
        cameraSpacePosition: Vector3D;
        screenBounds: ScreenBounds;
        projectedRadius: number;
        isVisible: boolean;
        isBehindCamera: boolean;
    } {
        if (!this.currentCamera) {
            return {
                cameraSpacePosition: { x: 0, y: 0, z: 0 },
                screenBounds: this.emptyBounds(),
                projectedRadius: 0,
                isVisible: false,
                isBehindCamera: false
            };
        }

        const cameraSpacePos = this.worldToCameraSpace(position);
        const bounds = this.sphereToScreenBounds(position, radius);
        const projectedRadius = cameraSpacePos.z > 0.1 ?
            (radius / cameraSpacePos.z) * (this.projectionMatrixCache.halfHeight * this.canvasHeight * 0.5) : 0;

        return {
            cameraSpacePosition: cameraSpacePos,
            screenBounds: bounds,
            projectedRadius: projectedRadius,
            isVisible: this.isValidBounds(bounds),
            isBehindCamera: cameraSpacePos.z < 0.1
        };
    }

    /**
     * Canvas-Dimensionen aktualisieren
     */
    public updateCanvasSize(width: number, height: number): void {
        this.canvasWidth = width;
        this.canvasHeight = height;

        // Projektion-Cache aktualisieren falls Aspect Ratio sich geändert hat
        if (this.currentCamera) {
            this.currentCamera.aspect = width / height;
            this.updateProjectionCache();
        }
    }

    // ===== VEKTOR-HILFSFUNKTIONEN =====

    private normalize(v: Vector3D): Vector3D {
        const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (length < 0.0001) {
            return { x: 0, y: 0, z: 1 }; // Fallback
        }
        return {
            x: v.x / length,
            y: v.y / length,
            z: v.z / length
        };
    }

    private cross(a: Vector3D, b: Vector3D): Vector3D {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }

    private dot(a: Vector3D, b: Vector3D): number {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    /**
     * Cleanup
     */
    public cleanup(): void {
        this.currentCamera = null;
        this.projectionMatrixCache.camera = null;
    }
}