/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { TrimTrailingWhitespaceCommand, trimTrailingWhitespace } from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import { Selection } from 'vs/editor/common/core/selection';
import { Position } from 'vs/editor/common/core/position';
import { IIdentifiedSingleEditOperation } from 'vs/editor/common/editorCommon';
import { createInsertDeleteSingleEditOp, createSingleEditOp, getEditOperation } from 'vs/editor/test/common/commands/commandTestUtils';
import { withEditorModel } from 'vs/editor/test/common/editorTestUtils';

function assertTrimTrailingWhitespaceCommand(text: string[], expected: IIdentifiedSingleEditOperation[]): void {
	return withEditorModel(text, (model) => {
		var op = new TrimTrailingWhitespaceCommand(new Selection(1, 1, 1, 1));
		var actual = getEditOperation(model, op);
		assert.deepEqual(actual, expected);
	});
}

function assertTrimTrailingWhitespace(text: string[], cursors: Position[], expected: IIdentifiedSingleEditOperation[]): void {
	return withEditorModel(text, (model) => {
		var actual = trimTrailingWhitespace(model, cursors);
		assert.deepEqual(actual, expected);
	});
}

suite('Editor Commands - Trim Trailing Whitespace Command', () => {

	test('remove trailing whitespace', function () {
		assertTrimTrailingWhitespaceCommand([''], []);
		assertTrimTrailingWhitespaceCommand(['text'], []);
		assertTrimTrailingWhitespaceCommand(['text   '], [createSingleEditOp(null, 1, 5, 1, 8)]);
		assertTrimTrailingWhitespaceCommand(['text\t   '], [createSingleEditOp(null, 1, 5, 1, 9)]);
		assertTrimTrailingWhitespaceCommand(['\t   '], [createSingleEditOp(null, 1, 1, 1, 5)]);
		assertTrimTrailingWhitespaceCommand(['text\t'], [createSingleEditOp(null, 1, 5, 1, 6)]);
		assertTrimTrailingWhitespaceCommand([
			'some text\t',
			'some more text',
			'\t  ',
			'even more text  ',
			'and some mixed\t   \t'
		], [
				createSingleEditOp(null, 1, 10, 1, 11),
				createSingleEditOp(null, 3, 1, 3, 4),
				createSingleEditOp(null, 4, 15, 4, 17),
				createSingleEditOp(null, 5, 15, 5, 20)
			]);


		assertTrimTrailingWhitespace(['text   '], [new Position(1, 1), new Position(1, 2), new Position(1, 3)], [createInsertDeleteSingleEditOp(null, 1, 5, 1, 8)]);
		assertTrimTrailingWhitespace(['text   '], [new Position(1, 1), new Position(1, 5)], [createInsertDeleteSingleEditOp(null, 1, 5, 1, 8)]);
		assertTrimTrailingWhitespace(['text   '], [new Position(1, 1), new Position(1, 5), new Position(1, 6)], [createInsertDeleteSingleEditOp(null, 1, 6, 1, 8)]);
		assertTrimTrailingWhitespace([
			'some text\t',
			'some more text',
			'\t  ',
			'even more text  ',
			'and some mixed\t   \t'
		], [], [
				createInsertDeleteSingleEditOp(null, 1, 10, 1, 11),
				createInsertDeleteSingleEditOp(null, 3, 1, 3, 4),
				createInsertDeleteSingleEditOp(null, 4, 15, 4, 17),
				createInsertDeleteSingleEditOp(null, 5, 15, 5, 20)
			]);
		assertTrimTrailingWhitespace([
			'some text\t',
			'some more text',
			'\t  ',
			'even more text  ',
			'and some mixed\t   \t'
		], [new Position(1, 11), new Position(3, 2), new Position(5, 1), new Position(4, 1), new Position(5, 10)], [
				createInsertDeleteSingleEditOp(null, 3, 2, 3, 4),
				createInsertDeleteSingleEditOp(null, 4, 15, 4, 17),
				createInsertDeleteSingleEditOp(null, 5, 15, 5, 20)
			]);
	});

});

