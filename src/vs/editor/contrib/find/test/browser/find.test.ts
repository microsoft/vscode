/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { getSelectionSearchString } from 'vs/editor/contrib/find/browser/findController';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';


suite('Find', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('search string at position', () => {
		withTestCodeEditor([
			'ABC DEF',
			'0123 456'
		], {}, (editor) => {

			// The cursor is at the very top, of the file, at the first ABC
			const searchStringAtTop = getSelectionSearchString(editor);
			assert.strictEqual(searchStringAtTop, 'ABC');

			// Move cursor to the end of ABC
			editor.setPosition(new Position(1, 3));
			const searchStringAfterABC = getSelectionSearchString(editor);
			assert.strictEqual(searchStringAfterABC, 'ABC');

			// Move cursor to DEF
			editor.setPosition(new Position(1, 5));
			const searchStringInsideDEF = getSelectionSearchString(editor);
			assert.strictEqual(searchStringInsideDEF, 'DEF');

		});
	});

	test('search string with selection', () => {
		withTestCodeEditor([
			'ABC DEF',
			'0123 456'
		], {}, (editor) => {

			// Select A of ABC
			editor.setSelection(new Range(1, 1, 1, 2));
			const searchStringSelectionA = getSelectionSearchString(editor);
			assert.strictEqual(searchStringSelectionA, 'A');

			// Select BC of ABC
			editor.setSelection(new Range(1, 2, 1, 4));
			const searchStringSelectionBC = getSelectionSearchString(editor);
			assert.strictEqual(searchStringSelectionBC, 'BC');

			// Select BC DE
			editor.setSelection(new Range(1, 2, 1, 7));
			const searchStringSelectionBCDE = getSelectionSearchString(editor);
			assert.strictEqual(searchStringSelectionBCDE, 'BC DE');

		});
	});

	test('search string with multiline selection', () => {
		withTestCodeEditor([
			'ABC DEF',
			'0123 456'
		], {}, (editor) => {

			// Select first line and newline
			editor.setSelection(new Range(1, 1, 2, 1));
			const searchStringSelectionWholeLine = getSelectionSearchString(editor);
			assert.strictEqual(searchStringSelectionWholeLine, null);

			// Select first line and chunk of second
			editor.setSelection(new Range(1, 1, 2, 4));
			const searchStringSelectionTwoLines = getSelectionSearchString(editor);
			assert.strictEqual(searchStringSelectionTwoLines, null);

			// Select end of first line newline and chunk of second
			editor.setSelection(new Range(1, 7, 2, 4));
			const searchStringSelectionSpanLines = getSelectionSearchString(editor);
			assert.strictEqual(searchStringSelectionSpanLines, null);

		});
	});

});
