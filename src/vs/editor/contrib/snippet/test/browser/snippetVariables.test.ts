/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { Selection } from 'vs/editor/common/core/selection';
import { EditorSnippetVariableResolver } from 'vs/editor/contrib/snippet/browser/snippetVariables';
import { SnippetParser, Variable } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { Model } from 'vs/editor/common/model/model';

suite('Snippet Variables Resolver', function () {

	let model: Model;
	let resolver: EditorSnippetVariableResolver;

	setup(function () {
		model = Model.createFromString([
			'this is line one',
			'this is line two',
			'    this is line three'
		].join('\n'), undefined, undefined, URI.parse('file:///foo/files/text.txt'));

		resolver = new EditorSnippetVariableResolver(model, new Selection(1, 1, 1, 1));
	});

	teardown(function () {
		model.dispose();
	});

	function assertVariableResolve(resolver: EditorSnippetVariableResolver, varName: string, expected: string) {
		const snippet = new SnippetParser().parse(`$${varName}`);
		const variable = <Variable>snippet.children[0];
		variable.resolve(resolver);
		if (variable.children.length === 0) {
			assert.equal(undefined, expected);
		} else {
			assert.equal(variable.toString(), expected);
		}
	}

	test('editor variables, basics', function () {
		assertVariableResolve(resolver, 'TM_FILENAME', 'text.txt');
		assertVariableResolve(resolver, 'something', undefined);
	});

	test('editor variables, file/dir', function () {

		assertVariableResolve(resolver, 'TM_FILENAME', 'text.txt');
		if (!isWindows) {
			assertVariableResolve(resolver, 'TM_DIRECTORY', '/foo/files');
			assertVariableResolve(resolver, 'TM_FILEPATH', '/foo/files/text.txt');
		}

		resolver = new EditorSnippetVariableResolver(
			Model.createFromString('', undefined, undefined, URI.parse('http://www.pb.o/abc/def/ghi')),
			new Selection(1, 1, 1, 1)
		);
		assertVariableResolve(resolver, 'TM_FILENAME', 'ghi');
		if (!isWindows) {
			assertVariableResolve(resolver, 'TM_DIRECTORY', '/abc/def');
			assertVariableResolve(resolver, 'TM_FILEPATH', '/abc/def/ghi');
		}

		resolver = new EditorSnippetVariableResolver(
			Model.createFromString('', undefined, undefined, URI.parse('mem:fff.ts')),
			new Selection(1, 1, 1, 1)
		);
		assertVariableResolve(resolver, 'TM_DIRECTORY', '');
		assertVariableResolve(resolver, 'TM_FILEPATH', 'fff.ts');

	});

	test('editor variables, selection', function () {

		resolver = new EditorSnippetVariableResolver(model, new Selection(1, 2, 2, 3));
		assertVariableResolve(resolver, 'TM_SELECTED_TEXT', 'his is line one\nth');
		assertVariableResolve(resolver, 'TM_CURRENT_LINE', 'this is line two');
		assertVariableResolve(resolver, 'TM_LINE_INDEX', '1');
		assertVariableResolve(resolver, 'TM_LINE_NUMBER', '2');

		resolver = new EditorSnippetVariableResolver(model, new Selection(2, 3, 1, 2));
		assertVariableResolve(resolver, 'TM_SELECTED_TEXT', 'his is line one\nth');
		assertVariableResolve(resolver, 'TM_CURRENT_LINE', 'this is line one');
		assertVariableResolve(resolver, 'TM_LINE_INDEX', '0');
		assertVariableResolve(resolver, 'TM_LINE_NUMBER', '1');

		resolver = new EditorSnippetVariableResolver(model, new Selection(1, 2, 1, 2));
		assertVariableResolve(resolver, 'TM_SELECTED_TEXT', undefined);

		assertVariableResolve(resolver, 'TM_CURRENT_WORD', 'this');

		resolver = new EditorSnippetVariableResolver(model, new Selection(3, 1, 3, 1));
		assertVariableResolve(resolver, 'TM_CURRENT_WORD', undefined);

	});

	test('TextmateSnippet, resolve variable', function () {
		const snippet = new SnippetParser().parse('"$TM_CURRENT_WORD"', true);
		assert.equal(snippet.toString(), '""');
		snippet.resolveVariables(resolver);
		assert.equal(snippet.toString(), '"this"');

	});

	test('TextmateSnippet, resolve variable with default', function () {
		const snippet = new SnippetParser().parse('"${TM_CURRENT_WORD:foo}"', true);
		assert.equal(snippet.toString(), '"foo"');
		snippet.resolveVariables(resolver);
		assert.equal(snippet.toString(), '"this"');
	});
});
