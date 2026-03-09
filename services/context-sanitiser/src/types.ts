// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

/**
 * Type definitions for the context sanitisation service.
 *
 * Implements prompt injection detection and defence based on source
 * trust levels, pattern matching, and MCP tool description review.
 */

// ---------------------------------------------------------------------------
// Source trust levels
// ---------------------------------------------------------------------------

/**
 * Trust levels assigned to different context sources.
 *
 * | Source                               | Trust Level  | Treatment                          |
 * |--------------------------------------|------------- |------------------------------------|
 * | CLAUDE.md / project constitution     | trusted      | Loaded without sanitisation        |
 * | Project source files (.ts, .py, .rs) | high         | Light sanitisation                 |
 * | Documentation files (README, docs/)  | medium       | Full sanitisation                  |
 * | Dependency source files              | low          | Heavy sanitisation, limit included |
 * | External content (pasted URLs)       | untrusted    | Full sanitisation, always warn     |
 * | MCP tool descriptions/responses      | medium       | Sanitise, flag instruction-like    |
 */
export type TrustLevel = 'trusted' | 'high' | 'medium' | 'low' | 'untrusted';

// ---------------------------------------------------------------------------
// Context source metadata
// ---------------------------------------------------------------------------

export type ContextSourceType =
	| 'system-prompt'
	| 'project-config'
	| 'source-code'
	| 'documentation'
	| 'dependency'
	| 'mcp-tool-description'
	| 'mcp-tool-response'
	| 'user-message'
	| 'external-content'
	| 'extension-context';

export interface ContextSource {
	type: ContextSourceType;
	path?: string;
	origin?: string;
}

// ---------------------------------------------------------------------------
// Sanitisation results
// ---------------------------------------------------------------------------

export interface SanitisationResult {
	/** Sanitised content (with suspicious sections removed or escaped). */
	content: string;
	/** Warnings about suspicious patterns detected. */
	warnings: Warning[];
	/** Whether the content was blocked entirely. */
	blocked: boolean;
	/** Trust level that was applied. */
	trustLevel: TrustLevel;
	/** Number of patterns matched. */
	patternsMatched: number;
}

export interface Warning {
	/** Type of suspicious pattern detected. */
	pattern: string;
	/** Human-readable description. */
	message: string;
	/** Severity: info, warning, or critical. */
	severity: 'info' | 'warning' | 'critical';
	/** Line number where the pattern was found (1-based). */
	line?: number;
	/** The matched text (truncated if long). */
	matchedText?: string;
}

// ---------------------------------------------------------------------------
// MCP tool review
// ---------------------------------------------------------------------------

export interface McpToolReview {
	serverName: string;
	tools: McpToolReviewEntry[];
	overallRisk: 'safe' | 'suspicious' | 'dangerous';
}

export interface McpToolReviewEntry {
	toolName: string;
	description: string;
	warnings: Warning[];
	risk: 'safe' | 'suspicious' | 'dangerous';
}

// ---------------------------------------------------------------------------
// Workspace scan
// ---------------------------------------------------------------------------

export interface WorkspaceScanResult {
	scannedAt: number;
	filesScanned: number;
	findings: WorkspaceFinding[];
}

export interface WorkspaceFinding {
	file: string;
	line: number;
	pattern: string;
	severity: 'info' | 'warning' | 'critical';
	matchedText: string;
}

// ---------------------------------------------------------------------------
// Detection pattern definition
// ---------------------------------------------------------------------------

export interface DetectionPattern {
	/** Unique identifier for this pattern. */
	id: string;
	/** Human-readable description. */
	description: string;
	/** Regular expression to match. */
	regex: RegExp;
	/** Severity when matched. */
	severity: 'info' | 'warning' | 'critical';
	/** Minimum trust level at which this pattern triggers (lower trust = more patterns). */
	minTrustLevel: TrustLevel;
}
