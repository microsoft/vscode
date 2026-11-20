/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { getReplCompletionRange, getReplHistoryCompletion } from '../../common/replCompletions.js';

suite('Debug - REPL completions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('DAP completion ranges', () => {
		test('replaces the full range even when it extends past the cursor', () => {
			const model = disposables.add(createTextModel('foo.barxyz'));

			assert.deepStrictEqual(getReplCompletionRange(model, new Position(1, 9), { start: 4, length: 6 }), new Range(1, 5, 1, 11));
		});

		test('honors a start offset of zero', () => {
			const model = disposables.add(createTextModel('foobar'));

			assert.deepStrictEqual(getReplCompletionRange(model, new Position(1, 4), { start: 0, length: 6 }), new Range(1, 1, 1, 7));
		});

		test('interprets start as an offset into the full input', () => {
			const model = disposables.add(createTextModel('foo\nbarxyz'));

			assert.deepStrictEqual(getReplCompletionRange(model, new Position(2, 4), { start: 4, length: 6 }), new Range(2, 1, 2, 7));
		});

		test('rejects ranges starting or ending on another line', () => {
			const model = disposables.add(createTextModel('foo\nbar'));

			assert.strictEqual(getReplCompletionRange(model, new Position(2, 3), { start: 0, length: 3 }), undefined);
			assert.strictEqual(getReplCompletionRange(model, new Position(1, 3), { start: 0, length: 5 }), undefined);
		});

		test('rejects ranges starting after the cursor', () => {
			const model = disposables.add(createTextModel('foobar'));

			assert.strictEqual(getReplCompletionRange(model, new Position(1, 3), { start: 4, length: 2 }), undefined);
		});

		test('extends a range that ends before the cursor up to the cursor', () => {
			// js-debug replaces only the `.` of `obj.ba` when completing a non-identifier property as `["bar!"]`
			const model = disposables.add(createTextModel('obj.ba'));

			assert.deepStrictEqual(getReplCompletionRange(model, new Position(1, 7), { start: 3, length: 1 }), new Range(1, 4, 1, 7));
			assert.deepStrictEqual(getReplCompletionRange(model, new Position(1, 7), { start: 3 }), new Range(1, 4, 1, 7));
		});

		test('without start, replaces characters before the cursor and clamps to the line start', () => {
			const model = disposables.add(createTextModel('foo.bar'));
			const position = new Position(1, 8);

			assert.deepStrictEqual(getReplCompletionRange(model, position, { length: 3 }), new Range(1, 5, 1, 8));
			assert.deepStrictEqual(getReplCompletionRange(model, position, { length: 20 }), new Range(1, 1, 1, 8));
			assert.deepStrictEqual(getReplCompletionRange(model, position, {}), new Range(1, 8, 1, 8));
		});
	});

	suite('History completions', () => {
		test('inserts the whole entry on the first line', () => {
			const model = disposables.add(createTextModel('pr'));
			const entry = 'print(0)\nprint(1)';

			assert.deepStrictEqual(getReplHistoryCompletion(model, new Position(1, 3), entry), {
				insertText: entry,
				range: new Range(1, 1, 1, 3)
			});
		});

		test('only inserts the continuation of preceding lines', () => {
			const model = disposables.add(createTextModel('if True:\n    pr'));

			assert.deepStrictEqual(getReplHistoryCompletion(model, new Position(2, 7), 'if True:\n    print(0)'), {
				insertText: '    print(0)',
				range: new Range(2, 1, 2, 7)
			});
		});

		test('rejects entries that do not continue preceding lines', () => {
			const model = disposables.add(createTextModel('if True:\n    pr'));

			assert.strictEqual(getReplHistoryCompletion(model, new Position(2, 7), 'if False:\n    print(0)'), undefined);
		});

		test('normalizes CRLF history entries when matching and inserting', () => {
			const model = disposables.add(createTextModel('if True:\r\n    pr'));

			assert.deepStrictEqual(getReplHistoryCompletion(model, new Position(2, 7), 'if True:\r\n    print(0)\r\nprint(1)'), {
				insertText: '    print(0)\nprint(1)',
				range: new Range(2, 1, 2, 7)
			});
		});
	});
});
