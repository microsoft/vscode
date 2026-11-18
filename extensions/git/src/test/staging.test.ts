/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import assert from 'assert';
import { applyLineChanges, LineChange } from '../staging';

suite('staging', () => {
	suite('applyLineChanges', () => {
		const change = (originalStartLineNumber: number, originalEndLineNumber: number, modifiedStartLineNumber: number, modifiedEndLineNumber: number): LineChange =>
			({ originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber });

		test('applies a modification in the middle of the file', () => {
			assert.strictEqual(
				applyLineChanges('a\nb\nc\n', 'a\nB\nc\n', [change(2, 2, 2, 2)]),
				'a\nB\nc\n');
		});

		test('applies only the selected change, keeping the rest of the base (#64027)', () => {
			// The base already contains the first region (as if it was committed); staging the
			// second region must not revert the first.
			assert.strictEqual(
				applyLineChanges('1x\n2\n3\n4\n5\n6\n', '1x\n2\n3\n4\n5\n6x\n', [change(6, 6, 6, 6)]),
				'1x\n2\n3\n4\n5\n6x\n');
		});

		test('applies an insertion at the end of the file (#59670)', () => {
			assert.strictEqual(
				applyLineChanges('a\nb', 'a\nb\nc', [change(2, 0, 3, 3)]),
				'a\nb\nc');
		});

		test('applies a deletion at the end of the file (#59670)', () => {
			// No trailing newline, so the deleted line is the last line and the end-of-file
			// branch (originalEndLineNumber === lineCount) is exercised.
			assert.strictEqual(
				applyLineChanges('a\nb\nc', 'a\nb', [change(3, 3, 2, 0)]),
				'a\nb');
		});

		test('preserves CRLF line endings', () => {
			assert.strictEqual(
				applyLineChanges('a\r\nb\r\nc\r\n', 'a\r\nB\r\nc\r\n', [change(2, 2, 2, 2)]),
				'a\r\nB\r\nc\r\n');
		});

		test('applies multiple selected changes in a single call', () => {
			assert.strictEqual(
				applyLineChanges('a\nb\nc\nd\n', 'A\nb\nc\nD\n', [change(1, 1, 1, 1), change(4, 4, 4, 4)]),
				'A\nb\nc\nD\n');
		});
	});
});
