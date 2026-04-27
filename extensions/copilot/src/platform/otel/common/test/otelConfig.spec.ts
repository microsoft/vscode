/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { resolveOTelConfig, type OTelConfigInput } from '../otelConfig';

function makeInput(overrides: Partial<OTelConfigInput> = {}): OTelConfigInput {
	return {
		env: {},
		extensionVersion: '1.0.0',
		sessionId: 'test-session',
		...overrides,
	};
}

describe('resolveOTelConfig', () => {

	it('returns disabled config by default', () => {
		const config = resolveOTelConfig(makeInput());
		expect(config.enabled).toBe(false);
	});

	it('enables when COPILOT_OTEL_ENABLED=true', () => {
		const config = resolveOTelConfig(makeInput({
			env: { 'COPILOT_OTEL_ENABLED': 'true' },
		}));
		expect(config.enabled).toBe(true);
	});

	it('enables when OTEL_EXPORTER_OTLP_ENDPOINT is set', () => {
		const config = resolveOTelConfig(makeInput({
			env: { 'OTEL_EXPORTER_OTLP_ENDPOINT': 'http://collector:4318' },
		}));
		expect(config.enabled).toBe(true);
		expect(config.otlpEndpoint).toBe('http://collector:4318/');
	});

	it('enables via VS Code setting', () => {
		const config = resolveOTelConfig(makeInput({
			settingEnabled: true,
		}));
		expect(config.enabled).toBe(true);
	});

	it('env COPILOT_OTEL_ENABLED overrides VS Code setting', () => {
		const config = resolveOTelConfig(makeInput({
			env: { 'COPILOT_OTEL_ENABLED': 'false' },
			settingEnabled: true,
		}));
		expect(config.enabled).toBe(false);
	});

	it('disables when vscodeTelemetryLevel is off', () => {
		const config = resolveOTelConfig(makeInput({
			env: { 'COPILOT_OTEL_ENABLED': 'true' },
			vscodeTelemetryLevel: 'off',
		}));
		expect(config.enabled).toBe(false);
	});

	it('uses file exporter when COPILOT_OTEL_FILE_EXPORTER_PATH is set', () => {
		const config = resolveOTelConfig(makeInput({
			env: {
				'COPILOT_OTEL_ENABLED': 'true',
				'COPILOT_OTEL_FILE_EXPORTER_PATH': '/tmp/otel.jsonl',
			},
		}));
		expect(config.enabled).toBe(true);
		expect(config.exporterType).toBe('file');
		expect(config.fileExporterPath).toBe('/tmp/otel.jsonl');
	});

	it('uses VS Code setting for exporter type', () => {
		const config = resolveOTelConfig(makeInput({
			settingEnabled: true,
			settingExporterType: 'console',
		}));
		expect(config.exporterType).toBe('console');
	});

	it('resolves COPILOT_OTEL_CAPTURE_CONTENT', () => {
		const config = resolveOTelConfig(makeInput({
			env: {
				'COPILOT_OTEL_ENABLED': 'true',
				'COPILOT_OTEL_CAPTURE_CONTENT': 'true',
			},
		}));
		expect(config.captureContent).toBe(true);
	});

	it('captureContent env overrides VS Code setting', () => {
		const config = resolveOTelConfig(makeInput({
			env: {
				'COPILOT_OTEL_ENABLED': 'true',
				'COPILOT_OTEL_CAPTURE_CONTENT': 'false',
			},
			settingCaptureContent: true,
		}));
		expect(config.captureContent).toBe(false);
	});

	it('parses OTEL_RESOURCE_ATTRIBUTES', () => {
		const config = resolveOTelConfig(makeInput({
			env: {
				'COPILOT_OTEL_ENABLED': 'true',
				'OTEL_RESOURCE_ATTRIBUTES': 'benchmark.id=test-123,benchmark.name=say_hello',
			},
		}));
		expect(config.resourceAttributes).toEqual({
			'benchmark.id': 'test-123',
			'benchmark.name': 'say_hello',
		});
	});

	it('uses grpc protocol when OTEL_EXPORTER_OTLP_PROTOCOL=grpc', () => {
		const config = resolveOTelConfig(makeInput({
			env: {
				'COPILOT_OTEL_ENABLED': 'true',
				'OTEL_EXPORTER_OTLP_PROTOCOL': 'grpc',
				'OTEL_EXPORTER_OTLP_ENDPOINT': 'http://collector:4317',
			},
		}));
		expect(config.otlpProtocol).toBe('grpc');
		expect(config.exporterType).toBe('otlp-grpc');
		// gRPC should use origin (strip path)
		expect(config.otlpEndpoint).toBe('http://collector:4317');
	});

	it('preserves service version and session id', () => {
		const config = resolveOTelConfig(makeInput({
			settingEnabled: true,
			extensionVersion: '2.5.0',
			sessionId: 'abc-123',
		}));
		expect(config.serviceVersion).toBe('2.5.0');
		expect(config.sessionId).toBe('abc-123');
	});

	it('defaults service name to copilot-chat', () => {
		const config = resolveOTelConfig(makeInput({
			settingEnabled: true,
		}));
		expect(config.serviceName).toBe('copilot-chat');
	});

	it('overrides service name from OTEL_SERVICE_NAME', () => {
		const config = resolveOTelConfig(makeInput({
			env: {
				'COPILOT_OTEL_ENABLED': 'true',
				'OTEL_SERVICE_NAME': 'my-service',
			},
		}));
		expect(config.serviceName).toBe('my-service');
	});

	it('returns frozen config objects', () => {
		const enabled = resolveOTelConfig(makeInput({ settingEnabled: true }));
		const disabled = resolveOTelConfig(makeInput());
		expect(Object.isFrozen(enabled)).toBe(true);
		expect(Object.isFrozen(disabled)).toBe(true);
	});

	describe('enabledVia', () => {

		it('returns disabled when OTel is off', () => {
			const config = resolveOTelConfig(makeInput());
			expect(config.enabledVia).toBe('disabled');
		});

		it('returns envVar when COPILOT_OTEL_ENABLED is set', () => {
			const config = resolveOTelConfig(makeInput({
				env: { 'COPILOT_OTEL_ENABLED': 'true' },
			}));
			expect(config.enabledVia).toBe('envVar');
		});

		it('returns disabled when COPILOT_OTEL_ENABLED=false overrides setting', () => {
			const config = resolveOTelConfig(makeInput({
				env: { 'COPILOT_OTEL_ENABLED': 'false' },
				settingEnabled: true,
			}));
			expect(config.enabledVia).toBe('disabled');
		});

		it('returns dbSpanExporterOnly when COPILOT_OTEL_ENABLED=false but dbSpanExporter is on', () => {
			const config = resolveOTelConfig(makeInput({
				env: { 'COPILOT_OTEL_ENABLED': 'false' },
				settingDbSpanExporter: true,
			}));
			// env var disabled OTel export, but dbSpanExporter keeps SDK loaded
			expect(config.enabledVia).toBe('dbSpanExporterOnly');
		});

		it('returns setting when enabled via VS Code setting', () => {
			const config = resolveOTelConfig(makeInput({
				settingEnabled: true,
			}));
			expect(config.enabledVia).toBe('setting');
		});

		it('returns otlpEndpointEnvVar when enabled via OTEL_EXPORTER_OTLP_ENDPOINT', () => {
			const config = resolveOTelConfig(makeInput({
				env: { 'OTEL_EXPORTER_OTLP_ENDPOINT': 'http://collector:4318' },
			}));
			expect(config.enabledVia).toBe('otlpEndpointEnvVar');
		});

		it('returns dbSpanExporterOnly when only dbSpanExporter is on', () => {
			const config = resolveOTelConfig(makeInput({
				settingDbSpanExporter: true,
			}));
			expect(config.enabledVia).toBe('dbSpanExporterOnly');
		});

		it('returns setting when both dbSpanExporter and setting are on', () => {
			const config = resolveOTelConfig(makeInput({
				settingEnabled: true,
				settingDbSpanExporter: true,
			}));
			expect(config.enabledVia).toBe('setting');
		});

		it('returns envVar when env var takes precedence over dbSpanExporter', () => {
			const config = resolveOTelConfig(makeInput({
				env: { 'COPILOT_OTEL_ENABLED': 'true' },
				settingDbSpanExporter: true,
			}));
			expect(config.enabledVia).toBe('envVar');
		});
	});
});
