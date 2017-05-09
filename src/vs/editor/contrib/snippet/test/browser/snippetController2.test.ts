/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Selection } from 'vs/editor/common/core/selection';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { mockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { Model } from "vs/editor/common/model/model";
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';

suite('SnippetController2', function () {

	function assertSelections(editor: ICommonCodeEditor, ...s: Selection[]) {
		for (const selection of editor.getSelections()) {
			const actual = s.shift();
			assert.ok(selection.equalsSelection(actual), `actual=${selection.toString()} <> expected=${actual.toString()}`);
		}
		assert.equal(s.length, 0);
	}

	let editor: ICommonCodeEditor;
	let model: Model;
	let contextKeys: MockContextKeyService;

	setup(function () {
		contextKeys = new MockContextKeyService();
		model = Model.createFromString('if\n    $state\nfi');
		editor = mockCodeEditor([], { model });
		editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5)]);
		assert.equal(model.getEOL(), '\n');
	});

	teardown(function () {
		model.dispose();
	});

	test('creation', function () {
		const ctrl = new SnippetController2(editor, contextKeys);
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), false);
		ctrl.dispose();
	});

	test('insert, insert -> abort', function () {
		const ctrl = new SnippetController2(editor, contextKeys);

		ctrl.insert('foo${1:bar}foo$0');
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));

		ctrl.abort();
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), false);
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
	});

	test('insert, insert -> tab, tab, done', function () {
		const ctrl = new SnippetController2(editor, contextKeys);

		ctrl.insert('${1:one}${2:two}$0');
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assert.equal(SnippetController2.HasNextTabstop.getValue(contextKeys), true);
		assert.equal(SnippetController2.HasPrevTabstop.getValue(contextKeys), false);

		ctrl.next();
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assert.equal(SnippetController2.HasNextTabstop.getValue(contextKeys), true);
		assert.equal(SnippetController2.HasPrevTabstop.getValue(contextKeys), true);

		ctrl.next();
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assert.equal(SnippetController2.HasNextTabstop.getValue(contextKeys), false);
		assert.equal(SnippetController2.HasPrevTabstop.getValue(contextKeys), true);

		// editor.trigger('test', 'type', { text: '\t' });
		// assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), false);
		// assert.equal(SnippetController2.HasNextTabstop.getValue(contextKeys), false);
		// assert.equal(SnippetController2.HasPrevTabstop.getValue(contextKeys), false);
	});

	test('insert, insert -> cursor moves out', function () {
		const ctrl = new SnippetController2(editor, contextKeys);

		ctrl.insert('foo${1:bar}foo$0');
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));

		// bad selection change
		editor.setSelections([new Selection(1, 12, 1, 12), new Selection(2, 16, 2, 16)]);
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), false);
	});

	test('insert, nested -> cursor moves out 1/2', function () {

		const ctrl = new SnippetController2(editor, contextKeys);

		ctrl.insert('foo${1:bar}foo$0');
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));

		ctrl.insert('ff$1bb$0');
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assertSelections(editor, new Selection(1, 6, 1, 6), new Selection(2, 10, 2, 10));

		// bad selection
		editor.setSelections([new Selection(3, 1, 3, 1), new Selection(1, 6, 1, 6)]);
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), false);
	});

	test('insert, nested -> cursor moves out 2/2', function () {

		const ctrl = new SnippetController2(editor, contextKeys);

		ctrl.insert('foo${1:bar}foo$0');
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));

		ctrl.insert('ff$1bb$0');
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assertSelections(editor, new Selection(1, 6, 1, 6), new Selection(2, 10, 2, 10));

		// select outer snippet
		editor.setSelections([new Selection(1, 3, 1, 3), new Selection(2, 6, 2, 6)]);
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);

		ctrl.next();
		assert.equal(model.getValue(), 'fooffbbfooif\n    fooffbbfoo$state\nfi');
		assertSelections(editor, new Selection(1, 11, 1, 11), new Selection(2, 15, 2, 15));
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
	});

	test('insert, nested -> tab across all', function () {
		const ctrl = new SnippetController2(editor, contextKeys);

		ctrl.insert('outer$1outer$0');
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assert.equal(SnippetController2.HasNextTabstop.getValue(contextKeys), true);
		assert.equal(SnippetController2.HasPrevTabstop.getValue(contextKeys), false);

		ctrl.insert('inner$1inner$0');
		assert.equal(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assert.equal(SnippetController2.HasNextTabstop.getValue(contextKeys), true);
		// assert.equal(SnippetController2.HasPrevTabstop.getValue(contextKeys), true);

	});
});
