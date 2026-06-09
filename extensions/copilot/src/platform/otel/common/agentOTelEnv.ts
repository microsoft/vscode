/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { OTelConfig } from './otelConfig';

/**
 * Derives environment variables for the Copilot CLI SDK from the extension's
 * resolved OTel configuration. Only sets variables that are not already present
 * in `process.env`, so explicit user env vars serve as per-agent overrides.
 *
 * Used for both the in-process `LocalSessionManager` (spread into `process.env`)
 * and the terminal CLI session (spread into `TerminalOptions.env`).
 */
export function deriveCopilotCliOTelEnv(config: OTelConfig, env: Record<string, string | undefined> = process.env): Record<string, string> {
	if (!config.enabled) {
		return {};
	}

	const result: Record<string, string> = {};

	if (!env['COPILOT_OTEL_ENABLED']) {
		result['COPILOT_OTEL_ENABLED'] = 'true';
	}
	if (!env['OTEL_EXPORTER_OTLP_ENDPOINT'] && config.otlpEndpoint) {
		result['OTEL_EXPORTER_OTLP_ENDPOINT'] = config.otlpEndpoint;
	}
	if (!env['OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT'] && config.captureContent) {
		result['OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT'] = 'true';
	}
	if (!env['COPILOT_OTEL_FILE_EXPORTER_PATH'] && config.fileExporterPath) {
		result['COPILOT_OTEL_FILE_EXPORTER_PATH'] = config.fileExporterPath;
	}
	if (!env['COPILOT_OTEL_EXPORTER_TYPE'] && config.exporterType === 'file') {
		result['COPILOT_OTEL_EXPORTER_TYPE'] = 'file';
	}
	// Note: Copilot CLI runtime only supports otlp-http (not gRPC).
	// The OTEL_EXPORTER_OTLP_ENDPOINT is used with the HTTP protocol regardless.
	// Standard vars (OTEL_EXPORTER_OTLP_HEADERS, OTEL_RESOURCE_ATTRIBUTES, OTEL_SERVICE_NAME)
	// flow via process.env inheritance — no explicit forwarding needed.

	return result;
}

/**
 * Derives environment variables for the Claude Code subprocess from the
 * extension's resolved OTel configuration. Claude uses different env var names
 * than the Copilot CLI SDK.
 *
 * Only sets variables not already present in `process.env`.
 */
export function deriveClaudeOTelEnv(config: OTelConfig, env: Record<string, string | undefined> = process.env): Record<string, string> {
	if (!config.enabled) {
		return {};
	}

	const result: Record<string, string> = {};

	if (!env['CLAUDE_CODE_ENABLE_TELEMETRY']) {
		result['CLAUDE_CODE_ENABLE_TELEMETRY'] = '1';
	}
	if (!env['OTEL_METRICS_EXPORTER']) {
		result['OTEL_METRICS_EXPORTER'] = 'otlp';
	}
	if (!env['OTEL_LOGS_EXPORTER']) {
		result['OTEL_LOGS_EXPORTER'] = 'otlp';
	}
	if (!env['OTEL_EXPORTER_OTLP_ENDPOINT'] && config.otlpEndpoint) {
		result['OTEL_EXPORTER_OTLP_ENDPOINT'] = config.otlpEndpoint;
	}
	if (!env['OTEL_EXPORTER_OTLP_PROTOCOL']) {
		result['OTEL_EXPORTER_OTLP_PROTOCOL'] = config.otlpProtocol === 'grpc' ? 'grpc' : 'http/json';
	}
	if (config.captureContent) {
		if (!env['OTEL_LOG_USER_PROMPTS']) {
			result['OTEL_LOG_USER_PROMPTS'] = '1';
		}
		if (!env['OTEL_LOG_TOOL_DETAILS']) {
			result['OTEL_LOG_TOOL_DETAILS'] = '1';
		}
	}
	// Claude SDK has no file exporter — skip fileExporterPath.
	// Standard vars (OTEL_EXPORTER_OTLP_HEADERS, OTEL_RESOURCE_ATTRIBUTES) flow via inheritance.

	return result;
}

/**
 * Env-var prefixes considered "OTel-related" for sanitization. Subprocesses
 * spawned outside the {@link deriveCopilotCliOTelEnv}/{@link deriveClaudeOTelEnv}
 * allow-lists (e.g. user-defined hooks, ad-hoc tool helpers) inherit
 * `process.env` by default, which would silently forward the extension's
 * OpenTelemetry configuration to arbitrary programs the user — or a 3rd-party
 * MCP server — never opted into. Pass `process.env` (or any sub-env) through
 * {@link sanitizeOTelEnv} at the spawn boundary to strip these.
 *
 * Prefixes (covers all current and future variants we care about):
 *   - `OTEL_` — standard OpenTelemetry env vars (endpoint, headers, protocol, …)
 *   - `COPILOT_OTEL_` — extension-specific overrides
 *   - `CLAUDE_CODE_ENABLE_TELEMETRY` — Claude Code OTel toggle
 *
 * If you add a new OTel-related env var name in {@link deriveCopilotCliOTelEnv}
 * or {@link deriveClaudeOTelEnv}, update {@link OTEL_ENV_PREFIXES} (or
 * {@link OTEL_ENV_EXACT_NAMES} for non-prefixed names) so the sanitizer keeps
 * pace.
 */
export const OTEL_ENV_PREFIXES: readonly string[] = ['OTEL_', 'COPILOT_OTEL_'];

/** Exact env-var names that are OTel-related but don't share a prefix. */
export const OTEL_ENV_EXACT_NAMES: ReadonlySet<string> = new Set(['CLAUDE_CODE_ENABLE_TELEMETRY']);

/**
 * Returns a shallow copy of {@link env} with all OTel-related variables
 * removed (see {@link OTEL_ENV_PREFIXES} and {@link OTEL_ENV_EXACT_NAMES}).
 *
 * Apply at subprocess boundaries that should NOT receive the extension's
 * OTel configuration — e.g. user-configured hooks, MCP server helpers,
 * and other tool-spawned processes — to prevent silent telemetry
 * propagation. For subprocesses that SHOULD inherit OTel config (the
 * Copilot CLI SDK, Claude Code), use {@link deriveCopilotCliOTelEnv} /
 * {@link deriveClaudeOTelEnv} instead, which compose the right vars
 * explicitly.
 *
 * `undefined` values are preserved (Node's `spawn` treats them as "not set"),
 * so callers can safely splat the result into a `{ ...env, ...extras }` object
 * without changing semantics.
 */
export function sanitizeOTelEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
	const result: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(env)) {
		if (OTEL_ENV_EXACT_NAMES.has(key)) {
			continue;
		}
		let isOtel = false;
		for (const prefix of OTEL_ENV_PREFIXES) {
			if (key.startsWith(prefix)) {
				isOtel = true;
				break;
			}
		}
		if (!isOtel) {
			result[key] = value;
		}
	}
	return result;
}
