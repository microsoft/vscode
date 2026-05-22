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
