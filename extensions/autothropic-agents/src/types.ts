import * as vscode from 'vscode';

export type SessionStatus = 'running' | 'waiting' | 'error' | 'complete' | 'paused' | 'exited';

export interface AgentSession {
	id: string;
	name: string;
	terminal: vscode.Terminal;
	status: SessionStatus;
	color: string;
	graphPosition: { x: number; y: number };
	systemPrompt?: string;
	humanInLoop?: boolean;
	createdAt: number;
}

export type EdgeCondition = 'all' | 'code-changes' | 'errors' | 'summary-only';

export interface SessionEdge {
	id: string;
	from: string;
	to: string;
	condition: EdgeCondition;
	maxIterations: number;
	iterationCount: number;
	lastResetAt: number;
}

export interface TopologyPreset {
	id: string;
	label: string;
	description: string;
	nodes: { name: string; role: string; relativePos: { x: number; y: number } }[];
	edges: { fromIndex: number; toIndex: number; condition?: EdgeCondition; maxIterations?: number }[];
}

export interface SessionMessage {
	id: string;
	fromSessionId: string;
	toSessionId: string;
	content: string;
	timestamp: number;
}

export interface ActivityLogEntry {
	id: string;
	sessionId: string;
	sessionName: string;
	sessionColor: string;
	timestamp: number;
	summary: string;
}

export interface PendingApproval {
	id: string;
	fromSessionId: string;
	toSessionId: string;
	fromSessionName: string;
	toSessionName: string;
	fromSessionColor: string;
	summary: string;
	fullMessage: string;
	timestamp: number;
}

/** Serializable session data (no terminal reference) for persistence and IPC */
export interface SerializableSession {
	id: string;
	name: string;
	status: SessionStatus;
	color: string;
	graphPosition: { x: number; y: number };
	systemPrompt?: string;
	humanInLoop?: boolean;
	createdAt: number;
}
