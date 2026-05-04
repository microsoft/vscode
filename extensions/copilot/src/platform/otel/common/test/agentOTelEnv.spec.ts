/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { deriveClaudeOTelEnv, deriveCopilotCliOTelEnv } from '../agentOTelEnv';
import type { OTelConfig } from '../otelConfig';

function makeConfig(overrides: Partial<OTelConfig> = {}): OTelConfig {
	return {
		enabled: true,
		enabledExplicitly: true,
		enabledVia: 'setting',
		exporterType: 'otlp-http',
		otlpEndpoint: 'http://localhost:4318',
		otlpProtocol: 'http',
		captureContent: false,
		maxAttributeSizeChars: 0,
		dbSpanExporter: false,
		logLevel: 'info',
		httpInstrumentation: false,
		serviceName: 'copilot-chat',
		serviceVersion: '1.0.0',
		sessionId: 'test-session',
		resourceAttributes: {},
		...overrides,
	};
}

const emptyEnv: Record<string, string | undefined> = {};

describe('deriveCopilotCliOTelEnv', () => {
	it('returns empty when disabled', () => {
		const result = deriveCopilotCliOTelEnv(makeConfig({ enabled: false }), emptyEnv);
		expect(result).toEqual({});
	});

	it('returns correct env vars when enabled', () => {
		const result = deriveCopilotCliOTelEnv(makeConfig(), emptyEnv);
		expect(result).toEqual({
			COPILOT_OTEL_ENABLED: 'true',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
		});
	});

	it('includes capture content var when captureContent is true', () => {
		const result = deriveCopilotCliOTelEnv(makeConfig({ captureContent: true }), emptyEnv);
		expect(result['OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT']).toBe('true');
	});

	it('includes file exporter path when set', () => {
		const result = deriveCopilotCliOTelEnv(makeConfig({ fileExporterPath: '/tmp/otel.jsonl', exporterType: 'file' }), emptyEnv);
		expect(result['COPILOT_OTEL_FILE_EXPORTER_PATH']).toBe('/tmp/otel.jsonl');
		expect(result['COPILOT_OTEL_EXPORTER_TYPE']).toBe('file');
	});

	it('does not set exporter type for non-file exporters', () => {
		const result = deriveCopilotCliOTelEnv(makeConfig({ exporterType: 'otlp-http' }), emptyEnv);
		expect(result['COPILOT_OTEL_EXPORTER_TYPE']).toBeUndefined();
	});

	it('does not overwrite existing env vars', () => {
		const existingEnv: Record<string, string | undefined> = {
			COPILOT_OTEL_ENABLED: 'false',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://custom:9999',
		};
		const result = deriveCopilotCliOTelEnv(makeConfig(), existingEnv);
		expect(result['COPILOT_OTEL_ENABLED']).toBeUndefined();
		expect(result['OTEL_EXPORTER_OTLP_ENDPOINT']).toBeUndefined();
	});

	it('does not include capture content when captureContent is false', () => {
		const result = deriveCopilotCliOTelEnv(makeConfig({ captureContent: false }), emptyEnv);
		expect(result['OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT']).toBeUndefined();
	});
});

describe('deriveClaudeOTelEnv', () => {
	it('returns empty when disabled', () => {
		const result = deriveClaudeOTelEnv(makeConfig({ enabled: false }), emptyEnv);
		expect(result).toEqual({});
	});

	it('returns correct env vars when enabled with HTTP', () => {
		const result = deriveClaudeOTelEnv(makeConfig(), emptyEnv);
		expect(result).toEqual({
			CLAUDE_CODE_ENABLE_TELEMETRY: '1',
			OTEL_METRICS_EXPORTER: 'otlp',
			OTEL_LOGS_EXPORTER: 'otlp',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
			OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
		});
	});

	it('uses gRPC protocol when configured', () => {
		const result = deriveClaudeOTelEnv(makeConfig({ otlpProtocol: 'grpc' }), emptyEnv);
		expect(result['OTEL_EXPORTER_OTLP_PROTOCOL']).toBe('grpc');
	});

	it('includes content capture vars when captureContent is true', () => {
		const result = deriveClaudeOTelEnv(makeConfig({ captureContent: true }), emptyEnv);
		expect(result['OTEL_LOG_USER_PROMPTS']).toBe('1');
		expect(result['OTEL_LOG_TOOL_DETAILS']).toBe('1');
	});

	it('does not include content capture vars when captureContent is false', () => {
		const result = deriveClaudeOTelEnv(makeConfig({ captureContent: false }), emptyEnv);
		expect(result['OTEL_LOG_USER_PROMPTS']).toBeUndefined();
		expect(result['OTEL_LOG_TOOL_DETAILS']).toBeUndefined();
	});

	it('does not overwrite existing env vars', () => {
		const existingEnv: Record<string, string | undefined> = {
			CLAUDE_CODE_ENABLE_TELEMETRY: '0',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://custom:9999',
			OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
		};
		const result = deriveClaudeOTelEnv(makeConfig(), existingEnv);
		expect(result['CLAUDE_CODE_ENABLE_TELEMETRY']).toBeUndefined();
		expect(result['OTEL_EXPORTER_OTLP_ENDPOINT']).toBeUndefined();
		expect(result['OTEL_EXPORTER_OTLP_PROTOCOL']).toBeUndefined();
	});

	it('does not include file exporter path (not supported by Claude SDK)', () => {
		const result = deriveClaudeOTelEnv(makeConfig({ fileExporterPath: '/tmp/otel.jsonl' }), emptyEnv);
		expect(result['COPILOT_OTEL_FILE_EXPORTER_PATH']).toBeUndefined();
	});
});
