/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert, describe, it } from 'vitest';
import { extractSessionId, filterSupportedBetas } from '../claudeLanguageModelServer';

const NONCE = 'vscode-lm-test-nonce';

describe('extractSessionId', () => {
	describe('Authorization Bearer header', () => {
		it('extracts session ID from Bearer token with nonce.sessionId format', () => {
			const result = extractSessionId({ 'authorization': `Bearer ${NONCE}.my-session` }, NONCE);
			assert.deepStrictEqual(result, { valid: true, sessionId: 'my-session' });
		});

		it('returns valid with no session ID for legacy Bearer format', () => {
			const result = extractSessionId({ 'authorization': `Bearer ${NONCE}` }, NONCE);
			assert.deepStrictEqual(result, { valid: true, sessionId: undefined });
		});

		it('returns invalid for wrong Bearer nonce', () => {
			const result = extractSessionId({ 'authorization': 'Bearer wrong-nonce.session' }, NONCE);
			assert.deepStrictEqual(result, { valid: false, sessionId: undefined });
		});

		it('ignores x-api-key and uses Authorization header when both are present', () => {
			// Simulates the case where ANTHROPIC_API_KEY is set in the environment:
			// the SDK sends both x-api-key (real API key) and Authorization: Bearer (nonce).
			// Only the Authorization: Bearer header should be used for auth.
			const result = extractSessionId({
				'x-api-key': 'sk-ant-real-api-key',
				'authorization': `Bearer ${NONCE}.my-session`,
			}, NONCE);
			assert.deepStrictEqual(result, { valid: true, sessionId: 'my-session' });
		});
	});

	describe('missing headers', () => {
		it('returns invalid when no auth headers are present', () => {
			const result = extractSessionId({}, NONCE);
			assert.deepStrictEqual(result, { valid: false, sessionId: undefined });
		});

		it('returns invalid for non-Bearer Authorization header', () => {
			const result = extractSessionId({ 'authorization': `Basic ${NONCE}.session` }, NONCE);
			assert.deepStrictEqual(result, { valid: false, sessionId: undefined });
		});
	});
});

describe('filterSupportedBetas', () => {
	it('allows exact match from supported list', () => {
		assert.strictEqual(filterSupportedBetas('interleaved-thinking-2025-05-14'), 'interleaved-thinking-2025-05-14');
	});

	it('allows prefix match for context-management', () => {
		assert.strictEqual(filterSupportedBetas('context-management-2025-06-27'), 'context-management-2025-06-27');
	});

	it('allows prefix match for advanced-tool-use', () => {
		assert.strictEqual(filterSupportedBetas('advanced-tool-use-2025-11-20'), 'advanced-tool-use-2025-11-20');
	});

	it('filters out unsupported betas', () => {
		assert.strictEqual(filterSupportedBetas('unsupported-beta-123'), undefined);
	});

	it('filters a comma-separated list to only supported betas', () => {
		assert.strictEqual(
			filterSupportedBetas('interleaved-thinking-2025-05-14,unsupported-beta,context-management-2025-06-27'),
			'interleaved-thinking-2025-05-14,context-management-2025-06-27'
		);
	});

	it('handles whitespace around commas', () => {
		assert.strictEqual(
			filterSupportedBetas('interleaved-thinking-2025-05-14 , context-management-2025-06-27'),
			'interleaved-thinking-2025-05-14,context-management-2025-06-27'
		);
	});

	it('returns undefined when all betas are unsupported', () => {
		assert.strictEqual(filterSupportedBetas('foo,bar,baz'), undefined);
	});

	it('returns undefined for empty string', () => {
		assert.strictEqual(filterSupportedBetas(''), undefined);
	});
});
