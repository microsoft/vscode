/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IReference } from '../../../base/common/lifecycle.js';
import { IAuthorizationProtectedResourceMetadata } from '../../../base/common/oauth.js';
import type { IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { ISyncedCustomization } from './agentPluginManager.js';
import type { IAgentSubscription } from './state/agentSubscription.js';
import type { CompletionsParams, CompletionsResult, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from './state/protocol/commands.js';
import { ProtectedResourceMetadata, type ConfigSchema, type FileEdit, type MessageAttachment, type ModelSelection, type SessionActiveClient, type ToolCallPendingConfirmationState, type ToolDefinition } from './state/protocol/state.js';
import type { ActionEnvelope, INotification, IRootConfigChangedAction, SessionAction, TerminalAction } from './state/sessionActions.js';
import type { ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult, ResourceListResult, ResourceMoveParams, ResourceMoveResult, ResourceReadResult, ResourceWriteParams, ResourceWriteResult, IStateSnapshot } from './state/sessionProtocol.js';
import { ComponentToState, SessionInputResponseKind, SessionStatus, StateComponents, type CustomizationRef, type PendingMessage, type RootState, type SessionCustomization, type SessionInputAnswer, type SessionMeta, type ToolCallResult, type Turn, type PolicyState } from './state/sessionState.js';

// IPC contract between the renderer and the agent host utility process.
// Defines all serializable event types, the IAgent provider interface,
// and the IAgentService / IAgentHostService service decorators.

export const enum AgentHostIpcChannels {
	/** Channel for the agent host service on the main-process side */
	AgentHost = 'agentHost',
	/** Channel for log forwarding from the agent host process */
	Logger = 'agentHostLogger',
	/** Channel for WebSocket client connection count (server process management only) */
	ConnectionTracker = 'agentHostConnectionTracker',
}

/** Configuration key that controls whether the local agent host process is spawned. */
export const AgentHostEnabledSettingId = 'chat.agentHost.enabled';

/** Configuration key that controls whether per-host IPC traffic output channels are created. */
export const AgentHostIpcLoggingSettingId = 'chat.agentHost.ipcLoggingEnabled';

/**
 * Configuration key that holds the absolute path to a locally-installed
 * `@anthropic-ai/claude-agent-sdk` package. When non-empty, the Claude agent
 * provider is registered inside the agent host and the SDK module is loaded
 * via dynamic `import()` from this path. When empty (the default), the
 * Claude provider is not registered. The SDK is intentionally not bundled
 * with VS Code; users opting into the Claude agent install the SDK
 * themselves and point this setting at it. The agent host process must be
 * restarted for changes to take effect.
 */
export const AgentHostClaudeAgentSdkPathSettingId = 'chat.agentHost.claudeAgent.path';

/**
 * Environment variable that holds the absolute path to a locally-installed
 * `@anthropic-ai/claude-agent-sdk` package. When set to a non-empty value,
 * the agent host process registers the Claude agent provider and loads the
 * SDK module from this path. Set by the agent host starters from
 * {@link AgentHostClaudeAgentSdkPathSettingId}, and may also be set directly
 * by developers as an override.
 */
export const AgentHostClaudeSdkPathEnvVar = 'VSCODE_AGENT_HOST_CLAUDE_SDK_PATH';

/** Result of starting the agent host WebSocket server on-demand. */
export interface IAgentHostSocketInfo {
	readonly socketPath: string;
}

/** Inspector listener information for the agent host process. */
export interface IAgentHostInspectInfo {
	readonly host: string;
	readonly port: number;
	/** A `devtools://` URL that can be opened with `INativeHostService.openDevToolsWindow`. */
	readonly devtoolsUrl: string;
}

/**
 * IPC service exposed on the {@link AgentHostIpcChannels.ConnectionTracker}
 * channel. Used by the server process for lifetime management and by the
 * shared process to request a local WebSocket listener on-demand.
 */
export interface IConnectionTrackerService {
	readonly onDidChangeConnectionCount: Event<number>;

	/**
	 * Request the agent host to start a WebSocket server on a local
	 * pipe/socket. Returns the socket path.
	 * If a server is already running, returns the existing info.
	 */
	startWebSocketServer(): Promise<IAgentHostSocketInfo>;

	/**
	 * Get inspector listener info for the agent host process. If the inspector
	 * is not currently active and `tryEnable` is true, opens the inspector on
	 * a random local port. Returns `undefined` if the inspector cannot be
	 * enabled (e.g. running in an environment without `node:inspector`).
	 */
	getInspectInfo(tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined>;
}

// ---- IPC data types (serializable across MessagePort) -----------------------

export interface IAgentSessionMetadata {
	readonly session: URI;
	readonly startTime: number;
	readonly modifiedTime: number;
	readonly project?: IAgentSessionProjectInfo;
	readonly summary?: string;
	readonly status?: SessionStatus;
	/** Human-readable description of what the session is currently doing. */
	readonly activity?: string;
	readonly model?: ModelSelection;
	readonly workingDirectory?: URI;
	readonly customizationDirectory?: URI;
	readonly isRead?: boolean;
	readonly isArchived?: boolean;
	readonly diffs?: readonly FileEdit[];
	/**
	 * Side-channel metadata mirroring {@link SessionState._meta}, propagated
	 * to clients via per-session state subscriptions.
	 * Producers SHOULD use namespaced keys; consumers MUST ignore unknown
	 * keys. Use the typed accessors in `sessionState.ts` (e.g.
	 * `readSessionGitState`) for well-known slots.
	 */
	readonly _meta?: SessionMeta;
}

export interface IAgentSessionProjectInfo {
	readonly uri: URI;
	readonly displayName: string;
}

export interface IAgentCreateSessionResult {
	readonly session: URI;
	readonly project?: IAgentSessionProjectInfo;
	/** The resolved working directory, which may differ from the requested one (e.g. worktree). */
	readonly workingDirectory?: URI;
	/**
	 * `true` when the agent only allocated an in-memory placeholder for this
	 * session (no SDK session, no worktree, no on-disk state). Materialization
	 * happens lazily on the first {@link IAgent.sendMessage}, at which point
	 * the agent fires {@link IAgent.onDidMaterializeSession}. The
	 * {@link IAgentService} uses this flag to defer the `sessionAdded` protocol
	 * notification so observers don't see the session in their list until it
	 * has been persisted.
	 */
	readonly provisional?: boolean;
}

/**
 * Payload of {@link IAgent.onDidMaterializeSession}. Fired once per session
 * when a previously {@link IAgentCreateSessionResult.provisional} session has
 * its SDK session, worktree (if any), and on-disk metadata in place.
 */
export interface IAgentMaterializeSessionEvent {
	readonly session: URI;
	readonly workingDirectory: URI | undefined;
	readonly project: IAgentSessionProjectInfo | undefined;
}

export type AgentProvider = string;

/** Metadata describing an agent backend, discovered over IPC. */
export interface IAgentDescriptor {
	readonly provider: AgentProvider;
	readonly displayName: string;
	readonly description: string;
}

// ---- Auth types (RFC 9728 / RFC 6750 inspired) -----------------------------

/**
 * Parameters for the `authenticate` command.
 * Analogous to sending `Authorization: Bearer <token>` (RFC 6750 section 2.1).
 */
export interface AuthenticateParams {
	/**
	 * The `resource` identifier from the server's
	 * {@link IAuthorizationProtectedResourceMetadata} that this token targets.
	 */
	readonly resource: string;

	/** The bearer token value (RFC 6750). */
	readonly token: string;
}

/**
 * Result of the `authenticate` command.
 */
export interface AuthenticateResult {
	/** Whether the token was accepted. */
	readonly authenticated: boolean;
}

/**
 * Canonical {@link ProtectedResourceMetadata} for the GitHub Copilot
 * resource. Shared between every agent provider that consumes a GitHub
 * Copilot bearer token (e.g. Copilot CLI, Claude) so they advertise an
 * identical resource identifier to the auth flow — clients dispatch by
 * `resource`, and divergent metadata would silently route the same
 * token down separate code paths.
 */
export const GITHUB_COPILOT_PROTECTED_RESOURCE: ProtectedResourceMetadata = {
	resource: 'https://api.github.com',
	resource_name: 'GitHub Copilot',
	authorization_servers: ['https://github.com/login/oauth'],
	scopes_supported: ['read:user', 'user:email'],
	required: true,
};

export interface IAgentCreateSessionConfig {
	readonly provider?: AgentProvider;
	readonly model?: ModelSelection;
	readonly session?: URI;
	readonly workingDirectory?: URI;
	readonly config?: Record<string, unknown>;
	/**
	 * Eagerly claim the active client role for the new session. When provided,
	 * the server initializes the session with this client as the active
	 * client, equivalent to dispatching a `session/activeClientChanged`
	 * action immediately after creation. The `clientId` MUST match the
	 * connection's own `clientId`.
	 */
	readonly activeClient?: SessionActiveClient;
	/** Fork from an existing session at a specific turn. */
	readonly fork?: {
		readonly session: URI;
		readonly turnIndex: number;
		readonly turnId: string;
		/**
		 * Maps old protocol turn IDs to new protocol turn IDs.
		 * Populated by the service layer after generating fresh UUIDs
		 * for the forked session's turns. Used by the agent to remap
		 * per-turn data (e.g. SDK event ID mappings) in the session database.
		 */
		readonly turnIdMapping?: ReadonlyMap<string, string>;
	};
}

export interface IAgentResolveSessionConfigParams {
	readonly provider?: AgentProvider;
	readonly workingDirectory?: URI;
	readonly config?: Record<string, unknown>;
}

export interface IAgentSessionConfigCompletionsParams extends IAgentResolveSessionConfigParams {
	readonly property: string;
	readonly query?: string;
}

/** Serializable model information from the agent host. */
export interface IAgentModelInfo {
	readonly provider: AgentProvider;
	readonly id: string;
	readonly name: string;
	readonly maxContextWindow?: number;
	readonly supportsVision: boolean;
	readonly configSchema?: ConfigSchema;
	readonly policyState?: PolicyState;
	readonly _meta?: Record<string, unknown>;
}

// ---- Agent signals (sent via IAgent.onDidSessionProgress) -------------------

/**
 * A signal emitted by an agent during session execution.
 *
 * Most signals carry a protocol {@link SessionAction} directly via the
 * `kind: 'action'` shape, eliminating a parallel event ontology. A small
 * number of cases that have no clean protocol action (permission
 * auto-approval, subagent session creation, steering message
 * acknowledgment) remain as discriminated non-action signals so the host
 * can perform side effects before — or instead of — dispatching an action.
 */
export type AgentSignal =
	| IAgentActionSignal
	| IAgentToolPendingConfirmationSignal
	| IAgentSubagentStartedSignal
	| IAgentSteeringConsumedSignal;

/**
 * Carries a protocol {@link SessionAction} produced by an agent. The host
 * dispatches the action through the state manager after routing via
 * {@link IAgentActionSignal.parentToolCallId} (if set).
 *
 * Agents are responsible for populating `session` and any `turnId` /
 * `partId` fields on the action.
 */
export interface IAgentActionSignal {
	readonly kind: 'action';
	/** Top-level session URI. For inner subagent events this is the parent session — see {@link parentToolCallId}. */
	readonly session: URI;
	/** Protocol action to dispatch. */
	readonly action: SessionAction;
	/** If set, route the action to the subagent session belonging to this tool call. */
	readonly parentToolCallId?: string;
}

/**
 * A tool has finished collecting parameters and needs the host to decide
 * whether it should run (or, mid-execution, re-confirm). The host applies
 * auto-approval logic over {@link permissionKind} / {@link permissionPath}
 * (see `SessionPermissionManager.getAutoApproval`) and then dispatches the
 * appropriate `SessionToolCallReady` action — with confirmation options
 * baked in when the user must approve, or with `confirmed: NotNeeded` when
 * the host auto-approved.
 *
 * Kept as a non-action signal because the host owns this approval policy;
 * the agent only describes the tool call and the kind of permission being
 * requested. The {@link state} field carries the protocol-shaped tool-call
 * state and is dispatched verbatim into the action.
 */
export interface IAgentToolPendingConfirmationSignal {
	readonly kind: 'pending_confirmation';
	readonly session: URI;
	/** Protocol-shaped pending-confirmation state, dispatched verbatim into `SessionToolCallReady`. */
	readonly state: ToolCallPendingConfirmationState;
	/** Host-only auto-approval kind (not part of the dispatched action). */
	readonly permissionKind?: 'shell' | 'write' | 'mcp' | 'read' | 'url' | 'custom-tool' | 'hook' | 'memory';
	/** Host-only auto-approval path target (not part of the dispatched action). */
	readonly permissionPath?: string;
	/**
	 * If set, the tool call belongs to the subagent rooted at this
	 * parent tool call. Used by the host to route the resulting
	 * `SessionToolCallReady` to the subagent session — otherwise the
	 * action would land on the parent session, where there is no
	 * matching `SessionToolCallStart`.
	 */
	readonly parentToolCallId?: string;
}

/**
 * A subagent was spawned by a tool call. The host creates a child session
 * silently and routes subsequent inner-tool events to it.
 *
 * Kept as a non-action signal because subagent session creation has no
 * protocol action — it's a host-side composition primitive.
 */
export interface IAgentSubagentStartedSignal {
	readonly kind: 'subagent_started';
	readonly session: URI;
	readonly toolCallId: string;
	readonly agentName: string;
	readonly agentDisplayName: string;
	readonly agentDescription?: string;
}

/** A steering message was consumed (sent to the model). */
export interface IAgentSteeringConsumedSignal {
	readonly kind: 'steering_consumed';
	readonly session: URI;
	readonly id: string;
}

// ---- Session URI helpers ----------------------------------------------------

export namespace AgentSession {

	/**
	 * Creates a session URI from a provider name and raw session ID.
	 * The URI scheme is the provider name (e.g., `copilot:/<rawId>`).
	 */
	export function uri(provider: AgentProvider, rawSessionId: string): URI {
		return URI.from({ scheme: provider, path: `/${rawSessionId}` });
	}

	/**
	 * Extracts the raw session ID from a session URI (the path without leading slash).
	 * Accepts both a URI object and a URI string.
	 */
	export function id(session: URI | string): string {
		const parsed = typeof session === 'string' ? URI.parse(session) : session;
		return parsed.path.substring(1);
	}

	/**
	 * Extracts the provider name from a session URI scheme.
	 * Accepts both a URI object and a URI string.
	 */
	export function provider(session: URI | string): AgentProvider | undefined {
		const parsed = typeof session === 'string' ? URI.parse(session) : session;
		return parsed.scheme || undefined;
	}
}

// ---- Agent provider interface -----------------------------------------------

/**
 * Implemented by each agent backend (e.g. Copilot SDK).
 * The {@link IAgentService} dispatches to the appropriate agent based on
 * the agent id.
 */
export interface IAgent {
	/** Unique identifier for this provider (e.g. `'copilot'`). */
	readonly id: AgentProvider;

	/** Fires when the provider streams progress for a session. */
	readonly onDidSessionProgress: Event<AgentSignal>;

	/**
	 * Fires once when a previously
	 * {@link IAgentCreateSessionResult.provisional} session has been
	 * materialized — i.e. its SDK session, worktree (if any), and on-disk
	 * metadata are all in place. The {@link IAgentService} uses this event
	 * to fire the deferred `sessionAdded` notification with the now-final
	 * summary.
	 */
	readonly onDidMaterializeSession?: Event<IAgentMaterializeSessionEvent>;

	/** Create a new session. Returns server-owned session metadata. */
	createSession(config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult>;

	/** Resolve the dynamic configuration schema for creating a session. */
	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult>;

	/** Return dynamic completions for a session configuration property. */
	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult>;

	/** Send a user message into an existing session. */
	sendMessage(session: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string): Promise<void>;

	/**
	 * Called when the session's pending (steering) message changes.
	 * The agent harness decides how to react — e.g. inject steering
	 * mid-turn via `mode: 'immediate'`.
	 *
	 * Queued messages are consumed on the server side and are not
	 * forwarded to the agent; `queuedMessages` will always be empty.
	 */
	setPendingMessages?(session: URI, steeringMessage: PendingMessage | undefined, queuedMessages: readonly PendingMessage[]): void;

	/**
	 * Retrieve the reconstructed turns for a session, used when restoring
	 * sessions from persistent storage. Each agent owns the conversion from
	 * its SDK-specific event log to protocol {@link Turn}s, including
	 * subagent sessions (callers pass the subagent URI to retrieve the
	 * child session's turns).
	 */
	getSessionMessages(session: URI): Promise<readonly Turn[]>;

	/** Dispose a session, freeing resources. */
	disposeSession(session: URI): Promise<void>;

	/** Abort the current turn, stopping any in-flight processing. */
	abortSession(session: URI): Promise<void>;

	/** Change the model for an existing session. */
	changeModel(session: URI, model: ModelSelection): Promise<void>;

	/** Respond to a pending permission request from the SDK. */
	respondToPermissionRequest(requestId: string, approved: boolean): void;

	/** Respond to a pending user input request from the SDK's ask_user tool. */
	respondToUserInputRequest(requestId: string, response: SessionInputResponseKind, answers?: Record<string, SessionInputAnswer>): void;

	/** Return the descriptor for this agent. */
	getDescriptor(): IAgentDescriptor;

	/** Available models from this provider. */
	readonly models: IObservable<readonly IAgentModelInfo[]>;

	/** List persisted sessions from this provider. */
	listSessions(): Promise<IAgentSessionMetadata[]>;

	/** Retrieve metadata for a single persisted session, without enumerating the provider catalog. */
	getSessionMetadata?(session: URI): Promise<IAgentSessionMetadata | undefined>;

	/** Declare protected resources this agent requires auth for (RFC 9728). */
	getProtectedResources(): ProtectedResourceMetadata[];

	/**
	 * Fires when the agent's host-owned customizations change
	 * (loading state, resolution results, etc.), so infrastructure
	 * can republish {@link AgentInfo} and session customization state.
	 */
	readonly onDidCustomizationsChange?: Event<void>;

	/**
	 * Returns the host-owned customization refs this agent currently exposes.
	 *
	 * Used to publish baseline customization metadata on {@link AgentInfo}.
	 */
	getCustomizations?(): readonly CustomizationRef[];

	/**
	 * Returns the effective customization list for a session, including
	 * source, enablement, and loading/error status.
	 */
	getSessionCustomizations?(session: URI): Promise<readonly SessionCustomization[]>;

	/**
	 * Authenticate for a specific resource. Returns true if accepted.
	 * The `resource` matches {@link IAuthorizationProtectedResourceMetadata.resource}.
	 */
	authenticate(resource: string, token: string): Promise<boolean>;

	/**
	 * Truncate a session's history. If `turnId` is provided, keeps turns up to
	 * and including that turn. If omitted, all turns are removed.
	 * Optional — not all providers support truncation.
	 */
	truncateSession?(session: URI, turnId?: string): Promise<void>;

	/**
	 * Notifies the provider that a session's archived state has changed.
	 * Providers may use this to clean up or restore per-session resources
	 * (for example, removing a session-owned worktree on archive and
	 * recreating it on unarchive). Optional.
	 */
	onArchivedChanged?(session: URI, isArchived: boolean): Promise<void>;

	/**
	 * Receives client-provided customization refs and syncs them (e.g. copies
	 * plugin files to local storage). Returns per-customization status with
	 * local plugin directories.
	 *
	 * The agent MAY defer a client restart until all active sessions are idle.
	 */
	setClientCustomizations(clientId: string, customizations: CustomizationRef[], progress?: (results: ISyncedCustomization[]) => void): Promise<ISyncedCustomization[]>;

	/**
	 * Receives client-provided tool definitions to make available in a
	 * specific session. The agent registers these as custom tools so the
	 * LLM can call them; execution is routed back to the owning client.
	 *
	 * Always called on `activeClientChanged`, even with an empty array,
	 * to clear a previous client's tools.
	 *
	 * @param session The session URI this tool set applies to.
	 * @param clientId The client that owns these tools.
	 * @param tools The tool definitions (full replacement).
	 */
	setClientTools(session: URI, clientId: string, tools: ToolDefinition[]): void;

	/**
	 * Called when a client completes a client-provided tool call.
	 * Resolves the tool handler's deferred promise so the SDK can continue.
	 *
	 * @param session The session the tool call belongs to.
	 */
	onClientToolCallComplete(session: URI, toolCallId: string, result: ToolCallResult): void;

	/**
	 * Notifies the agent that a customization has been toggled on or off.
	 * The agent MAY restart its client before the next message is sent.
	 */
	setCustomizationEnabled(uri: string, enabled: boolean): void;

	/** Gracefully shut down all sessions. */
	shutdown(): Promise<void>;

	/** Dispose this provider and all its resources. */
	dispose(): void;
}

// ---- Service interfaces -----------------------------------------------------

export const IAgentService = createDecorator<IAgentService>('agentService');

/**
 * Service contract for communicating with the agent host process. Methods here
 * are proxied across MessagePort via `ProxyChannel`.
 *
 * State is synchronized via the subscribe/unsubscribe/dispatchAction protocol.
 * Clients observe root state (agents, models) and session state via subscriptions,
 * and mutate state by dispatching actions (e.g. session/turnStarted, session/turnCancelled).
 */
export interface IAgentService {
	readonly _serviceBrand: undefined;

	/**
	 * Authenticate for a protected resource on the server.
	 * The {@link AuthenticateParams.resource} must match a resource from
	 * the agent's protectedResources in root state. Analogous to RFC 6750
	 * bearer token delivery.
	 */
	authenticate(params: AuthenticateParams): Promise<AuthenticateResult>;

	/** List all available sessions from the Copilot CLI. */
	listSessions(): Promise<IAgentSessionMetadata[]>;

	/** Create a new session. Returns the session URI. */
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;

	/** Resolve the dynamic configuration schema for creating a session. */
	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult>;

	/** Return dynamic completions for a session configuration property. */
	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult>;

	/**
	 * Return completion items for a partially-typed input (e.g. an `@`-mention
	 * inside a user message the user is composing). Delegates to a pluggable
	 * set of {@link IAgentHostCompletionItemProvider}s registered with the
	 * agent host.
	 *
	 * Note: this method does not accept a {@link CancellationToken} because
	 * `CancellationToken`s do not round-trip through the IPC boundary today
	 * (the deserialised value lacks the prototype methods used by
	 * subscribers). Callers that need cancellation should race the returned
	 * promise on their own side.
	 */
	completions(params: CompletionsParams): Promise<CompletionsResult>;

	/**
	 * Returns the set of characters that, when typed in a {@link UserMessage}
	 * input, SHOULD cause the client to issue a `completions` request.
	 * Aggregated from every registered {@link IAgentHostCompletionItemProvider}.
	 */
	getCompletionTriggerCharacters(): Promise<readonly string[]>;

	/** Dispose a session in the agent host, freeing SDK resources. */
	disposeSession(session: URI): Promise<void>;

	/** Create a new terminal on the agent host. */
	createTerminal(params: CreateTerminalParams): Promise<void>;

	/** Dispose a terminal and kill its process if still running. */
	disposeTerminal(terminal: URI): Promise<void>;

	/** Gracefully shut down all sessions and the underlying client. */
	shutdown(): Promise<void>;

	// ---- Protocol methods (sessions process protocol) ----------------------

	/**
	 * Subscribe to state at the given URI. Returns a snapshot of the current
	 * state and the serverSeq at snapshot time. Subsequent actions for this
	 * resource arrive via {@link onDidAction}. Registers `clientId` against
	 * the resource so the server-side refcount knows who is watching, so the
	 * caller does not need to invoke {@link addSubscriber} separately. Pair
	 * with {@link unsubscribe} when the subscription is released.
	 */
	subscribe(resource: URI, clientId: string): Promise<IStateSnapshot>;

	/**
	 * Counterpart to {@link subscribe}. Drops `clientId` from the refcount
	 * for `resource`; when the last subscriber is removed, idle session state
	 * for `resource` may be evicted from the server.
	 */
	unsubscribe(resource: URI, clientId: string): void;

	/**
	 * Register `clientId` against `resource` without going through
	 * {@link subscribe}. Only needed by callers that hand out snapshots
	 * synchronously (e.g. the JSON-RPC handshake serving `initialSubscriptions`
	 * out of the in-memory state cache); regular subscribers should call
	 * {@link subscribe} instead. Counterpart cleanup is {@link unsubscribe}.
	 */
	addSubscriber(resource: URI, clientId: string): void;

	/**
	 * Fires when the server applies an action to subscribable state.
	 * Clients use this alongside {@link subscribe} to keep their local
	 * state in sync.
	 */
	readonly onDidAction: Event<ActionEnvelope>;

	/**
	 * Fires when the server broadcasts an ephemeral notification
	 * (e.g. sessionAdded, sessionRemoved).
	 */
	readonly onDidNotification: Event<INotification>;

	/**
	 * Dispatch a client-originated action to the server. The server applies
	 * it to state, triggers side effects, and echoes it back via
	 * {@link onDidAction} with the client's origin for reconciliation.
	 */
	dispatchAction(action: SessionAction | TerminalAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void;

	/**
	 * List the contents of a directory on the agent host's filesystem.
	 * Used by the client to drive a remote folder picker before session creation.
	 */
	resourceList(uri: URI): Promise<ResourceListResult>;

	/**
	 * Read stored content by URI from the agent host (e.g. file edit snapshots,
	 * or reading files from the remote filesystem).
	 */
	resourceRead(uri: URI): Promise<ResourceReadResult>;

	/**
	 * Write content to a file on the agent host's filesystem.
	 * Used for undo/redo operations on file edits.
	 */
	resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult>;

	/**
	 * Copy a resource from one URI to another on the agent host's filesystem.
	 */
	resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult>;

	/**
	 * Delete a resource at a URI on the agent host's filesystem.
	 */
	resourceDelete(params: ResourceDeleteParams): Promise<ResourceDeleteResult>;

	/**
	 * Move (rename) a resource from one URI to another on the agent host's filesystem.
	 */
	resourceMove(params: ResourceMoveParams): Promise<ResourceMoveResult>;
}

/**
 * Consumer-facing connection to an agent host. Session handlers, terminal
 * contributions, and other features program against this interface.
 *
 * Implementations wrap an {@link IAgentService} and layer subscription
 * management and optimistic write-ahead on top.
 */
export interface IAgentConnection {
	readonly _serviceBrand: undefined;
	readonly clientId: string;

	// ---- State subscriptions ------------------------------------------------
	readonly rootState: IAgentSubscription<RootState>;
	getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>>;
	getSubscriptionUnmanaged<T extends StateComponents>(kind: T, resource: URI): IAgentSubscription<ComponentToState[T]> | undefined;

	// ---- Action dispatch ----------------------------------------------------
	dispatch(action: SessionAction | TerminalAction | IRootConfigChangedAction): void;

	// ---- Events (connection-level) ------------------------------------------
	readonly onDidNotification: Event<INotification>;
	readonly onDidAction: Event<ActionEnvelope>;

	// ---- Session lifecycle --------------------------------------------------
	authenticate(params: AuthenticateParams): Promise<AuthenticateResult>;
	listSessions(): Promise<IAgentSessionMetadata[]>;
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;
	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult>;
	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult>;
	completions(params: CompletionsParams): Promise<CompletionsResult>;

	/**
	 * Trigger characters announced by the connected agent host that should
	 * cause the client to issue a `completions` request when typed in a
	 * user-message input. Resolves once on first request and is cached.
	 */
	getCompletionTriggerCharacters(): Promise<readonly string[]>;
	disposeSession(session: URI): Promise<void>;

	// ---- Terminal lifecycle -------------------------------------------------
	createTerminal(params: CreateTerminalParams): Promise<void>;
	disposeTerminal(terminal: URI): Promise<void>;

	// ---- Filesystem operations ----------------------------------------------
	resourceList(uri: URI): Promise<ResourceListResult>;
	resourceRead(uri: URI): Promise<ResourceReadResult>;
	resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult>;
	resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult>;
	resourceDelete(params: ResourceDeleteParams): Promise<ResourceDeleteResult>;
	resourceMove(params: ResourceMoveParams): Promise<ResourceMoveResult>;
}

export const IAgentHostService = createDecorator<IAgentHostService>('agentHostService');

/**
 * The local wrapper around the agent host process (manages lifecycle, restart,
 * exposes the proxied service). Consumed by the main process and workbench.
 */
export interface IAgentHostService extends IAgentConnection {

	readonly onAgentHostExit: Event<number>;
	readonly onAgentHostStart: Event<void>;

	/**
	 * `true` while we are in the middle of authenticating against the local
	 * agent host (resolving tokens for any advertised `protectedResources` and
	 * pushing them via {@link authenticate}). Defaults to `true` at startup so
	 * that the period before the first auth pass is also covered.
	 *
	 * Producers (the workbench `AgentHostContribution`) flip this around their
	 * auth pass; consumers (e.g. the local sessions provider) read it to mark
	 * sessions as still loading.
	 */
	readonly authenticationPending: IObservable<boolean>;

	/** Update {@link authenticationPending}. Internal — only the auth driver should call this. */
	setAuthenticationPending(pending: boolean): void;

	restartAgentHost(): Promise<void>;

	startWebSocketServer(): Promise<IAgentHostSocketInfo>;

	/**
	 * Get inspector listener info for the agent host process. If the inspector
	 * is not currently active and `tryEnable` is true, opens the inspector on
	 * a random local port. Returns `undefined` if the inspector cannot be
	 * enabled.
	 */
	getInspectInfo(tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined>;
}
