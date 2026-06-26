/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { AgentSession, AgentHostOTelEnvVars, buildAgentHostOTelEnv, isAgentEnabled, readAgentHostOTelPolicySettings, sanitizeAgentHostOTelPolicySettings } from '../../common/agentService.js';

suite('AgentSession namespace', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uri creates a URI with provider as scheme and id as path', () => {
		const session = AgentSession.uri('copilot', 'abc-123');
		assert.strictEqual(session.scheme, 'copilot');
		assert.strictEqual(session.path, '/abc-123');
	});

	test('id extracts the raw session ID from a session URI', () => {
		const session = URI.from({ scheme: 'copilot', path: '/my-session-42' });
		assert.strictEqual(AgentSession.id(session), 'my-session-42');
	});

	test('uri and id are inverse operations', () => {
		const rawId = 'test-session-xyz';
		const session = AgentSession.uri('copilot', rawId);
		assert.strictEqual(AgentSession.id(session), rawId);
	});

	test('provider extracts copilot from a copilot-scheme URI', () => {
		const session = AgentSession.uri('copilot', 'sess-1');
		assert.strictEqual(AgentSession.provider(session), 'copilot');
	});
});

suite('isAgentEnabled', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const cases: ReadonlyArray<{ envValue: string | undefined; defaultEnabled: boolean; expected: boolean; description: string }> = [
		// Fallback to default
		{ envValue: undefined, defaultEnabled: true, expected: true, description: 'undefined falls back to default=true' },
		{ envValue: undefined, defaultEnabled: false, expected: false, description: 'undefined falls back to default=false' },
		{ envValue: '', defaultEnabled: true, expected: true, description: 'empty string falls back to default=true' },
		{ envValue: '', defaultEnabled: false, expected: false, description: 'empty string falls back to default=false' },
		{ envValue: '   ', defaultEnabled: true, expected: true, description: 'whitespace-only falls back to default=true' },
		{ envValue: 'maybe', defaultEnabled: true, expected: true, description: 'unrecognized value falls back to default=true' },
		{ envValue: 'maybe', defaultEnabled: false, expected: false, description: 'unrecognized value falls back to default=false' },
		// Explicit enable
		{ envValue: 'true', defaultEnabled: false, expected: true, description: '"true" enables even when default=false' },
		{ envValue: 'TRUE', defaultEnabled: false, expected: true, description: '"TRUE" is case-insensitive' },
		{ envValue: '  true  ', defaultEnabled: false, expected: true, description: '"true" with whitespace is trimmed' },
		{ envValue: '1', defaultEnabled: false, expected: true, description: '"1" enables even when default=false' },
		// Explicit disable
		{ envValue: 'false', defaultEnabled: true, expected: false, description: '"false" disables even when default=true' },
		{ envValue: 'FALSE', defaultEnabled: true, expected: false, description: '"FALSE" is case-insensitive' },
		{ envValue: '  false  ', defaultEnabled: true, expected: false, description: '"false" with whitespace is trimmed' },
		{ envValue: '0', defaultEnabled: true, expected: false, description: '"0" disables even when default=true' },
	];

	for (const { envValue, defaultEnabled, expected, description } of cases) {
		test(description, () => {
			assert.strictEqual(isAgentEnabled(envValue, defaultEnabled), expected);
		});
	}
});

suite('buildAgentHostOTelEnv', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('enterprise policy wins over inherited env', () => {
		const env = buildAgentHostOTelEnv(
			{ enabled: false },
			{ [AgentHostOTelEnvVars.OtlpEndpoint]: 'http://user:4318' },
			{ enabled: true, otlpEndpoint: 'http://enterprise:4318' },
		);
		assert.strictEqual(env[AgentHostOTelEnvVars.Enabled], 'true');
		assert.strictEqual(env[AgentHostOTelEnvVars.OtlpEndpoint], 'http://enterprise:4318');
	});

	test('managed protocol sets the generic and per-signal protocol env vars', () => {
		const env = buildAgentHostOTelEnv(
			{},
			{ [AgentHostOTelEnvVars.OtlpProtocol]: 'http/json' },
			{ otlpProtocol: 'http/protobuf' },
		);
		assert.strictEqual(env[AgentHostOTelEnvVars.OtlpProtocol], 'http/protobuf');
		assert.strictEqual(env[AgentHostOTelEnvVars.OtlpTracesProtocol], 'http/protobuf');
		assert.strictEqual(env[AgentHostOTelEnvVars.OtlpMetricsProtocol], 'http/protobuf');
	});

	test('policy-disabled blanks endpoint and file export', () => {
		const env = buildAgentHostOTelEnv(
			{ enabled: true, otlpEndpoint: 'http://user:4318' },
			{},
			{ enabled: false },
		);
		assert.strictEqual(env[AgentHostOTelEnvVars.Enabled], 'false');
		assert.strictEqual(env[AgentHostOTelEnvVars.OtlpEndpoint], '');
		assert.strictEqual(env[AgentHostOTelEnvVars.FilePath], '');
	});

	test('managed service name wins over inherited env', () => {
		const env = buildAgentHostOTelEnv(
			{ serviceName: 'user-service' },
			{ [AgentHostOTelEnvVars.ServiceName]: 'env-service' },
			{ serviceName: 'enterprise-service' },
		);
		assert.strictEqual(env[AgentHostOTelEnvVars.ServiceName], 'enterprise-service');
	});

	test('empty managed service name emits no override', () => {
		const env = buildAgentHostOTelEnv(
			{},
			{ [AgentHostOTelEnvVars.ServiceName]: 'env-service' },
			{ serviceName: '' },
		);
		// The builder returns only overrides; leaving the key out preserves the inherited env value.
		assert.strictEqual(env[AgentHostOTelEnvVars.ServiceName], undefined);
	});
});

suite('readAgentHostOTelPolicySettings', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function fakeConfig(policy: Record<string, unknown>): IConfigurationService {
		return {
			inspect: <T>(key: string) => ({ policyValue: policy[key] as T | undefined }),
		} as unknown as IConfigurationService;
	}

	test('maps the policy value of every otel key', () => {
		const cfg = fakeConfig({
			'chat.agentHost.otel.enabled': true,
			'chat.agentHost.otel.exporterType': 'otlp-http',
			'chat.agentHost.otel.otlpProtocol': 'http/protobuf',
			'chat.agentHost.otel.otlpEndpoint': 'http://localhost:4318',
			'chat.agentHost.otel.captureContent': false,
			'chat.agentHost.otel.outfile': '/tmp/o.jsonl',
			'chat.agentHost.otel.serviceName': 'my-service',
		});
		assert.deepStrictEqual(readAgentHostOTelPolicySettings(cfg), {
			enabled: true,
			exporterType: 'otlp-http',
			otlpProtocol: 'http/protobuf',
			otlpEndpoint: 'http://localhost:4318',
			captureContent: false,
			outfile: '/tmp/o.jsonl',
			serviceName: 'my-service',
		});
	});

	test('absent policy yields an all-undefined snapshot', () => {
		assert.deepStrictEqual(readAgentHostOTelPolicySettings(fakeConfig({})), {
			enabled: undefined,
			exporterType: undefined,
			otlpProtocol: undefined,
			otlpEndpoint: undefined,
			captureContent: undefined,
			outfile: undefined,
			serviceName: undefined,
		});
	});
});

suite('sanitizeAgentHostOTelPolicySettings', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps well-typed fields and drops unknown/mistyped ones', () => {
		assert.deepStrictEqual(
			sanitizeAgentHostOTelPolicySettings({
				enabled: true,
				exporterType: 'otlp-http',
				otlpProtocol: 'http/protobuf',
				otlpEndpoint: 'http://localhost:4318',
				captureContent: false,
				outfile: '/tmp/o.jsonl',
				serviceName: 'my-service',
				bogus: 123,
			}),
			{
				enabled: true,
				exporterType: 'otlp-http',
				otlpProtocol: 'http/protobuf',
				otlpEndpoint: 'http://localhost:4318',
				captureContent: false,
				outfile: '/tmp/o.jsonl',
				serviceName: 'my-service',
			},
		);
	});

	test('mistyped fields are dropped to undefined', () => {
		assert.deepStrictEqual(
			sanitizeAgentHostOTelPolicySettings({ enabled: 'yes', otlpEndpoint: 42, captureContent: 1 }),
			{ enabled: undefined, exporterType: undefined, otlpProtocol: undefined, otlpEndpoint: undefined, captureContent: undefined, outfile: undefined, serviceName: undefined },
		);
	});

	test('non-object input yields an empty policy', () => {
		assert.deepStrictEqual(sanitizeAgentHostOTelPolicySettings(null), {});
		assert.deepStrictEqual(sanitizeAgentHostOTelPolicySettings('x'), {});
	});
});
