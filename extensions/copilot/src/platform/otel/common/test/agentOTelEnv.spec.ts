/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { deriveCopilotCliOTelEnv } from '../agentOTelEnv';
import type { OTelConfig } from '../otelConfig';

function makeConfig(overrides: Partial<OTelConfig> = {}): OTelConfig {
	return {
		enabled: true,
		enabledExplicitly: true,
		enabledVia: 'setting',
		exporterType: 'otlp-http',
		otlpEndpoint: 'http://localhost:4318',
		otlpProtocol: 'http/json',
		captureContent: false,
		maxAttributeSizeChars: 0,
		dbSpanExporter: false,
		logLevel: 'info',
		httpInstrumentation: false,
		serviceName: 'copilot-chat',
		serviceVersion: '1.0.0',
		sessionId: 'test-session',
		resourceAttributes: {},
		headers: {},
		...overrides,
	};
}

const emptyEnv: Record<string, string | undefined> = {};

describe('deriveCopilotCliOTelEnv', () => {
	it('returns empty when disabled', () => {
		const result = deriveCopilotCliOTelEnv(makeConfig({ enabled: false }), emptyEnv);
		expect(result).toEqual({});
	});

	it('returns empty in db-only mode (enabled but not enabledExplicitly)', () => {
		const result = deriveCopilotCliOTelEnv(makeConfig({ enabledExplicitly: false, enabledVia: 'dbSpanExporterOnly', dbSpanExporter: true }), emptyEnv);
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
