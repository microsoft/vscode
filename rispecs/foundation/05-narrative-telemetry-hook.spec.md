# Narrative Telemetry Hook

> Telemetry interception point for narrative event routing.

## Desired Outcome
VS Code telemetry events are interceptable at the workbench level so the `mia.three-universe` extension can transform usage patterns into narrative beats — all processed locally, privacy-first.

## Current Reality
VS Code telemetry flows through the `ITelemetryService` which sends events to configured endpoints. There is no extension-accessible hook to observe telemetry events.

## Structural Tension
Usage telemetry contains rich signals about developer intent (what files they edit, how long they focus, what commands they use). Routing these to the narrative system transforms passive data into story beats.

---

## Components

### TelemetryEventEmitter
Workbench-level event emitter for telemetry observation.
- **Behavior:** Add an `onDidLogTelemetryEvent` event to the workbench telemetry service that fires whenever a telemetry event is logged. The event payload includes event name and sanitized properties (no PII). Extensions can subscribe via a proposed API:
  ```typescript
  // Proposed API surface
  vscode.telemetry.onDidLogEvent(event: { name: string; properties: Record<string, string> }): Disposable
  ```
  This is a **read-only observation** hook — extensions cannot modify or block telemetry events.

### PrivacyGuardrails
Privacy protection for telemetry observation.
- **Behavior:** The event emitter strips all PII before firing:
  - File paths reduced to extensions only (`.ts`, `.md`, not full paths)
  - User identifiers removed
  - Machine identifiers removed
  - Only event names and aggregate properties exposed
  - Extension must declare `mia.telemetryObserver` permission in package.json

### NarrativeTelemetryTransformer
Extension-side transformer (in `mia.three-universe` extension).
- **Behavior:** Subscribes to telemetry events and transforms patterns into narrative signals:
  - `editor.open` → file focus event
  - `editor.save` → creation milestone
  - `terminal.command` → engineering action
  - `debug.start` / `debug.stop` → tension-resolution cycle
  - Long focus periods → deep work narrative beats
  
  Signals sent to mia-code-server via WebSocket for three-universe processing. All processing local to the extension — no raw telemetry leaves the editor.

---

## Creative Advancement Scenario: Developer Focus Tracking

**Desired Outcome**: Developer's coding session becomes a readable narrative
**Current Reality**: Telemetry events are opaque data points with no narrative meaning
**Natural Progression**:
  1. Developer opens files, writes code, runs tests — generating telemetry
  2. Telemetry hook fires events to the three-universe extension
  3. Extension transforms events into narrative signals (file focus, creation milestones)
  4. Signals flow to mia-code-server for story beat generation
  5. Story Monitor shows the session's narrative arc in real-time
**Resolution**: The coding session has a readable narrative structure

---

## Supporting Structures
- Proposed API requiring `extensionAllowedProposedApi` in product.json
- Privacy-first: event stripping happens in the workbench layer, before extension access
- This is the only foundation spec requiring VS Code source modification (telemetry service)
- Fulfills: `mia-code-server/rispecs/mia-vscode/11-telemetry-narrative.spec.md`
- Alternative: If source modification is deferred, the extension can approximate via command execution events and `vscode.workspace.onDid*` events (reduced signal fidelity)
