/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { Handler } from '../../../../common/editorCommon.js';
import { EndOfLineSequence } from '../../../../common/model.js';
import { ReplaceAllCommand } from '../../browser/replaceAllCommand.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';

suite('ReplaceAllCommand', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function testReplaceAll(text: string[], searchRegex: string, replaceString: string, selection: Selection, expectedText: string[], expectedSelection: Selection, eol = EndOfLineSequence.LF): void {
		// With 1000 or more edits, the text buffer combines them into a single edit (#221826)
		for (const extraLineCount of [0, 1000]) {
			withTestCodeEditor([...text, ...Array(extraLineCount).fill('#')], {}, editor => {
				const model = editor.getModel()!;
				model.setEOL(eol);
				editor.setSelection(selection);
				const searchScope = new Range(1, 1, text.length, model.getLineMaxColumn(text.length));
				const ranges = model.findMatches(searchRegex, searchScope, true, true, null, false).map(m => m.range);
				const replaceStrings = ranges.map(() => replaceString);
				for (let i = 0; i < extraLineCount; i++) {
					ranges.push(new Range(text.length + i + 1, 1, text.length + i + 1, 2));
					replaceStrings.push('');
				}

				editor.executeCommand('test', new ReplaceAllCommand(editor.getSelection()!, ranges, replaceStrings));

				const message = `with ${extraLineCount} extra edits`;
				assert.deepStrictEqual(model.getLinesContent().slice(0, model.getLineCount() - extraLineCount), expectedText, message);
				assert.deepStrictEqual(editor.getSelection(), expectedSelection, message);
			});
		}
	}

	test('keeps a selection of unchanged text', () => {
		const text = ['aa XX bb XX cc'];
		const expectedText = ['aa Y bb Y cc'];
		testReplaceAll(text, 'XX', 'Y', new Selection(1, 1, 1, 3), expectedText, new Selection(1, 1, 1, 3));
		testReplaceAll(text, 'XX', 'Y', new Selection(1, 7, 1, 9), expectedText, new Selection(1, 6, 1, 8));
		testReplaceAll(text, 'XX', 'Y', new Selection(1, 15, 1, 13), expectedText, new Selection(1, 13, 1, 11));
		testReplaceAll(['aa XX', 'bb XX', 'cc'], 'XX', 'Y', new Selection(2, 1, 3, 3), ['aa Y', 'bb Y', 'cc'], new Selection(2, 1, 3, 3));
	});

	test('keeps a selection that spans or overlaps replacements', () => {
		const text = ['aa XX bb XX cc'];
		testReplaceAll(text, 'XX', '', new Selection(1, 4, 1, 6), ['aa  bb  cc'], new Selection(1, 4, 1, 4));
		testReplaceAll(text, 'XX', 'Y', new Selection(1, 6, 1, 4), ['aa Y bb Y cc'], new Selection(1, 5, 1, 4));
		testReplaceAll(text, 'XX', 'Y', new Selection(1, 2, 1, 15), ['aa Y bb Y cc'], new Selection(1, 2, 1, 13));
		testReplaceAll(text, 'XX', 'Y', new Selection(1, 5, 1, 11), ['aa Y bb Y cc'], new Selection(1, 5, 1, 10));
		testReplaceAll(text, 'XX', 'YYYY', new Selection(1, 5, 1, 11), ['aa YYYY bb YYYY cc'], new Selection(1, 5, 1, 13));
		testReplaceAll(text, 'XX', 'YYYY', new Selection(1, 4, 1, 6), ['aa YYYY bb YYYY cc'], new Selection(1, 4, 1, 6));
	});

	test('keeps a cursor in or next to a replacement', () => {
		const text = ['aa XX', 'XX'];
		testReplaceAll(text, 'XX', 'Y', new Selection(1, 4, 1, 4), ['aa Y', 'Y'], new Selection(1, 4, 1, 4));
		testReplaceAll(text, 'XX', 'Y', new Selection(1, 5, 1, 5), ['aa Y', 'Y'], new Selection(1, 5, 1, 5));
		testReplaceAll(text, 'XX', 'YYYY', new Selection(1, 5, 1, 5), ['aa YYYY', 'YYYY'], new Selection(1, 5, 1, 5));
		testReplaceAll(text, 'XX', 'YYYY', new Selection(1, 6, 1, 6), ['aa YYYY', 'YYYY'], new Selection(1, 6, 1, 6));
		testReplaceAll(text, 'XX', 'YYYY', new Selection(2, 1, 2, 1), ['aa YYYY', 'YYYY'], new Selection(2, 1, 2, 1));
		testReplaceAll(text, 'XX', '', new Selection(2, 3, 2, 3), ['aa ', ''], new Selection(2, 1, 2, 1));
	});

	test('keeps a cursor next to an insertion', () => {
		testReplaceAll(['aa', '', 'bb'], '^', '> ', new Selection(1, 1, 1, 1), ['> aa', '> ', '> bb'], new Selection(1, 3, 1, 3));
		testReplaceAll(['aa', '', 'bb'], '^', '> ', new Selection(2, 1, 2, 1), ['> aa', '> ', '> bb'], new Selection(2, 1, 2, 1));
		testReplaceAll(['aa', '', 'bb'], '^', '> ', new Selection(3, 1, 3, 3), ['> aa', '> ', '> bb'], new Selection(3, 3, 3, 5));
	});

	test('keeps a selection when replacements add or remove lines', () => {
		testReplaceAll(['aa XX bb XX cc'], 'XX', '\n', new Selection(1, 7, 1, 9), ['aa ', ' bb ', ' cc'], new Selection(2, 2, 2, 4));
		testReplaceAll(['aa XX bb XX cc'], 'XX', 'Y\nZ', new Selection(1, 13, 1, 15), ['aa Y', 'Z bb Y', 'Z cc'], new Selection(3, 3, 3, 5));
		testReplaceAll(['aa X', 'X bb X', 'X cc'], 'X\\nX', '-', new Selection(2, 3, 2, 5), ['aa - bb - cc'], new Selection(1, 6, 1, 8));
		testReplaceAll(['aa X', 'X bb X', 'X cc'], 'X\\nX', '-', new Selection(2, 2, 3, 3), ['aa - bb - cc'], new Selection(1, 5, 1, 11));
	});

	test('keeps a selection in a document with CRLF line endings', () => {
		testReplaceAll(['aa XX bb'], 'XX', 'Y\nZ', new Selection(1, 7, 1, 9), ['aa Y', 'Z bb'], new Selection(2, 3, 2, 5), EndOfLineSequence.CRLF);
		testReplaceAll(['aa XX bb'], 'XX', 'Y\nZ', new Selection(1, 4, 1, 6), ['aa Y', 'Z bb'], new Selection(1, 4, 1, 5), EndOfLineSequence.CRLF);
		testReplaceAll(['aa XX bb'], 'XX', 'Y\nZ', new Selection(1, 4, 1, 6), ['aa Y', 'Z bb'], new Selection(1, 4, 2, 1), EndOfLineSequence.LF);
	});

	test('keeps a selection when auto whitespace on another line is trimmed', () => {
		for (const extraLineCount of [0, 1000]) {
			withTestCodeEditor(['XX', '\taa', 'XX bb', ...Array(extraLineCount).fill('XX')], {}, editor => {
				const model = editor.getModel()!;
				// Leave auto whitespace on line 3, which the next edit trims
				editor.setSelection(new Selection(2, 4, 2, 4));
				editor.trigger('keyboard', Handler.Type, { text: '\n' });
				editor.setSelection(new Selection(4, 4, 4, 6));
				const ranges = model.findMatches('XX', false, false, true, null, false).map(m => m.range);

				editor.executeCommand('test', new ReplaceAllCommand(editor.getSelection()!, ranges, ranges.map(() => 'Y')));

				const message = `with ${extraLineCount} extra edits`;
				assert.deepStrictEqual(model.getLinesContent().slice(0, 4), ['Y', '\taa', '', 'Y bb'], message);
				assert.deepStrictEqual(editor.getSelection(), new Selection(4, 3, 4, 5), message);
			});
		}
	});
});
