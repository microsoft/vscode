/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { Selection } from 'vs/editor/common/core/selection';
import { SnippetVariablesResolver } from 'vs/editor/contrib/snippet/common/snippetVariables';
import { MockCodeEditor, withMockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { Model } from 'vs/editor/common/model/model';

suite('Snippet Variables Resolver', function () {

	const model = Model.createFromString('', undefined, undefined, URI.parse('file:///foo/files/text.txt'));

	function variablesTest(callback: (editor: MockCodeEditor, resolver: SnippetVariablesResolver) => any) {


		const lines: string[] = [
			'this is line one',
			'this is line two',
			'    this is line three'
		];

		model.setValue(lines.join('\n'));

		withMockCodeEditor(lines, { model }, editor => {
			callback(editor, new SnippetVariablesResolver(editor));
		});
	}

	test('editor variables, basics', function () {

		variablesTest((editor, resolver) => {
			assert.equal(resolver.resolve('TM_FILENAME'), 'text.txt');
			assert.equal(resolver.resolve('something'), undefined);

			editor.setModel(null);
			assert.throws(() => resolver.resolve('TM_FILENAME'));
		});
	});

	test('editor variables, file/dir', function () {

		variablesTest((editor, resolver) => {
			assert.equal(resolver.resolve('TM_FILENAME'), 'text.txt');
			if (!isWindows) {
				assert.equal(resolver.resolve('TM_DIRECTORY'), '/foo/files');
				assert.equal(resolver.resolve('TM_FILEPATH'), '/foo/files/text.txt');
			}

			editor.setModel(Model.createFromString('', undefined, undefined, URI.parse('http://www.pb.o/abc/def/ghi')));
			assert.equal(resolver.resolve('TM_FILENAME'), 'ghi');
			if (!isWindows) {
				assert.equal(resolver.resolve('TM_DIRECTORY'), '/abc/def');
				assert.equal(resolver.resolve('TM_FILEPATH'), '/abc/def/ghi');
			}

			editor.setModel(Model.createFromString('', undefined, undefined, URI.parse('mem:fff.ts')));
			assert.equal(resolver.resolve('TM_DIRECTORY'), '');
			assert.equal(resolver.resolve('TM_FILEPATH'), 'fff.ts');
		});
	});

	test('editor variables, selection', function () {

		variablesTest((editor, resolver) => {

			editor.setSelection(new Selection(1, 2, 2, 3));
			assert.equal(resolver.resolve('TM_SELECTED_TEXT'), 'his is line one\nth');
			assert.equal(resolver.resolve('TM_CURRENT_LINE'), 'this is line two');
			assert.equal(resolver.resolve('TM_LINE_INDEX'), '1');
			assert.equal(resolver.resolve('TM_LINE_NUMBER'), '2');

			editor.setSelection(new Selection(2, 3, 1, 2));
			assert.equal(resolver.resolve('TM_SELECTED_TEXT'), 'his is line one\nth');
			assert.equal(resolver.resolve('TM_CURRENT_LINE'), 'this is line one');
			assert.equal(resolver.resolve('TM_LINE_INDEX'), '0');
			assert.equal(resolver.resolve('TM_LINE_NUMBER'), '1');

			editor.setSelection(new Selection(1, 2, 1, 2));
			assert.equal(resolver.resolve('TM_SELECTED_TEXT'), '');

			assert.equal(resolver.resolve('TM_CURRENT_WORD'), 'this');

			editor.setSelection(new Selection(3, 1, 3, 1));
			assert.equal(resolver.resolve('TM_CURRENT_WORD'), '');
		});
	});

});
