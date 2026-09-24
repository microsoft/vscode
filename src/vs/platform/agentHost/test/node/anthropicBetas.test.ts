/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { filterSupportedBetas } from '../../node/claude/anthropicBetas.js';

suite('filterSupportedBetas', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const additionalBeta = 'mid-conversation-output-config-2026-07-01';

	test('allows exact match from supported list', () => {
		assert.strictEqual(filterSupportedBetas('interleaved-thinking-2025-05-14'), `interleaved-thinking-2025-05-14,${additionalBeta}`);
	});

	test('allows prefix match for context-management', () => {
		assert.strictEqual(filterSupportedBetas('context-management-2025-06-27'), `context-management-2025-06-27,${additionalBeta}`);
	});

	test('allows prefix match for advanced-tool-use', () => {
		assert.strictEqual(filterSupportedBetas('advanced-tool-use-2025-11-20'), `advanced-tool-use-2025-11-20,${additionalBeta}`);
	});

	test('allows prefix match for mid-conversation-output-config', () => {
		assert.strictEqual(filterSupportedBetas('mid-conversation-output-config-2026-07-02'), `mid-conversation-output-config-2026-07-02,${additionalBeta}`);
	});

	test('adds the CAPI output-config beta for SDK per-turn control', () => {
		assert.strictEqual(filterSupportedBetas('per-turn-control-2026-07-01'), additionalBeta);
	});

	test('does not duplicate an explicitly requested output-config beta', () => {
		assert.strictEqual(
			filterSupportedBetas('per-turn-control-2026-07-01,mid-conversation-output-config-2026-07-01,per-turn-control-2026-07-01'),
			additionalBeta,
		);
	});

	test('adds additional betas regardless of the SDK per-turn-control version', () => {
		assert.deepStrictEqual(
			['per-turn-control', 'per-turn-control-2026-07-02'].map(filterSupportedBetas),
			[additionalBeta, additionalBeta],
		);
	});

	test('filters out unsupported betas', () => {
		assert.strictEqual(filterSupportedBetas('unsupported-beta-123'), additionalBeta);
	});

	test('filters a comma-separated list to only supported betas', () => {
		assert.strictEqual(
			filterSupportedBetas('interleaved-thinking-2025-05-14,unsupported-beta,context-management-2025-06-27'),
			`interleaved-thinking-2025-05-14,context-management-2025-06-27,${additionalBeta}`,
		);
	});

	test('handles whitespace around commas', () => {
		assert.strictEqual(
			filterSupportedBetas('interleaved-thinking-2025-05-14 , context-management-2025-06-27'),
			`interleaved-thinking-2025-05-14,context-management-2025-06-27,${additionalBeta}`,
		);
	});

	test('keeps additional betas when all supplied betas are unsupported', () => {
		assert.strictEqual(filterSupportedBetas('foo,bar,baz'), additionalBeta);
	});

	test('adds additional betas to an empty header', () => {
		assert.strictEqual(filterSupportedBetas(''), additionalBeta);
	});

	test('rejects supported family without date suffix (date-suffix discipline)', () => {
		assert.deepStrictEqual(
			['interleaved-thinking', 'mid-conversation-output-config'].map(filterSupportedBetas),
			[additionalBeta, additionalBeta],
		);
	});
});
