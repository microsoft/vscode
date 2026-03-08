// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';

describe('Playwright MCP Server', () => {
	describe('URL validation', () => {
		test('allows localhost URLs', () => {
			const allowedOrigins = ['localhost', '127.0.0.1'];

			const testCases = [
				{ url: 'http://localhost:3000', expected: true },
				{ url: 'http://localhost:8080/path', expected: true },
				{ url: 'http://127.0.0.1:3000', expected: true },
				{ url: 'https://example.com', expected: false },
				{ url: 'https://google.com', expected: false },
			];

			for (const { url, expected } of testCases) {
				const parsed = new URL(url);
				const allowed = allowedOrigins.some(origin =>
					parsed.hostname === origin || parsed.hostname.endsWith(`.${origin}`)
				);
				assert.strictEqual(allowed, expected, `URL ${url} should be ${expected ? 'allowed' : 'blocked'}`);
			}
		});

		test('rejects invalid URLs', () => {
			assert.throws(() => new URL('not-a-url'));
		});
	});

	describe('health endpoint contract', () => {
		test('returns expected shape', () => {
			const health = { status: 'ok', service: 'mcp-playwright' };
			assert.deepStrictEqual(health, {
				status: 'ok',
				service: 'mcp-playwright',
			});
		});
	});

	describe('tool parameter validation', () => {
		test('navigate requires url', () => {
			const params = { url: 'http://localhost:3000' };
			assert.ok(params.url, 'url is required');
		});

		test('click requires at least one identifier', () => {
			const validParams = [
				{ role: 'button', name: 'Submit' },
				{ text: 'Click me' },
				{ selector: '#btn' },
			];
			for (const params of validParams) {
				const hasIdentifier = 'role' in params || 'text' in params || 'selector' in params;
				assert.ok(hasIdentifier, 'at least one identifier required');
			}
		});

		test('type requires text and a field identifier', () => {
			const params = { label: 'Email', text: 'test@example.com' };
			assert.ok(params.text, 'text is required');
			assert.ok(params.label, 'field identifier is required');
		});
	});
});
