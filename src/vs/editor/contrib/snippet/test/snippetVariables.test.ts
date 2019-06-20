/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { Selection } from 'vs/editor/common/core/selection';
import { SelectionBasedVariableResolver, CompositeSnippetVariableResolver, ModelBasedVariableResolver, ClipboardBasedVariableResolver, TimeBasedVariableResolver, WorkspaceBasedVariableResolver } from 'vs/editor/contrib/snippet/snippetVariables';
import { SnippetParser, Variable, VariableResolver } from 'vs/editor/contrib/snippet/snippetParser';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { Workspace, toWorkspaceFolders, IWorkspace, IWorkspaceContextService, toWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

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

	async function assertVariableResolve(resolver: VariableResolver, varName: string, expected?: string) {
		const snippet = new SnippetParser().parse(`$${varName}`);
		const variable = <Variable>snippet.children[0];
		await variable.resolve(resolver);
		if (variable.children.length === 0) {
			assert.equal(undefined, expected);
		} else {
			assert.equal(variable.toString(), expected);
		}
	}

	test('editor variables, basics', async function () {
		await assertVariableResolve(resolver, 'TM_FILENAME', 'text.txt');
		await assertVariableResolve(resolver, 'something', undefined);
	});

	test('editor variables, file/dir', async function () {

		await assertVariableResolve(resolver, 'TM_FILENAME', 'text.txt');
		if (!isWindows) {
			await assertVariableResolve(resolver, 'TM_DIRECTORY', '/foo/files');
			await assertVariableResolve(resolver, 'TM_FILEPATH', '/foo/files/text.txt');
		}

		resolver = new ModelBasedVariableResolver(
			TextModel.createFromString('', undefined, undefined, URI.parse('http://www.pb.o/abc/def/ghi'))
		);
		await assertVariableResolve(resolver, 'TM_FILENAME', 'ghi');
		if (!isWindows) {
			await assertVariableResolve(resolver, 'TM_DIRECTORY', '/abc/def');
			await assertVariableResolve(resolver, 'TM_FILEPATH', '/abc/def/ghi');
		}

		resolver = new ModelBasedVariableResolver(
			TextModel.createFromString('', undefined, undefined, URI.parse('mem:fff.ts'))
		);
		await assertVariableResolve(resolver, 'TM_DIRECTORY', '');
		await assertVariableResolve(resolver, 'TM_FILEPATH', 'fff.ts');

	});

	test('editor variables, selection', async function () {

		resolver = new SelectionBasedVariableResolver(model, new Selection(1, 2, 2, 3));
		await assertVariableResolve(resolver, 'TM_SELECTED_TEXT', 'his is line one\nth');
		await assertVariableResolve(resolver, 'TM_CURRENT_LINE', 'this is line two');
		await assertVariableResolve(resolver, 'TM_LINE_INDEX', '1');
		await assertVariableResolve(resolver, 'TM_LINE_NUMBER', '2');

		resolver = new SelectionBasedVariableResolver(model, new Selection(2, 3, 1, 2));
		await assertVariableResolve(resolver, 'TM_SELECTED_TEXT', 'his is line one\nth');
		await assertVariableResolve(resolver, 'TM_CURRENT_LINE', 'this is line one');
		await assertVariableResolve(resolver, 'TM_LINE_INDEX', '0');
		await assertVariableResolve(resolver, 'TM_LINE_NUMBER', '1');

		resolver = new SelectionBasedVariableResolver(model, new Selection(1, 2, 1, 2));
		await assertVariableResolve(resolver, 'TM_SELECTED_TEXT', undefined);

		await assertVariableResolve(resolver, 'TM_CURRENT_WORD', 'this');

		resolver = new SelectionBasedVariableResolver(model, new Selection(3, 1, 3, 1));
		await assertVariableResolve(resolver, 'TM_CURRENT_WORD', undefined);

	});

	test('TextmateSnippet, resolve variable', async function () {
		const snippet = new SnippetParser().parse('"$TM_CURRENT_WORD"', true);
		assert.equal(snippet.toString(), '""');
		await snippet.resolveVariables(resolver);
		assert.equal(snippet.toString(), '"this"');

	});

	test('TextmateSnippet, resolve variable with default', async function () {
		const snippet = new SnippetParser().parse('"${TM_CURRENT_WORD:foo}"', true);
		assert.equal(snippet.toString(), '"foo"');
		await snippet.resolveVariables(resolver);
		assert.equal(snippet.toString(), '"this"');
	});

	test('More useful environment variables for snippets, #32737', async function () {

		await assertVariableResolve(resolver, 'TM_FILENAME_BASE', 'text');

		resolver = new ModelBasedVariableResolver(
			TextModel.createFromString('', undefined, undefined, URI.parse('http://www.pb.o/abc/def/ghi'))
		);
		await assertVariableResolve(resolver, 'TM_FILENAME_BASE', 'ghi');

		resolver = new ModelBasedVariableResolver(
			TextModel.createFromString('', undefined, undefined, URI.parse('mem:.git'))
		);
		await assertVariableResolve(resolver, 'TM_FILENAME_BASE', '.git');

		resolver = new ModelBasedVariableResolver(
			TextModel.createFromString('', undefined, undefined, URI.parse('mem:foo.'))
		);
		await assertVariableResolve(resolver, 'TM_FILENAME_BASE', 'foo');
	});


	async function assertVariableResolve2(input: string, expected: string, varValue?: string) {
		const snippet = await (new SnippetParser().parse(input)
			.resolveVariables({ async resolve(variable) { return varValue || variable.name; } }));

		const actual = snippet.toString();
		assert.equal(actual, expected);
	}

	test('Variable Snippet Transform', async function () {

		const snippet = new SnippetParser().parse('name=${TM_FILENAME/(.*)\\..+$/$1/}', true);
		await snippet.resolveVariables(resolver);
		assert.equal(snippet.toString(), 'name=text');

		await assertVariableResolve2('${ThisIsAVar/([A-Z]).*(Var)/$2/}', 'Var');
		await assertVariableResolve2('${ThisIsAVar/([A-Z]).*(Var)/$2-${1:/downcase}/}', 'Var-t');
		await assertVariableResolve2('${Foo/(.*)/${1:+Bar}/img}', 'Bar');

		//https://github.com/Microsoft/vscode/issues/33162
		await assertVariableResolve2('export default class ${TM_FILENAME/(\\w+)\\.js/$1/g}', 'export default class FooFile', 'FooFile.js');

		await assertVariableResolve2('${foobarfoobar/(foo)/${1:+FAR}/g}', 'FARbarFARbar'); // global
		await assertVariableResolve2('${foobarfoobar/(foo)/${1:+FAR}/}', 'FARbarfoobar'); // first match
		await assertVariableResolve2('${foobarfoobar/(bazz)/${1:+FAR}/g}', 'foobarfoobar'); // no match, no else
		// await assertVariableResolve2('${foobarfoobar/(bazz)/${1:+FAR}/g}', ''); // no match

		await assertVariableResolve2('${foobarfoobar/(foo)/${2:+FAR}/g}', 'barbar'); // bad group reference
	});

	test('Snippet transforms do not handle regex with alternatives or optional matches, #36089', async function () {

		await assertVariableResolve2(
			'${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'MyClass',
			'my-class.js'
		);

		// no hyphens
		await assertVariableResolve2(
			'${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'Myclass',
			'myclass.js'
		);

		// none matching suffix
		await assertVariableResolve2(
			'${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'Myclass.foo',
			'myclass.foo'
		);

		// more than one hyphen
		await assertVariableResolve2(
			'${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}',
			'ThisIsAFile',
			'this-is-a-file.js'
		);

		// KEBAB CASE
		await assertVariableResolve2(
			'${TM_FILENAME_BASE/([A-Z][a-z]+)([A-Z][a-z]+$)?/${1:/downcase}-${2:/downcase}/g}',
			'capital-case',
			'CapitalCase'
		);

		await assertVariableResolve2(
			'${TM_FILENAME_BASE/([A-Z][a-z]+)([A-Z][a-z]+$)?/${1:/downcase}-${2:/downcase}/g}',
			'capital-case-more',
			'CapitalCaseMore'
		);
	});

	test('Add variable to insert value from clipboard to a snippet #40153', async function () {

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
		await assertVariableResolve(resolver, 'CLIPBOARD', undefined);

		readTextResult = null;
		await assertVariableResolve(resolver, 'CLIPBOARD', undefined);

		readTextResult = '';
		await assertVariableResolve(resolver, 'CLIPBOARD', undefined);

		readTextResult = 'foo';
		await assertVariableResolve(resolver, 'CLIPBOARD', 'foo');

		await assertVariableResolve(resolver, 'foo', undefined);
		await assertVariableResolve(resolver, 'cLIPBOARD', undefined);
	});

	test('Add variable to insert value from clipboard to a snippet #40153', async function () {

		let readTextResult: string;
		let resolver: VariableResolver;
		const clipboardService = new class implements IClipboardService {
			_serviceBrand: any;
			async readText(): Promise<string> { return readTextResult; }
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
		await assertVariableResolve(resolver, 'CLIPBOARD', 'line1');
		readTextResult = 'line1\nline2\nline3';
		await assertVariableResolve(resolver, 'CLIPBOARD', 'line1\nline2\nline3');

		readTextResult = 'line1\nline2';
		await assertVariableResolve(resolver, 'CLIPBOARD', 'line2');
		readTextResult = 'line1\nline2';
		resolver = new ClipboardBasedVariableResolver(clipboardService, 0, 2);
		await assertVariableResolve(resolver, 'CLIPBOARD', 'line1');
	});


	async function assertVariableResolve3(resolver: VariableResolver, varName: string) {
		const snippet = new SnippetParser().parse(`$${varName}`);
		const variable = <Variable>snippet.children[0];

		assert.equal(await variable.resolve(resolver), true, `${varName} failed to resolve`);
	}

	test('Add time variables for snippets #41631, #43140', async function () {

		const resolver = new TimeBasedVariableResolver;

		await assertVariableResolve3(resolver, 'CURRENT_YEAR');
		await assertVariableResolve3(resolver, 'CURRENT_YEAR_SHORT');
		await assertVariableResolve3(resolver, 'CURRENT_MONTH');
		await assertVariableResolve3(resolver, 'CURRENT_DATE');
		await assertVariableResolve3(resolver, 'CURRENT_HOUR');
		await assertVariableResolve3(resolver, 'CURRENT_MINUTE');
		await assertVariableResolve3(resolver, 'CURRENT_SECOND');
		await assertVariableResolve3(resolver, 'CURRENT_DAY_NAME');
		await assertVariableResolve3(resolver, 'CURRENT_DAY_NAME_SHORT');
		await assertVariableResolve3(resolver, 'CURRENT_MONTH_NAME');
		await assertVariableResolve3(resolver, 'CURRENT_MONTH_NAME_SHORT');
	});

	test('creating snippet - format-condition doesn\'t work #53617', async function () {

		const snippet = new SnippetParser().parse('${TM_LINE_NUMBER/(10)/${1:?It is:It is not}/} line 10', true);
		await snippet.resolveVariables({ async resolve() { return '10'; } });
		assert.equal(snippet.toString(), 'It is line 10');

		await snippet.resolveVariables({ async resolve() { return '11'; } });
		assert.equal(snippet.toString(), 'It is not line 10');
	});

	test('Add workspace name variable for snippets #68261', async function () {

		let workspace: IWorkspace;
		let resolver: VariableResolver;
		const workspaceService = new class implements IWorkspaceContextService {
			_serviceBrand: any;
			_throw = () => { throw new Error(); };
			onDidChangeWorkbenchState = this._throw;
			onDidChangeWorkspaceName = this._throw;
			onDidChangeWorkspaceFolders = this._throw;
			getCompleteWorkspace = this._throw;
			getWorkspace(): IWorkspace { return workspace; }
			getWorkbenchState = this._throw;
			getWorkspaceFolder = this._throw;
			isCurrentWorkspace = this._throw;
			isInsideWorkspace = this._throw;
		};

		resolver = new WorkspaceBasedVariableResolver(workspaceService);

		// empty workspace
		workspace = new Workspace('');
		await assertVariableResolve(resolver, 'WORKSPACE_NAME', undefined);

		// single folder workspace without config
		workspace = new Workspace('', [toWorkspaceFolder(URI.file('/folderName'))]);
		await assertVariableResolve(resolver, 'WORKSPACE_NAME', 'folderName');

		// workspace with config
		const workspaceConfigPath = URI.file('testWorkspace.code-workspace');
		workspace = new Workspace('', toWorkspaceFolders([{ path: 'folderName' }], workspaceConfigPath), workspaceConfigPath);
		await assertVariableResolve(resolver, 'WORKSPACE_NAME', 'testWorkspace');
	});
});