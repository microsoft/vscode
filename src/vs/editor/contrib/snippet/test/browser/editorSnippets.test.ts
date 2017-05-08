/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Selection } from 'vs/editor/common/core/selection';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { SnippetSession } from 'vs/editor/contrib/snippet/browser/editorSnippets';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { mockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { Model } from "vs/editor/common/model/model";

suite('SnippetInsertion', function () {

	let editor: ICommonCodeEditor;
	let model: Model;

	function assertSelections(editor: ICommonCodeEditor, ...s: Selection[]) {
		for (const selection of editor.getSelections()) {
			const actual = s.shift();
			assert.ok(selection.equalsSelection(actual), `actual=${selection.toString()} <> expected=${actual.toString()}`);
		}
		assert.equal(s.length, 0);
	}

	setup(function () {
		model = Model.createFromString('function foo() {\n    console.log(a);\n}');
		editor = mockCodeEditor([], { model });
		editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5)]);
		assert.equal(model.getEOL(), '\n');
	});

	teardown(function () {
		model.dispose();
	});

	test('normalize whitespace', function () {

		function assertNormalized(position: IPosition, input: string, expected: string): void {
			const actual = SnippetSession.normalizeWhitespace(model, position, input);
			assert.equal(actual, expected);
		}

		assertNormalized(new Position(1, 1), 'foo', 'foo');
		assertNormalized(new Position(1, 1), 'foo\rbar', 'foo\nbar');
		assertNormalized(new Position(1, 1), 'foo\rbar', 'foo\nbar');
		assertNormalized(new Position(2, 5), 'foo\r\tbar', 'foo\n        bar');
		assertNormalized(new Position(2, 3), 'foo\r\tbar', 'foo\n      bar');
	});

	test('text edits & selection', function () {
		const session = new SnippetSession(editor, 'foo${1:bar}foo$0');
		assert.equal(editor.getModel().getValue(), 'foobarfoofunction foo() {\n    foobarfooconsole.log(a);\n}');

		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
		session.next();
		assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
	});

	test('snippets, selections and new text with newlines', () => {

		const session = new SnippetSession(editor, 'foo\n\t${1:bar}\n$0');

		assert.equal(editor.getModel().getValue(), 'foo\n    bar\nfunction foo() {\n    foo\n        bar\nconsole.log(a);\n}');

		assertSelections(editor, new Selection(2, 5, 2, 8), new Selection(5, 9, 5, 12));

		session.next();
		assertSelections(editor, new Selection(3, 1, 3, 1), new Selection(6, 1, 6, 1));
	});

	test('snippets, selections -> next/prev', () => {

		const session = new SnippetSession(editor, 'f$2oo${1:bar}foo$0');

		// @ $2
		assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(2, 6, 2, 6));
		// @ $1
		session.next();
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
		// @ $2
		session.prev();
		assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(2, 6, 2, 6));
		// @ $1
		session.next();
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
		// @ $0
		session.next();
		assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
	});

	test('snippets, selections & typing', function () {
		const session = new SnippetSession(editor, 'f${2:oo}_$1_$0');

		editor.trigger('test', 'type', { text: 'X' });
		session.next();
		editor.trigger('test', 'type', { text: 'bar' });

		// go back to ${2:oo} which is now just 'X'
		session.prev();
		assertSelections(editor, new Selection(1, 2, 1, 3), new Selection(2, 6, 2, 7));

		// go forward to $1 which is now 'bar'
		session.next();
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));

		// go to final tabstop
		session.next();
		assert.equal(model.getValue(), 'fX_bar_function foo() {\n    fX_bar_console.log(a);\n}');
		assertSelections(editor, new Selection(1, 8, 1, 8), new Selection(2, 12, 2, 12));
	});

	test('snippets, insert into non-empty selection', function () {
		model.setValue('foo_bar_foo');
		editor.setSelections([new Selection(1, 1, 1, 4), new Selection(1, 9, 1, 12)]);

		new SnippetSession(editor, 'x$0');
		assert.equal(model.getValue(), 'x_bar_x');
		assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(1, 8, 1, 8));
	});

	test('snippets, don\'t grow final tabstop', function () {
		model.setValue('foo_zzz_foo');
		editor.setSelection(new Selection(1, 5, 1, 8));
		const session = new SnippetSession(editor, '$1bar$0');

		assertSelections(editor, new Selection(1, 5, 1, 5));
		editor.trigger('test', 'type', { text: 'foo-' });

		session.next();
		assert.equal(model.getValue(), 'foo_foo-bar_foo');
		assertSelections(editor, new Selection(1, 12, 1, 12));

		editor.trigger('test', 'type', { text: 'XXX' });
		assert.equal(model.getValue(), 'foo_foo-barXXX_foo');
		session.prev();
		assertSelections(editor, new Selection(1, 5, 1, 9));
		session.next();
		assertSelections(editor, new Selection(1, 15, 1, 15));
	});

});

