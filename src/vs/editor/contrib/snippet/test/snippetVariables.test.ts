/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { Selection } from 'vs/editor/common/core/selection';
import { SelectionBasedVariableResolver, CompositeSnippetVariableResolver, ModelBasedVariableResolver, ClipboardBasedVariableResolver, TimeBasedVariableResolver } from 'vs/editor/contrib/snippet/snippetVariables';
import { SnippetParser, Variable, VariableResolver } from 'vs/editor/contrib/snippet/snippetParser';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';

suite('Snippet Variables Resolver', function () {

	let model: TextModel;
	let resolver: VariableResolver;

	setup(function () {
		model = TextModel.createFromString([
			'this is line one',
			'this is line two',
			'    this is line three'
		].join('\n'), undefined, undefined, URI.parse('file:///foo/files/text.txt'));

		resolver = new CompositeSnippetVariableResolver([
			new ModelBasedVariableResolver(model),
			new SelectionBasedVariableResolver(model, new Selection(1, 1, 1, 1)),
		]);
	});

	teardown(function () {
		model.dispose();
	});

	function assertVariableResolve(resolver: VariableResolver, varName: string, expected?: string) {
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

		resolver = new ModelBasedVariableResolver(
			TextModel.createFromString('', undefined, undefined, URI.parse('http://www.pb.o/abc/def/ghi'))
		);
		assertVariableResolve(resolver, 'TM_FILENAME', 'ghi');
		if (!isWindows) {
			assertVariableResolve(resolver, 'TM_DIRECTORY', '/abc/def');
			assertVariableResolve(resolver, 'TM_FILEPATH', '/abc/def/ghi');
		}

		resolver = new ModelBasedVariableResolver(
			TextModel.createFromString('', undefined, undefined, URI.parse('mem:fff.ts'))
		);
		assertVariableResolve(resolver, 'TM_DIRECTORY', '');
		assertVariableResolve(resolver, 'TM_FILEPATH', 'fff.ts');

	});

	test('editor variables, selection', function () {

		resolver = new SelectionBasedVariableResolver(model, new Selection(1, 2, 2, 3));
		assertVariableResolve(resolver, 'TM_SELECTED_TEXT', 'his is line one\nth');
		assertVariableResolve(resolver, 'TM_CURRENT_LINE', 'this is line two');
		assertVariableResolve(resolver, 'TM_LINE_INDEX', '1');
		assertVariableResolve(resolver, 'TM_LINE_NUMBER', '2');

		resolver = new SelectionBasedVariableResolver(model, new Selection(2, 3, 1, 2));
		assertVariableResolve(resolver, 'TM_SELECTED_TEXT', 'his is line one\nth');
		assertVariableResolve(resolver, 'TM_CURRENT_LINE', 'this is line one');
		assertVariableResolve(resolver, 'TM_LINE_INDEX', '0');
		assertVariableResolve(resolver, 'TM_LINE_NUMBER', '1');

		resolver = new SelectionBasedVariableResolver(model, new Selection(1, 2, 1, 2));
		assertVariableResolve(resolver, 'TM_SELECTED_TEXT', undefined);

		assertVariableResolve(resolver, 'TM_CURRENT_WORD', 'this');

		resolver = new SelectionBasedVariableResolver(model, new Selection(3, 1, 3, 1));
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

		resolver = new ModelBasedVariableResolver(
			TextModel.createFromString('', undefined, undefined, URI.parse('http://www.pb.o/abc/def/ghi'))
		);
		assertVariableResolve(resolver, 'TM_FILENAME_BASE', 'ghi');

		resolver = new ModelBasedVariableResolver(
			TextModel.createFromString('', undefined, undefined, URI.parse('mem:.git'))
		);
		assertVariableResolve(resolver, 'TM_FILENAME_BASE', '.git');

		resolver = new ModelBasedVariableResolver(
			TextModel.createFromString('', undefined, undefined, URI.parse('mem:foo.'))
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
		assertVariableResolve2('${foobarfoobar/(bazz)/${1:+FAR}/g}', 'foobarfoobar'); // no match, no else
		// assertVariableResolve2('${foobarfoobar/(bazz)/${1:+FAR}/g}', ''); // no match

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

	test('Add variable to insert value from clipboard to a snippet #40153', function () {

		let readTextResult: string | null | undefined;
		const clipboardService = new class implements IClipboardService {
			_serviceBrand: any;
			readText(): any { return readTextResult; }
			_throw = () => { throw new Error(); };
			writeText = this._throw;
			readFindText = this._throw;
			writeFindText = this._throw;
			writeResources = this._throw;
			readResources = this._throw;
			hasResources = this._throw;
		};
		let resolver = new ClipboardBasedVariableResolver(clipboardService, 1, 0);

		readTextResult = undefined;
		assertVariableResolve(resolver, 'CLIPBOARD', undefined);

		readTextResult = null;
		assertVariableResolve(resolver, 'CLIPBOARD', undefined);

		readTextResult = '';
		assertVariableResolve(resolver, 'CLIPBOARD', undefined);

		readTextResult = 'foo';
		assertVariableResolve(resolver, 'CLIPBOARD', 'foo');

		assertVariableResolve(resolver, 'foo', undefined);
		assertVariableResolve(resolver, 'cLIPBOARD', undefined);
	});

	test('Add variable to insert value from clipboard to a snippet #40153', function () {

		let readTextResult: string;
		let resolver: VariableResolver;
		const clipboardService = new class implements IClipboardService {
			_serviceBrand: any;
			readText(): string { return readTextResult; }
			_throw = () => { throw new Error(); };
			writeText = this._throw;
			readFindText = this._throw;
			writeFindText = this._throw;
			writeResources = this._throw;
			readResources = this._throw;
			hasResources = this._throw;
		};

		resolver = new ClipboardBasedVariableResolver(clipboardService, 1, 2);
		readTextResult = 'line1';
		assertVariableResolve(resolver, 'CLIPBOARD', 'line1');
		readTextResult = 'line1\nline2\nline3';
		assertVariableResolve(resolver, 'CLIPBOARD', 'line1\nline2\nline3');

		readTextResult = 'line1\nline2';
		assertVariableResolve(resolver, 'CLIPBOARD', 'line2');
		readTextResult = 'line1\nline2';
		resolver = new ClipboardBasedVariableResolver(clipboardService, 0, 2);
		assertVariableResolve(resolver, 'CLIPBOARD', 'line1');
	});


	function assertVariableResolve3(resolver: VariableResolver, varName: string) {
		const snippet = new SnippetParser().parse(`$${varName}`);
		const variable = <Variable>snippet.children[0];

		assert.equal(variable.resolve(resolver), true, `${varName} failed to resolve`);
	}

	test('Add time variables for snippets #41631, #43140', function () {

		const resolver = new TimeBasedVariableResolver;

		assertVariableResolve3(resolver, 'CURRENT_YEAR');
		assertVariableResolve3(resolver, 'CURRENT_YEAR_SHORT');
		assertVariableResolve3(resolver, 'CURRENT_MONTH');
		assertVariableResolve3(resolver, 'CURRENT_DATE');
		assertVariableResolve3(resolver, 'CURRENT_HOUR');
		assertVariableResolve3(resolver, 'CURRENT_MINUTE');
		assertVariableResolve3(resolver, 'CURRENT_SECOND');
		assertVariableResolve3(resolver, 'CURRENT_DAY_NAME');
		assertVariableResolve3(resolver, 'CURRENT_DAY_NAME_SHORT');
		assertVariableResolve3(resolver, 'CURRENT_MONTH_NAME');
		assertVariableResolve3(resolver, 'CURRENT_MONTH_NAME_SHORT');
	});

	test('creating snippet - format-condition doesn\'t work #53617', function () {

		const snippet = new SnippetParser().parse('${TM_LINE_NUMBER/(10)/${1:?It is:It is not}/} line 10', true);
		snippet.resolveVariables({ resolve() { return '10'; } });
		assert.equal(snippet.toString(), 'It is line 10');

		snippet.resolveVariables({ resolve() { return '11'; } });
		assert.equal(snippet.toString(), 'It is not line 10');
	});
});
