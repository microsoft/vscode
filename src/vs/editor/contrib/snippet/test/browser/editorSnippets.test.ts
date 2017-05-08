/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Selection } from 'vs/editor/common/core/selection';
import { SnippetSession } from 'vs/editor/contrib/snippet/browser/editorSnippets';
import { SnippetParser } from 'vs/editor/contrib/snippet/common/snippetParser';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { mockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';


suite('Editor Contrib - Snippets', () => {

	let editor: ICommonCodeEditor;

	setup(() => {
		editor = mockCodeEditor([
			'function foo() {',
			'\tconsole.log(a)',
			'}'
		], {});
	});

	teardown(() => {
		editor.dispose();
	});

	test('snippets, selections', () => {

		editor.setSelections([
			new Selection(1, 1, 1, 1),
			new Selection(2, 2, 2, 2),
		]);

		const snippet = SnippetParser.parse('foo${1:bar}foo$0');
		const session = new SnippetSession(editor, snippet);

		assert.equal(editor.getModel().getLineContent(1), 'foobarfoofunction foo() {');
		assert.equal(editor.getModel().getLineContent(2), '\tfoobarfooconsole.log(a)');

		assert.equal(editor.getSelections().length, 2);
		assert.ok(editor.getSelections()[0].equalsSelection(new Selection(1, 4, 1, 7)));
		assert.ok(editor.getSelections()[1].equalsSelection(new Selection(2, 5, 2, 8)));

		session.next();
		assert.equal(editor.getSelections().length, 2);
		assert.ok(editor.getSelections()[0].equalsSelection(new Selection(1, 10, 1, 10)));
		assert.ok(editor.getSelections()[1].equalsSelection(new Selection(2, 11, 2, 11)));

	});
});
