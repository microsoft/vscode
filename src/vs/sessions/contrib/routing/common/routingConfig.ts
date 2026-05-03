/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * User-editable per-agent routing configuration.
 *
 * Persisted to `.son-of-anton/routing.json` in the workspace root. Each agent
 * role maps to a primary provider/model and an optional fallback chain that
 * the model-router walks on transient failure.
 *
 * This file is intentionally provider-agnostic: it does not validate that a
 * `providerId` corresponds to a connected account, only that the entry is
 * structurally well-formed. Reconciliation against the credential broker
 * happens at routing time inside `services/model-router`.
 */

/** Identifier of a registered agent role (e.g. `orchestrator`, `coder`). */
export type AgentRole = string;

/** Identifier of a provider as understood by the model-router (e.g. `anthropic-oauth`). */
export type ProviderId = string;

/** Identifier of a provider-specific model (e.g. `claude-opus-4-7`). */
export type ModelId = string;

export interface ProviderModelChoice {
	readonly provider: ProviderId;
	readonly model: ModelId;
}

export interface AgentRoute {
	readonly primary: ProviderModelChoice;
	readonly fallback?: ReadonlyArray<ProviderModelChoice>;
}

/** Top-level wire shape for `.son-of-anton/routing.json`. */
export interface RoutingConfig {
	readonly version: 1;
	readonly agents: { readonly [role: string]: AgentRoute };
}

/** Result of parsing a candidate routing config. */
export type ParseResult =
	| { ok: true; config: RoutingConfig }
	| { ok: false; error: string };

const ROUTING_CONFIG_VERSION = 1;

/**
 * Parse a JSON string into a validated RoutingConfig. Returns an error result
 * (rather than throwing) on any structural issue so callers can surface a
 * useful message in the UI.
 */
export function parseRoutingConfig(raw: string): ParseResult {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (err) {
		return { ok: false, error: `Invalid JSON: ${(err as Error).message}` };
	}

	return validateRoutingConfig(value);
}

/**
 * Validate an arbitrary value as a RoutingConfig. Tolerates a missing
 * `version` field (defaults to 1) but rejects any other deviation.
 */
export function validateRoutingConfig(value: unknown): ParseResult {
	if (!isRecord(value)) {
		return { ok: false, error: 'Top-level value must be an object' };
	}

	const version = value['version'];
	if (version !== undefined && version !== ROUTING_CONFIG_VERSION) {
		return { ok: false, error: `Unsupported version: ${String(version)} (expected ${ROUTING_CONFIG_VERSION})` };
	}

	const agents = value['agents'];
	if (!isRecord(agents)) {
		return { ok: false, error: '`agents` must be an object keyed by agent role' };
	}

	const validated: { [role: string]: AgentRoute } = {};
	for (const [role, candidate] of Object.entries(agents)) {
		if (!isAgentRoleId(role)) {
			return { ok: false, error: `Invalid agent role id: "${role}"` };
		}
		const routeResult = validateAgentRoute(candidate);
		if (!routeResult.ok) {
			return { ok: false, error: `agents.${role}: ${routeResult.error}` };
		}
		validated[role] = routeResult.route;
	}

	return { ok: true, config: { version: ROUTING_CONFIG_VERSION, agents: validated } };
}

type RouteValidation =
	| { ok: true; route: AgentRoute }
	| { ok: false; error: string };

function validateAgentRoute(value: unknown): RouteValidation {
	if (!isRecord(value)) {
		return { ok: false, error: 'route must be an object' };
	}

	const primary = validateChoice(value['primary']);
	if (!primary.ok) {
		return { ok: false, error: `primary: ${primary.error}` };
	}

	const fallbackRaw = value['fallback'];
	if (fallbackRaw === undefined) {
		return { ok: true, route: { primary: primary.choice } };
	}
	if (!Array.isArray(fallbackRaw)) {
		return { ok: false, error: 'fallback must be an array' };
	}

	const fallback: ProviderModelChoice[] = [];
	for (let i = 0; i < fallbackRaw.length; i++) {
		const result = validateChoice(fallbackRaw[i]);
		if (!result.ok) {
			return { ok: false, error: `fallback[${i}]: ${result.error}` };
		}
		fallback.push(result.choice);
	}

	return { ok: true, route: { primary: primary.choice, fallback } };
}

type ChoiceValidation =
	| { ok: true; choice: ProviderModelChoice }
	| { ok: false; error: string };

function validateChoice(value: unknown): ChoiceValidation {
	if (!isRecord(value)) {
		return { ok: false, error: 'choice must be an object' };
	}
	const provider = value['provider'];
	const model = value['model'];
	if (typeof provider !== 'string' || provider.length === 0) {
		return { ok: false, error: '`provider` must be a non-empty string' };
	}
	if (typeof model !== 'string' || model.length === 0) {
		return { ok: false, error: '`model` must be a non-empty string' };
	}
	return { ok: true, choice: { provider, model } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const AGENT_ROLE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function isAgentRoleId(value: string): boolean {
	return AGENT_ROLE_ID_PATTERN.test(value);
}

/**
 * Serialise a RoutingConfig to a deterministic, human-friendly JSON string.
 * Agent roles are sorted alphabetically; choices preserve insertion order.
 * Always ends with a trailing newline so the file plays well with editors.
 */
export function serializeRoutingConfig(config: RoutingConfig): string {
	const sortedRoles = Object.keys(config.agents).sort();
	const agents: Record<string, AgentRoute> = {};
	for (const role of sortedRoles) {
		agents[role] = serializeRoute(config.agents[role]);
	}
	const ordered = { version: config.version, agents };
	return JSON.stringify(ordered, undefined, '\t') + '\n';
}

function serializeRoute(route: AgentRoute): AgentRoute {
	const out: { primary: ProviderModelChoice; fallback?: ProviderModelChoice[] } = {
		primary: { provider: route.primary.provider, model: route.primary.model },
	};
	if (route.fallback && route.fallback.length > 0) {
		out.fallback = route.fallback.map(c => ({ provider: c.provider, model: c.model }));
	}
	return out;
}

/**
 * Default routing for a fresh workspace. Mirrors the model-routing guidance in
 * `CLAUDE.md` (Opus for orchestrator, Sonnet for code, Haiku for exploration)
 * and prefers Anthropic-direct so `cache_control` works end-to-end.
 */
export function defaultRoutingConfig(): RoutingConfig {
	return {
		version: ROUTING_CONFIG_VERSION,
		agents: {
			orchestrator: {
				primary: { provider: 'anthropic-oauth', model: 'claude-opus-4-7' },
				fallback: [
					{ provider: 'copilot', model: 'claude-opus' },
					{ provider: 'anthropic-key', model: 'claude-opus-4-7' },
				],
			},
			coder: {
				primary: { provider: 'anthropic-oauth', model: 'claude-sonnet-4-6' },
				fallback: [
					{ provider: 'copilot', model: 'claude-sonnet' },
				],
			},
			explorer: {
				primary: { provider: 'anthropic-oauth', model: 'claude-haiku-4-5' },
			},
			reviewer: {
				primary: { provider: 'anthropic-oauth', model: 'claude-sonnet-4-6' },
			},
			tester: {
				primary: { provider: 'anthropic-oauth', model: 'claude-sonnet-4-6' },
			},
		},
	};
}

/**
 * Replace the route for a single agent, returning a new config. Used by the
 * panel UI to apply edits without mutating the loaded config in place.
 */
export function setAgentRoute(config: RoutingConfig, role: AgentRole, route: AgentRoute): RoutingConfig {
	return {
		version: config.version,
		agents: { ...config.agents, [role]: route },
	};
}

/** Remove an agent's route, falling back to whatever the router decides. */
export function clearAgentRoute(config: RoutingConfig, role: AgentRole): RoutingConfig {
	const next = { ...config.agents };
	delete next[role];
	return { version: config.version, agents: next };
}

/** Provider catalogue surfaced in the UI dropdowns. */
export interface ProviderCatalogueEntry {
	readonly id: ProviderId;
	readonly displayName: string;
	readonly models: ReadonlyArray<{ readonly id: ModelId; readonly displayName: string }>;
}

/**
 * Default provider/model catalogue used by the panel when no live data from
 * the credential broker is available. Mirrors the providers wired up in
 * `services/model-router/src/providers/`.
 */
export const DEFAULT_PROVIDER_CATALOGUE: ReadonlyArray<ProviderCatalogueEntry> = [
	{
		id: 'anthropic-oauth',
		displayName: 'Claude (subscription)',
		models: [
			{ id: 'claude-opus-4-7', displayName: 'Opus 4.7' },
			{ id: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6' },
			{ id: 'claude-haiku-4-5', displayName: 'Haiku 4.5' },
		],
	},
	{
		id: 'anthropic-key',
		displayName: 'Claude (API key)',
		models: [
			{ id: 'claude-opus-4-7', displayName: 'Opus 4.7' },
			{ id: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6' },
			{ id: 'claude-haiku-4-5', displayName: 'Haiku 4.5' },
		],
	},
	{
		id: 'chatgpt-oauth',
		displayName: 'ChatGPT / Codex',
		models: [
			{ id: 'gpt-5-codex', displayName: 'GPT-5 Codex' },
			{ id: 'o4-mini', displayName: 'o4-mini' },
		],
	},
	{
		id: 'copilot',
		displayName: 'GitHub Copilot',
		models: [
			{ id: 'claude-opus', displayName: 'Claude Opus (via Copilot)' },
			{ id: 'claude-sonnet', displayName: 'Claude Sonnet (via Copilot)' },
			{ id: 'gpt-4o', displayName: 'GPT-4o (via Copilot)' },
			{ id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro (via Copilot)' },
		],
	},
	{
		id: 'openai-key',
		displayName: 'OpenAI (API key)',
		models: [
			{ id: 'gpt-4o', displayName: 'GPT-4o' },
			{ id: 'gpt-4o-mini', displayName: 'GPT-4o mini' },
		],
	},
	{
		id: 'openrouter',
		displayName: 'OpenRouter',
		models: [
			{ id: 'anthropic/claude-opus-4-7', displayName: 'Opus 4.7 (via OpenRouter)' },
			{ id: 'openai/gpt-4o', displayName: 'GPT-4o (via OpenRouter)' },
		],
	},
];
