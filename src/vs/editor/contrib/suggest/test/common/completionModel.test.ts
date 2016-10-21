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

	test('top score', function () {

		assert.equal(model.topScoreIdx, 0);

		model.lineContext = { leadingLineContent: 'Foo', characterCountDelta: 0 };
		assert.equal(model.topScoreIdx, 1);
	});

	test('complete/incomplete', function () {

		assert.equal(model.incomplete.length, 0);

		let incompleteModel = new CompletionModel([
			createSuggestItem('foo', 3, true),
			createSuggestItem('foo', 2),
		], 1, {
				leadingLineContent: 'foo',
				characterCountDelta: 0
			});
		assert.equal(incompleteModel.incomplete.length, 1);
	});

	test('replaceIncomplete', function () {

		const completeItem = createSuggestItem('foobar', 1, false, { lineNumber: 1, column: 2 });
		const incompleteItem = createSuggestItem('foofoo', 1, true, { lineNumber: 1, column: 2 });

		const model = new CompletionModel([completeItem, incompleteItem], 2, { leadingLineContent: 'foo', characterCountDelta: 0 });
		assert.equal(model.incomplete.length, 1);
		assert.equal(model.incomplete[0], incompleteItem.support);
		assert.equal(model.items.length, 2);

		const newCompleteItem = [
			createSuggestItem('foofoo', 1, false, { lineNumber: 1, column: 3 }),
			createSuggestItem('foofoo2', 1, false, { lineNumber: 1, column: 3 })
		];
		model.replaceIncomplete(newCompleteItem, (a, b) => 0);
		assert.equal(model.incomplete.length, 0);
		assert.equal(model.items.length, 3);
	});
});
