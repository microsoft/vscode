/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
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
	| 'anton-e2e'
	| 'anton-security'
	| 'anton-pentest'
	| 'anton-docs'
	| 'anton-ci'
	| 'anton-pr'
	| 'anton-moderniser'
	| 'anton-review'
	| 'anton-spec';

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
 * Feedback from the review agent. The shape evolved with the H3 harness
 * upgrade — the legacy `checks` / `suggestions` / `confidence` fields stay
 * for backward compatibility while the structured `issues` /
 * `suggestedNextStep` / `confidenceInRetrySuccess` fields drive the
 * orchestrator's retry loop. Specialists receiving freeform retry feedback
 * in the past would re-attempt the whole task; with structured issues the
 * specialist can target each one (issue id round-trips into the retry
 * prompt so the agent can cite "addressing issue #2").
 */
export interface ReviewFeedback {
	passed: boolean;
	checks: ReviewCheck[];
	suggestions: string[];
	confidence: 'high' | 'medium' | 'low';
	/**
	 * Structured issue list — the most actionable surface for retries. Each
	 * entry has a stable id, a severity, an optional location, a category,
	 * a description, and an optional proposed fix. Unset on legacy review
	 * outputs (the orchestrator falls back to freeform `suggestions` then).
	 */
	issues?: ReviewIssue[];
	/**
	 * One-sentence directive for what the specialist should do next on
	 * retry. Lifted from the LLM's emitted JSON; the orchestrator surfaces
	 * it as a "Next step:" line in the retry prompt.
	 */
	suggestedNextStep?: string;
	/**
	 * Likelihood (0..1) that a single retry will succeed given the issues
	 * surfaced. The orchestrator may skip the retry early when this is
	 * very low, escalating directly to the developer instead.
	 */
	confidenceInRetrySuccess?: number;
}

/**
 * One actionable issue surfaced by a review pass. The id is stable across
 * retry rounds so a specialist can cite it ("addressing #2") and the chat
 * surface can render an "N issues fixed of M" status banner.
 */
export interface ReviewIssue {
	id: string;
	severity: 'blocker' | 'warning' | 'suggestion';
	category: 'correctness' | 'tests' | 'style' | 'performance' | 'security' | 'integration';
	description: string;
	location?: { file: string; line?: number };
	proposedFix?: string;
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
	/** Optional. Maximum wall-clock time per subtask invocation. Default 5 minutes. */
	readonly perTurnTimeoutMs?: number;
	/** Optional. Consecutive failures for one handle that trip the breaker. Default 3. */
	readonly consecutiveFailureCircuitBreaker?: number;
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

/**
 * OWASP Top 10 categories (2021).
 */
export type OwaspCategory =
	| 'A01-broken-access-control'
	| 'A02-cryptographic-failures'
	| 'A03-injection'
	| 'A04-insecure-design'
	| 'A05-security-misconfiguration'
	| 'A06-vulnerable-components'
	| 'A07-auth-failures'
	| 'A08-software-integrity-failures'
	| 'A09-logging-failures'
	| 'A10-ssrf';

/**
 * A confirmed vulnerability finding from pen testing.
 */
export interface PenTestFinding {
	id: string;
	owaspCategory: OwaspCategory;
	testType: string;
	severity: 'critical' | 'high' | 'medium' | 'low';
	endpoint: string;
	payload: string;
	evidence: string;
	impact: string;
	suggestedFix: string;
	filePath?: string;
	line?: number;
	confirmed: boolean;
	reproducible: boolean;
}

/**
 * Summary of a pen test scan session.
 */
export interface PenTestScanSummary {
	sessionId: string;
	status: 'pending' | 'running' | 'completed' | 'failed';
	findingsCount: number;
	findings: PenTestFinding[];
	startedAt: number;
	completedAt: number | null;
}
