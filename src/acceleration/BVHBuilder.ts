// src/acceleration/BVHBuilder.ts

import { Logger } from '../utils/Logger';

export interface BVHNode {
    // Bounding Box (6 floats)
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;

    // Node Info (4 floats)
    leftChild: number;   // Index des linken Kindes (-1 = Leaf)
    rightChild: number;  // Index des rechten Kindes
    firstSphere: number; // Index des ersten Spheres in sphereIndices 
    sphereCount: number; // Anzahl Spheres in diesem Leaf
}

export interface BVHBuildResult {
    nodes: Float32Array;        // Flaches Array für GPU (nodes * 10 floats) 
    sphereIndices: Uint32Array; // Sortierte Sphere-Indizes
    nodeCount: number;
    maxDepth: number;
    leafCount: number;
}

export class BVHBuilder {
    private logger: Logger;
    private maxLeafSize: number = 6;      // Max 6 Spheres pro Leaf
    private maxDepth: number = 20;        // Max 20 BVH-Levels

    // Build-Statistiken
    private buildStats = {
        nodeCount: 0,
        leafCount: 0,
        maxDepth: 0,
        buildTime: 0
    };

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     *  BVH aus Sphere-Daten erstellen
     */
    public buildBVH(spheresData: Float32Array, sphereCount: number): BVHBuildResult {
        const startTime = performance.now();
        this.logger.cache('🌳 Starte BVH-Build...');
        this.resetBuildStats();


        const spheres = this.extractSpheres(spheresData, sphereCount);

        const sphereIndices: number[] = Array.from({ length: sphereCount }, (_, i) => i);

        const tempNodes: BVHNode[] = [];

        this.buildNodeRecursive(spheres, sphereIndices, 0, sphereCount, tempNodes, 0);

        const result = this.createGPUArrays(tempNodes, sphereIndices);

        this.buildStats.buildTime = performance.now() - startTime;
        this.logBuildStats(sphereCount, result);

        return result;
    }

    /**
     * 📦 Sphere-Daten extrahieren
     */
    private extractSpheres(spheresData: Float32Array, count: number): Array<{
        index: number;
        center: { x: number; y: number; z: number };
        radius: number;
        minBounds: { x: number; y: number; z: number };
        maxBounds: { x: number; y: number; z: number };
    }> {
        const spheres = [];

        for (let i = 0; i < count; i++) {
            const offset = i * 8; // 8 floats pro Sphere
            const center = {
                x: spheresData[offset + 0],
                y: spheresData[offset + 1],
                z: spheresData[offset + 2]
            };
            const radius = spheresData[offset + 3];

            spheres.push({
                index: i,
                center,
                radius,
                minBounds: {
                    x: center.x - radius,
                    y: center.y - radius,
                    z: center.z - radius
                },
                maxBounds: {
                    x: center.x + radius,
                    y: center.y + radius,
                    z: center.z + radius
                }
            });
        }

        return spheres;
    }

    /**
     * 🔄 Rekursiver BVH-Node Build
     */
    private buildNodeRecursive(
        spheres: Array<any>,
        sphereIndices: number[],
        start: number,
        count: number,
        nodes: BVHNode[],
        depth: number
    ): number {
        this.buildStats.maxDepth = Math.max(this.buildStats.maxDepth, depth);

        // Bounding Box für alle Spheres in diesem Bereich berechnen
        const bounds = this.calculateBounds(spheres, sphereIndices, start, count);

        const nodeIndex = nodes.length;
        this.buildStats.nodeCount++;

        // Leaf-Node Bedingungen
        if (count <= this.maxLeafSize || depth >= this.maxDepth) {
            // LEAF NODE erstellen
            this.buildStats.leafCount++;

            nodes.push({
                minX: bounds.minX, minY: bounds.minY, minZ: bounds.minZ,
                maxX: bounds.maxX, maxY: bounds.maxY, maxZ: bounds.maxZ,
                leftChild: -1,        // -1 = Leaf
                rightChild: -1,       // Auch -1 bei Leaf
                firstSphere: start,   // firstSphere Index
                sphereCount: count    // sphereCount
            });

            return nodeIndex;
        }

        // INTERNAL NODE - Split finden
        const splitResult = this.findBestSplit(spheres, sphereIndices, start, count, bounds);

        if (splitResult.leftCount === 0 || splitResult.rightCount === 0) {
            // Split fehlgeschlagen -> Leaf Node
            this.buildStats.leafCount++;

            nodes.push({
                minX: bounds.minX, minY: bounds.minY, minZ: bounds.minZ,
                maxX: bounds.maxX, maxY: bounds.maxY, maxZ: bounds.maxZ,
                leftChild: -1,
                rightChild: -1,
                firstSphere: start,
                sphereCount: count
            });

            return nodeIndex;
        }

        // Platzhalter für Internal Node
        nodes.push({
            minX: bounds.minX, minY: bounds.minY, minZ: bounds.minZ,
            maxX: bounds.maxX, maxY: bounds.maxY, maxZ: bounds.maxZ,
            leftChild: -1,   // Wird später gesetzt
            rightChild: -1,  // Wird später gesetzt
            firstSphere: -1, // Nur für Leafs relevant
            sphereCount: 0   // Nur für Leafs relevant
        });

        // Rekursive Child-Builds
        const leftChildIndex = this.buildNodeRecursive(
            spheres, sphereIndices, start, splitResult.leftCount, nodes, depth + 1
        );

        const rightChildIndex = this.buildNodeRecursive(
            spheres, sphereIndices, start + splitResult.leftCount, splitResult.rightCount, nodes, depth + 1
        );

        // Internal Node vervollständigen
        nodes[nodeIndex].leftChild = leftChildIndex;
        nodes[nodeIndex].rightChild = rightChildIndex;

        return nodeIndex;
    }

    /**
     * 🔍 Bounding Box berechnen
     */
    private calculateBounds(spheres: Array<any>, indices: number[], start: number, count: number): {
        minX: number; minY: number; minZ: number;
        maxX: number; maxY: number; maxZ: number;
    } {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = start; i < start + count; i++) {
            const sphere = spheres[indices[i]];
            minX = Math.min(minX, sphere.minBounds.x);
            minY = Math.min(minY, sphere.minBounds.y);
            minZ = Math.min(minZ, sphere.minBounds.z);
            maxX = Math.max(maxX, sphere.maxBounds.x);
            maxY = Math.max(maxY, sphere.maxBounds.y);
            maxZ = Math.max(maxZ, sphere.maxBounds.z);
        }

        return { minX, minY, minZ, maxX, maxY, maxZ };
    }

    /**
     * ✂️ Besten Split finden (Surface Area Heuristic vereinfacht)
     */
    private findBestSplit(
        spheres: Array<any>,
        indices: number[],
        start: number,
        count: number,
        bounds: any
    ): { leftCount: number; rightCount: number } {

        // Längste Achse finden
        const extentX = bounds.maxX - bounds.minX;
        const extentY = bounds.maxY - bounds.minY;
        const extentZ = bounds.maxZ - bounds.minZ;

        let axis = 0; // 0=X, 1=Y, 2=Z
        if (extentY > extentX && extentY > extentZ) axis = 1;
        else if (extentZ > extentX && extentZ > extentY) axis = 2;

        // Spheres nach Zentrum der gewählten Achse sortieren
        const axisKey = axis === 0 ? 'x' : (axis === 1 ? 'y' : 'z');
        this.sortSpheresAlongAxis(spheres, indices, start, count, axisKey);

        // Median Split
        const leftCount = Math.floor(count / 2);
        const rightCount = count - leftCount;

        return { leftCount, rightCount };
    }

    /**
     * 🔄 Spheres entlang Achse sortieren
     */
    private sortSpheresAlongAxis(
        spheres: Array<any>,
        indices: number[],
        start: number,
        count: number,
        axis: 'x' | 'y' | 'z'
    ): void {
        const subArray = indices.slice(start, start + count);

        subArray.sort((a, b) => {
            return spheres[a].center[axis] - spheres[b].center[axis];
        });

        // Zurück in indices array kopieren
        for (let i = 0; i < count; i++) {
            indices[start + i] = subArray[i];
        }
    }

    /**
     * 🎮 GPU-Arrays erstellen (KORRIGIERT: 10 floats pro Node)
     */
    private createGPUArrays(nodes: BVHNode[], sphereIndices: number[]): BVHBuildResult {
        // Nodes Array (10 floats pro Node) - KORRIGIERT!
        const nodeFloats = new Float32Array(nodes.length * 10);

        let leafNodeCount = 0;
        let totalSpheres = 0;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const offset = i * 10; // 10 floats pro Node!

            // Bounding Box (immer gleich)
            nodeFloats[offset + 0] = node.minX;
            nodeFloats[offset + 1] = node.minY;
            nodeFloats[offset + 2] = node.minZ;
            nodeFloats[offset + 3] = node.maxX;
            nodeFloats[offset + 4] = node.maxY;
            nodeFloats[offset + 5] = node.maxZ;

            // ===== LEAF-NODE-ERKENNUNG =====
            const isLeafNode = (node.leftChild === undefined || node.leftChild === null || node.leftChild < 0);

            if (isLeafNode) {
                //  LEAF NODE - Enthält Spheres
                nodeFloats[offset + 6] = -1;  // leftChild = -1 markiert Leaf
                nodeFloats[offset + 7] = -1;  // rightChild = -1
                nodeFloats[offset + 8] = node.firstSphere !== undefined ? node.firstSphere : 0;
                nodeFloats[offset + 9] = node.sphereCount !== undefined ? node.sphereCount : 0;

                leafNodeCount++;
                totalSpheres += node.sphereCount || 0;
            } else {
                //  INNER NODE - Verweist auf Kinder
                nodeFloats[offset + 6] = node.leftChild;
                nodeFloats[offset + 7] = node.rightChild;
                nodeFloats[offset + 8] = -1;  // firstSphere = -1 bei Inner-Node
                nodeFloats[offset + 9] = 0;   // sphereCount = 0 bei Inner-Node
            }
        }

        // Sphere Indices Array
        const sphereIndicesArray = new Uint32Array(sphereIndices);

        // DEBUG deaktiviert für Performance-Tests
        // console.log(`📊 BVH: ${nodes.length} nodes`);

        return {
            nodes: nodeFloats,
            sphereIndices: sphereIndicesArray,
            nodeCount: nodes.length,
            maxDepth: this.buildStats.maxDepth,
            leafCount: this.buildStats.leafCount
        };
    }

    /**
     * 📊 Build-Statistiken zurücksetzen
     */
    private resetBuildStats(): void {
        this.buildStats = {
            nodeCount: 0,
            leafCount: 0,
            maxDepth: 0,
            buildTime: 0
        };
    }

    /**
     * 📋 Build-Statistiken loggen
     */
    private logBuildStats(sphereCount: number, result: BVHBuildResult): void {
        this.logger.cache('🌳 BVH Build abgeschlossen:');
        this.logger.cache(`  ├─ Spheres: ${sphereCount}`);
        this.logger.cache(`  ├─ Nodes: ${result.nodeCount} (${this.buildStats.leafCount} Leafs)`);
        this.logger.cache(`  ├─ Max Tiefe: ${result.maxDepth}`);
        this.logger.cache(`  ├─ GPU Memory: ${(result.nodes.byteLength / 1024).toFixed(1)}KB nodes + ${(result.sphereIndices.byteLength / 1024).toFixed(1)}KB indices`);
        this.logger.cache(`  └─ Build Zeit: ${this.buildStats.buildTime.toFixed(2)}ms`);

        // Effizienz-Berechnung
        const linearTests = sphereCount;
        const avgBVHTests = Math.log2(sphereCount) * 1.5; // Geschätzt
        const speedup = linearTests / avgBVHTests;

        this.logger.cache(`🚀 Erwarteter Speedup: ${speedup.toFixed(1)}x (${linearTests} → ${avgBVHTests.toFixed(1)} Tests/Ray)`);
    }

    /**
     * 🔧 BVH-Konfiguration setzen
     */
    public setConfiguration(maxLeafSize: number, maxDepth: number): void {
        this.maxLeafSize = Math.max(1, Math.min(16, maxLeafSize));
        this.maxDepth = Math.max(1, Math.min(30, maxDepth));

        this.logger.cache(`BVH Konfiguration: Max Leaf Size=${this.maxLeafSize}, Max Depth=${this.maxDepth}`);
    }

    /**
     * 📊 Build-Statistiken abrufen
     */
    public getLastBuildStats(): {
        nodeCount: number;
        leafCount: number;
        maxDepth: number;
        buildTime: number;
    } {
        return { ...this.buildStats };
    }
}