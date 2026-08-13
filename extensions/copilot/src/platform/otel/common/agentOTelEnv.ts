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
	// Only forward to subprocess when the user explicitly opted in. In db-only
	// mode the in-process SDK uses NoopSpanExporter; the subprocess has no DB
	// exporter and would silently export to the OTLP endpoint.
	if (!config.enabled || !config.enabledExplicitly) {
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
