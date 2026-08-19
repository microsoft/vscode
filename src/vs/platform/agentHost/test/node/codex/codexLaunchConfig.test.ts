/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildCodexLaunchConfig, buildCodexResumeParams } from '../../../node/codex/codexLaunchConfig.js';

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

	test('resume explicitly binds each session provider', () => {
		assert.deepStrictEqual(buildCodexResumeParams('openai', 'thread-a', {}, undefined, {}, undefined, true), {
			threadId: 'thread-a',
			modelProvider: 'openai',
			config: { 'features.image_generation': true },
		});
		assert.deepStrictEqual(buildCodexResumeParams('vscode-proxy', 'thread-b', { GitHub: { url: 'https://api.githubcopilot.com/mcp/' } }), {
			threadId: 'thread-b',
			modelProvider: 'vscode-proxy',
			config: { 'features.image_generation': false, mcp_servers: { GitHub: { url: 'https://api.githubcopilot.com/mcp/' } } },
		});
		assert.deepStrictEqual(buildCodexResumeParams('openai', 'thread-c', {}, undefined, {
			agents: { Reviewer: { description: 'Reviews', config_file: '/tmp/reviewer.toml' } },
		}, 'Use the selected reviewer instructions.'), {
			threadId: 'thread-c',
			modelProvider: 'openai',
			config: { agents: { Reviewer: { description: 'Reviews', config_file: '/tmp/reviewer.toml' } }, 'features.image_generation': false },
			developerInstructions: 'Use the selected reviewer instructions.',
		});
		assert.deepStrictEqual(buildCodexResumeParams('custom-provider', 'thread-c', {}, ['/repo-a', '/repo-b']), {
			threadId: 'thread-c',
			modelProvider: 'custom-provider',
			cwd: '/repo-a',
			runtimeWorkspaceRoots: ['/repo-a', '/repo-b'],
			config: { 'features.image_generation': false },
		});
	});
});
