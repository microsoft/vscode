/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IPosition } from 'vs/editor/common/editorCommon';
import { ISuggestion, ISuggestResult, ISuggestSupport } from 'vs/editor/common/modes';
import { ISuggestionItem } from 'vs/editor/contrib/suggest/common/suggest';
import { CompletionModel } from 'vs/editor/contrib/suggest/common/completionModel';

suite('CompletionModel', function () {

	function createSuggestItem(label: string, overwriteBefore: number, incomplete: boolean = false, position: IPosition = { lineNumber: 1, column: 1 }): ISuggestionItem {

		return new class implements ISuggestionItem {

			position = position;

			suggestion: ISuggestion = {
				label,
				overwriteBefore,
				insertText: label,
				type: 'property'
			};

			container: ISuggestResult = {
				incomplete,
				suggestions: [this.suggestion]
			};

			support: ISuggestSupport = {
				triggerCharacters: [],
				provideCompletionItems(): any {
					return;
				}
			};

			resolve() {
				return null;
			}
		};
	}

	let model: CompletionModel;

	setup(function () {

		model = new CompletionModel([
			createSuggestItem('foo', 3),
			createSuggestItem('Foo', 3),
			createSuggestItem('foo', 2),
		], 1, {
				leadingLineContent: 'foo',
				characterCountDelta: 0
			});
	});

	test('filtering - cached', function () {

		const itemsNow = model.items;
		let itemsThen = model.items;
		assert.ok(itemsNow === itemsThen);

		// still the same context
		model.lineContext = { leadingLineContent: 'foo', characterCountDelta: 0 };
		itemsThen = model.items;
		assert.ok(itemsNow === itemsThen);

		// different context, refilter
		model.lineContext = { leadingLineContent: 'foo1', characterCountDelta: 1 };
		itemsThen = model.items;
		assert.ok(itemsNow !== itemsThen);
	});


	test('complete/incomplete', function () {

		assert.equal(model.incomplete, false);

		let incompleteModel = new CompletionModel([
			createSuggestItem('foo', 3, true),
			createSuggestItem('foo', 2),
		], 1, {
				leadingLineContent: 'foo',
				characterCountDelta: 0
			});
		assert.equal(incompleteModel.incomplete, true);
	});

	test('replaceIncomplete', function () {

		const completeItem = createSuggestItem('foobar', 1, false, { lineNumber: 1, column: 2 });
		const incompleteItem = createSuggestItem('foofoo', 1, true, { lineNumber: 1, column: 2 });

		const model = new CompletionModel([completeItem, incompleteItem], 2, { leadingLineContent: 'foo', characterCountDelta: 0 });
		assert.equal(model.incomplete, true);
		assert.equal(model.items.length, 2);

		const {complete, incomplete} = model.resolveIncompleteInfo();

		assert.equal(incomplete.length, 1);
		assert.ok(incomplete[0] === incompleteItem.support);
		assert.equal(complete.length, 1);
		assert.ok(complete[0] === completeItem);
	});

	function assertTopScore(lineContent: string, expected: number, ...suggestionLabels: string[]): void {

		const model = new CompletionModel(
			suggestionLabels.map(label => createSuggestItem(label, lineContent.length)),
			lineContent.length,
			{
				characterCountDelta: 0,
				leadingLineContent: lineContent
			}
		);

		assert.equal(model.topScoreIdx, expected, `${lineContent}, ACTUAL: ${model.items[model.topScoreIdx].suggestion.label} <> EXPECTED: ${model.items[expected].suggestion.label}`);

	}

	test('top score', function () {

		assertTopScore('Foo', 1, 'foo', 'Foo', 'foo');

		assertTopScore('CC', 1, 'camelCase', 'CamelCase');
		assertTopScore('cC', 0, 'camelCase', 'CamelCase');
		assertTopScore('cC', 1, 'ccfoo', 'camelCase');
		assertTopScore('cC', 1, 'ccfoo', 'camelCase', 'foo-cC-bar');

		// issue #17836
		assertTopScore('p', 0, 'parse', 'posix', 'sep', 'pafdsa', 'path', 'p');
		assertTopScore('pa', 0, 'parse', 'posix', 'sep', 'pafdsa', 'path', 'p');

		// issue #14583
		assertTopScore('log', 3, 'HTMLOptGroupElement', 'ScrollLogicalPosition', 'SVGFEMorphologyElement', 'log');
		assertTopScore('e', 2, 'AbstractWorker', 'ActiveXObject', 'else');

		// issue #14446
		assertTopScore('workbench.sideb', 1, 'workbench.editor.defaultSideBySideLayout', 'workbench.sideBar.location');

		// issue #11423
		assertTopScore('editor.r', 2, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');
		assertTopScore('editor.R', 1, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');
		assertTopScore('Editor.r', 0, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');

		assertTopScore('-mo', 1, '-ms-ime-mode', '-moz-columns');
		// dupe, issue #14861
		assertTopScore('convertModelPosition', 0, 'convertModelPositionToViewPosition', 'convertViewToModelPosition');
		// dupe, issue #14942
		assertTopScore('is', 0, 'isValidViewletId', 'import statement');

	});


	test('proper current word when length=0, #16380', function () {

		model = new CompletionModel([
			createSuggestItem('    </div', 4),
			createSuggestItem('a', 0),
			createSuggestItem('p', 0),
			createSuggestItem('    </tag', 4),
			createSuggestItem('    XYZ', 4),
		], 1, {
				leadingLineContent: '   <',
				characterCountDelta: 0
			});

		assert.equal(model.items.length, 4);

		const [a, b, c, d] = model.items;
		assert.equal(a.suggestion.label, '    </div');
		assert.equal(b.suggestion.label, 'a');
		assert.equal(c.suggestion.label, 'p');
		assert.equal(d.suggestion.label, '    </tag');
	});

});
