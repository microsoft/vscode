/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { computeDiffCounts } from '../../node/diffWorkerMain.js';

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
