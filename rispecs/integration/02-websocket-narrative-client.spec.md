# WebSocket Narrative Client

> WebSocket client for real-time narrative events from mia-code-server.

## Desired Outcome
mia-vscode extensions receive real-time narrative events — beats, analyses, phase transitions, coherence updates — via a persistent WebSocket connection, enabling live dashboards, ambient indicators, and responsive UI updates.

## Current Reality
No WebSocket connection exists between the VS Code client and mia-code-server.

## Structural Tension
Real-time events make the narrative system alive. Without them, extensions must poll — creating latency and oscillating request patterns instead of smooth event flow.

---

## Components

### NarrativeWebSocket
Persistent WebSocket connection manager.
- **Behavior:** Connects to `ws://{serverUrl}/api/ws/narrative` (or `wss://` for TLS). Managed by the `mia.three-universe` core extension. Lifecycle:
  1. Connect on activation (if `mia.serverUrl` configured)
  2. Authenticate with bearer token in initial handshake
  3. Subscribe to event channels based on active extensions
  4. Reconnect on disconnect with exponential backoff
  5. Buffer events during brief disconnections (up to 100 events)

### EventDispatcher
Event routing to subscribed extensions.
- **Behavior:** Extensions subscribe to specific event types via the `MiaAPI`:
  ```typescript
  interface NarrativeEventBus {
    on(type: 'beat.created', handler: (beat: StoryBeat) => void): Disposable;
    on(type: 'analysis.complete', handler: (result: ThreeUniverseResult) => void): Disposable;
    on(type: 'session.phase', handler: (phase: SessionPhase) => void): Disposable;
    on(type: 'coherence.update', handler: (scores: CoherenceScores) => void): Disposable;
    on(type: 'chart.progress', handler: (chart: ChartProgress) => void): Disposable;
    on(type: '*', handler: (event: NarrativeEvent) => void): Disposable;
  }
  ```
  Events dispatched asynchronously — subscribers never block each other.

### EventTypes
Narrative event schema.
- **Data:**
  ```typescript
  interface NarrativeEvent {
    id: string;
    type: string;
    timestamp: string;     // ISO 8601
    sessionId: string;
    universe?: 'engineer' | 'ceremony' | 'story';
    significance: number;  // 1-5
    payload: unknown;
  }
  
  // Specific event payloads
  interface BeatCreatedEvent extends NarrativeEvent {
    type: 'beat.created';
    payload: { beat: StoryBeat };
  }
  
  interface AnalysisCompleteEvent extends NarrativeEvent {
    type: 'analysis.complete';
    payload: { fileUri: string; result: ThreeUniverseResult };
  }
  
  interface SessionPhaseEvent extends NarrativeEvent {
    type: 'session.phase';
    payload: { phase: 'germination' | 'assimilation' | 'completion'; previous: string };
  }
  
  interface CoherenceUpdateEvent extends NarrativeEvent {
    type: 'coherence.update';
    payload: { engineer: number; ceremony: number; story: number };
  }
  ```

### OfflineBuffer
Event buffer for disconnection resilience.
- **Behavior:** When WebSocket disconnects:
  1. Buffer locally-generated events (user actions) in memory
  2. On reconnect, request missed server events since last received event ID
  3. Merge and replay events in chronological order
  4. Emit `reconnected` event so extensions can refresh their full state if needed

---

## Supporting Structures
- Implemented within `extensions/mia-three-universe/src/ws/` directory
- Uses VS Code's WebSocket support (browser) or `ws` package (node)
- Connection state exposed via `MiaAPI.isConnected()` and `MiaAPI.onConnectionStateChanged`
- Fulfills: `mia-code-server/rispecs/mia-server-core/04-websocket-narrative-channel` (client side)
