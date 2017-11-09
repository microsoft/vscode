/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { Selection } from 'vs/editor/common/core/selection';
import { EditorSnippetVariableResolver } from 'vs/editor/contrib/snippet/snippetVariables';
import { SnippetParser, Variable } from 'vs/editor/contrib/snippet/snippetParser';
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

	test('More useful environment variables for snippets, #32737', function () {

		assertVariableResolve(resolver, 'TM_FILENAME_BASE', 'text');

		resolver = new EditorSnippetVariableResolver(
			Model.createFromString('', undefined, undefined, URI.parse('http://www.pb.o/abc/def/ghi')),
			new Selection(1, 1, 1, 1)
		);
		assertVariableResolve(resolver, 'TM_FILENAME_BASE', 'ghi');

		resolver = new EditorSnippetVariableResolver(
			Model.createFromString('', undefined, undefined, URI.parse('mem:.git')),
			new Selection(1, 1, 1, 1)
		);
		assertVariableResolve(resolver, 'TM_FILENAME_BASE', '.git');

		resolver = new EditorSnippetVariableResolver(
			Model.createFromString('', undefined, undefined, URI.parse('mem:foo.')),
			new Selection(1, 1, 1, 1)
		);
		assertVariableResolve(resolver, 'TM_FILENAME_BASE', 'foo');
	});


	function assertVariableResolve2(input: string, expected: string, varValue?: string) {
		const snippet = new SnippetParser().parse(input)
			.resolveVariables({ resolve(variable) { return varValue || variable.name; } });

		const actual = snippet.toString();
		assert.equal(actual, expected);
	}

	test('Variable Snippet Transform', function () {

		const snippet = new SnippetParser().parse('name=${TM_FILENAME/(.*)\\..+$/$1/}', true);
		snippet.resolveVariables(resolver);
		assert.equal(snippet.toString(), 'name=text');

		assertVariableResolve2('${ThisIsAVar/([A-Z]).*(Var)/$2/}', 'Var');
		assertVariableResolve2('${ThisIsAVar/([A-Z]).*(Var)/$2-${1:/downcase}/}', 'Var-t');
		assertVariableResolve2('${Foo/(.*)/${1:+Bar}/img}', 'Bar');

		//https://github.com/Microsoft/vscode/issues/33162
		assertVariableResolve2('export default class ${TM_FILENAME/(\\w+)\\.js/$1/g}', 'export default class FooFile', 'FooFile.js');

		assertVariableResolve2('${foobarfoobar/(foo)/${1:+FAR}/g}', 'FARbarFARbar'); // global
		assertVariableResolve2('${foobarfoobar/(foo)/${1:+FAR}/}', 'FARbarfoobar'); // first match
		assertVariableResolve2('${foobarfoobar/(bazz)/${1:+FAR}/g}', 'foobarfoobar'); // no match

		assertVariableResolve2('${foobarfoobar/(foo)/${2:+FAR}/g}', 'barbar'); // bad group reference
	});

	test('Snippet transforms do not handle regex with alternatives or optional matches, #36089', function () {

		assertVariableResolve2(
			'${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'MyClass',
			'my-class.js'
		);

		// no hyphens
		assertVariableResolve2(
			'${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'Myclass',
			'myclass.js'
		);

		// none matching suffix
		assertVariableResolve2(
			'${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'Myclass.foo',
			'myclass.foo'
		);

		// more than one hyphen
		assertVariableResolve2(
			'${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'ThisIsAFile',
			'this-is-a-file.js'
		);

		// KEBAB CASE
		assertVariableResolve2(
			'${TM_FILENAME_BASE/([A-Z][a-z]+)([A-Z][a-z]+$)?/${1:/downcase}-${2:/downcase}/g}',
			'capital-case',
			'CapitalCase'
		);

		assertVariableResolve2(
			'${TM_FILENAME_BASE/([A-Z][a-z]+)([A-Z][a-z]+$)?/${1:/downcase}-${2:/downcase}/g}',
			'capital-case-more',
			'CapitalCaseMore'
		);
	});

});
