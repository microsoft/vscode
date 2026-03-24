/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IAuthorizationProtectedResourceMetadata } from '../../../base/common/oauth.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IActionEnvelope, INotification, ISessionAction } from './state/sessionActions.js';
import type { IBrowseDirectoryResult, IFetchContentResult, IStateSnapshot } from './state/sessionProtocol.js';
import { AttachmentType, PermissionKind, type IToolCallResult, type PolicyState } from './state/sessionState.js';

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

/** Configuration key that controls whether the agent host process is spawned. */
export const AgentHostEnabledSettingId = 'chat.agentHost.enabled';

/** Configuration key that controls whether per-host IPC traffic output channels are created. */
export const AgentHostIpcLoggingSettingId = 'chat.agentHost.ipcLoggingEnabled';

// ---- IPC data types (serializable across MessagePort) -----------------------

export interface IAgentSessionMetadata {
	readonly session: URI;
	readonly startTime: number;
	readonly modifiedTime: number;
	readonly summary?: string;
	readonly workingDirectory?: string;
}

export type AgentProvider = string;

/** Metadata describing an agent backend, discovered over IPC. */
export interface IAgentDescriptor {
	readonly provider: AgentProvider;
	readonly displayName: string;
	readonly description: string;
	/**
	 * Whether the renderer should push a GitHub auth token for this agent.
	 * @deprecated Use {@link IResourceMetadata.resources} from {@link IAgentService.getResourceMetadata} instead.
	 */
	readonly requiresAuth: boolean;
}

// ---- Auth types (RFC 9728 / RFC 6750 inspired) -----------------------------

/**
 * Describes the agent host as an OAuth 2.0 protected resource.
 * Uses {@link IAuthorizationProtectedResourceMetadata} from RFC 9728
 * to describe auth requirements, enabling clients to resolve tokens
 * using the standard VS Code authentication service.
 *
 * Returned from the server via {@link IAgentService.getResourceMetadata}.
 */
export interface IResourceMetadata {
	/**
	 * Protected resources the agent host requires authentication for.
	 * Each entry uses the standard RFC 9728 shape so clients can resolve
	 * tokens via {@link IAuthenticationService.getOrActivateProviderIdForServer}.
	 */
	readonly resources: readonly IAuthorizationProtectedResourceMetadata[];
}

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
	readonly model?: string;
	readonly session?: URI;
	readonly workingDirectory?: string;
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
	readonly supportsReasoningEffort: boolean;
	readonly supportedReasoningEfforts?: readonly string[];
	readonly defaultReasoningEffort?: string;
	readonly policyState?: PolicyState;
	readonly billingMultiplier?: number;
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
	readonly invocationMessage: string;
	/** A representative input string for display in the UI (e.g., the shell command). */
	readonly toolInput?: string;
	/** Hint for the renderer about how to display this tool (e.g., 'terminal' for shell commands). */
	readonly toolKind?: 'terminal';
	/** Language identifier for syntax highlighting (e.g., 'shellscript', 'powershell'). Used with toolKind 'terminal'. */
	readonly language?: string;
	/** Serialized JSON of the tool arguments, if available. */
	readonly toolArguments?: string;
	readonly mcpServerName?: string;
	readonly mcpToolName?: string;
	readonly parentToolCallId?: string;
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

/** A tool permission request from the SDK requiring a renderer-side decision. */
export interface IAgentPermissionRequestEvent extends IAgentProgressEventBase {
	readonly type: 'permission_request';
	/** Unique ID for correlating the response. */
	readonly requestId: string;
	/** The kind of permission being requested. */
	readonly permissionKind: PermissionKind;
	/** The tool call ID that triggered this permission request. */
	readonly toolCallId?: string;
	/** File path involved (for read/write). */
	readonly path?: string;
	/** For shell: the full command text. */
	readonly fullCommandText?: string;
	/** For shell: the intention description. */
	readonly intention?: string;
	/** For MCP: the server name. */
	readonly serverName?: string;
	/** For MCP: the tool name. */
	readonly toolName?: string;
	/** Serialized JSON of the full permission request for fallback display. */
	readonly rawRequest: string;
}

/** Streaming reasoning/thinking content from the assistant. */
export interface IAgentReasoningEvent extends IAgentProgressEventBase {
	readonly type: 'reasoning';
	readonly content: string;
}

export type IAgentProgressEvent =
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

	/** Create a new session. Returns the session URI. */
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;

	/** Send a user message into an existing session. */
	sendMessage(session: URI, prompt: string, attachments?: IAgentAttachment[]): Promise<void>;

	/** Retrieve all session events/messages for reconstruction. */
	getSessionMessages(session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]>;

	/** Dispose a session, freeing resources. */
	disposeSession(session: URI): Promise<void>;

	/** Abort the current turn, stopping any in-flight processing. */
	abortSession(session: URI): Promise<void>;

	/** Change the model for an existing session. */
	changeModel(session: URI, model: string): Promise<void>;

	/** Respond to a pending permission request from the SDK. */
	respondToPermissionRequest(requestId: string, approved: boolean): void;

	/** Return the descriptor for this agent. */
	getDescriptor(): IAgentDescriptor;

	/** List available models from this provider. */
	listModels(): Promise<IAgentModelInfo[]>;

	/** List persisted sessions from this provider. */
	listSessions(): Promise<IAgentSessionMetadata[]>;

	/** Declare protected resources this agent requires auth for (RFC 9728). */
	getProtectedResources(): IAuthorizationProtectedResourceMetadata[];

	/**
	 * Authenticate for a specific resource. Returns true if accepted.
	 * The `resource` matches {@link IAuthorizationProtectedResourceMetadata.resource}.
	 */
	authenticate(resource: string, token: string): Promise<boolean>;

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

	/** Discover available agent backends from the agent host. */
	listAgents(): Promise<IAgentDescriptor[]>;

	/**
	 * Retrieve the resource metadata describing auth requirements.
	 * Modeled on RFC 9728 (OAuth 2.0 Protected Resource Metadata).
	 */
	getResourceMetadata(): Promise<IResourceMetadata>;

	/**
	 * Authenticate for a protected resource on the server.
	 * The {@link IAuthenticateParams.resource} must match a resource from
	 * {@link getResourceMetadata}. Analogous to RFC 6750 bearer token delivery.
	 */
	authenticate(params: IAuthenticateParams): Promise<IAuthenticateResult>;

	/**
	 * Refresh the model list from all providers, publishing updated
	 * agents (with models) to root state via `root/agentsChanged`.
	 */
	refreshModels(): Promise<void>;

	/** List all available sessions from the Copilot CLI. */
	listSessions(): Promise<IAgentSessionMetadata[]>;

	/** Create a new session. Returns the session URI. */
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;

	/** Dispose a session in the agent host, freeing SDK resources. */
	disposeSession(session: URI): Promise<void>;

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
	dispatchAction(action: ISessionAction, clientId: string, clientSeq: number): void;

	/**
	 * List the contents of a directory on the agent host's filesystem.
	 * Used by the client to drive a remote folder picker before session creation.
	 */
	browseDirectory(uri: URI): Promise<IBrowseDirectoryResult>;

	/**
	 * Fetch stored content by URI from the agent host (e.g. file edit snapshots,
	 * or reading files from the remote filesystem).
	 */
	fetchContent(uri: URI): Promise<IFetchContentResult>;
}

/**
 * A concrete connection to an agent host - local utility process or remote
 * WebSocket. Extends the core protocol surface with a `clientId` used for
 * write-ahead reconciliation. Both {@link IAgentHostService} (local) and
 * per-connection objects from {@link IRemoteAgentHostService} (remote)
 * satisfy this contract.
 */
export interface IAgentConnection extends IAgentService {
	/** Unique identifier for this client connection, used as the origin in action envelopes. */
	readonly clientId: string;
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
}
