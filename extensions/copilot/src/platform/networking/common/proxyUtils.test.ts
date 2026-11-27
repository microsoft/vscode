/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getConfiguredProxyUrl, isLLMEndpoint, maybeInterceptUrlThroughProxy } from './proxyUtils';

suite('Proxy Utils', () => {

	suite('isLLMEndpoint', () => {
		test('should detect GitHub Copilot LLM endpoints', () => {
			assert.strictEqual(isLLMEndpoint('https://api.githubcopilot.com/chat/completions'), true);
			assert.strictEqual(isLLMEndpoint('https://api.individual.githubcopilot.com/completions'), true);
			assert.strictEqual(isLLMEndpoint('https://api.business.githubcopilot.com/v1/embeddings'), true);
			assert.strictEqual(isLLMEndpoint('https://api.enterprise.githubcopilot.com/messages'), true);
			assert.strictEqual(isLLMEndpoint('https://api-model-lab.githubcopilot.com/test'), true);
		});

		test('should reject non-LLM endpoints', () => {
			assert.strictEqual(isLLMEndpoint('https://api.github.com/repos'), false);
			assert.strictEqual(isLLMEndpoint('https://example.com/api'), false);
			assert.strictEqual(isLLMEndpoint('https://openai.com/v1/chat/completions'), false);
		});

		test('should handle invalid URLs gracefully', () => {
			assert.strictEqual(isLLMEndpoint('not a valid url'), false);
			assert.strictEqual(isLLMEndpoint(''), false);
		});
	});

	suite('maybeInterceptUrlThroughProxy', () => {
		test('should rewrite URL and add proxy headers', () => {
			const headers: Record<string, string> = {};
			const originalUrl = 'https://api.githubcopilot.com/v1/chat/completions';
			const proxyUrl = 'http://localhost:8787/v1';

			const result = maybeInterceptUrlThroughProxy(originalUrl, proxyUrl, headers);

			// Should redirect to proxy
			assert.strictEqual(result.includes('localhost:8787'), true);
			// Should preserve the path
			assert.strictEqual(result.includes('/v1/chat/completions'), true);
			// Should add original URL header
			assert.strictEqual(headers['X-Original-Url'], originalUrl);
			// Should add original host header
			assert.strictEqual(headers['X-Original-Host'], 'api.githubcopilot.com');
		});

		test('should handle proxy URLs with trailing slash', () => {
			const headers: Record<string, string> = {};
			const originalUrl = 'https://api.githubcopilot.com/v1/completions';
			const proxyUrl = 'http://localhost:8787/v1/';

			const result = maybeInterceptUrlThroughProxy(originalUrl, proxyUrl, headers);

			// Should not create double slashes in path
			assert.strictEqual(result.includes('///'), false);
			assert.strictEqual(headers['X-Original-Url'], originalUrl);
		});

		test('should preserve query parameters', () => {
			const headers: Record<string, string> = {};
			const originalUrl = 'https://api.githubcopilot.com/v1/chat/completions?timeout=30&model=gpt-4';
			const proxyUrl = 'http://localhost:8787/v1';

			const result = maybeInterceptUrlThroughProxy(originalUrl, proxyUrl, headers);

			// Should preserve query string
			assert.strictEqual(result.includes('timeout=30'), true);
			assert.strictEqual(result.includes('model=gpt-4'), true);
		});

		test('should handle invalid URLs gracefully', () => {
			const headers: Record<string, string> = {};
			const result = maybeInterceptUrlThroughProxy('invalid url', 'http://localhost:8787', headers);

			// Should return original URL on error
			assert.strictEqual(result, 'invalid url');
		});

		test('should handle streaming endpoints', () => {
			const headers: Record<string, string> = {};
			const originalUrl = 'https://api.githubcopilot.com/v1/chat/completions';
			const proxyUrl = 'http://localhost:4017/api/v1';

			const result = maybeInterceptUrlThroughProxy(originalUrl, proxyUrl, headers);

			// Should still work for streaming endpoints (proxy handles streaming transparently)
			assert.strictEqual(result.includes('localhost:4017'), true);
			assert.strictEqual(headers['X-Original-Url'], originalUrl);
		});
	});

	suite('getConfiguredProxyUrl', () => {
		test('should read COPILOT_PROXY_URL environment variable', () => {
			const originalEnv = process.env['COPILOT_PROXY_URL'];
			try {
				process.env['COPILOT_PROXY_URL'] = 'http://localhost:8787/v1';
				const result = getConfiguredProxyUrl();
				assert.strictEqual(result, 'http://localhost:8787/v1');
			} finally {
				if (originalEnv !== undefined) {
					process.env['COPILOT_PROXY_URL'] = originalEnv;
				} else {
					delete process.env['COPILOT_PROXY_URL'];
				}
			}
		});

		test('should return undefined when env var is not set', () => {
			const originalEnv = process.env['COPILOT_PROXY_URL'];
			try {
				delete process.env['COPILOT_PROXY_URL'];
				const result = getConfiguredProxyUrl();
				assert.strictEqual(result, undefined);
			} finally {
				if (originalEnv !== undefined) {
					process.env['COPILOT_PROXY_URL'] = originalEnv;
				}
			}
		});

		test('should prefer vsCodeSettingUrl over env var', () => {
			const originalEnv = process.env['COPILOT_PROXY_URL'];
			try {
				process.env['COPILOT_PROXY_URL'] = 'http://env-proxy:8787/v1';
				const result = getConfiguredProxyUrl('http://vscode-setting-proxy:9000/v1');
				assert.strictEqual(result, 'http://vscode-setting-proxy:9000/v1');
			} finally {
				if (originalEnv !== undefined) {
					process.env['COPILOT_PROXY_URL'] = originalEnv;
				} else {
					delete process.env['COPILOT_PROXY_URL'];
				}
			}
		});

		test('should fall back to env var when vsCodeSettingUrl is empty string', () => {
			const originalEnv = process.env['COPILOT_PROXY_URL'];
			try {
				process.env['COPILOT_PROXY_URL'] = 'http://env-proxy:8787/v1';
				const result = getConfiguredProxyUrl('');
				assert.strictEqual(result, 'http://env-proxy:8787/v1');
			} finally {
				if (originalEnv !== undefined) {
					process.env['COPILOT_PROXY_URL'] = originalEnv;
				} else {
					delete process.env['COPILOT_PROXY_URL'];
				}
			}
		});

		test('should return undefined when vsCodeSettingUrl is empty and env var is not set', () => {
			const originalEnv = process.env['COPILOT_PROXY_URL'];
			try {
				delete process.env['COPILOT_PROXY_URL'];
				const result = getConfiguredProxyUrl('');
				assert.strictEqual(result, undefined);
			} finally {
				if (originalEnv !== undefined) {
					process.env['COPILOT_PROXY_URL'] = originalEnv;
				}
			}
		});
	});
});
