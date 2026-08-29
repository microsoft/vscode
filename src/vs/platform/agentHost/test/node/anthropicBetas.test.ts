/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { filterSupportedBetas } from '../../node/claude/anthropicBetas.js';

suite('filterSupportedBetas', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('allows exact match from supported list', () => {
		assert.strictEqual(filterSupportedBetas('interleaved-thinking-2025-05-14'), 'interleaved-thinking-2025-05-14');
	});

	test('allows prefix match for context-management', () => {
		assert.strictEqual(filterSupportedBetas('context-management-2025-06-27'), 'context-management-2025-06-27');
	});

	test('allows prefix match for advanced-tool-use', () => {
		assert.strictEqual(filterSupportedBetas('advanced-tool-use-2025-11-20'), 'advanced-tool-use-2025-11-20');
	});

	test('filters out unsupported betas', () => {
		assert.strictEqual(filterSupportedBetas('unsupported-beta-123'), undefined);
	});

	test('filters a comma-separated list to only supported betas', () => {
		assert.strictEqual(
			filterSupportedBetas('interleaved-thinking-2025-05-14,unsupported-beta,context-management-2025-06-27'),
			'interleaved-thinking-2025-05-14,context-management-2025-06-27',
		);
	});

	test('handles whitespace around commas', () => {
		assert.strictEqual(
			filterSupportedBetas('interleaved-thinking-2025-05-14 , context-management-2025-06-27'),
			'interleaved-thinking-2025-05-14,context-management-2025-06-27',
		);
	});

	test('returns undefined when all betas are unsupported', () => {
		assert.strictEqual(filterSupportedBetas('foo,bar,baz'), undefined);
	});

	test('returns undefined for empty string', () => {
		assert.strictEqual(filterSupportedBetas(''), undefined);
	});

	test('rejects supported family without date suffix (date-suffix discipline)', () => {
		assert.strictEqual(filterSupportedBetas('interleaved-thinking'), undefined);
	});
});
