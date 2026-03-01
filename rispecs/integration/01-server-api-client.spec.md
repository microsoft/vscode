# Server API Client

> HTTP client for mia-code-server narrative API routes.

## Desired Outcome
All mia-vscode extensions share a single, reliable HTTP client that communicates with the mia-code-server's narrative API — handling authentication, retries, and type-safe request/response contracts.

## Current Reality
No shared HTTP client exists. Each extension would need to implement its own fetch logic.

## Structural Tension
A shared client eliminates duplication and ensures all extensions authenticate, handle errors, and target the same server consistently.

---

## Components

### MiaHttpClient
Shared HTTP client class.
- **Behavior:** Provided by the `mia.three-universe` core extension via its exported API. Methods:
  ```typescript
  interface MiaHttpClient {
    // Narrative Intelligence
    analyzeThreeUniverse(fileUri: string, content: string): Promise<ThreeUniverseResult>;
    
    // STC Charts
    getCharts(): Promise<STCChart[]>;
    createChart(chart: CreateChartRequest): Promise<STCChart>;
    updateChart(id: string, updates: Partial<STCChart>): Promise<STCChart>;
    
    // Story Beats
    createBeat(beat: CreateBeatRequest): Promise<StoryBeat>;
    getSessionBeats(sessionId: string): Promise<StoryBeat[]>;
    
    // Agent Chat
    sendChatMessage(message: ChatRequest): AsyncIterable<ChatChunk>;
    
    // PDE
    decompose(prompt: string): Promise<DecompositionResult>;
    
    // Session
    getSession(id: string): Promise<Session>;
    createSession(intent?: string): Promise<Session>;
    
    // Health
    healthCheck(): Promise<ServerHealth>;
  }
  ```

### AuthenticationHandler
Token-based authentication.
- **Behavior:** Authentication flow:
  1. First connection: user enters server URL and password in welcome walkthrough
  2. Client sends credentials to `/api/auth/token`
  3. Receives bearer token, stored in VS Code Secret Storage
  4. All subsequent requests include `Authorization: Bearer {token}` header
  5. Token refresh on 401 response (automatic retry)
  6. Graceful degradation: extensions work in limited local-only mode when disconnected

### ConnectionManager
Server connection lifecycle.
- **Behavior:** Manages connection state:
  - `connected` — server reachable, authenticated
  - `connecting` — attempting connection
  - `disconnected` — no server configured or unreachable
  - `reconnecting` — lost connection, attempting recovery
  
  Emits `onConnectionStateChanged` event. Heartbeat via `/api/health` every 30 seconds. Exponential backoff on reconnection attempts (1s, 2s, 4s, 8s... max 60s).

### APIRouteContracts
Route map matching mia-code-server endpoints.
- **Behavior:** All routes prefixed with server URL from `mia.serverUrl` setting:
  | Method | Route | Purpose |
  |--------|-------|---------|
  | POST | `/api/narrative/analyze` | Three-universe analysis |
  | GET/POST | `/api/stc/charts` | Chart CRUD |
  | POST | `/api/narrative/beats` | Create story beat |
  | GET | `/api/narrative/beats?session={id}` | Get session beats |
  | POST | `/api/agent/chat` | Agent chat (SSE response) |
  | POST | `/api/pde/decompose` | PDE decomposition |
  | GET | `/api/sessions/{id}` | Session detail |
  | POST | `/api/sessions` | Create session |
  | GET | `/api/health` | Health check |
  | POST | `/api/auth/token` | Authentication |

---

## Supporting Structures
- Implemented within `extensions/mia-three-universe/src/api/` directory
- Uses VS Code's built-in `fetch` (or `node-fetch` for server-side)
- Secret Storage for token persistence
- Fulfills: `mia-code-server/rispecs/mia-server-core/03-narrative-routes` (client side)
