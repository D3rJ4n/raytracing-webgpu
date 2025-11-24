# BVH Performance Skalierungs-Tests

Diese Tests vergleichen die Performance von BVH-basiertem vs. linearem Raytracing bei steigender Objektanzahl.

## Test-Übersicht

### Test 1: `testBVHScaling()` - MIT BVH
- **Start:** 200 Kugeln
- **Inkrement:** +20 Kugeln pro Durchgang
- **Durchgänge:** 10 (endet bei 380 Kugeln)
- **Frames pro Durchgang:** 50
- **Erwartete Komplexität:** O(log n) - logarithmisches Wachstum

### Test 2: `testLinearScaling()` - OHNE BVH
- **Start:** 200 Kugeln
- **Inkrement:** +20 Kugeln pro Durchgang
- **Durchgänge:** 10 (endet bei 380 Kugeln)
- **Frames pro Durchgang:** 50
- **Erwartete Komplexität:** O(n) - lineares Wachstum

## Ausführung

1. **Projekt starten:**
   ```bash
   npm run dev
   ```

2. **Browser-Konsole öffnen** (F12)

3. **Tests ausführen:**

   **Test 1 - BVH (zuerst ausführen):**
   ```javascript
   testBVHScaling()
   ```

   **Test 2 - Linear (danach ausführen):**
   ```javascript
   testLinearScaling()
   ```

4. **Ergebnisse analysieren:**
   - Beide Tests geben detaillierte Tabellen mit Render-Zeiten aus
   - Eine Komplexitäts-Analyse zeigt, ob O(log n) bzw. O(n) erreicht wird
   - Die Tests können ca. 5-10 Minuten pro Test dauern

## Erwartete Ergebnisse

### BVH-Test (O(log n))
Bei Verdopplung der Kugeln (200 → 400) erwarten wir nur einen **logarithmischen Anstieg**:
- Kugeln: 1.9x mehr
- Zeit: ~1.13x länger (log(380)/log(200) ≈ 1.127)

**Beispiel:**
```
200 Kugeln: 10ms
380 Kugeln: ~11.3ms (nur +13%!)
```

### Linearer Test (O(n))
Bei Verdopplung der Kugeln erwarten wir einen **proportionalen Anstieg**:
- Kugeln: 1.9x mehr
- Zeit: ~1.9x länger

**Beispiel:**
```
200 Kugeln: 10ms
380 Kugeln: ~19ms (+90%)
```

## Interpretation

Die Tests zeigen den **dramatischen Unterschied** zwischen BVH und linearem Rendering:

- **Mit BVH:** Auch bei vielen Objekten bleibt die Performance fast konstant
- **Ohne BVH:** Performance verschlechtert sich proportional zur Objektanzahl

Bei 380 Kugeln sollte BVH **~1.7x schneller** sein als linear!

## Test-Parameter anpassen

Die Test-Parameter können in [src/tests/PerformanceTests.ts](src/tests/PerformanceTests.ts) angepasst werden:

```typescript
const startSpheres = 200;        // Startanzahl
const sphereIncrement = 20;       // +20 pro Durchgang
const iterations = 10;            // 10 Durchgänge
const framesPerIteration = 50;    // 50 Frames pro Test
```

Für dramatischere Unterschiede kannst du auch größere Sprünge testen:
```typescript
const startSpheres = 200;
const sphereIncrement = 100;      // +100 pro Durchgang
const iterations = 8;             // bis 1000 Kugeln
```

## Hinweise

- **Beide Tests nacheinander ausführen** für direkten Vergleich
- **Cache wird deaktiviert** um reine BVH/Linear-Performance zu messen
- Jeder Test dauert ca. **5-10 Minuten**
- Die Szene wird zwischen den Tests automatisch neu erstellt
- Ergebnisse werden in der Browser-Konsole ausgegeben

## Troubleshooting

**Problem:** Tests sind sehr langsam
- **Lösung:** Reduziere `framesPerIteration` auf 20-30

**Problem:** Browser friert ein
- **Lösung:** Reduziere `iterations` oder `sphereIncrement`

**Problem:** Inkonsistente Ergebnisse
- **Lösung:** Schließe andere Browser-Tabs für stabilere Messungen
