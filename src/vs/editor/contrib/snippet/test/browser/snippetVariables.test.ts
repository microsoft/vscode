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
import { SnippetParser } from 'vs/editor/contrib/snippet/browser/snippetParser';
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

	test('editor variables, basics', function () {
		assert.equal(resolver.resolve('TM_FILENAME'), 'text.txt');
		assert.equal(resolver.resolve('something'), undefined);
	});

	test('editor variables, file/dir', function () {

		assert.equal(resolver.resolve('TM_FILENAME'), 'text.txt');
		if (!isWindows) {
			assert.equal(resolver.resolve('TM_DIRECTORY'), '/foo/files');
			assert.equal(resolver.resolve('TM_FILEPATH'), '/foo/files/text.txt');
		}

		resolver = new EditorSnippetVariableResolver(
			Model.createFromString('', undefined, undefined, URI.parse('http://www.pb.o/abc/def/ghi')),
			new Selection(1, 1, 1, 1)
		);
		assert.equal(resolver.resolve('TM_FILENAME'), 'ghi');
		if (!isWindows) {
			assert.equal(resolver.resolve('TM_DIRECTORY'), '/abc/def');
			assert.equal(resolver.resolve('TM_FILEPATH'), '/abc/def/ghi');
		}

		resolver = new EditorSnippetVariableResolver(
			Model.createFromString('', undefined, undefined, URI.parse('mem:fff.ts')),
			new Selection(1, 1, 1, 1)
		);
		assert.equal(resolver.resolve('TM_DIRECTORY'), '');
		assert.equal(resolver.resolve('TM_FILEPATH'), 'fff.ts');

	});

	test('editor variables, selection', function () {

		resolver = new EditorSnippetVariableResolver(model, new Selection(1, 2, 2, 3));
		assert.equal(resolver.resolve('TM_SELECTED_TEXT'), 'his is line one\nth');
		assert.equal(resolver.resolve('TM_CURRENT_LINE'), 'this is line two');
		assert.equal(resolver.resolve('TM_LINE_INDEX'), '1');
		assert.equal(resolver.resolve('TM_LINE_NUMBER'), '2');

		resolver = new EditorSnippetVariableResolver(model, new Selection(2, 3, 1, 2));
		assert.equal(resolver.resolve('TM_SELECTED_TEXT'), 'his is line one\nth');
		assert.equal(resolver.resolve('TM_CURRENT_LINE'), 'this is line one');
		assert.equal(resolver.resolve('TM_LINE_INDEX'), '0');
		assert.equal(resolver.resolve('TM_LINE_NUMBER'), '1');

		resolver = new EditorSnippetVariableResolver(model, new Selection(1, 2, 1, 2));
		assert.equal(resolver.resolve('TM_SELECTED_TEXT'), undefined);

		assert.equal(resolver.resolve('TM_CURRENT_WORD'), 'this');

		resolver = new EditorSnippetVariableResolver(model, new Selection(3, 1, 3, 1));
		assert.equal(resolver.resolve('TM_CURRENT_WORD'), undefined);

	});

	test('TextmateSnippet, resolve variable', function () {
		const snippet = new SnippetParser().parse('"$TM_CURRENT_WORD"', true);
		assert.equal(snippet.text, '""');
		snippet.resolveVariables(resolver);
		assert.equal(snippet.text, '"this"');

	});

	test('TextmateSnippet, resolve variable with default', function () {
		const snippet = new SnippetParser().parse('"${TM_CURRENT_WORD:foo}"', true);
		assert.equal(snippet.text, '"foo"');
		snippet.resolveVariables(resolver);
		assert.equal(snippet.text, '"this"');
	});
});
