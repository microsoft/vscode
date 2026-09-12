/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildCodexLaunchConfig, buildCodexResumeParams, codexPermissionProfile, codexPermissionProfileOverrides } from '../../../node/codex/codexLaunchConfig.js';

suite('CodexLaunchConfig', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('adds the Copilot proxy and enforces telemetry overrides after extra arguments', () => {
		const config = buildCodexLaunchConfig({ PATH: '/bin', OPENAI_API_KEY: 'personal' }, { baseUrl: 'http://127.0.0.1:1234', nonce: 'nonce' }, ['--log-level=debug', '-c', 'analytics.enabled=true']);
		assert.deepStrictEqual(config.env, { PATH: '/bin', OPENAI_API_KEY: 'nonce', AI_AGENT: 'github_copilot_vscode_agent' });
		assert.ok(config.args.includes('model_providers.vscode-proxy.name="VS Code Proxy"'));
		assert.ok(!config.args.some(argument => argument.startsWith('model_provider=')));
		assert.ok(config.args.includes('model_providers.vscode-proxy.requires_openai_auth=false'));
		assert.ok(config.args.includes('features.image_generation=false'));
		assert.ok(config.args.includes('shell_environment_policy.set.AI_AGENT="github_copilot_vscode_agent"'));
		assert.ok(config.args.includes('--log-level=debug'));
		assert.ok(config.args.indexOf('analytics.enabled=true') < config.args.lastIndexOf('analytics.enabled=false'));
		assert.deepStrictEqual(config.args.slice(-12), [
			'-c', 'analytics.enabled=false',
			'-c', 'feedback.enabled=false',
			'-c', 'otel.log_user_prompt=false',
			'-c', 'otel.trace_exporter="none"',
			'-c', 'otel.exporter="none"',
			'-c', 'otel.metrics_exporter="none"',
		]);
	});

	test('routes traces to loopback and logs/metrics directly to the external sink', () => {
		const config = buildCodexLaunchConfig({}, { baseUrl: 'http://127.0.0.1:1234', nonce: 'nonce' }, [], {
			traces: { endpoint: 'http://127.0.0.1:4567/v1/traces', protocol: 'http/json' },
			external: { endpoint: 'http://collector:4318', protocol: 'http/protobuf', headers: { authorization: 'Bearer test' } },
			captureContent: false,
			resourceAttributes: { 'service.namespace': 'vscode.agent-host', region: 'west us' },
		});
		assert.strictEqual(config.env.OTEL_SERVICE_NAME, undefined);
		assert.strictEqual(config.env.OTEL_RESOURCE_ATTRIBUTES, 'service.namespace=vscode.agent-host,region=west%20us');
		assert.ok(config.args.includes('analytics.enabled=false'));
		assert.ok(config.args.includes('feedback.enabled=false'));
		assert.ok(config.args.includes('otel.log_user_prompt=false'));
		assert.ok(config.args.includes('otel.trace_exporter={ otlp-http = { endpoint = "http://127.0.0.1:4567/v1/traces", protocol = "json" } }'));
		assert.ok(config.args.includes('otel.exporter={ otlp-http = { endpoint = "http://collector:4318/v1/logs", protocol = "binary", headers = { "authorization" = "Bearer test" } } }'));
		assert.ok(config.args.includes('otel.metrics_exporter={ otlp-http = { endpoint = "http://collector:4318/v1/metrics", protocol = "binary", headers = { "authorization" = "Bearer test" } } }'));
	});

	test('keeps gRPC signal endpoints unchanged and uses decoded headers', () => {
		const config = buildCodexLaunchConfig({}, { baseUrl: 'http://127.0.0.1:1234', nonce: 'nonce' }, [], {
			traces: { endpoint: 'https://collector:4317', protocol: 'grpc' },
			external: { endpoint: 'https://collector:4317', protocol: 'grpc', headers: { authorization: 'Bearer test/token' } },
			captureContent: false,
			resourceAttributes: {},
		});
		const expected = '{ otlp-grpc = { endpoint = "https://collector:4317", headers = { "authorization" = "Bearer test/token" } } }';
		assert.ok(config.args.includes(`otel.exporter=${expected}`));
		assert.ok(config.args.includes(`otel.metrics_exporter=${expected}`));
	});

	test('defines workspace-scoped permission profiles after extra arguments', () => {
		const config = buildCodexLaunchConfig({}, { baseUrl: 'http://127.0.0.1:1234', nonce: 'nonce' }, ['-c', 'default_permissions=":danger-full-access"', '-c', 'sandbox_mode="danger-full-access"']);
		const expectedOverrides = codexPermissionProfileOverrides();
		assert.deepStrictEqual({
			profiles: expectedOverrides.map(override => config.args.includes(override)),
			secureDefaultWins: config.args.indexOf('default_permissions=":danger-full-access"') < config.args.indexOf('default_permissions="vscode-workspace"'),
			selection: {
				workspace: codexPermissionProfile('workspace-write', false),
				workspaceWithNetwork: codexPermissionProfile('workspace-write', true),
				readOnly: codexPermissionProfile('read-only', true),
				fullAccess: codexPermissionProfile('danger-full-access', false),
			},
		}, {
			profiles: expectedOverrides.map(() => true),
			secureDefaultWins: true,
			selection: {
				workspace: 'vscode-workspace',
				workspaceWithNetwork: 'vscode-workspace-network',
				readOnly: 'vscode-workspace-read-only',
				fullAccess: ':danger-full-access',
			},
		});
	});

	test('keeps the Linux sandbox bootstrap visible while denying shared temp access on macOS', () => {
		const linuxProfile = codexPermissionProfileOverrides('linux')[1];
		const macProfile = codexPermissionProfileOverrides('darwin')[1];
		const windowsProfiles = codexPermissionProfileOverrides('win32');
		const windowsProfile = windowsProfiles[1];
		assert.deepStrictEqual({
			linux: linuxProfile,
			mac: macProfile,
			windows: windowsProfiles,
			temp: [linuxProfile, macProfile, windowsProfile].map(profile => [profile.includes('":tmpdir" = "write"'), profile.includes('":slash_tmp" = "deny"')]),
		}, {
			linux: 'permissions.vscode-workspace={ extends = ":workspace", filesystem = { ":root" = "deny", ":minimal" = "read", ":tmpdir" = "write", ":slash_tmp" = "read" }, network = { enabled = false } }',
			mac: 'permissions.vscode-workspace={ extends = ":workspace", filesystem = { ":root" = "deny", ":minimal" = "read", ":tmpdir" = "write", ":slash_tmp" = "deny" }, network = { enabled = false } }',
			windows: [
				'default_permissions="vscode-workspace"',
				'permissions.vscode-workspace={ extends = ":workspace", network = { enabled = false } }',
				'permissions.vscode-workspace-network={ extends = "vscode-workspace", network = { enabled = true } }',
				'permissions.vscode-workspace-read-only={ extends = ":read-only" }',
			],
			temp: [[true, false], [true, true], [false, false]],
		});
	});

	test('resume explicitly binds each session model and provider', () => {
		assert.deepStrictEqual(buildCodexResumeParams({ modelProvider: 'openai', modelId: 'native-model' }, 'thread-a', {}, undefined, {}, undefined, true), {
			threadId: 'thread-a',
			model: 'native-model',
			modelProvider: 'openai',
			config: { 'features.default_mode_request_user_input': true, 'features.image_generation': true },
		});
		assert.deepStrictEqual(buildCodexResumeParams({ modelProvider: 'vscode-proxy', modelId: 'copilot-model' }, 'thread-b', { GitHub: { url: 'https://api.githubcopilot.com/mcp/' } }), {
			threadId: 'thread-b',
			model: 'copilot-model',
			modelProvider: 'vscode-proxy',
			config: { 'features.default_mode_request_user_input': true, 'features.image_generation': false, mcp_servers: { GitHub: { url: 'https://api.githubcopilot.com/mcp/' } } },
		});
		assert.deepStrictEqual(buildCodexResumeParams({ modelProvider: 'openai', modelId: 'native-model' }, 'thread-c', {}, undefined, {
			agents: { Reviewer: { description: 'Reviews', config_file: '/tmp/reviewer.toml' } },
		}, 'Use the selected reviewer instructions.'), {
			threadId: 'thread-c',
			model: 'native-model',
			modelProvider: 'openai',
			config: { agents: { Reviewer: { description: 'Reviews', config_file: '/tmp/reviewer.toml' } }, 'features.default_mode_request_user_input': true, 'features.image_generation': false },
			developerInstructions: 'Use the selected reviewer instructions.',
		});
		assert.deepStrictEqual(buildCodexResumeParams({ modelProvider: 'custom-provider', modelId: 'custom-model' }, 'thread-c', {}, ['/repo-a', '/repo-b']), {
			threadId: 'thread-c',
			model: 'custom-model',
			modelProvider: 'custom-provider',
			cwd: '/repo-a',
			runtimeWorkspaceRoots: ['/repo-a', '/repo-b'],
			config: { 'features.default_mode_request_user_input': true, 'features.image_generation': false },
		});
		assert.deepStrictEqual(buildCodexResumeParams({ modelProvider: 'openai', modelId: 'native-model' }, 'thread-d', {}, ['/repo'], {}, undefined, false, {
			approvalPolicy: 'on-request',
			approvalsReviewer: 'auto_review',
			permissions: 'vscode-workspace',
		}), {
			threadId: 'thread-d',
			model: 'native-model',
			modelProvider: 'openai',
			cwd: '/repo',
			runtimeWorkspaceRoots: ['/repo'],
			approvalPolicy: 'on-request',
			approvalsReviewer: 'auto_review',
			permissions: 'vscode-workspace',
			config: { 'features.default_mode_request_user_input': true, 'features.image_generation': false },
		});
	});
});
