/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getNativeCliProxyArguments, getNativeCliProxyEnvironment } from '../../common/nativeCliProxyConfiguration.js';

suite('Native CLI proxy configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const configuration = { leaseId: 'lease', baseUrl: 'http://127.0.0.1:1234', token: 'local-capability', model: 'model-id', settingsFile: '/private/settings.json' };

	test('uses supported CLI flags without SDK, approval bypass, or credentials in argv', () => {
		const claude = getNativeCliProxyArguments('claude', configuration);
		const codex = getNativeCliProxyArguments('codex', configuration);
		assert.deepStrictEqual({
			claude,
			codexModel: codex.slice(0, 4),
			codexEndpoint: codex[5].includes('http://127.0.0.1:1234/v1'),
			codexNativeAuth: codex[5].includes('requires_openai_auth = false'),
			credentialsInArguments: [...claude, ...codex].join(' ').includes(configuration.token),
			headless: [...claude, ...codex].some(argument => ['app-server', '--print', '--dangerously-skip-permissions'].includes(argument)),
		}, { claude: ['--model', 'model-id', '--settings', '/private/settings.json'], codexModel: ['--model', 'model-id', '-c', 'model_provider="vscode-copilot"'], codexEndpoint: true, codexNativeAuth: true, credentialsInArguments: false, headless: false });
	});

	test('selects Copilot explicitly without leaking native account credentials into the gateway', () => {
		const env = getNativeCliProxyEnvironment('claude', configuration);
		assert.deepStrictEqual({
			endpoint: env.ANTHROPIC_BASE_URL,
			credential: env.ANTHROPIC_AUTH_TOKEN,
			nativeKey: env.ANTHROPIC_API_KEY,
			nativeOAuth: env.CLAUDE_CODE_OAUTH_TOKEN,
			bedrock: env.CLAUDE_CODE_USE_BEDROCK,
			codex: getNativeCliProxyEnvironment('codex', configuration),
		}, { endpoint: configuration.baseUrl, credential: configuration.token, nativeKey: '', nativeOAuth: '', bedrock: '0', codex: { VSCODE_CLI_PROXY_TOKEN: configuration.token } });
	});

	test('Claude model aliases remain distinct and resumed CLIs retain their own selected model', () => {
		const models = ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'].map(id => ({ id, name: id }));
		const env = getNativeCliProxyEnvironment('claude', { ...configuration, models });
		assert.deepStrictEqual({
			sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL,
			opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL,
			haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
			claudeResume: getNativeCliProxyArguments('claude', configuration, false),
			codexResumeOverridesModel: getNativeCliProxyArguments('codex', configuration, false).includes('--model'),
		}, {
			sonnet: models[0].id, opus: models[1].id, haiku: models[2].id,
			claudeResume: ['--settings', configuration.settingsFile],
			codexResumeOverridesModel: false,
		});
	});
});
