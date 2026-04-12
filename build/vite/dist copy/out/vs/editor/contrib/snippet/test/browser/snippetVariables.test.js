/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { sep } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Selection } from '../../../../common/core/selection.js';
import { SnippetParser } from '../../browser/snippetParser.js';
import { ClipboardBasedVariableResolver, CompositeSnippetVariableResolver, ModelBasedVariableResolver, SelectionBasedVariableResolver, TimeBasedVariableResolver, WorkspaceBasedVariableResolver } from '../../browser/snippetVariables.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { toWorkspaceFolders } from '../../../../../platform/workspaces/common/workspaces.js';
suite('Snippet Variables Resolver', function () {
    const labelService = new class extends mock() {
        getUriLabel(uri) {
            return uri.fsPath;
        }
    };
    let model;
    let resolver;
    setup(function () {
        model = createTextModel([
            'this is line one',
            'this is line two',
            '    this is line three'
        ].join('\n'), undefined, undefined, URI.parse('file:///foo/files/text.txt'));
        resolver = new CompositeSnippetVariableResolver([
            new ModelBasedVariableResolver(labelService, model),
            new SelectionBasedVariableResolver(model, new Selection(1, 1, 1, 1), 0, undefined),
        ]);
    });
    teardown(function () {
        model.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function assertVariableResolve(resolver, varName, expected) {
        const snippet = new SnippetParser().parse(`$${varName}`);
        const variable = snippet.children[0];
        variable.resolve(resolver);
        if (variable.children.length === 0) {
            assert.strictEqual(undefined, expected);
        }
        else {
            assert.strictEqual(variable.toString(), expected);
        }
    }
    test('editor variables, basics', function () {
        assertVariableResolve(resolver, 'TM_FILENAME', 'text.txt');
        assertVariableResolve(resolver, 'something', undefined);
    });
    test('editor variables, file/dir', function () {
        const disposables = new DisposableStore();
        assertVariableResolve(resolver, 'TM_FILENAME', 'text.txt');
        if (!isWindows) {
            assertVariableResolve(resolver, 'TM_DIRECTORY', '/foo/files');
            assertVariableResolve(resolver, 'TM_DIRECTORY_BASE', 'files');
            assertVariableResolve(resolver, 'TM_FILEPATH', '/foo/files/text.txt');
        }
        resolver = new ModelBasedVariableResolver(labelService, disposables.add(createTextModel('', undefined, undefined, URI.parse('http://www.pb.o/abc/def/ghi'))));
        assertVariableResolve(resolver, 'TM_FILENAME', 'ghi');
        if (!isWindows) {
            assertVariableResolve(resolver, 'TM_DIRECTORY', '/abc/def');
            assertVariableResolve(resolver, 'TM_DIRECTORY_BASE', 'def');
            assertVariableResolve(resolver, 'TM_FILEPATH', '/abc/def/ghi');
        }
        resolver = new ModelBasedVariableResolver(labelService, disposables.add(createTextModel('', undefined, undefined, URI.parse('mem:fff.ts'))));
        assertVariableResolve(resolver, 'TM_DIRECTORY', '');
        assertVariableResolve(resolver, 'TM_DIRECTORY_BASE', '');
        assertVariableResolve(resolver, 'TM_FILEPATH', 'fff.ts');
        disposables.dispose();
    });
    test('Path delimiters in code snippet variables aren\'t specific to remote OS #76840', function () {
        const labelService = new class extends mock() {
            getUriLabel(uri) {
                return uri.fsPath.replace(/\/|\\/g, '|');
            }
        };
        const model = createTextModel([].join('\n'), undefined, undefined, URI.parse('foo:///foo/files/text.txt'));
        const resolver = new CompositeSnippetVariableResolver([new ModelBasedVariableResolver(labelService, model)]);
        assertVariableResolve(resolver, 'TM_FILEPATH', '|foo|files|text.txt');
        model.dispose();
    });
    test('editor variables, selection', function () {
        resolver = new SelectionBasedVariableResolver(model, new Selection(1, 2, 2, 3), 0, undefined);
        assertVariableResolve(resolver, 'TM_SELECTED_TEXT', 'his is line one\nth');
        assertVariableResolve(resolver, 'TM_CURRENT_LINE', 'this is line two');
        assertVariableResolve(resolver, 'TM_LINE_INDEX', '1');
        assertVariableResolve(resolver, 'TM_LINE_NUMBER', '2');
        assertVariableResolve(resolver, 'CURSOR_INDEX', '0');
        assertVariableResolve(resolver, 'CURSOR_NUMBER', '1');
        resolver = new SelectionBasedVariableResolver(model, new Selection(1, 2, 2, 3), 4, undefined);
        assertVariableResolve(resolver, 'CURSOR_INDEX', '4');
        assertVariableResolve(resolver, 'CURSOR_NUMBER', '5');
        resolver = new SelectionBasedVariableResolver(model, new Selection(2, 3, 1, 2), 0, undefined);
        assertVariableResolve(resolver, 'TM_SELECTED_TEXT', 'his is line one\nth');
        assertVariableResolve(resolver, 'TM_CURRENT_LINE', 'this is line one');
        assertVariableResolve(resolver, 'TM_LINE_INDEX', '0');
        assertVariableResolve(resolver, 'TM_LINE_NUMBER', '1');
        resolver = new SelectionBasedVariableResolver(model, new Selection(1, 2, 1, 2), 0, undefined);
        assertVariableResolve(resolver, 'TM_SELECTED_TEXT', undefined);
        assertVariableResolve(resolver, 'TM_CURRENT_WORD', 'this');
        resolver = new SelectionBasedVariableResolver(model, new Selection(3, 1, 3, 1), 0, undefined);
        assertVariableResolve(resolver, 'TM_CURRENT_WORD', undefined);
    });
    test('TextmateSnippet, resolve variable', function () {
        const snippet = new SnippetParser().parse('"$TM_CURRENT_WORD"', true);
        assert.strictEqual(snippet.toString(), '""');
        snippet.resolveVariables(resolver);
        assert.strictEqual(snippet.toString(), '"this"');
    });
    test('TextmateSnippet, resolve variable with default', function () {
        const snippet = new SnippetParser().parse('"${TM_CURRENT_WORD:foo}"', true);
        assert.strictEqual(snippet.toString(), '"foo"');
        snippet.resolveVariables(resolver);
        assert.strictEqual(snippet.toString(), '"this"');
    });
    test('More useful environment variables for snippets, #32737', function () {
        const disposables = new DisposableStore();
        assertVariableResolve(resolver, 'TM_FILENAME_BASE', 'text');
        resolver = new ModelBasedVariableResolver(labelService, disposables.add(createTextModel('', undefined, undefined, URI.parse('http://www.pb.o/abc/def/ghi'))));
        assertVariableResolve(resolver, 'TM_FILENAME_BASE', 'ghi');
        resolver = new ModelBasedVariableResolver(labelService, disposables.add(createTextModel('', undefined, undefined, URI.parse('mem:.git'))));
        assertVariableResolve(resolver, 'TM_FILENAME_BASE', '.git');
        resolver = new ModelBasedVariableResolver(labelService, disposables.add(createTextModel('', undefined, undefined, URI.parse('mem:foo.'))));
        assertVariableResolve(resolver, 'TM_FILENAME_BASE', 'foo');
        disposables.dispose();
    });
    function assertVariableResolve2(input, expected, varValue) {
        const snippet = new SnippetParser().parse(input)
            .resolveVariables({ resolve(variable) { return varValue || variable.name; } });
        const actual = snippet.toString();
        assert.strictEqual(actual, expected);
    }
    test('Variable Snippet Transform', function () {
        const snippet = new SnippetParser().parse('name=${TM_FILENAME/(.*)\\..+$/$1/}', true);
        snippet.resolveVariables(resolver);
        assert.strictEqual(snippet.toString(), 'name=text');
        assertVariableResolve2('${ThisIsAVar/([A-Z]).*(Var)/$2/}', 'Var');
        assertVariableResolve2('${ThisIsAVar/([A-Z]).*(Var)/$2-${1:/downcase}/}', 'Var-t');
        assertVariableResolve2('${Foo/(.*)/${1:+Bar}/img}', 'Bar');
        //https://github.com/microsoft/vscode/issues/33162
        assertVariableResolve2('export default class ${TM_FILENAME/(\\w+)\\.js/$1/g}', 'export default class FooFile', 'FooFile.js');
        assertVariableResolve2('${foobarfoobar/(foo)/${1:+FAR}/g}', 'FARbarFARbar'); // global
        assertVariableResolve2('${foobarfoobar/(foo)/${1:+FAR}/}', 'FARbarfoobar'); // first match
        assertVariableResolve2('${foobarfoobar/(bazz)/${1:+FAR}/g}', 'foobarfoobar'); // no match, no else
        // assertVariableResolve2('${foobarfoobar/(bazz)/${1:+FAR}/g}', ''); // no match
        assertVariableResolve2('${foobarfoobar/(foo)/${2:+FAR}/g}', 'barbar'); // bad group reference
    });
    test('Snippet transforms do not handle regex with alternatives or optional matches, #36089', function () {
        assertVariableResolve2('${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}', 'MyClass', 'my-class.js');
        // no hyphens
        assertVariableResolve2('${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}', 'Myclass', 'myclass.js');
        // none matching suffix
        assertVariableResolve2('${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}', 'Myclass.foo', 'myclass.foo');
        // more than one hyphen
        assertVariableResolve2('${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}', 'ThisIsAFile', 'this-is-a-file.js');
        // KEBAB CASE
        assertVariableResolve2('${TM_FILENAME_BASE/([A-Z][a-z]+)([A-Z][a-z]+$)?/${1:/downcase}-${2:/downcase}/g}', 'capital-case', 'CapitalCase');
        assertVariableResolve2('${TM_FILENAME_BASE/([A-Z][a-z]+)([A-Z][a-z]+$)?/${1:/downcase}-${2:/downcase}/g}', 'capital-case-more', 'CapitalCaseMore');
    });
    test('Add variable to insert value from clipboard to a snippet #40153', function () {
        assertVariableResolve(new ClipboardBasedVariableResolver(() => undefined, 1, 0, true), 'CLIPBOARD', undefined);
        assertVariableResolve(new ClipboardBasedVariableResolver(() => null, 1, 0, true), 'CLIPBOARD', undefined);
        assertVariableResolve(new ClipboardBasedVariableResolver(() => '', 1, 0, true), 'CLIPBOARD', undefined);
        assertVariableResolve(new ClipboardBasedVariableResolver(() => 'foo', 1, 0, true), 'CLIPBOARD', 'foo');
        assertVariableResolve(new ClipboardBasedVariableResolver(() => 'foo', 1, 0, true), 'foo', undefined);
        assertVariableResolve(new ClipboardBasedVariableResolver(() => 'foo', 1, 0, true), 'cLIPBOARD', undefined);
    });
    test('Add variable to insert value from clipboard to a snippet #40153, 2', function () {
        assertVariableResolve(new ClipboardBasedVariableResolver(() => 'line1', 1, 2, true), 'CLIPBOARD', 'line1');
        assertVariableResolve(new ClipboardBasedVariableResolver(() => 'line1\nline2\nline3', 1, 2, true), 'CLIPBOARD', 'line1\nline2\nline3');
        assertVariableResolve(new ClipboardBasedVariableResolver(() => 'line1\nline2', 1, 2, true), 'CLIPBOARD', 'line2');
        resolver = new ClipboardBasedVariableResolver(() => 'line1\nline2', 0, 2, true);
        assertVariableResolve(new ClipboardBasedVariableResolver(() => 'line1\nline2', 0, 2, true), 'CLIPBOARD', 'line1');
        assertVariableResolve(new ClipboardBasedVariableResolver(() => 'line1\nline2', 0, 2, false), 'CLIPBOARD', 'line1\nline2');
    });
    function assertVariableResolve3(resolver, varName) {
        const snippet = new SnippetParser().parse(`$${varName}`);
        const variable = snippet.children[0];
        assert.strictEqual(variable.resolve(resolver), true, `${varName} failed to resolve`);
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
        assertVariableResolve3(resolver, 'CURRENT_SECONDS_UNIX');
        assertVariableResolve3(resolver, 'CURRENT_TIMEZONE_OFFSET');
    });
    test('Time-based snippet variables resolve to the same values even as time progresses', async function () {
        const snippetText = `
			$CURRENT_YEAR
			$CURRENT_YEAR_SHORT
			$CURRENT_MONTH
			$CURRENT_DATE
			$CURRENT_HOUR
			$CURRENT_MINUTE
			$CURRENT_SECOND
			$CURRENT_DAY_NAME
			$CURRENT_DAY_NAME_SHORT
			$CURRENT_MONTH_NAME
			$CURRENT_MONTH_NAME_SHORT
			$CURRENT_SECONDS_UNIX
			$CURRENT_TIMEZONE_OFFSET
		`;
        const clock = sinon.useFakeTimers();
        try {
            const resolver = new TimeBasedVariableResolver;
            const firstResolve = new SnippetParser().parse(snippetText).resolveVariables(resolver);
            clock.tick((365 * 24 * 3600 * 1000) + (24 * 3600 * 1000) + (3661 * 1000)); // 1 year + 1 day + 1 hour + 1 minute + 1 second
            const secondResolve = new SnippetParser().parse(snippetText).resolveVariables(resolver);
            assert.strictEqual(firstResolve.toString(), secondResolve.toString(), `Time-based snippet variables resolved differently`);
        }
        finally {
            clock.restore();
        }
    });
    test('creating snippet - format-condition doesn\'t work #53617', function () {
        const snippet = new SnippetParser().parse('${TM_LINE_NUMBER/(10)/${1:?It is:It is not}/} line 10', true);
        snippet.resolveVariables({ resolve() { return '10'; } });
        assert.strictEqual(snippet.toString(), 'It is line 10');
        snippet.resolveVariables({ resolve() { return '11'; } });
        assert.strictEqual(snippet.toString(), 'It is not line 10');
    });
    test('Add workspace name and folder variables for snippets #68261', function () {
        let workspace;
        const workspaceService = new class {
            constructor() {
                this._throw = () => { throw new Error(); };
                this.onDidChangeWorkbenchState = this._throw;
                this.onDidChangeWorkspaceName = this._throw;
                this.onWillChangeWorkspaceFolders = this._throw;
                this.onDidChangeWorkspaceFolders = this._throw;
                this.getCompleteWorkspace = this._throw;
                this.getWorkbenchState = this._throw;
                this.hasWorkspaceData = this._throw;
                this.getWorkspaceFolder = this._throw;
                this.isCurrentWorkspace = this._throw;
                this.isInsideWorkspace = this._throw;
            }
            getWorkspace() { return workspace; }
        };
        const resolver = new WorkspaceBasedVariableResolver(workspaceService);
        // empty workspace
        workspace = new Workspace('');
        assertVariableResolve(resolver, 'WORKSPACE_NAME', undefined);
        assertVariableResolve(resolver, 'WORKSPACE_FOLDER', undefined);
        // single folder workspace without config
        workspace = new Workspace('', [toWorkspaceFolder(URI.file('/folderName'))]);
        assertVariableResolve(resolver, 'WORKSPACE_NAME', 'folderName');
        if (!isWindows) {
            assertVariableResolve(resolver, 'WORKSPACE_FOLDER', '/folderName');
        }
        // workspace with config
        const workspaceConfigPath = URI.file('testWorkspace.code-workspace');
        workspace = new Workspace('', toWorkspaceFolders([{ path: 'folderName' }], workspaceConfigPath, extUriBiasedIgnorePathCase), workspaceConfigPath);
        assertVariableResolve(resolver, 'WORKSPACE_NAME', 'testWorkspace');
        if (!isWindows) {
            assertVariableResolve(resolver, 'WORKSPACE_FOLDER', '/');
        }
    });
    test('Add RELATIVE_FILEPATH snippet variable #114208', function () {
        let resolver;
        // Mock a label service (only coded for file uris)
        const workspaceLabelService = ((rootPath) => {
            const labelService = new class extends mock() {
                getUriLabel(uri, options = {}) {
                    const rootFsPath = URI.file(rootPath).fsPath + sep;
                    const fsPath = uri.fsPath;
                    if (options.relative && rootPath && fsPath.startsWith(rootFsPath)) {
                        return fsPath.substring(rootFsPath.length);
                    }
                    return fsPath;
                }
            };
            return labelService;
        });
        const model = createTextModel('', undefined, undefined, URI.parse('file:///foo/files/text.txt'));
        // empty workspace
        resolver = new ModelBasedVariableResolver(workspaceLabelService(''), model);
        if (!isWindows) {
            assertVariableResolve(resolver, 'RELATIVE_FILEPATH', '/foo/files/text.txt');
        }
        else {
            assertVariableResolve(resolver, 'RELATIVE_FILEPATH', '\\foo\\files\\text.txt');
        }
        // single folder workspace
        resolver = new ModelBasedVariableResolver(workspaceLabelService('/foo'), model);
        if (!isWindows) {
            assertVariableResolve(resolver, 'RELATIVE_FILEPATH', 'files/text.txt');
        }
        else {
            assertVariableResolve(resolver, 'RELATIVE_FILEPATH', 'files\\text.txt');
        }
        model.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldFZhcmlhYmxlcy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvc25pcHBldC90ZXN0L2Jyb3dzZXIvc25pcHBldFZhcmlhYmxlcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssS0FBSyxNQUFNLE9BQU8sQ0FBQztBQUMvQixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsYUFBYSxFQUE4QixNQUFNLGdDQUFnQyxDQUFDO0FBQzNGLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxnQ0FBZ0MsRUFBRSwwQkFBMEIsRUFBRSw4QkFBOEIsRUFBRSx5QkFBeUIsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVPLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUUzRSxPQUFPLEVBQXdDLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDaEksT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFN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