// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

/**
 * Core type definitions for the Agent Client Protocol (ACP).
 *
 * ACP is a JSON-RPC 2.0 protocol that separates three concerns:
 * 1. Agent discovery — agents advertise their capabilities
 * 2. Session management — creating, monitoring, pausing, and terminating sessions
 * 3. Editor integration — agents request file reads, edits, terminal commands
 */

// ---------------------------------------------------------------------------
// Agent descriptors
// ---------------------------------------------------------------------------

/** Describes an agent's identity and how to connect to it. */
export interface AgentDescriptor {
	id: string;
	name: string;
	version?: string;
	transport: TransportType;
	capabilities: AgentCapability[];
	contextWindow?: number;
	costTier: CostTier;
}

export type TransportType = 'stdio' | 'http';
export type CostTier = 'free' | 'subscription' | 'pay-per-use' | 'local';

/** Capabilities an agent can declare. */
export type AgentCapability =
	| 'code-generation'
	| 'analysis'
	| 'refactoring'
	| 'testing'
	| 'security-review'
	| 'search-grounding'
	| 'sandbox-execution'
	| 'exploration'
	| 'documentation';

/** Detailed capability report returned by the agent after connection. */
export interface AgentCapabilities {
	agentId: string;
	capabilities: AgentCapability[];
	supportedLanguages?: string[];
	maxConcurrentSessions?: number;
	supportsPause: boolean;
	supportsResume: boolean;
	tools?: AgentToolDescriptor[];
}

export interface AgentToolDescriptor {
	name: string;
	description: string;
	inputSchema?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export interface SessionConfig {
	task: string;
	context?: SessionContext;
	tools?: string[];
	maxTokens?: number;
	timeout?: number;
}

export interface SessionContext {
	files?: FileContext[];
	codeGraph?: Record<string, unknown>;
	buildDag?: Record<string, unknown>;
	custom?: Record<string, unknown>;
}

export interface FileContext {
	path: string;
	content?: string;
	language?: string;
}

export interface Session {
	id: string;
	agentId: string;
	status: SessionStatus;
	createdAt: number;
	updatedAt: number;
}

export type SessionStatus =
	| 'initialising'
	| 'running'
	| 'paused'
	| 'completed'
	| 'failed'
	| 'terminated';

// ---------------------------------------------------------------------------
// Session events (streamed from agent to editor)
// ---------------------------------------------------------------------------

export interface SessionEvent {
	type: SessionEventType;
	sessionId: string;
	timestamp: number;
	data: unknown;
	requiresApproval: boolean;
}

export type SessionEventType =
	| 'message'
	| 'file_edit'
	| 'terminal_command'
	| 'tool_call'
	| 'plan'
	| 'progress'
	| 'complete'
	| 'error';

/** A proposed file edit from an agent, subject to approval. */
export interface FileEditEvent {
	type: 'file_edit';
	path: string;
	originalContent?: string;
	proposedContent: string;
	hunks?: DiffHunk[];
}

export interface DiffHunk {
	startLine: number;
	endLine: number;
	original: string;
	proposed: string;
}

/** A terminal command the agent wants to execute. */
export interface TerminalCommandEvent {
	type: 'terminal_command';
	command: string;
	workingDirectory?: string;
	requiresApproval: boolean;
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 message types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
	jsonrpc: '2.0';
	id: number | string;
	method: string;
	params?: unknown;
}

export interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: number | string;
	result?: unknown;
	error?: JsonRpcError;
}

export interface JsonRpcNotification {
	jsonrpc: '2.0';
	method: string;
	params?: unknown;
}

export interface JsonRpcError {
	code: number;
	message: string;
	data?: unknown;
}

// ---------------------------------------------------------------------------
// Agent registration configuration
// ---------------------------------------------------------------------------

/** Format of .son-of-anton/agents/acp-agents.json */
export interface AgentRegistryConfig {
	agents: AgentRegistryEntry[];
}

export interface AgentRegistryEntry {
	id: string;
	name: string;
	transport: TransportType;
	command?: string;
	args?: string[];
	url?: string;
	capabilities: AgentCapability[];
	contextWindow?: number;
	costTier: CostTier;
	env?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// ACP Client interface
// ---------------------------------------------------------------------------

/** The primary interface for interacting with ACP agent servers. */
export interface ACPClient {
	// Discovery
	listAgents(): Promise<AgentDescriptor[]>;
	getAgentCapabilities(agentId: string): Promise<AgentCapabilities>;

	// Session management
	createSession(agentId: string, config: SessionConfig): Promise<Session>;
	sendMessage(sessionId: string, message: string, context?: SessionContext): Promise<void>;
	pauseSession(sessionId: string): Promise<void>;
	resumeSession(sessionId: string): Promise<void>;
	terminateSession(sessionId: string): Promise<void>;

	// Event stream
	onSessionEvent(sessionId: string, handler: (event: SessionEvent) => void): void;
	offSessionEvent(sessionId: string, handler: (event: SessionEvent) => void): void;

	// Lifecycle
	shutdown(): Promise<void>;
}
