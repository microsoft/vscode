// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

/**
 * Schema for `.son-of-anton/routing.json`.
 *
 * Keys are agent role names (e.g. "orchestrator", "coder", "explorer") or
 * "*" as a catch-all. Each value specifies the primary provider+model and an
 * ordered list of fallback entries tried in sequence on retryable error
 * (§10.1 of AGENTIC_PLATFORM_PLAN.md).
 *
 * Example:
 * ```jsonc
 * {
 *   "orchestrator": {
 *     "primary": { "provider": "anthropic-oauth", "model": "claude-opus-4-7" },
 *     "fallback": [
 *       { "provider": "copilot", "model": "claude-opus" },
 *       { "provider": "anthropic", "model": "claude-opus-4-7" }
 *     ]
 *   }
 * }
 * ```
 */
export type FailoverConfig = Record<string, AgentRoleFailover>;

/** Per-agent-role failover configuration. */
export interface AgentRoleFailover {
	readonly primary: FailoverEntry;
	readonly fallback: readonly FailoverEntry[];
}

/** One entry in a failover chain — a provider ID and the model to use. */
export interface FailoverEntry {
	readonly provider: string;
	readonly model: string;
}
