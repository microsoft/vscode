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

	test('snippets', () => {

		editor.setSelections([
			new Selection(1, 1, 1, 1),
			new Selection(2, 2, 2, 2),
		]);

		new SnippetSession(editor, SnippetParser.parse('foo\n${1:bar}\nfoo'));
		assert.ok(true);
	});
});
