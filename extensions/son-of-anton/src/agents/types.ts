/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ModelId } from '../llm/LlmClient';

/**
 * Identifies a specialist agent in the system.
 */
export type AgentHandle =
	| 'anton'
	| 'anton-code'
	| 'anton-test'
	| 'anton-security'
	| 'anton-docs';

/**
 * A subtask decomposed by the orchestrator.
 */
export interface Subtask {
	id: string;
	instruction: string;
	assignee: AgentHandle;
	scopeFiles: string[];
	dependencies: string[];
	status: 'pending' | 'in_progress' | 'completed' | 'failed';
	result?: SubtaskResult;
	retryCount: number;
}

/**
 * Result returned by a specialist agent.
 */
export interface SubtaskResult {
	success: boolean;
	changes: FileChange[];
	summary: string;
	tokenUsage: TokenUsage;
	reviewFeedback?: ReviewFeedback;
}

/**
 * A proposed change to a file.
 */
export interface FileChange {
	filePath: string;
	changeType: 'create' | 'modify' | 'delete';
	content?: string;
	diff?: string;
}

/**
 * Token usage tracking for cost monitoring.
 */
export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	naiveInputTokens: number;
}

/**
 * Feedback from the review agent.
 */
export interface ReviewFeedback {
	passed: boolean;
	checks: ReviewCheck[];
	suggestions: string[];
	confidence: 'high' | 'medium' | 'low';
}

/**
 * Individual check run by the review agent.
 */
export interface ReviewCheck {
	name: string;
	passed: boolean;
	message: string;
	severity: 'error' | 'warning' | 'info';
}

/**
 * Security finding from the security scanner.
 */
export interface SecurityFinding {
	ruleId: string;
	severity: 'critical' | 'high' | 'medium' | 'low';
	message: string;
	filePath: string;
	line?: number;
	suggestedFix?: string;
	blocking: boolean;
}

/**
 * Execution plan produced by the orchestrator.
 */
export interface ExecutionPlan {
	id: string;
	originalRequest: string;
	subtasks: Subtask[];
	scopeDeclaration: ScopeDeclaration;
	approved: boolean;
}

/**
 * Scope declaration mapping specialists to files.
 */
export interface ScopeDeclaration {
	entries: ScopeEntry[];
}

/**
 * A single scope entry mapping an agent to files it will touch.
 */
export interface ScopeEntry {
	agent: AgentHandle;
	files: string[];
	accessType: 'read' | 'write';
}

/**
 * Configuration for an agent participant.
 */
export interface AgentConfig {
	handle: AgentHandle;
	displayName: string;
	description: string;
	defaultModel: ModelId;
	maxRetries: number;
	slashCommands: SlashCommandConfig[];
}

/**
 * A slash command registered for an agent.
 */
export interface SlashCommandConfig {
	name: string;
	description: string;
}

/**
 * Metrics tracked per specialist agent.
 */
export interface AgentMetrics {
	agentHandle: AgentHandle;
	totalInvocations: number;
	firstPassSuccessCount: number;
	totalRetries: number;
	escalationCount: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalNaiveInputTokens: number;
	averageLatencyMs: number;
	failureModes: Map<string, number>;
}

/**
 * A memory entry stored in project memory.
 */
export interface MemoryEntry {
	timestamp: number;
	category: 'decision' | 'convention' | 'warning' | 'context';
	content: string;
	source: string;
}
