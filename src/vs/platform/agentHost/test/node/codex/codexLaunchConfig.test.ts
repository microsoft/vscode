/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildCodexLaunchConfig, buildCodexResumeParams, isCodexThreadProviderCompatible } from '../../../node/codex/codexLaunchConfig.js';

suite('CodexLaunchConfig', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('copilot config injects proxy credentials and provider overrides', () => {
		const config = buildCodexLaunchConfig('copilot', { PATH: '/bin', OPENAI_API_KEY: 'personal' }, { baseUrl: 'http://127.0.0.1:1234', nonce: 'nonce' }, ['--log-level=debug']);
		assert.deepStrictEqual(config.env, { PATH: '/bin', OPENAI_API_KEY: 'nonce', AI_AGENT: 'github_copilot_vscode_agent' });
		assert.ok(config.args.includes('model_provider="vscode-proxy"'));
		assert.ok(config.args.includes('features.image_generation=false'));
		assert.ok(config.args.includes('shell_environment_policy.set.AI_AGENT="github_copilot_vscode_agent"'));
		assert.strictEqual(config.args.at(-1), '--log-level=debug');
	});

	test('openai config preserves user credentials and omits proxy overrides', () => {
		const config = buildCodexLaunchConfig('openai', { PATH: '/bin', OPENAI_API_KEY: 'personal', CODEX_HOME: '/codex' }, undefined, []);
		assert.deepStrictEqual(config.env, { PATH: '/bin', OPENAI_API_KEY: 'personal', CODEX_HOME: '/codex', AI_AGENT: 'github_copilot_vscode_agent' });
		assert.deepStrictEqual(config.args, [
			'app-server',
			'-c', 'shell_environment_policy.set.AI_AGENT="github_copilot_vscode_agent"',
			'-c', 'features.tool_call_mcp_elicitation=false',
		]);
	});

	test('routes traces to loopback and logs/metrics directly to the external sink', () => {
		const config = buildCodexLaunchConfig('openai', {}, undefined, [], {
			traces: { endpoint: 'http://127.0.0.1:4567/v1/traces', protocol: 'http/json' },
			external: { endpoint: 'http://collector:4318', protocol: 'http/protobuf' },
			captureContent: false,
		});
		assert.ok(config.args.includes('otel.log_user_prompt=false'));
		assert.ok(config.args.includes('otel.trace_exporter={ otlp-http = { endpoint = "http://127.0.0.1:4567/v1/traces", protocol = "json" } }'));
		assert.ok(config.args.includes('otel.exporter={ otlp-http = { endpoint = "http://collector:4318/v1/logs", protocol = "binary" } }'));
		assert.ok(config.args.includes('otel.metrics_exporter={ otlp-http = { endpoint = "http://collector:4318/v1/metrics", protocol = "binary" } }'));
	});

	test('identifies provider-compatible threads', () => {
		assert.deepStrictEqual({
			copilotProxy: isCodexThreadProviderCompatible('copilot', 'vscode-proxy'),
			copilotOpenAI: isCodexThreadProviderCompatible('copilot', 'openai'),
			openAIProxy: isCodexThreadProviderCompatible('openai', 'vscode-proxy'),
			openAIDefault: isCodexThreadProviderCompatible('openai', 'openai'),
			openAICustom: isCodexThreadProviderCompatible('openai', 'custom-provider'),
		}, {
			copilotProxy: true,
			copilotOpenAI: false,
			openAIProxy: false,
			openAIDefault: true,
			openAICustom: true,
		});
	});

	test('resume explicitly binds the compatible provider', () => {
		assert.deepStrictEqual(buildCodexResumeParams('openai', 'thread-a', {}), {
			threadId: 'thread-a',
			modelProvider: 'openai',
		});
		assert.deepStrictEqual(buildCodexResumeParams('copilot', 'thread-b', { GitHub: { url: 'https://api.githubcopilot.com/mcp/' } }), {
			threadId: 'thread-b',
			modelProvider: 'vscode-proxy',
			config: { mcp_servers: { GitHub: { url: 'https://api.githubcopilot.com/mcp/' } } },
		});
		assert.deepStrictEqual(buildCodexResumeParams('openai', 'thread-c', {}, ['/repo-a', '/repo-b']), {
			threadId: 'thread-c',
			modelProvider: 'openai',
			cwd: '/repo-a',
			runtimeWorkspaceRoots: ['/repo-a', '/repo-b'],
		});
	});
});
