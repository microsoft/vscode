/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Hardcoded stubs for the ancillary CAPI/GitHub-API endpoints the agent host's
 * SDK/CLI hits to bootstrap (user discovery, token exchange, model catalog,
 * telemetry). These are boilerplate the SDK just needs *shaped* correctly, so
 * the record/replay proxy never records them — it forwards them to real CAPI
 * while recording (so the run works) and serves these stubs on replay.
 *
 * Keeping them out of the fixtures avoids committing the recorder's identity
 * (login, org membership, enterprise endpoints from `/copilot_internal/user`)
 * and the full internal model catalog, leaving only the readable model turns.
 *
 * `${capi}` in a stub body is rewritten to the proxy's own URL on replay so the
 * SDK keeps talking to the proxy.
 */

/** The placeholder rewritten to the proxy URL on replay (see capiReplayProxy). */
const CAPI = '${capi}';

export interface IStubResponse {
	readonly status: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
}

/** Model ids that must appear in the stub `/models` catalog for the SDK/CLI to
 * proceed on replay: each provider's default plus a few stable public models.
 * Update when a provider's default model changes. */
interface IStubModel {
	readonly id: string;
	readonly vendor: string;
	readonly supportedEndpoints: readonly string[];
	readonly maxContextWindowTokens: number;
	readonly maxOutputTokens: number;
	readonly maxPromptTokens: number;
	readonly vision?: boolean;
	readonly isChatDefault?: boolean;
	readonly isChatFallback?: boolean;
}

const STUB_MODELS: readonly IStubModel[] = [
	// Every family pinned by `copilotPromptsE2E`, plus the provider default and
	// the generic models other suites use. `supportedEndpoints` picks the dialect.
	{ id: 'gpt-5', vendor: 'OpenAI', supportedEndpoints: ['/responses', 'ws:/responses'], maxContextWindowTokens: 400000, maxOutputTokens: 128000, maxPromptTokens: 272000, vision: true },
	{ id: 'gpt-5-mini', vendor: 'OpenAI', supportedEndpoints: ['/responses', 'ws:/responses'], maxContextWindowTokens: 400000, maxOutputTokens: 128000, maxPromptTokens: 272000, vision: true },
	{ id: 'gpt-5-codex', vendor: 'OpenAI', supportedEndpoints: ['/responses', 'ws:/responses'], maxContextWindowTokens: 400000, maxOutputTokens: 128000, maxPromptTokens: 272000, vision: true },
	{ id: 'gpt-5.1', vendor: 'OpenAI', supportedEndpoints: ['/responses', 'ws:/responses'], maxContextWindowTokens: 400000, maxOutputTokens: 128000, maxPromptTokens: 272000, vision: true },
	{ id: 'gpt-5.1-codex', vendor: 'OpenAI', supportedEndpoints: ['/responses', 'ws:/responses'], maxContextWindowTokens: 400000, maxOutputTokens: 128000, maxPromptTokens: 272000, vision: true },
	{ id: 'gpt-5.1-codex-mini', vendor: 'OpenAI', supportedEndpoints: ['/responses', 'ws:/responses'], maxContextWindowTokens: 400000, maxOutputTokens: 128000, maxPromptTokens: 272000, vision: true },
	{ id: 'gpt-5.6-sol', vendor: 'OpenAI', supportedEndpoints: ['/responses', 'ws:/responses'], maxContextWindowTokens: 1050000, maxOutputTokens: 128000, maxPromptTokens: 922000, vision: true },
	{ id: 'gpt-5.6-luna', vendor: 'OpenAI', supportedEndpoints: ['/responses', 'ws:/responses'], maxContextWindowTokens: 1050000, maxOutputTokens: 128000, maxPromptTokens: 922000, vision: true },
	{ id: 'gpt-5.6-terra', vendor: 'OpenAI', supportedEndpoints: ['/responses', 'ws:/responses'], maxContextWindowTokens: 1050000, maxOutputTokens: 128000, maxPromptTokens: 922000, vision: true },
	{ id: 'claude-haiku-4.5', vendor: 'Anthropic', supportedEndpoints: ['/v1/messages', '/chat/completions'], maxContextWindowTokens: 200000, maxOutputTokens: 32000, maxPromptTokens: 168000, vision: true },
	{ id: 'claude-sonnet-4.5', vendor: 'Anthropic', supportedEndpoints: ['/v1/messages', '/chat/completions'], maxContextWindowTokens: 200000, maxOutputTokens: 32000, maxPromptTokens: 168000, vision: true },
	{ id: 'claude-opus-4.5', vendor: 'Anthropic', supportedEndpoints: ['/v1/messages', '/chat/completions'], maxContextWindowTokens: 1000000, maxOutputTokens: 64000, maxPromptTokens: 936000, vision: true },
	{ id: 'claude-sonnet-4.6', vendor: 'Anthropic', supportedEndpoints: ['/v1/messages', '/chat/completions'], maxContextWindowTokens: 1000000, maxOutputTokens: 64000, maxPromptTokens: 936000, vision: true },
	{ id: 'claude-opus-4.6', vendor: 'Anthropic', supportedEndpoints: ['/v1/messages', '/chat/completions'], maxContextWindowTokens: 1000000, maxOutputTokens: 64000, maxPromptTokens: 936000, vision: true },
	{ id: 'claude-opus-4.7', vendor: 'Anthropic', supportedEndpoints: ['/v1/messages', '/chat/completions'], maxContextWindowTokens: 1000000, maxOutputTokens: 64000, maxPromptTokens: 936000, vision: true },
	{ id: 'claude-opus-4.8', vendor: 'Anthropic', supportedEndpoints: ['/v1/messages', '/chat/completions'], maxContextWindowTokens: 1000000, maxOutputTokens: 64000, maxPromptTokens: 936000, vision: true },
	{ id: 'claude-sonnet-5', vendor: 'Anthropic', supportedEndpoints: ['/v1/messages', '/chat/completions'], maxContextWindowTokens: 1000000, maxOutputTokens: 64000, maxPromptTokens: 936000, vision: true },
	{ id: 'claude-opus-5', vendor: 'Anthropic', supportedEndpoints: ['/v1/messages', '/chat/completions'], maxContextWindowTokens: 1000000, maxOutputTokens: 64000, maxPromptTokens: 936000, vision: true },
	{ id: 'gemini-2.0-flash', vendor: 'Google', supportedEndpoints: ['/responses', 'ws:/responses'], maxContextWindowTokens: 1000000, maxOutputTokens: 8192, maxPromptTokens: 128000, vision: true },
	{ id: 'gpt-5.3-codex', vendor: 'OpenAI', supportedEndpoints: ['/responses', 'ws:/responses'], maxContextWindowTokens: 400000, maxOutputTokens: 128000, maxPromptTokens: 272000, vision: true, isChatDefault: true, isChatFallback: true },
	{ id: 'gpt-4o', vendor: 'Azure OpenAI', supportedEndpoints: ['/chat/completions'], maxContextWindowTokens: 128000, maxOutputTokens: 4096, maxPromptTokens: 64000, vision: true },
	{ id: 'gpt-4o-mini', vendor: 'Azure OpenAI', supportedEndpoints: ['/chat/completions'], maxContextWindowTokens: 128000, maxOutputTokens: 4096, maxPromptTokens: 64000 },
];

function expandModel(model: IStubModel): Record<string, unknown> {
	return {
		id: model.id,
		name: model.id,
		object: 'model',
		vendor: model.vendor,
		version: model.id,
		preview: false,
		model_picker_enabled: true,
		is_chat_default: model.isChatDefault ?? false,
		is_chat_fallback: model.isChatFallback ?? false,
		supported_endpoints: model.supportedEndpoints,
		capabilities: {
			type: 'chat',
			family: model.id,
			tokenizer: 'o200k_base',
			object: 'model_capabilities',
			limits: {
				max_context_window_tokens: model.maxContextWindowTokens,
				max_output_tokens: model.maxOutputTokens,
				max_prompt_tokens: model.maxPromptTokens,
			},
			supports: { streaming: true, tool_calls: true, parallel_tool_calls: true, vision: model.vision ?? false, structured_outputs: true },
		},
	};
}

/** A generic, PII-free `/copilot_internal/user` body. */
function userStubBody(): string {
	return JSON.stringify({
		login: 'replay-user',
		access_type_sku: 'copilot_for_business_seat',
		copilot_plan: 'enterprise',
		chat_enabled: true,
		cli_enabled: true,
		copilotignore_enabled: true,
		editor_preview_features_enabled: true,
		is_mcp_enabled: true,
		organization_login_list: [],
		organization_list: [],
		codex_agent_enabled: true,
		cloud_session_storage_enabled: true,
		token_based_billing: true,
		endpoints: { api: CAPI, proxy: CAPI, telemetry: CAPI, 'origin-tracker': CAPI },
		quota_snapshots: quotaSnapshots(),
	});
}

function quotaSnapshots(): Record<string, unknown> {
	const snapshot = { unlimited: true, percent_remaining: 100.0, remaining: 0, entitlement: 0, overage_count: 0, overage_permitted: true, has_quota: true, quota_remaining: 0.0, token_based_billing: true };
	return { chat: { ...snapshot, quota_id: 'chat' }, completions: { ...snapshot, quota_id: 'completions' }, premium_interactions: { ...snapshot, quota_id: 'premium_interactions' } };
}

/** A fake Copilot token pointing back at the proxy. */
function tokenStubBody(): string {
	return JSON.stringify({
		token: 'replay-copilot-token',
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		refresh_in: 1800,
		endpoints: { api: CAPI, proxy: CAPI, telemetry: CAPI },
	});
}

function utilityChatCompletionStubBody(): string {
	return JSON.stringify({
		choices: [{ message: { role: 'assistant', content: 'Generated utility response' }, finish_reason: 'stop', index: 0 }],
	});
}

const JSON_HEADERS: Readonly<Record<string, string>> = { 'content-type': 'application/json' };

/**
 * Returns a stub response for an ancillary bootstrap endpoint, or undefined if
 * the path is a model endpoint that should be recorded/replayed normally.
 */
export function getAncillaryStub(method: string, path: string, body?: string): IStubResponse | undefined {
	if (path === '/chat/completions' && method === 'POST' && isNonStreamingChatCompletion(body)) {
		return isCommitMessageCompletion(body)
			? { status: 200, headers: JSON_HEADERS, body: utilityChatCompletionStubBody() }
			: { status: 403, headers: JSON_HEADERS, body: 'Forbidden' };
	}
	if (path === '/models' && method === 'GET') {
		return { status: 200, headers: JSON_HEADERS, body: JSON.stringify({ data: STUB_MODELS.map(expandModel), object: 'list' }) };
	}
	// The SDK probes websocket support before falling back to POST /responses.
	if (path === '/responses' && method === 'GET') {
		return { status: 400, headers: { 'content-type': 'text/plain' }, body: 'Bad Request' };
	}
	// Auto-mode model-selection endpoints the SDK/agent host probes during model
	// setup: `/models/session/intent` (model router) and `/models/session` (auto
	// model / session token). Replay drives the model turn from the recorded
	// response, so auto-mode selection is neither needed nor wanted here (letting
	// it pick a model could steer the SDK onto an endpoint the fixture never
	// recorded). Answer with the same failure the proxy already returns for an
	// unrecorded call (500 + `x-should-retry: false`) so the SDK falls back to
	// the configured model exactly as it does today — but served as a stub (not
	// recorded, not a strict cache miss) so an SDK bump that starts calling these
	// does not fail the run and no short-lived session token lands in a fixture.
	if ((path === '/models/session' || path === '/models/session/intent') && method === 'POST') {
		return { status: 500, headers: { 'content-type': 'text/plain', 'x-should-retry': 'false' }, body: 'auto-mode not available in replay' };
	}
	// Enterprise MCP registry policy — fetched only when the developer has local
	// MCP servers configured (`~/.copilot/mcp-config.json`), so it varies per
	// machine and must be stubbed, not recorded (issue #325248). Empty registry =
	// no enterprise restrictions, exactly as when none is configured.
	if (path === '/copilot/mcp_registry' && method === 'GET') {
		return { status: 200, headers: JSON_HEADERS, body: JSON.stringify({ mcp_registries: [] }) };
	}
	// The built-in GitHub MCP server shares the CAPI origin and starts alongside
	// each provider. These E2E scenarios do not exercise its tools, so keep it
	// unavailable in replay instead of recording unrelated MCP bootstrap traffic
	// or changing the model-visible tool inventory.
	if ((path === '/mcp' || path === '/mcp/readonly') && method === 'POST') {
		return { status: 404, headers: { 'content-type': 'text/plain', 'x-should-retry': 'false' }, body: 'GitHub MCP is not available in replay' };
	}
	// Codex follows an unavailable MCP response with standard OAuth protected
	// resource and authorization-server discovery. Keep those probes ancillary
	// and unavailable as well; they do not participate in model replay.
	if (method === 'GET' && (path === '/mcp' || path.startsWith('/.well-known/') || path.includes('/.well-known/'))) {
		return { status: 404, headers: { 'content-type': 'text/plain' }, body: 'OAuth metadata is not available in replay' };
	}
	if (path.startsWith('/copilot_internal/')) {
		if (path.includes('/token') || path.includes('/nltoken')) {
			return { status: 200, headers: JSON_HEADERS, body: tokenStubBody() };
		}
		if (path.includes('/user')) {
			return { status: 200, headers: JSON_HEADERS, body: userStubBody() };
		}
		return { status: 200, headers: JSON_HEADERS, body: '{}' };
	}
	if (path === '/telemetry' || path.startsWith('/agents')) {
		return { status: 200, headers: JSON_HEADERS, body: '{}' };
	}
	return undefined;
}

function isNonStreamingChatCompletion(body: string | undefined): boolean {
	if (!body) {
		return false;
	}
	try {
		return JSON.parse(body).stream === false;
	} catch {
		return false;
	}
}

function isCommitMessageCompletion(body: string | undefined): boolean {
	if (!body) {
		return false;
	}
	try {
		const messages = JSON.parse(body).messages;
		return Array.isArray(messages) && messages.some(message =>
			message?.role === 'system'
			&& typeof message.content === 'string'
			&& message.content.includes('You generate concise Git commit messages.')
		);
	} catch {
		return false;
	}
}
