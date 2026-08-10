/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IArcTextReplacement } from '../../../../base/common/editArcTracker.js';
import { computeDetailedDiff, computeDiffCounts } from '../../node/diffWorkerMain.js';

suite('Agent Host Diff Worker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns line counts and character edits from one diff', () => {
		const result = computeDiffCounts('alpha\nbeta\ngamma', 'alpha\nBETA\ngamma\nomega', 5_000);

		assert.deepStrictEqual({
			added: result.added,
			removed: result.removed,
			applied: applyChanges('alpha\nbeta\ngamma', result.changes),
			changeCount: result.changes.length,
		}, {
			added: 2,
			removed: 1,
			applied: 'alpha\nBETA\ngamma\nomega',
			changeCount: 2,
		});
	});

	test('detailed diff preserves line endings and whitespace changes', () => {
		const original = 'first  \r\nsecond\r\n';
		const modified = 'first \r\nsecond changed\r\n';
		const result = computeDetailedDiff(original, modified, 5000);

		assert.deepStrictEqual({
			content: applyReplacements(original, result.replacements),
			added: result.added,
			removed: result.removed,
			hitTimeout: result.hitTimeout,
		}, {
			content: modified,
			added: 2,
			removed: 2,
			hitTimeout: false,
		});
	});

	test('detailed diff reconstructs line-ending-only changes', () => {
		const original = 'first\r\nsecond\r\n';
		const modified = 'first\nsecond\n';
		const result = computeDetailedDiff(original, modified, 5000);

		assert.deepStrictEqual({
			content: applyReplacements(original, result.replacements),
			hitTimeout: result.hitTimeout,
		}, {
			content: modified,
			hitTimeout: false,
		});
	});

	test('detailed diff reconstructs mixed content and line-ending changes', () => {
		const original = 'first\r\nsecond\r\nthird\r\n';
		const modified = 'first\nchanged\nthird\n';
		const result = computeDetailedDiff(original, modified, 5000);

		assert.deepStrictEqual({
			content: applyReplacements(original, result.replacements),
			hitTimeout: result.hitTimeout,
		}, {
			content: modified,
			hitTimeout: false,
		});
	});

	test('line counts retain whitespace-insensitive behavior', () => {
		assert.deepStrictEqual(computeDiffCounts('first  \n', 'first \n', 5000), {
			added: 0,
			removed: 0,
			changes: [],
		});
	});
});

function applyChanges(content: string, changes: readonly { startOffset: number; endOffsetExclusive: number; newText: string }[]): string {
	let result = '';
	let lastOffset = 0;
	for (const change of changes) {
		result += content.substring(lastOffset, change.startOffset);
		result += change.newText;
		lastOffset = change.endOffsetExclusive;
	}
	return result + content.substring(lastOffset);
}

function applyReplacements(value: string, replacements: readonly IArcTextReplacement[]): string {
	let result = '';
	let offset = 0;
	for (const replacement of replacements) {
		result += value.substring(offset, replacement.start);
		result += replacement.text;
		offset = replacement.endExclusive;
	}
	return result + value.substring(offset);
}
