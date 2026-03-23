# Remote Agent Host - Architecture Reference

This file describes the key types in the remote agent host system, from the
agent host process itself up through the sessions app integration layer.

The system has four layers:

1. **Agent host process** (`platform/agentHost/node/`)
   The utility process that hosts agent backends (e.g. Copilot SDK).
   Owns the authoritative state tree and dispatches to IAgent providers.

2. **Platform services** (`platform/agentHost/common/`, `electron-browser/`)
   Service interfaces and IPC plumbing that expose the agent host to the
   renderer. Local connections use MessagePort; remote ones use WebSocket.

3. **Workbench contributions** (`workbench/contrib/chat/browser/agentSessions/agentHost/`)
   Shared UI adapters that bridge the agent host protocol with the chat UI:
   session handlers, session list controllers, language model providers, and
   state-to-progress adapters. Used by both local and remote agent hosts.

4. **Sessions app orchestrator** (`sessions/contrib/remoteAgentHost/`)
   The contribution that discovers remote agent hosts, dynamically registers
   them as chat session types, and provides the remote filesystem provider.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        Sessions App (Layer 4)                            │
│  RemoteAgentHostContribution                                             │
│    per-connection → SessionClientState + agent registrations             │
│    AgentHostFileSystemProvider (agenthost:// scheme)                     │
├──────────────────────────────────────┬────────────────────────────────────┤
│     Workbench Contributions (3)      │     Workbench Contributions (3)   │
│  AgentHostContribution (local)       │  (shared adapters)                │
│    SessionClientState                │  AgentHostSessionHandler           │
│    per-agent registrations           │  AgentHostSessionListController    │
│                                      │  AgentHostLanguageModelProvider    │
├──────────────────────────────────────┴────────────────────────────────────┤
│                     Platform Services (Layer 2)                          │
│  IAgentHostService (local, MessagePort)                                  │
│  IRemoteAgentHostService (remote, WebSocket)                             │
│    └─ both implement IAgentConnection                                    │
├───────────────────────────────────────────────────────────────────────────┤
│                     Agent Host Process (Layer 1)                         │
│  AgentService → SessionStateManager → IAgent (Copilot SDK)              │
│  ProtocolServerHandler (WebSocket protocol bridge)                       │
│  AgentSideEffects (action dispatch + progress event routing)             │
└───────────────────────────────────────────────────────────────────────────┘
```

```typescript

// =============================================================================
// LAYER 1: Agent Host Process (platform/agentHost/node/)
// =============================================================================

/**
 * Implemented by each agent backend (e.g. the Copilot SDK wrapper).
 * The agent host process can host multiple providers, though currently
 * only `copilot` is supported.
 *
 * Registered with {@link AgentService.registerProvider}. Provider progress
 * events are wired to the state manager through {@link AgentSideEffects}.
 *
 * File: `platform/agentHost/common/agentService.ts`
 */
interface IAgent {
	/** Unique provider identifier (e.g. `'copilot'`). */
	readonly id: AgentProvider;
	/** Fires when the provider streams progress for a session. */
	readonly onDidSessionProgress: Event<IAgentProgressEvent>;
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;
	sendMessage(session: URI, prompt: string, attachments?: IAgentAttachment[]): Promise<void>;
	getSessionMessages(session: URI): Promise<IAgentProgressEvent[]>;
	disposeSession(session: URI): Promise<void>;
	abortSession(session: URI): Promise<void>;
	changeModel(session: URI, model: string): Promise<void>;
	respondToPermissionRequest(requestId: string, approved: boolean): void;
	getDescriptor(): IAgentDescriptor;
	listModels(): Promise<IAgentModelInfo[]>;
	listSessions(): Promise<IAgentSessionMetadata[]>;
	getProtectedResources(): IAuthorizationProtectedResourceMetadata[];
	authenticate(resource: string, token: string): Promise<boolean>;
	shutdown(): Promise<void>;
	dispose(): void;
}

/**
 * The agent service implementation that runs inside the agent host utility
 * process. Dispatches to registered {@link IAgent} providers based on the
 * provider identifier in the session URI scheme.
 *
 * Owns the {@link SessionStateManager} (authoritative state tree) and
 * {@link AgentSideEffects} (action routing + progress event mapping).
 *
 * When `VSCODE_AGENT_HOST_PORT` is set, the process also starts a
 * {@link ProtocolServerHandler} over WebSocket for external clients.
 *
 * File: `platform/agentHost/node/agentService.ts`
 */
interface AgentService extends IAgentService {
	/** Exposes the state manager for co-hosting a WebSocket protocol server. */
	readonly stateManager: SessionStateManager;
	/** Register a new agent backend provider. */
	registerProvider(provider: IAgent): void;
}

/**
 * Server-side authoritative state manager for the sessions process protocol.
 *
 * Maintains the root state (agent list + active session count) and per-session
 * state trees. Applies actions through pure reducers, assigns monotonic
 * sequence numbers, and emits {@link IActionEnvelope}s for subscribed clients.
 *
 * Consumed by both the IPC proxy (for local clients) and
 * {@link ProtocolServerHandler} (for WebSocket clients). Both paths share
 * the same state, so local and remote clients see identical state.
 *
 * File: `platform/agentHost/node/sessionStateManager.ts`
 */
interface SessionStateManager {
	readonly rootState: IRootState;
	readonly serverSeq: number;
	readonly onDidEmitEnvelope: Event<IActionEnvelope>;
	readonly onDidEmitNotification: Event<INotification>;
	getSessionState(session: string): ISessionState | undefined;
	getSnapshot(resource: string): IStateSnapshot | undefined;
	createSession(summary: ISessionSummary): ISessionState;
	removeSession(session: string): void;
	applyAction(action: IStateAction, origin: IActionOrigin): void;
}

/**
 * Shared side-effect handler that routes client-dispatched actions to the
 * correct {@link IAgent} backend, handles session create/dispose/list
 * operations, and wires agent progress events to the state manager.
 *
 * Also implements {@link IProtocolSideEffectHandler} so the WebSocket
 * {@link ProtocolServerHandler} can delegate side effects to the same logic.
 *
 * File: `platform/agentHost/node/agentSideEffects.ts`
 */
interface AgentSideEffects extends IProtocolSideEffectHandler {
	/** Connects an IAgent's progress events to the state manager. */
	registerProgressListener(provider: IAgent): IDisposable;
}

/**
 * Server-side protocol handler for WebSocket clients. Routes JSON-RPC
 * messages to the {@link SessionStateManager}, manages client subscriptions,
 * and broadcasts action envelopes to subscribed clients.
 *
 * Handles the initialize/reconnect handshake, subscribe/unsubscribe,
 * dispatchAction, createSession, disposeSession, and browseDirectory commands.
 *
 * Exposes {@link onDidChangeConnectionCount} so the server process can
 * track how many external clients are connected (used by
 * {@link ServerAgentHostManager} for lifetime management).
 *
 * File: `platform/agentHost/node/protocolServerHandler.ts`
 */
interface ProtocolServerHandler {
	/** Fires with the current client count when a client connects or disconnects. */
	readonly onDidChangeConnectionCount: Event<number>;
}

/**
 * Side-effect handler interface for protocol commands that require
 * business logic beyond pure state management. Implemented by
 * {@link AgentSideEffects} and consumed by {@link ProtocolServerHandler}.
 *
 * File: `platform/agentHost/node/protocolServerHandler.ts`
 */
interface IProtocolSideEffectHandler {
	handleAction(action: ISessionAction): void;
	handleCreateSession(command: ICreateSessionParams): Promise<void>;
	handleDisposeSession(session: string): void;
	handleListSessions(): Promise<ISessionSummary[]>;
	handleGetResourceMetadata(): IResourceMetadata;
	handleAuthenticate(params: IAuthenticateParams): Promise<IAuthenticateResult>;
	handleBrowseDirectory(uri: string): Promise<IBrowseDirectoryResult>;
	getDefaultDirectory(): string;
}

/**
 * Main-process service that manages the agent host utility process lifecycle:
 * lazy start on first connection request, crash recovery (up to 5 restarts),
 * and logger channel forwarding.
 *
 * The renderer communicates with the utility process directly via MessagePort;
 * this class does not relay any agent service calls.
 *
 * File: `platform/agentHost/node/agentHostService.ts`
 */
interface AgentHostProcessManager {
	// Internal lifecycle management - start, restart, logger forwarding.
}

/**
 * Server-specific agent host manager. Eagerly starts the agent host process,
 * handles crash recovery, and tracks both active agent sessions and connected
 * WebSocket clients via {@link IServerLifetimeService} to keep the server
 * alive while either signal is active.
 *
 * The lifetime token is held when:
 * - there are active agent sessions (turns in progress), OR
 * - there are WebSocket clients connected to the agent host
 *
 * The token is released (allowing server auto-shutdown) only when both
 * active sessions = 0 AND connected clients = 0.
 *
 * Session count comes from `root/activeSessionsChanged` actions via
 * {@link IAgentService.onDidAction}. Client connection count comes from
 * a separate IPC channel ({@link AgentHostIpcChannels.ConnectionTracker})
 * that is not part of the agent host protocol -- it is a server-only
 * process-management concern.
 *
 * File: `server/node/serverAgentHostManager.ts`
 */
interface ServerAgentHostManager {
	// Tracks _hasActiveSessions + _connectionCount, updates lifetime token
	// when either changes.
}

/**
 * Abstracts the utility process creation so the same lifecycle management
 * works for both Electron utility processes and Node child processes.
 *
 * File: `platform/agentHost/common/agent.ts`
 */
interface IAgentHostStarter extends IDisposable {
	readonly onRequestConnection?: Event<void>;
	readonly onWillShutdown?: Event<void>;
	/** Creates the agent host process and connects to it. */
	start(): IAgentHostConnection;
}

/**
 * The connection returned by {@link IAgentHostStarter.start}. Provides
 * an IPC channel client and process exit events.
 *
 * File: `platform/agentHost/common/agent.ts`
 */
interface IAgentHostConnection {
	readonly client: IChannelClient;
	readonly store: DisposableStore;
	readonly onDidProcessExit: Event<{ code: number; signal: string }>;
}

// =============================================================================
// LAYER 2: Platform Services (platform/agentHost/common/ & electron-browser/)
// =============================================================================

/**
 * Core protocol surface for communicating with an agent host. Methods are
 * proxied across MessagePort (local) or implemented over WebSocket (remote).
 *
 * State synchronization uses the subscribe/unsubscribe/dispatchAction pattern.
 * Clients observe root state (discovered agents, models) and session state
 * via subscriptions, and mutate state by dispatching actions (e.g.
 * `session/turnStarted`, `session/turnCancelled`).
 *
 * File: `platform/agentHost/common/agentService.ts`
 */
interface IAgentService {
	listAgents(): Promise<IAgentDescriptor[]>;
	getResourceMetadata(): Promise<IResourceMetadata>;
	authenticate(params: IAuthenticateParams): Promise<IAuthenticateResult>;
	refreshModels(): Promise<void>;
	listSessions(): Promise<IAgentSessionMetadata[]>;
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;
	disposeSession(session: URI): Promise<void>;
	shutdown(): Promise<void>;

	// ---- Protocol methods ----
	subscribe(resource: URI): Promise<IStateSnapshot>;
	unsubscribe(resource: URI): void;
	readonly onDidAction: Event<IActionEnvelope>;
	readonly onDidNotification: Event<INotification>;
	dispatchAction(action: ISessionAction, clientId: string, clientSeq: number): void;
	browseDirectory(uri: URI): Promise<IBrowseDirectoryResult>;
}

/**
 * A concrete connection to an agent host - local utility process or remote
 * WebSocket. Extends {@link IAgentService} with a `clientId` used for
 * write-ahead reconciliation of optimistic actions.
 *
 * Both {@link IAgentHostService} (local) and per-connection objects from
 * {@link IRemoteAgentHostService} (remote) satisfy this contract. The
 * workbench contributions ({@link AgentHostSessionHandler}, etc.) program
 * against this single interface.
 *
 * File: `platform/agentHost/common/agentService.ts`
 */
interface IAgentConnection extends IAgentService {
	/** Unique client identifier, used as origin in action envelopes. */
	readonly clientId: string;
}

/**
 * The local agent host service - wraps the utility process connection and
 * provides lifecycle events. The renderer talks to the utility process
 * directly via MessagePort using ProxyChannel.
 *
 * Registered as a singleton service. Also implements {@link IAgentConnection}
 * so it can be used interchangeably with remote connections.
 *
 * File: `platform/agentHost/common/agentService.ts` (interface)
 * File: `platform/agentHost/electron-browser/agentHostService.ts` (implementation)
 */
interface IAgentHostService extends IAgentConnection {
	readonly onAgentHostExit: Event<number>;
	readonly onAgentHostStart: Event<void>;
	restartAgentHost(): Promise<void>;
}

/**
 * Manages connections to one or more remote agent host processes over
 * WebSocket. Each connection is identified by its address string (from the
 * `chat.remoteAgentHosts` setting) and exposed as an {@link IAgentConnection}.
 *
 * The implementation reads the setting, creates a
 * {@link RemoteAgentHostProtocolClient} per address, reconnects when the
 * setting changes, and fires `onDidChangeConnections` when connections are
 * established or lost.
 *
 * File: `platform/agentHost/common/remoteAgentHostService.ts` (interface)
 * File: `platform/agentHost/electron-browser/remoteAgentHostServiceImpl.ts` (implementation)
 */
interface IRemoteAgentHostService {
	readonly onDidChangeConnections: Event<void>;
	readonly connections: readonly IRemoteAgentHostConnectionInfo[];
	getConnection(address: string): IAgentConnection | undefined;
}

/**
 * Metadata about a single remote connection - address, friendly name,
 * client ID from the handshake, and the remote machine's home directory.
 *
 * File: `platform/agentHost/common/remoteAgentHostService.ts`
 */
interface IRemoteAgentHostConnectionInfo {
	readonly address: string;
	readonly name: string;
	readonly clientId: string;
	readonly defaultDirectory?: string;
}

/**
 * An entry in the `chat.remoteAgentHosts` setting.
 *
 * File: `platform/agentHost/common/remoteAgentHostService.ts`
 */
interface IRemoteAgentHostEntry {
	readonly address: string;
	readonly name: string;
	readonly connectionToken?: string;
}

/**
 * A protocol-level client for a single remote agent host connection.
 * Manages the WebSocket transport, handshake (initialize command with
 * protocol version exchange), subscriptions, action dispatch, and
 * JSON-RPC request/response correlation.
 *
 * Implements {@link IAgentConnection} so consumers can program against
 * a single interface regardless of whether the agent host is local or remote.
 *
 * File: `platform/agentHost/electron-browser/remoteAgentHostProtocolClient.ts`
 */
interface RemoteAgentHostProtocolClient extends IAgentConnection {
	readonly defaultDirectory: string | undefined;
	readonly onDidClose: Event<void>;
	connect(): Promise<void>;
}

// =============================================================================
// LAYER 2: State Protocol Types (platform/agentHost/common/state/)
// =============================================================================

/**
 * Root state: the top-level state tree subscribed to at `agenthost:/root`.
 * Contains the list of discovered agent backends and active session count.
 * Mutated by `root/agentsChanged` and `root/activeSessionsChanged` actions.
 *
 * File: `platform/agentHost/common/state/sessionState.ts` (re-exported from protocol)
 */
interface IRootState {
	readonly agents: readonly IAgentInfo[];
	readonly activeSessions: number;
}

/**
 * Describes an agent backend discovered via root state subscription.
 * Each agent exposes a provider name, display metadata, and available models.
 *
 * File: `platform/agentHost/common/state/sessionState.ts` (re-exported from protocol)
 */
interface IAgentInfo {
	readonly provider: string;
	readonly displayName: string;
	readonly description: string;
	readonly models: readonly ISessionModelInfo[];
}

/**
 * Per-session state tree. Contains the session summary, lifecycle, completed
 * turns, active turn (if any), and server tools. Mutated by session actions
 * like `session/turnStarted`, `session/delta`, `session/toolCallStart`, etc.
 *
 * File: `platform/agentHost/common/state/sessionState.ts` (re-exported from protocol)
 */
interface ISessionState {
	readonly summary: ISessionSummary;
	readonly lifecycle: SessionLifecycle;
	readonly turns: readonly ITurn[];
	readonly activeTurn: IActiveTurn | undefined;
}

/**
 * An envelope wrapping a state action with origin metadata and a monotonic
 * server sequence number. Clients use the origin to distinguish their own
 * echoed actions from concurrent actions from other clients/the server.
 *
 * File: `platform/agentHost/common/state/sessionActions.ts` (re-exported from protocol)
 */
interface IActionEnvelope {
	readonly action: IStateAction;
	readonly origin: IActionOrigin;
	readonly serverSeq: number;
}

/**
 * A state snapshot returned by the subscribe command. Contains the current
 * state at the given resource URI and the server sequence number at
 * snapshot time. The client should process subsequent envelopes with
 * `serverSeq > fromSeq`.
 *
 * File: `platform/agentHost/common/state/sessionProtocol.ts` (re-exported from protocol)
 */
interface IStateSnapshot {
	readonly resource: string;
	readonly state: IRootState | ISessionState;
	readonly fromSeq: number;
}

/**
 * Client-side state manager with write-ahead reconciliation.
 *
 * Maintains confirmed state (last server-acknowledged), a pending action
 * queue (optimistically applied), and reconciles when the server echoes
 * actions back (possibly interleaved with actions from other sources).
 * Operates on two kinds of subscribable state:
 *   - Root state (agents + models) - server-only mutations, no write-ahead.
 *   - Session state - mixed: client-sendable actions get write-ahead,
 *     server-only actions are applied directly.
 *
 * Usage:
 * 1. `handleSnapshot()` - apply initial state from subscribe response.
 * 2. `applyOptimistic()` - optimistically apply a client action.
 * 3. `receiveEnvelope()` - process a server action envelope.
 * 4. `receiveNotification()` - process an ephemeral notification.
 *
 * File: `platform/agentHost/common/state/sessionClientState.ts`
 */
interface SessionClientState {
	readonly clientId: string;
	readonly rootState: IRootState | undefined;
	readonly onDidChangeRootState: Event<IRootState>;
	readonly onDidChangeSessionState: Event<{ session: string; state: ISessionState }>;
	readonly onDidReceiveNotification: Event<INotification>;
	getSessionState(session: string): ISessionState | undefined;
	handleSnapshot(resource: string, state: IRootState | ISessionState, fromSeq: number): void;
	applyOptimistic(action: ISessionAction): number;
	receiveEnvelope(envelope: IActionEnvelope): void;
	receiveNotification(notification: INotification): void;
	unsubscribe(resource: string): void;
}

/**
 * A bidirectional transport for protocol messages (JSON-RPC 2.0 framing).
 * Implementations handle serialization, framing, and connection management.
 * Concrete implementations: MessagePort (ProxyChannel), WebSocket, stdio.
 *
 * File: `platform/agentHost/common/state/sessionTransport.ts`
 */
interface IProtocolTransport extends IDisposable {
	readonly onMessage: Event<IProtocolMessage>;
	readonly onClose: Event<void>;
	send(message: IProtocolMessage): void;
}

/**
 * Server-side transport that accepts multiple client connections.
 * Each connected client gets its own {@link IProtocolTransport}.
 *
 * File: `platform/agentHost/common/state/sessionTransport.ts`
 */
interface IProtocolServer extends IDisposable {
	readonly onConnection: Event<IProtocolTransport>;
	readonly address: string | undefined;
}

// =============================================================================
// LAYER 3: Workbench Contributions (workbench/contrib/chat/browser/agentSessions/agentHost/)
// =============================================================================

/**
 * Renderer-side handler for a single agent host chat session type.
 * Bridges the protocol state layer with the chat UI:
 *
 * - Subscribes to session state via {@link IAgentConnection}
 * - Derives `IChatProgress[]` from immutable state changes in
 *   {@link SessionClientState}
 * - Dispatches client actions (`turnStarted`, `permissionResolved`,
 *   `turnCancelled`) back to the server
 * - Registers a dynamic chat agent via {@link IChatAgentService}
 *
 * Works with both local and remote connections via the {@link IAgentConnection}
 * interface passed in the config.
 *
 * File: `workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts`
 */
interface AgentHostSessionHandler extends IChatSessionContentProvider {
	provideChatSessionContent(sessionResource: URI, token: CancellationToken): Promise<IChatSession>;
}

/**
 * Configuration for an {@link AgentHostSessionHandler} instance.
 * Contains the agent identity, displayName, the connection to use,
 * and optional callbacks for resolving working directories and
 * interactive authentication.
 *
 * File: `workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts`
 */
interface IAgentHostSessionHandlerConfig {
	readonly provider: AgentProvider;
	readonly agentId: string;
	readonly sessionType: string;
	readonly fullName: string;
	readonly description: string;
	readonly connection: IAgentConnection;
	readonly extensionId?: string;
	readonly extensionDisplayName?: string;
	/** Resolve a working directory for a new session (e.g. from active session's repository URI). */
	readonly resolveWorkingDirectory?: (resourceKey: string) => string | undefined;
	/** Trigger interactive authentication when the server rejects with auth-required. */
	readonly resolveAuthentication?: () => Promise<boolean>;
}

/**
 * Provides session list items for the chat sessions sidebar by querying
 * active sessions from an agent host connection. Listens to protocol
 * notifications (`notify/sessionAdded`, `notify/sessionRemoved`) for
 * incremental updates, and refreshes on `session/turnComplete` actions.
 *
 * Works with both local and remote agent host connections via
 * {@link IAgentConnection}.
 *
 * File: `workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionListController.ts`
 */
interface AgentHostSessionListController extends IChatSessionItemController {
	readonly items: readonly IChatSessionItem[];
	readonly onDidChangeChatSessionItems: Event<IChatSessionItemsDelta>;
	refresh(token: CancellationToken): Promise<void>;
}

/**
 * Exposes models available from the agent host process as selectable
 * language models in the chat model picker. Models come from root state
 * (via {@link IAgentInfo.models}) and are published with IDs prefixed
 * by the session type (e.g. `remote-localhost__8081-copilot:claude-sonnet-4-20250514`).
 *
 * File: `workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.ts`
 */
interface AgentHostLanguageModelProvider extends ILanguageModelChatProvider {
	/** Called when models change in root state to push updates to the model picker. */
	updateModels(models: readonly ISessionModelInfo[]): void;
}

/**
 * The local agent host contribution (for the workbench, not the sessions app).
 * Discovers agents from the local agent host process and registers each one
 * as a chat session type. Gated on the `chat.agentHost.enabled` setting.
 *
 * Uses the same shared adapters ({@link AgentHostSessionHandler}, etc.)
 * but connects via {@link IAgentHostService} (MessagePort) instead of
 * {@link IRemoteAgentHostService} (WebSocket).
 *
 * File: `workbench/contrib/chat/browser/agentSessions/agentHost/agentHostChatContribution.ts`
 */
interface AgentHostContribution extends IWorkbenchContribution {
	// Registers per-agent: chat session contribution, session list controller,
	// session handler, and language model provider - same 4 registrations
	// as RemoteAgentHostContribution but for the local agent host.
}

// =============================================================================
// LAYER 4: Sessions App Orchestrator (sessions/contrib/remoteAgentHost/)
// =============================================================================

/**
 * Central orchestrator for remote agent hosts in the sessions app.
 *
 * For each active remote connection:
 * 1. Creates a {@link SessionClientState} for write-ahead reconciliation
 * 2. Subscribes to `agenthost:/root` to discover available agents
 * 3. For each discovered copilot agent, performs four registrations:
 *    - Chat session contribution (via {@link IChatSessionsService})
 *    - Session list controller ({@link AgentHostSessionListController})
 *    - Session content provider ({@link AgentHostSessionHandler})
 *    - Language model provider ({@link AgentHostLanguageModelProvider})
 * 4. Registers authority→address mappings for the filesystem provider
 * 5. Authenticates connections using RFC 9728 resource metadata
 *
 * Reconciles when connections change (added/removed/name changed)
 * and when the default auth account or auth sessions change.
 *
 * File: `sessions/contrib/remoteAgentHost/browser/remoteAgentHost.contribution.ts`
 */
interface RemoteAgentHostContribution extends IWorkbenchContribution {
	// Per-connection state tracked in a DisposableMap<address, ConnectionState>
}

/**
 * Read-only {@link IFileSystemProvider} registered under the `agenthost`
 * scheme. Proxies `stat` and `readdir` calls through the agent host
 * protocol's `browseDirectory` RPC.
 *
 * The URI authority identifies the remote connection (sanitized address),
 * the URI path is the remote filesystem path. Authority-to-address mappings
 * are registered by {@link RemoteAgentHostContribution} via
 * `registerAuthority(authority, address)`.
 *
 * File: `sessions/contrib/remoteAgentHost/browser/agentHostFileSystemProvider.ts`
 */
interface AgentHostFileSystemProvider extends IFileSystemProvider {
	/** Register a mapping from sanitized URI authority to remote address. */
	registerAuthority(authority: string, address: string): IDisposable;
}

// =============================================================================
// Naming Conventions & URI Schemes
// =============================================================================

/**
 * Remote addresses are encoded into URI-safe authority strings:
 * - `localhost:8081` → `localhost__8081`
 * - `http://127.0.0.1:3000` → `b64-aHR0cDovLzEyNy4wLjAuMTozMDAw`
 *
 * | Context                  | Scheme           | Example                                         |
 * |--------------------------|------------------|-------------------------------------------------|
 * | Session resource (UI)    | `<sessionType>`  | `remote-localhost__8081-copilot:/untitled-abc`   |
 * | Backend session (server) | `<provider>`     | `copilot:/abc-123`                               |
 * | Root state subscription  | (string literal) | `agenthost:/root`                                |
 * | Remote filesystem        | `agenthost`      | `agenthost://localhost__8081/home/user/project`  |
 * | Language model ID        | -                | `remote-localhost__8081-copilot:claude-sonnet-4-20250514` |
 *
 * Session type naming: `remote-${authority}-${provider}` for remote,
 *                      `agent-host-${provider}` for local.
 */

// =============================================================================
// IPC & Auth Data Types (platform/agentHost/common/agentService.ts)
// =============================================================================

/** Metadata describing an agent backend, discovered over IPC or root state. */
interface IAgentDescriptor {
	readonly provider: AgentProvider;
	readonly displayName: string;
	readonly description: string;
	/** @deprecated Use IResourceMetadata from getResourceMetadata() instead. */
	readonly requiresAuth: boolean;
}

/** Serializable model information from the agent host. */
interface IAgentModelInfo {
	readonly provider: AgentProvider;
	readonly id: string;
	readonly name: string;
	readonly maxContextWindow: number;
	readonly supportsVision: boolean;
	readonly supportsReasoningEffort: boolean;
}

/** Configuration for creating a new session. */
interface IAgentCreateSessionConfig {
	readonly provider?: AgentProvider;
	readonly model?: string;
	readonly session?: URI;
	readonly workingDirectory?: string;
}

/** Metadata for an existing session (returned by listSessions). */
interface IAgentSessionMetadata {
	readonly session: URI;
	readonly startTime: number;
	readonly modifiedTime: number;
	readonly summary?: string;
	readonly workingDirectory?: string;
}

/** Serializable attachment passed alongside a message to the agent host. */
interface IAgentAttachment {
	readonly type: AttachmentType;
	readonly path: string;
	readonly displayName?: string;
	readonly text?: string;
	readonly selection?: {
		readonly start: { readonly line: number; readonly character: number };
		readonly end: { readonly line: number; readonly character: number };
	};
}

/**
 * Describes the agent host as an OAuth 2.0 protected resource (RFC 9728).
 * Clients resolve tokens via the VS Code authentication service.
 */
interface IResourceMetadata {
	readonly resources: readonly IAuthorizationProtectedResourceMetadata[];
}

/**
 * Parameters for the `authenticate` command (RFC 6750 bearer token delivery).
 */
interface IAuthenticateParams {
	readonly resource: string;
	readonly token: string;
}

/**
 * Result of the `authenticate` command.
 */
interface IAuthenticateResult {
	readonly authenticated: boolean;
}

// =============================================================================
// Progress Events (platform/agentHost/common/agentService.ts)
// =============================================================================

/**
 * Discriminated union of progress events streamed from the agent host.
 * The state-to-progress adapter ({@link stateToProgressAdapter.ts})
 * translates protocol state changes into `IChatProgress[]` for the chat UI,
 * but these events are also used in the IPC path for the old event-based API.
 *
 * Types: `delta`, `message`, `idle`, `tool_start`, `tool_complete`,
 * `title_changed`, `error`, `usage`, `permission_request`, `reasoning`.
 */
type IAgentProgressEvent =
	| IAgentDeltaEvent
	| IAgentMessageEvent
	| IAgentIdleEvent
	| IAgentToolStartEvent
	| IAgentToolCompleteEvent
	| IAgentTitleChangedEvent
	| IAgentErrorEvent
	| IAgentUsageEvent
	| IAgentPermissionRequestEvent
	| IAgentReasoningEvent;
```
