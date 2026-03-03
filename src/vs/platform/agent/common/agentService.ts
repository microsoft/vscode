/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const enum AgentHostIpcChannels {
	/** Channel for the agent host service on the main-process side */
	AgentHost = 'agentHost',
	/** Channel for log forwarding from the agent host process */
	Logger = 'agentHostLogger',
}

/** Configuration key that controls whether the agent host process is spawned. */
export const AgentHostEnabledSettingId = 'chat.agentHost.enabled';

// ---- IPC data types (serializable across MessagePort) -----------------------

export interface IAgentSessionMetadata {
	readonly session: URI;
	readonly startTime: number;
	readonly modifiedTime: number;
	readonly summary?: string;
}

export type AgentProvider = 'copilot' | 'claude';

export interface IAgentCreateSessionConfig {
	readonly provider?: AgentProvider;
	readonly model?: string;
	readonly session?: URI;
}

/** Serializable model information from the agent host. */
export interface IAgentModelInfo {
	readonly id: string;
	readonly name: string;
	readonly maxContextWindow: number;
	readonly supportsVision: boolean;
	readonly supportsReasoningEffort: boolean;
	readonly supportedReasoningEfforts?: readonly string[];
	readonly defaultReasoningEffort?: string;
	readonly policyState?: 'enabled' | 'disabled' | 'unconfigured';
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
	readonly totalResponseSizeBytes?: number;
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
	readonly success: boolean;
	/** Message describing the completed tool invocation (e.g., "Ran `echo hello`"). */
	readonly pastTenseMessage: string;
	/** Tool output content for display in the UI. */
	readonly toolOutput?: string;
	readonly isUserRequested?: boolean;
	readonly result?: {
		readonly content: string;
		readonly detailedContent?: string;
	};
	readonly error?: {
		readonly message: string;
		readonly code?: string;
	};
	/** Serialized JSON of tool-specific telemetry data. */
	readonly toolTelemetry?: string;
	readonly parentToolCallId?: string;
}

export type IAgentProgressEvent =
	| IAgentDeltaEvent
	| IAgentMessageEvent
	| IAgentIdleEvent
	| IAgentToolStartEvent
	| IAgentToolCompleteEvent;

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
	 */
	export function id(session: URI): string {
		return session.path.substring(1);
	}

	/**
	 * Extracts the provider name from a session URI scheme.
	 */
	export function provider(session: URI): AgentProvider | undefined {
		const scheme = session.scheme;
		if (scheme === 'copilot' || scheme === 'claude') {
			return scheme;
		}
		return undefined;
	}
}

// ---- Agent provider interface -----------------------------------------------

/**
 * Implemented by each agent backend (e.g. Copilot SDK, Claude Agent SDK).
 * The {@link IAgentService} dispatches to the appropriate agent based on
 * the agent id.
 */
export interface IAgent {
	/** Unique identifier for this provider (e.g. `'copilot'`, `'claude'`). */
	readonly id: AgentProvider;

	/** Fires when the provider streams progress for a session. */
	readonly onDidSessionProgress: Event<IAgentProgressEvent>;

	/** Create a new session. Returns the session URI. */
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;

	/** Send a user message into an existing session. */
	sendMessage(session: URI, prompt: string): Promise<void>;

	/** Retrieve all session events/messages for reconstruction. */
	getSessionMessages(session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]>;

	/** Dispose a session, freeing resources. */
	disposeSession(session: URI): Promise<void>;

	/** List available models from this provider. */
	listModels(): Promise<IAgentModelInfo[]>;

	/** List persisted sessions from this provider. */
	listSessions(): Promise<IAgentSessionMetadata[]>;

	/** Set the authentication token for this provider. */
	setAuthToken(token: string): Promise<void>;

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
 */
export interface IAgentService {
	readonly _serviceBrand: undefined;

	/** Fires when the agent host streams progress for a session. */
	readonly onDidSessionProgress: Event<IAgentProgressEvent>;

	/** Set the GitHub auth token used by the Copilot SDK. */
	setAuthToken(token: string): Promise<void>;

	/** List available models from the agent. */
	listModels(): Promise<IAgentModelInfo[]>;

	/** List all available sessions from the Copilot CLI. */
	listSessions(): Promise<IAgentSessionMetadata[]>;

	/** Create a new session. Returns the session URI. */
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;

	/** Send a user message into an existing session. */
	sendMessage(session: URI, prompt: string): Promise<void>;

	/** Retrieve all session events/messages for reconstruction, including tool invocations. */
	getSessionMessages(session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]>;

	/** Dispose a session in the agent host, freeing SDK resources. */
	disposeSession(session: URI): Promise<void>;

	/** Gracefully shut down all sessions and the underlying client. */
	shutdown(): Promise<void>;
}

export const IAgentHostService = createDecorator<IAgentHostService>('agentHostService');

/**
 * The local wrapper around the agent host process (manages lifecycle, restart,
 * exposes the proxied service). Consumed by the main process and workbench.
 */
export interface IAgentHostService extends IAgentService {

	readonly onAgentHostExit: Event<number>;
	readonly onAgentHostStart: Event<void>;

	restartAgentHost(): Promise<void>;
}
