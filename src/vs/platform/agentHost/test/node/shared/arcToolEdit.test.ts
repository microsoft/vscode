/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditArcTracker } from '../../../../../base/common/editArcTracker.js';
import { computeDiffCounts } from '../../../node/diffWorkerMain.js';
import { createArcTextEditFromDiff } from '../../../node/shared/arcToolEdit.js';

suite('Agent Host ARC Tool Edit', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('creates verified ARC edits from existing diff changes', () => {
		assert.deepStrictEqual(createArcTextEditFromDiff([{
			startOffset: 6,
			endOffsetExclusive: 12,
			newText: 'after',
		}], 'value=before', 'value=after'), {
			replacements: [{ start: 6, endExclusive: 12, text: 'after' }]
		});
	});

	test('rejects diff changes that do not reconstruct the result', () => {
		assert.strictEqual(createArcTextEditFromDiff([], 'first\r\nsecond', 'first\nsecond'), undefined);
	});

	for (const eol of ['\n', '\r\n']) {
		test(`excludes unchanged interior text and preserves retention with ${JSON.stringify(eol)}`, () => {
			const middle = Array.from({ length: 100 }, (_, i) => `// unchanged line ${i}`);
			const before = ['const first = 1;', ...middle, 'const last = 2;'].join(eol);
			const after = ['const first = 3;', ...middle, 'const last = 4;'].join(eol);
			const diff = computeDiffCounts(before, after, 5000);
			const edit = createArcTextEditFromDiff(diff.changes, before, after);
			assert.ok(edit);
			const tracker = new EditArcTracker(before, edit);
			const initial = tracker.getValues();
			tracker.handleEdits({ replacements: [{ start: after.indexOf('3'), endExclusive: after.indexOf('3') + 1, text: '5' }] });
			assert.deepStrictEqual({
				hitTimeout: diff.hitTimeout,
				originalCharCount: tracker.getOriginalCharacterCount(),
				initial,
				retained: tracker.getValues(),
			}, {
				hitTimeout: false,
				originalCharCount: 2,
				initial: { arc: 2, insertedLineCounts: 2, deletedLineCounts: 2 },
				retained: { arc: 1, insertedLineCounts: 1, deletedLineCounts: 1 },
			});
		});
	}

	for (const [before, after, characters] of [['', 'new file\n', 9], ['old file\n', '', 0], ['unchanged', 'unchanged', 0]] as const) {
		test(`handles ${JSON.stringify(before)} to ${JSON.stringify(after)}`, () => {
			const edit = createArcTextEditFromDiff(computeDiffCounts(before, after, 5000).changes, before, after);
			assert.ok(edit);
			assert.strictEqual(new EditArcTracker(before, edit).getOriginalCharacterCount(), characters);
		});
	}
});
