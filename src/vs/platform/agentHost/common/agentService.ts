/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IReference } from '../../../base/common/lifecycle.js';
import { IAuthorizationProtectedResourceMetadata } from '../../../base/common/oauth.js';
import type { IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { ISyncedCustomization } from './agentPluginManager.js';
import type { IAgentSubscription } from './state/agentSubscription.js';
import type { ICreateTerminalParams, IResolveSessionConfigResult, ISessionConfigCompletionsResult } from './state/protocol/commands.js';
import { IProtectedResourceMetadata, type IConfigSchema, type IFileEdit, type IModelSelection, type IToolDefinition } from './state/protocol/state.js';
import type { IActionEnvelope, INotification, ISessionAction, ITerminalAction } from './state/sessionActions.js';
import type { IResourceCopyParams, IResourceCopyResult, IResourceDeleteParams, IResourceDeleteResult, IResourceListResult, IResourceMoveParams, IResourceMoveResult, IResourceReadResult, IResourceWriteParams, IResourceWriteResult, IStateSnapshot } from './state/sessionProtocol.js';
import { AttachmentType, ComponentToState, SessionInputResponseKind, SessionStatus, StateComponents, type ICustomizationRef, type IPendingMessage, type IRootState, type ISessionInputAnswer, type ISessionInputRequest, type IToolCallResult, type IToolResultContent, type PolicyState, type StringOrMarkdown } from './state/sessionState.js';

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

/** Result of starting the agent host WebSocket server on-demand. */
export interface IAgentHostSocketInfo {
	readonly socketPath: string;
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
}

// ---- IPC data types (serializable across MessagePort) -----------------------

export interface IAgentSessionMetadata {
	readonly session: URI;
	readonly startTime: number;
	readonly modifiedTime: number;
	readonly project?: IAgentSessionProjectInfo;
	readonly summary?: string;
	readonly status?: SessionStatus;
	readonly model?: IModelSelection;
	readonly workingDirectory?: URI;
	readonly isRead?: boolean;
	readonly isDone?: boolean;
	readonly diffs?: readonly IFileEdit[];
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
export interface IAuthenticateParams {
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
export interface IAuthenticateResult {
	/** Whether the token was accepted. */
	readonly authenticated: boolean;
}

export interface IAgentCreateSessionConfig {
	readonly provider?: AgentProvider;
	readonly model?: IModelSelection;
	readonly session?: URI;
	readonly workingDirectory?: URI;
	readonly config?: Record<string, string>;
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

export const AgentHostSessionConfigBranchNameHintKey = 'branchNameHint';

export interface IAgentResolveSessionConfigParams {
	readonly provider?: AgentProvider;
	readonly workingDirectory?: URI;
	readonly config?: Record<string, string>;
}

export interface IAgentSessionConfigCompletionsParams extends IAgentResolveSessionConfigParams {
	readonly property: string;
	readonly query?: string;
}

/** Serializable attachment passed alongside a message to the agent host. */
export interface IAgentAttachment {
	readonly type: AttachmentType;
	readonly path: string;
	readonly displayName?: string;
	/** For selections: the selected text. */
	readonly text?: string;
	/** For selections: line/character range. */
	readonly selection?: {
		readonly start: { readonly line: number; readonly character: number };
		readonly end: { readonly line: number; readonly character: number };
	};
}

/** Serializable model information from the agent host. */
export interface IAgentModelInfo {
	readonly provider: AgentProvider;
	readonly id: string;
	readonly name: string;
	readonly maxContextWindow: number;
	readonly supportsVision: boolean;
	readonly configSchema?: IConfigSchema;
	readonly policyState?: PolicyState;
}

// ---- Progress events (discriminated union by `type`) ------------------------

interface IAgentProgressEventBase {
	readonly session: URI;
}

/** Streaming text delta from the assistant (`assistant.message_delta`). */
export interface IAgentDeltaEvent extends IAgentProgressEventBase {
	readonly type: 'delta';
	readonly messageId: string;
	readonly content: string;
	readonly parentToolCallId?: string;
}

/** A complete assistant message (`assistant.message`), used for history reconstruction. */
export interface IAgentMessageEvent extends IAgentProgressEventBase {
	readonly type: 'message';
	readonly role: 'user' | 'assistant';
	readonly messageId: string;
	readonly content: string;
	readonly toolRequests?: readonly {
		readonly toolCallId: string;
		readonly name: string;
		/** Serialized JSON of arguments, if available. */
		readonly arguments?: string;
		readonly type?: 'function' | 'custom';
	}[];
	readonly reasoningOpaque?: string;
	readonly reasoningText?: string;
	readonly encryptedContent?: string;
	readonly parentToolCallId?: string;
}

/** The session has finished processing and is waiting for input (`session.idle`). */
export interface IAgentIdleEvent extends IAgentProgressEventBase {
	readonly type: 'idle';
}

/** A tool has started executing (`tool.execution_start`). */
export interface IAgentToolStartEvent extends IAgentProgressEventBase {
	readonly type: 'tool_start';
	readonly toolCallId: string;
	readonly toolName: string;
	/** Human-readable display name for this tool. */
	readonly displayName: string;
	/** Message describing the tool invocation in progress (e.g., "Running `echo hello`"). */
	readonly invocationMessage: StringOrMarkdown;
	/** A representative input string for display in the UI (e.g., the shell command). */
	readonly toolInput?: string;
	/** Hint for the renderer about how to display this tool (e.g., 'terminal' for shell commands, 'subagent' for subagent-spawning tools). */
	readonly toolKind?: 'terminal' | 'subagent';
	/** Language identifier for syntax highlighting (e.g., 'shellscript', 'powershell'). Used with toolKind 'terminal'. */
	readonly language?: string;
	/** Serialized JSON of the tool arguments, if available. */
	readonly toolArguments?: string;
	readonly mcpServerName?: string;
	readonly mcpToolName?: string;
	readonly parentToolCallId?: string;
	/**
	 * If set, this tool is provided by a client and the identified client
	 * is responsible for executing it. Maps to `toolClientId` in the
	 * protocol `session/toolCallStart` action.
	 */
	readonly toolClientId?: string;
}

/** A tool has finished executing (`tool.execution_complete`). */
export interface IAgentToolCompleteEvent extends IAgentProgressEventBase {
	readonly type: 'tool_complete';
	readonly toolCallId: string;
	/** Tool execution result, matching the protocol {@link IToolCallResult} shape. */
	readonly result: IToolCallResult;
	readonly isUserRequested?: boolean;
	/** Serialized JSON of tool-specific telemetry data. */
	readonly toolTelemetry?: string;
	readonly parentToolCallId?: string;
}

/** The session title has been updated. */
export interface IAgentTitleChangedEvent extends IAgentProgressEventBase {
	readonly type: 'title_changed';
	readonly title: string;
}

/** An error occurred during session processing. */
export interface IAgentErrorEvent extends IAgentProgressEventBase {
	readonly type: 'error';
	readonly errorType: string;
	readonly message: string;
	readonly stack?: string;
}

/** Token usage information for a request. */
export interface IAgentUsageEvent extends IAgentProgressEventBase {
	readonly type: 'usage';
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly model?: string;
	readonly cacheReadTokens?: number;
}

/**
 * A running tool requires re-confirmation (e.g. a mid-execution permission check).
 * Maps to `SessionToolCallReady` without `confirmed` to transition Running → PendingConfirmation.
 */
export interface IAgentToolReadyEvent extends IAgentProgressEventBase {
	readonly type: 'tool_ready';
	readonly toolCallId: string;
	/** Message describing what confirmation is needed. */
	readonly invocationMessage: StringOrMarkdown;
	/** Raw tool input to display. */
	readonly toolInput?: string;
	/** Short title for the confirmation prompt. */
	readonly confirmationTitle?: StringOrMarkdown;
	/** Kind of permission being requested. */
	readonly permissionKind?: 'shell' | 'write' | 'mcp' | 'read' | 'url' | 'custom-tool';
	/** File path associated with the permission request. */
	readonly permissionPath?: string;
	/** File edits this tool call will perform, for preview before confirmation. */
	readonly edits?: { items: IFileEdit[] };
}

/** Streaming reasoning/thinking content from the assistant. */
export interface IAgentReasoningEvent extends IAgentProgressEventBase {
	readonly type: 'reasoning';
	readonly content: string;
}

/** A steering message was consumed (sent to the model). */
export interface IAgentSteeringConsumedEvent extends IAgentProgressEventBase {
	readonly type: 'steering_consumed';
	readonly id: string;
}

/** The agent's ask_user tool is requesting user input. */
export interface IAgentUserInputRequestEvent extends IAgentProgressEventBase {
	readonly type: 'user_input_request';
	readonly request: ISessionInputRequest;
}

/** A subagent has been spawned by a tool call. */
export interface IAgentSubagentStartedEvent extends IAgentProgressEventBase {
	readonly type: 'subagent_started';
	readonly toolCallId: string;
	readonly agentName: string;
	readonly agentDisplayName: string;
	readonly agentDescription?: string;
}

/** Partial content update for a running tool call (e.g. terminal URI available). */
export interface IAgentToolContentChangedEvent extends IAgentProgressEventBase {
	readonly type: 'tool_content_changed';
	readonly toolCallId: string;
	readonly content: IToolResultContent[];
}

export type IAgentProgressEvent =
	| IAgentDeltaEvent
	| IAgentMessageEvent
	| IAgentIdleEvent
	| IAgentToolStartEvent
	| IAgentToolReadyEvent
	| IAgentToolCompleteEvent
	| IAgentTitleChangedEvent
	| IAgentErrorEvent
	| IAgentUsageEvent
	| IAgentReasoningEvent
	| IAgentSteeringConsumedEvent
	| IAgentUserInputRequestEvent
	| IAgentSubagentStartedEvent
	| IAgentToolContentChangedEvent;

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
	readonly onDidSessionProgress: Event<IAgentProgressEvent>;

	/** Create a new session. Returns server-owned session metadata. */
	createSession(config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult>;

	/** Resolve the dynamic configuration schema for creating a session. */
	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<IResolveSessionConfigResult>;

	/** Return dynamic completions for a session configuration property. */
	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<ISessionConfigCompletionsResult>;

	/** Send a user message into an existing session. */
	sendMessage(session: URI, prompt: string, attachments?: IAgentAttachment[], turnId?: string): Promise<void>;

	/**
	 * Called when the session's pending (steering) message changes.
	 * The agent harness decides how to react — e.g. inject steering
	 * mid-turn via `mode: 'immediate'`.
	 *
	 * Queued messages are consumed on the server side and are not
	 * forwarded to the agent; `queuedMessages` will always be empty.
	 */
	setPendingMessages?(session: URI, steeringMessage: IPendingMessage | undefined, queuedMessages: readonly IPendingMessage[]): void;

	/** Retrieve all session events/messages for reconstruction. */
	getSessionMessages(session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent | IAgentSubagentStartedEvent)[]>;

	/** Dispose a session, freeing resources. */
	disposeSession(session: URI): Promise<void>;

	/** Abort the current turn, stopping any in-flight processing. */
	abortSession(session: URI): Promise<void>;

	/** Change the model for an existing session. */
	changeModel(session: URI, model: IModelSelection): Promise<void>;

	/** Respond to a pending permission request from the SDK. */
	respondToPermissionRequest(requestId: string, approved: boolean): void;

	/** Respond to a pending user input request from the SDK's ask_user tool. */
	respondToUserInputRequest(requestId: string, response: SessionInputResponseKind, answers?: Record<string, ISessionInputAnswer>): void;

	/** Return the descriptor for this agent. */
	getDescriptor(): IAgentDescriptor;

	/** Available models from this provider. */
	readonly models: IObservable<readonly IAgentModelInfo[]>;

	/** List persisted sessions from this provider. */
	listSessions(): Promise<IAgentSessionMetadata[]>;

	/** Declare protected resources this agent requires auth for (RFC 9728). */
	getProtectedResources(): IProtectedResourceMetadata[];

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
	 * Receives client-provided customization refs and syncs them (e.g. copies
	 * plugin files to local storage). Returns per-customization status with
	 * local plugin directories.
	 *
	 * The agent MAY defer a client restart until all active sessions are idle.
	 */
	setClientCustomizations(clientId: string, customizations: ICustomizationRef[], progress?: (results: ISyncedCustomization[]) => void): Promise<ISyncedCustomization[]>;

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
	setClientTools(session: URI, clientId: string, tools: IToolDefinition[]): void;

	/**
	 * Called when a client completes a client-provided tool call.
	 * Resolves the tool handler's deferred promise so the SDK can continue.
	 *
	 * @param session The session the tool call belongs to.
	 */
	onClientToolCallComplete(session: URI, toolCallId: string, result: IToolCallResult): void;

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
	 * The {@link IAuthenticateParams.resource} must match a resource from
	 * the agent's protectedResources in root state. Analogous to RFC 6750
	 * bearer token delivery.
	 */
	authenticate(params: IAuthenticateParams): Promise<IAuthenticateResult>;

	/** List all available sessions from the Copilot CLI. */
	listSessions(): Promise<IAgentSessionMetadata[]>;

	/** Create a new session. Returns the session URI. */
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;

	/** Resolve the dynamic configuration schema for creating a session. */
	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<IResolveSessionConfigResult>;

	/** Return dynamic completions for a session configuration property. */
	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<ISessionConfigCompletionsResult>;

	/** Dispose a session in the agent host, freeing SDK resources. */
	disposeSession(session: URI): Promise<void>;

	/** Create a new terminal on the agent host. */
	createTerminal(params: ICreateTerminalParams): Promise<void>;

	/** Dispose a terminal and kill its process if still running. */
	disposeTerminal(terminal: URI): Promise<void>;

	/** Gracefully shut down all sessions and the underlying client. */
	shutdown(): Promise<void>;

	// ---- Protocol methods (sessions process protocol) ----------------------

	/**
	 * Subscribe to state at the given URI. Returns a snapshot of the current
	 * state and the serverSeq at snapshot time. Subsequent actions for this
	 * resource arrive via {@link onDidAction}.
	 */
	subscribe(resource: URI): Promise<IStateSnapshot>;

	/** Unsubscribe from state updates for the given URI. */
	unsubscribe(resource: URI): void;

	/**
	 * Fires when the server applies an action to subscribable state.
	 * Clients use this alongside {@link subscribe} to keep their local
	 * state in sync.
	 */
	readonly onDidAction: Event<IActionEnvelope>;

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
	dispatchAction(action: ISessionAction | ITerminalAction, clientId: string, clientSeq: number): void;

	/**
	 * List the contents of a directory on the agent host's filesystem.
	 * Used by the client to drive a remote folder picker before session creation.
	 */
	resourceList(uri: URI): Promise<IResourceListResult>;

	/**
	 * Read stored content by URI from the agent host (e.g. file edit snapshots,
	 * or reading files from the remote filesystem).
	 */
	resourceRead(uri: URI): Promise<IResourceReadResult>;

	/**
	 * Write content to a file on the agent host's filesystem.
	 * Used for undo/redo operations on file edits.
	 */
	resourceWrite(params: IResourceWriteParams): Promise<IResourceWriteResult>;

	/**
	 * Copy a resource from one URI to another on the agent host's filesystem.
	 */
	resourceCopy(params: IResourceCopyParams): Promise<IResourceCopyResult>;

	/**
	 * Delete a resource at a URI on the agent host's filesystem.
	 */
	resourceDelete(params: IResourceDeleteParams): Promise<IResourceDeleteResult>;

	/**
	 * Move (rename) a resource from one URI to another on the agent host's filesystem.
	 */
	resourceMove(params: IResourceMoveParams): Promise<IResourceMoveResult>;
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
	readonly rootState: IAgentSubscription<IRootState>;
	getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>>;
	getSubscriptionUnmanaged<T extends StateComponents>(kind: T, resource: URI): IAgentSubscription<ComponentToState[T]> | undefined;

	// ---- Action dispatch ----------------------------------------------------
	dispatch(action: ISessionAction | ITerminalAction): void;

	// ---- Events (connection-level) ------------------------------------------
	readonly onDidNotification: Event<INotification>;
	readonly onDidAction: Event<IActionEnvelope>;

	// ---- Session lifecycle --------------------------------------------------
	authenticate(params: IAuthenticateParams): Promise<IAuthenticateResult>;
	listSessions(): Promise<IAgentSessionMetadata[]>;
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;
	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<IResolveSessionConfigResult>;
	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<ISessionConfigCompletionsResult>;
	disposeSession(session: URI): Promise<void>;

	// ---- Terminal lifecycle -------------------------------------------------
	createTerminal(params: ICreateTerminalParams): Promise<void>;
	disposeTerminal(terminal: URI): Promise<void>;

	// ---- Filesystem operations ----------------------------------------------
	resourceList(uri: URI): Promise<IResourceListResult>;
	resourceRead(uri: URI): Promise<IResourceReadResult>;
	resourceWrite(params: IResourceWriteParams): Promise<IResourceWriteResult>;
	resourceCopy(params: IResourceCopyParams): Promise<IResourceCopyResult>;
	resourceDelete(params: IResourceDeleteParams): Promise<IResourceDeleteResult>;
	resourceMove(params: IResourceMoveParams): Promise<IResourceMoveResult>;
}

export const IAgentHostService = createDecorator<IAgentHostService>('agentHostService');

/**
 * The local wrapper around the agent host process (manages lifecycle, restart,
 * exposes the proxied service). Consumed by the main process and workbench.
 */
export interface IAgentHostService extends IAgentConnection {

	readonly onAgentHostExit: Event<number>;
	readonly onAgentHostStart: Event<void>;

	restartAgentHost(): Promise<void>;

	startWebSocketServer(): Promise<IAgentHostSocketInfo>;
}
