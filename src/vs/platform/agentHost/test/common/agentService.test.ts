/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../configuration/common/configuration.js';
import { thirdPartyAgentEnabledValue } from '../../../policy/common/copilotManagedSettings.js';
import { AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE, protectedResourcesRequireGitHubCopilotSignIn } from '../../common/agent.js';
import { affectsAgentHostProviderPreference, AgentHostClaudeAgentEnabledSettingId, AgentHostCodexAgentEnabledSettingId, AgentHostOTelEnvVars, AgentHostOTelPolicyState, buildAgentHostOTelEnv, CodexPreferAgentHostEditorSettingId, isAgentEnabled, readAgentHostOTelPolicySettings, sanitizeAgentHostOTelPolicySettings, shouldSurfaceLocalAgentHostProvider } from '../../common/agentService.js';
import type { ProtectedResourceMetadata } from '../../common/state/protocol/state.js';
import { buildChatUri, buildDefaultChatUri, resolveChatUri } from '../../common/state/sessionState.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';

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

	test('native URI helpers preserve legacy schemes without assigning a provider to standard sessions', () => {
		const session = AgentSession.uri('copilotcli', 'mc-test');
		assert.deepStrictEqual({
			session: session.toString(),
			id: AgentSession.id(session),
			provider: AgentSession.provider(session),
			stringProvider: AgentSession.provider(session.toString()),
			legacyProvider: AgentSession.provider('copilotcli:/existing-session'),
			standardProvider: AgentSession.provider('ahp-session:/standard-session'),
			claude: AgentSession.uri('claude', 'unchanged').toString(),
			codex: AgentSession.uri('codex', 'unchanged').toString(),
		}, {
			session: 'copilotcli:/mc-test',
			id: 'mc-test',
			provider: 'copilotcli',
			stringProvider: 'copilotcli',
			legacyProvider: 'copilotcli',
			standardProvider: undefined,
			claude: 'claude:/unchanged',
			codex: 'codex:/unchanged',
		});
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

suite('shouldSurfaceLocalAgentHostProvider', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('surfaces enabled providers and uses window-specific Codex settings', () => {
		const configurationService = new TestConfigurationService({
			[AgentHostClaudeAgentEnabledSettingId]: true,
			[AgentHostCodexAgentEnabledSettingId]: true,
			[CodexPreferAgentHostEditorSettingId]: true,
		});

		assert.deepStrictEqual({
			agentsClaude: shouldSurfaceLocalAgentHostProvider('claude', configurationService, true),
			editorClaude: shouldSurfaceLocalAgentHostProvider('claude', configurationService, false),
			agentsCodex: shouldSurfaceLocalAgentHostProvider('codex', configurationService, true),
			editorCodex: shouldSurfaceLocalAgentHostProvider('codex', configurationService, false),
			otherProvider: shouldSurfaceLocalAgentHostProvider('copilot', configurationService, true),
		}, {
			agentsClaude: true,
			editorClaude: true,
			agentsCodex: true,
			editorCodex: true,
			otherProvider: true,
		});
	});

	test('surfaces Claude when the setting is absent, matching its default', () => {
		const configurationService = new TestConfigurationService();

		assert.deepStrictEqual({
			agentsClaude: shouldSurfaceLocalAgentHostProvider('claude', configurationService, true),
			editorClaude: shouldSurfaceLocalAgentHostProvider('claude', configurationService, false),
		}, {
			agentsClaude: true,
			editorClaude: true,
		});
	});

	test('hides disabled providers in both windows even when the editor prefers Codex', () => {
		const configurationService = new TestConfigurationService({
			[AgentHostClaudeAgentEnabledSettingId]: false,
			[AgentHostCodexAgentEnabledSettingId]: false,
			[CodexPreferAgentHostEditorSettingId]: true,
		});

		assert.deepStrictEqual({
			agentsClaude: shouldSurfaceLocalAgentHostProvider('claude', configurationService, true),
			editorClaude: shouldSurfaceLocalAgentHostProvider('claude', configurationService, false),
			agentsCodex: shouldSurfaceLocalAgentHostProvider('codex', configurationService, true),
			editorCodex: shouldSurfaceLocalAgentHostProvider('codex', configurationService, false),
		}, {
			agentsClaude: false,
			editorClaude: false,
			agentsCodex: false,
			editorCodex: false,
		});
	});

	test('reacts to Codex enablement changes in both windows', () => {
		const event: IConfigurationChangeEvent = {
			source: ConfigurationTarget.DEFAULT,
			affectedKeys: new Set([AgentHostCodexAgentEnabledSettingId]),
			change: { keys: [AgentHostCodexAgentEnabledSettingId], overrides: [] },
			affectsConfiguration: key => key === AgentHostCodexAgentEnabledSettingId,
		};
		assert.deepStrictEqual({
			agentsWindow: affectsAgentHostProviderPreference(event, true),
			editorWindow: affectsAgentHostProviderPreference(event, false),
		}, { agentsWindow: true, editorWindow: true });
	});

	test('preserves editor preference and restores availability when policy is removed', async () => {
		const configurationService = new TestConfigurationService({
			[AgentHostCodexAgentEnabledSettingId]: true,
			[CodexPreferAgentHostEditorSettingId]: false,
		});
		const before = [true, false].map(window => shouldSurfaceLocalAgentHostProvider('codex', configurationService, window));
		await configurationService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, false);
		const governed = [true, false].map(window => shouldSurfaceLocalAgentHostProvider('codex', configurationService, window));
		await configurationService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, true);
		const restored = [true, false].map(window => shouldSurfaceLocalAgentHostProvider('codex', configurationService, window));
		assert.deepStrictEqual({ before, governed, restored }, {
			before: [true, false],
			governed: [false, false],
			restored: [true, false],
		});
	});

	test('managed-settings and preview-feature denials suppress both harnesses on every surface', () => {
		for (const policyData of [
			{ managedSettingsActive: true },
			{ chat_preview_features_enabled: false },
		]) {
			const configurationService = new TestConfigurationService({
				[AgentHostClaudeAgentEnabledSettingId]: thirdPartyAgentEnabledValue(policyData) ?? true,
				[AgentHostCodexAgentEnabledSettingId]: thirdPartyAgentEnabledValue(policyData) ?? true,
				[CodexPreferAgentHostEditorSettingId]: true,
			});
			assert.deepStrictEqual({
				editor: ['claude', 'codex', 'copilot'].map(provider => shouldSurfaceLocalAgentHostProvider(provider, configurationService, false)),
				agents: ['claude', 'codex', 'copilot'].map(provider => shouldSurfaceLocalAgentHostProvider(provider, configurationService, true)),
			}, { editor: [false, false, true], agents: [false, false, true] });
		}
	});
});

suite('buildAgentHostOTelEnv', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('identity policy overrides both settings and environment without enabling telemetry or content', () => {
		for (const captureIdentity of [false, true]) {
			const env = buildAgentHostOTelEnv(
				{ captureIdentity: !captureIdentity },
				{ COPILOT_OTEL_CAPTURE_IDENTITY: String(!captureIdentity) },
				{ captureIdentity },
				{ COPILOT_OTEL_CAPTURE_IDENTITY: String(!captureIdentity) },
			);
			assert.deepStrictEqual(env, { COPILOT_OTEL_CAPTURE_IDENTITY: String(captureIdentity) });
		}
	});

	test('identity omission preserves environment precedence over personal settings', () => {
		assert.deepStrictEqual({
			absent: buildAgentHostOTelEnv({}, {}),
			preference: buildAgentHostOTelEnv({ captureIdentity: true }, {}),
			environment: buildAgentHostOTelEnv({ captureIdentity: false }, { COPILOT_OTEL_CAPTURE_IDENTITY: 'true' }),
		}, {
			absent: {},
			preference: { COPILOT_OTEL_CAPTURE_IDENTITY: 'true' },
			environment: {},
		});
	});

	test('shell identity opt-in does not change content defaults or shell endpoint inheritance', () => {
		const shellEnv = {
			COPILOT_OTEL_CAPTURE_IDENTITY: 'true',
			OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'true',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://shell:4318',
		};
		const overlay = buildAgentHostOTelEnv({ captureIdentity: false, captureContent: false }, {}, {}, shellEnv);
		assert.deepStrictEqual({ ...shellEnv, ...overlay }, {
			COPILOT_OTEL_CAPTURE_IDENTITY: 'true',
			OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'false',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://shell:4318',
		});
	});

	test('resolved shell env overrides only the new identity preference, not existing OTel settings', () => {
		const shellEnv = {
			COPILOT_OTEL_ENABLED: 'false',
			COPILOT_OTEL_EXPORTER_TYPE: 'console',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://shell:4318',
			OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'true',
			COPILOT_OTEL_CAPTURE_IDENTITY: 'false',
			COPILOT_OTEL_FILE_EXPORTER_PATH: 'shell.jsonl',
			COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED: 'false',
		};
		const overlay = buildAgentHostOTelEnv({
			enabled: true,
			exporterType: 'otlp-http',
			otlpEndpoint: 'http://settings:4318',
			captureContent: false,
			captureIdentity: true,
			outfile: 'settings.jsonl',
			dbSpanExporterEnabled: true,
		}, {}, {}, shellEnv);
		assert.deepStrictEqual({ ...shellEnv, ...overlay }, {
			COPILOT_OTEL_ENABLED: 'true',
			COPILOT_OTEL_EXPORTER_TYPE: 'otlp-http',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://settings:4318',
			OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'false',
			COPILOT_OTEL_CAPTURE_IDENTITY: 'false',
			COPILOT_OTEL_FILE_EXPORTER_PATH: 'settings.jsonl',
			COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED: 'true',
		});
	});

	test('managed policy still overrides resolved shell content and endpoint values', () => {
		const shellEnv = {
			COPILOT_OTEL_CAPTURE_IDENTITY: 'true',
			OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'true',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://shell:4318',
		};
		const overlay = buildAgentHostOTelEnv({}, {}, {
			captureIdentity: false,
			captureContent: false,
			otlpEndpoint: 'http://enterprise:4318',
		}, shellEnv);
		assert.deepStrictEqual({ ...shellEnv, ...overlay }, {
			COPILOT_OTEL_CAPTURE_IDENTITY: 'false',
			OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'false',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://enterprise:4318',
			COPILOT_OTEL_FILE_EXPORTER_PATH: '',
		});
	});

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

	test('managed resource attributes serialize into OTEL_RESOURCE_ATTRIBUTES', () => {
		const env = buildAgentHostOTelEnv(
			{},
			{ [AgentHostOTelEnvVars.ResourceAttributes]: 'service.namespace=env' },
			{ resourceAttributes: { 'deployment.environment': 'prod', 'service.namespace': 'acme' } },
		);
		assert.strictEqual(env[AgentHostOTelEnvVars.ResourceAttributes], 'deployment.environment=prod,service.namespace=acme');
	});

	test('empty managed resource attributes emit no override', () => {
		const env = buildAgentHostOTelEnv(
			{},
			{ [AgentHostOTelEnvVars.ResourceAttributes]: 'service.namespace=env' },
			{ resourceAttributes: {} },
		);
		assert.strictEqual(env[AgentHostOTelEnvVars.ResourceAttributes], undefined);
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
			'chat.agentHost.otel.captureIdentity': true,
			'chat.agentHost.otel.outfile': '/tmp/o.jsonl',
			'chat.agentHost.otel.serviceName': 'my-service',
			'chat.agentHost.otel.resourceAttributes': { 'service.namespace': 'acme' },
		});
		assert.deepStrictEqual(readAgentHostOTelPolicySettings(cfg), {
			enabled: true,
			exporterType: 'otlp-http',
			otlpProtocol: 'http/protobuf',
			otlpEndpoint: 'http://localhost:4318',
			captureContent: false,
			captureIdentity: true,
			outfile: '/tmp/o.jsonl',
			serviceName: 'my-service',
			resourceAttributes: { 'service.namespace': 'acme' },
		});
	});

	test('absent policy yields an all-undefined snapshot', () => {
		assert.deepStrictEqual(readAgentHostOTelPolicySettings(fakeConfig({})), {
			enabled: undefined,
			exporterType: undefined,
			otlpProtocol: undefined,
			otlpEndpoint: undefined,
			captureContent: undefined,
			captureIdentity: undefined,
			outfile: undefined,
			serviceName: undefined,
			resourceAttributes: undefined,
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
				captureIdentity: false,
				outfile: '/tmp/o.jsonl',
				serviceName: 'my-service',
				resourceAttributes: { 'service.namespace': 'acme', dropped: 7 },
				bogus: 123,
			}),
			{
				enabled: true,
				exporterType: 'otlp-http',
				otlpProtocol: 'http/protobuf',
				otlpEndpoint: 'http://localhost:4318',
				captureContent: false,
				captureIdentity: false,
				outfile: '/tmp/o.jsonl',
				serviceName: 'my-service',
				resourceAttributes: { 'service.namespace': 'acme' },
			},
		);
	});

	test('mistyped fields are dropped to undefined', () => {
		assert.deepStrictEqual(
			sanitizeAgentHostOTelPolicySettings({ enabled: 'yes', otlpEndpoint: 42, captureContent: 1, captureIdentity: 'false' }),
			{ enabled: undefined, exporterType: undefined, otlpProtocol: undefined, otlpEndpoint: undefined, captureContent: undefined, captureIdentity: undefined, outfile: undefined, serviceName: undefined, resourceAttributes: undefined },
		);
	});

	test('non-object input yields an empty policy', () => {
		assert.deepStrictEqual(sanitizeAgentHostOTelPolicySettings(null), {});
		assert.deepStrictEqual(sanitizeAgentHostOTelPolicySettings('x'), {});
	});

	test('resourceAttributes drop prototype-pollution keys', () => {
		// JSON.parse yields an OWN enumerable `__proto__` data property; the sanitizer must not
		// copy it onto the result (which would trigger the prototype setter).
		const raw = JSON.parse('{"resourceAttributes":{"__proto__":"polluted","constructor":"x","service.namespace":"acme"}}');
		const result = sanitizeAgentHostOTelPolicySettings(raw);
		assert.deepStrictEqual(result.resourceAttributes, { 'service.namespace': 'acme' });
		assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
	});
});

suite('AgentHostOTelPolicyState', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('identity-only changes restart for capture, suppression, and withdrawal after settled refresh', () => {
		const state = new AgentHostOTelPolicyState();
		state.update({}, false);
		for (const captureIdentity of [true, false, undefined, true]) {
			state.didStart();
			const policy = { captureIdentity };
			assert.strictEqual(state.update(policy, true, false), false);
			assert.strictEqual(state.update(policy, true, true), true);
			assert.strictEqual(state.update(policy, true, true), false);
			assert.strictEqual(state.policy?.captureIdentity, captureIdentity);
			const inherited = { COPILOT_OTEL_CAPTURE_IDENTITY: 'true' };
			assert.deepStrictEqual({ ...inherited, ...buildAgentHostOTelEnv({}, inherited, state.policy) }, {
				COPILOT_OTEL_CAPTURE_IDENTITY: String(captureIdentity ?? true),
			});
		}
	});

	test('ignores transient refresh and unresolved window snapshots for a running host', () => {
		const state = new AgentHostOTelPolicyState();
		const policy = { enabled: true, otlpEndpoint: 'https://collector.example' };
		state.update(policy, false);
		state.didStart();
		assert.deepStrictEqual({
			refreshPending: state.update({ enabled: false, otlpEndpoint: '' }, true, false),
			newWindowLoading: state.update({}, true, false),
			refreshComplete: state.update(policy, true, true),
			policy: state.policy,
		}, {
			refreshPending: false,
			newWindowLoading: false,
			refreshComplete: false,
			policy: sanitizeAgentHostOTelPolicySettings(policy),
		});
	});

	test('uses provisional startup policy but never overwrites a settled policy during restart', () => {
		const state = new AgentHostOTelPolicyState();
		const restricted = { enabled: false, otlpEndpoint: '' };
		state.update({}, false, false);
		state.update(restricted, false, false);
		assert.deepStrictEqual(state.policy, sanitizeAgentHostOTelPolicySettings(restricted));
		state.didStart();
		const policy = { enabled: true, otlpEndpoint: 'https://collector.example' };
		assert.deepStrictEqual({
			latePolicy: state.update(policy, true, true),
			pendingDuringRestart: state.update(restricted, false, false),
			policy: state.policy,
		}, {
			latePolicy: true,
			pendingDuringRestart: false,
			policy: sanitizeAgentHostOTelPolicySettings(policy),
		});
	});

	test('applies settled restrictions and policy withdrawal', () => {
		const state = new AgentHostOTelPolicyState();
		state.update({ enabled: true, otlpEndpoint: 'https://collector.example' }, false);
		state.didStart();
		const failedRefresh = state.update({ enabled: false, otlpEndpoint: '' }, true, true);
		state.didStart();
		const withdrawal = state.update({}, true, true);
		assert.deepStrictEqual({ failedRefresh, withdrawal, policy: state.policy }, {
			failedRefresh: true, withdrawal: true, policy: sanitizeAgentHostOTelPolicySettings({}),
		});
	});

	test('restarts once for changed forwarded policy while deduplicating events and windows', () => {
		const state = new AgentHostOTelPolicyState();
		const first = { enabled: true, otlpEndpoint: 'http://localhost:4318' };
		const second = { enabled: true, otlpEndpoint: 'http://localhost:4319' };
		const third = { enabled: true, otlpEndpoint: 'http://localhost:4320' };

		assert.deepStrictEqual({
			initialBeforeStart: state.update(first, false),
			duplicateFromAnotherWindow: state.update(first, true),
			changedWhileRunning: state.update(second, true),
			duplicateConfigurationEvent: state.update(second, true),
			latestWhileRestartPending: state.update(third, true),
			policyBeforeStartCompletes: state.policy,
		}, {
			initialBeforeStart: false,
			duplicateFromAnotherWindow: false,
			changedWhileRunning: true,
			duplicateConfigurationEvent: false,
			latestWhileRestartPending: false,
			policyBeforeStartCompletes: {
				enabled: true,
				exporterType: undefined,
				otlpProtocol: undefined,
				otlpEndpoint: 'http://localhost:4320',
				captureContent: undefined,
				captureIdentity: undefined,
				outfile: undefined,
				serviceName: undefined,
				resourceAttributes: undefined,
			},
		});

		state.didStart();
		assert.deepStrictEqual({
			duplicateAfterRestart: state.update(third, true),
			nextChange: state.update(first, true),
		}, {
			duplicateAfterRestart: false,
			nextChange: true,
		});
	});
});

suite('resolveChatUri', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = AgentSession.uri('copilot', 'sess-1');

	test('default chat collapses onto the scope (session) URI', () => {
		const defaultChat = URI.parse(buildDefaultChatUri(session));
		assert.strictEqual(resolveChatUri(session, defaultChat).toString(), session.toString());
	});

	test('peer chat is addressed by its own URI', () => {
		const peer = URI.parse(buildChatUri(session, 'peer-42'));
		assert.strictEqual(resolveChatUri(session, peer).toString(), peer.toString());
	});
});

suite('protectedResourcesRequireGitHubCopilotSignIn', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const githubCopilotWithoutRequired: ProtectedResourceMetadata = { resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource };
	const githubCopilotRequiredFalse: ProtectedResourceMetadata = { ...GITHUB_COPILOT_PROTECTED_RESOURCE, required: false };
	const otherRequiredResource: ProtectedResourceMetadata = { resource: 'https://api.openai.com', required: true };

	test('derives the requirement from advertised protected resources', () => {
		const scenarios: Record<string, ProtectedResourceMetadata[]> = {
			// Proxy-mode Copilot / Claude: advertises the resource as required.
			copilotRequired: [GITHUB_COPILOT_PROTECTED_RESOURCE],
			// Absent `required` is treated the same as `true`.
			copilotRequiredAbsent: [githubCopilotWithoutRequired],
			// An agent that advertises no protected resources at all.
			noResourcesAdvertised: [],
			// Codex on OpenAI: advertises the resource but marks it optional.
			copilotRequiredFalse: [githubCopilotRequiredFalse],
			// Only unrelated resources are advertised.
			onlyOtherResource: [otherRequiredResource],
			// Mixed: an optional GitHub Copilot resource alongside a required other one.
			optionalCopilotWithOtherRequired: [githubCopilotRequiredFalse, otherRequiredResource],
		};

		const result = Object.fromEntries(
			Object.entries(scenarios).map(([name, resources]) => [name, protectedResourcesRequireGitHubCopilotSignIn(resources)]),
		);

		assert.deepStrictEqual(result, {
			copilotRequired: true,
			copilotRequiredAbsent: true,
			noResourcesAdvertised: false,
			copilotRequiredFalse: false,
			onlyOtherResource: false,
			optionalCopilotWithOtherRequired: false,
		});
	});

	test('the GitHub repo resource alone does not require Copilot sign-in', () => {
		assert.strictEqual(protectedResourcesRequireGitHubCopilotSignIn([GITHUB_REPO_PROTECTED_RESOURCE]), false);
	});
});
