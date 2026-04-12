/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { CoreEditingCommands } from '../../../../browser/coreCommands.js';
import { Selection } from '../../../../common/core/selection.js';
import { Range } from '../../../../common/core/range.js';
import { SnippetController2 } from '../../browser/snippetController2.js';
import { createTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('SnippetController2', function () {
    /** @deprecated */
    function assertSelections(editor, ...s) {
        for (const selection of editor.getSelections()) {
            const actual = s.shift();
            assert.ok(selection.equalsSelection(actual), `actual=${selection.toString()} <> expected=${actual.toString()}`);
        }
        assert.strictEqual(s.length, 0);
    }
    function assertContextKeys(service, inSnippet, hasPrev, hasNext) {
        const state = getContextState(service);
        assert.strictEqual(state.inSnippet, inSnippet, `inSnippetMode`);
        assert.strictEqual(state.hasPrev, hasPrev, `HasPrevTabstop`);
        assert.strictEqual(state.hasNext, hasNext, `HasNextTabstop`);
    }
    function getContextState(service = contextKeys) {
        return {
            inSnippet: SnippetController2.InSnippetMode.getValue(service),
            hasPrev: SnippetController2.HasPrevTabstop.getValue(service),
            hasNext: SnippetController2.HasNextTabstop.getValue(service),
        };
    }
    let ctrl;
    let editor;
    let model;
    let contextKeys;
    let instaService;
    setup(function () {
        contextKeys = new MockContextKeyService();
        model = createTextModel('if\n    $state\nfi');
        const serviceCollection = new ServiceCollection([ILabelService, new class extends mock() {
            }], [IWorkspaceContextService, new class extends mock() {
                getWorkspace() {
                    return { id: 'foo', folders: [] };
                }
            }], [ILogService, new NullLogService()], [IContextKeyService, contextKeys]);
        instaService = new InstantiationService(serviceCollection);
        editor = createTestCodeEditor(model, { serviceCollection });
        editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5)]);
        assert.strictEqual(model.getEOL(), '\n');
    });
    teardown(function () {
        model.dispose();
        ctrl.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('creation', () => {
        ctrl = instaService.createInstance(SnippetController2, editor);
        assertContextKeys(contextKeys, false, false, false);
    });
    test('insert, insert -> abort', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('foo${1:bar}foo$0');
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
        ctrl.cancel();
        assertContextKeys(contextKeys, false, false, false);
        assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
    });
    test('insert, insert -> tab, tab, done', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('${1:one}${2:two}$0');
        assertContextKeys(contextKeys, true, false, true);
        ctrl.next();
        assertContextKeys(contextKeys, true, true, true);
        ctrl.next();
        assertContextKeys(contextKeys, false, false, false);
        editor.trigger('test', 'type', { text: '\t' });
        assert.strictEqual(SnippetController2.InSnippetMode.getValue(contextKeys), false);
        assert.strictEqual(SnippetController2.HasNextTabstop.getValue(contextKeys), false);
        assert.strictEqual(SnippetController2.HasPrevTabstop.getValue(contextKeys), false);
    });
    test('insert, insert -> cursor moves out (left/right)', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('foo${1:bar}foo$0');
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
        // bad selection change
        editor.setSelections([new Selection(1, 12, 1, 12), new Selection(2, 16, 2, 16)]);
        assertContextKeys(contextKeys, false, false, false);
    });
    test('insert, insert -> cursor moves out (up/down)', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('foo${1:bar}foo$0');
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
        // bad selection change
        editor.setSelections([new Selection(2, 4, 2, 7), new Selection(3, 8, 3, 11)]);
        assertContextKeys(contextKeys, false, false, false);
    });
    test('insert, insert -> cursors collapse', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('foo${1:bar}foo$0');
        assert.strictEqual(SnippetController2.InSnippetMode.getValue(contextKeys), true);
        assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
        // bad selection change
        editor.setSelections([new Selection(1, 4, 1, 7)]);
        assertContextKeys(contextKeys, false, false, false);
    });
    test('insert, insert plain text -> no snippet mode', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('foobar');
        assertContextKeys(contextKeys, false, false, false);
        assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
    });
    test('insert, delete snippet text', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('${1:foobar}$0');
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 1, 1, 7), new Selection(2, 5, 2, 11));
        editor.trigger('test', 'cut', {});
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
        editor.trigger('test', 'type', { text: 'abc' });
        assertContextKeys(contextKeys, true, false, true);
        ctrl.next();
        assertContextKeys(contextKeys, false, false, false);
        editor.trigger('test', 'tab', {});
        assertContextKeys(contextKeys, false, false, false);
        // editor.trigger('test', 'type', { text: 'abc' });
        // assertContextKeys(contextKeys, false, false, false);
    });
    test('insert, nested trivial snippet', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('${1:foo}bar$0');
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 1, 1, 4), new Selection(2, 5, 2, 8));
        ctrl.insert('FOO$0');
        assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
        assertContextKeys(contextKeys, true, false, true);
        ctrl.next();
        assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
        assertContextKeys(contextKeys, false, false, false);
    });
    test('insert, nested snippet', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('${1:foobar}$0');
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 1, 1, 7), new Selection(2, 5, 2, 11));
        ctrl.insert('far$1boo$0');
        assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
        assertContextKeys(contextKeys, true, false, true);
        ctrl.next();
        assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
        assertContextKeys(contextKeys, true, true, true);
        ctrl.next();
        assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
        assertContextKeys(contextKeys, false, false, false);
    });
    test('insert, nested plain text', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('${1:foobar}$0');
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 1, 1, 7), new Selection(2, 5, 2, 11));
        ctrl.insert('farboo');
        assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
        assertContextKeys(contextKeys, true, false, true);
        ctrl.next();
        assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
        assertContextKeys(contextKeys, false, false, false);
    });
    test('Nested snippets without final placeholder jumps to next outer placeholder, #27898', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('for(const ${1:element} of ${2:array}) {$0}');
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 11, 1, 18), new Selection(2, 15, 2, 22));
        ctrl.next();
        assertContextKeys(contextKeys, true, true, true);
        assertSelections(editor, new Selection(1, 22, 1, 27), new Selection(2, 26, 2, 31));
        ctrl.insert('document');
        assertContextKeys(contextKeys, true, true, true);
        assertSelections(editor, new Selection(1, 30, 1, 30), new Selection(2, 34, 2, 34));
        ctrl.next();
        assertContextKeys(contextKeys, false, false, false);
    });
    test('Inconsistent tab stop behaviour with recursive snippets and tab / shift tab, #27543', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.insert('1_calize(${1:nl}, \'${2:value}\')$0');
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 10, 1, 12), new Selection(2, 14, 2, 16));
        ctrl.insert('2_calize(${1:nl}, \'${2:value}\')$0');
        assertSelections(editor, new Selection(1, 19, 1, 21), new Selection(2, 23, 2, 25));
        ctrl.next(); // inner `value`
        assertSelections(editor, new Selection(1, 24, 1, 29), new Selection(2, 28, 2, 33));
        ctrl.next(); // inner `$0`
        assertSelections(editor, new Selection(1, 31, 1, 31), new Selection(2, 35, 2, 35));
        ctrl.next(); // outer `value`
        assertSelections(editor, new Selection(1, 34, 1, 39), new Selection(2, 38, 2, 43));
        ctrl.prev(); // inner `$0`
        assertSelections(editor, new Selection(1, 31, 1, 31), new Selection(2, 35, 2, 35));
    });
    test('Snippet tabstop selecting content of previously entered variable only works when separated by space, #23728', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        ctrl.insert('import ${2:${1:module}} from \'${1:module}\'$0');
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 8, 1, 14), new Selection(1, 21, 1, 27));
        ctrl.insert('foo');
        assertSelections(editor, new Selection(1, 11, 1, 11), new Selection(1, 21, 1, 21));
        ctrl.next(); // ${2:...}
        assertSelections(editor, new Selection(1, 8, 1, 11));
    });
    test('HTML Snippets Combine, #32211', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        model.updateOptions({ insertSpaces: false, tabSize: 4, trimAutoWhitespace: false });
        editor.setSelection(new Selection(1, 1, 1, 1));
        ctrl.insert(`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=\${2:device-width}, initial-scale=\${3:1.0}">
				<meta http-equiv="X-UA-Compatible" content="\${5:ie=edge}">
				<title>\${7:Document}</title>
			</head>
			<body>
				\${8}
			</body>
			</html>
		`);
        ctrl.next();
        ctrl.next();
        ctrl.next();
        ctrl.next();
        assertSelections(editor, new Selection(11, 5, 11, 5));
        ctrl.insert('<input type="${2:text}">');
        assertSelections(editor, new Selection(11, 18, 11, 22));
    });
    test('Problems with nested snippet insertion #39594', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        ctrl.insert('$1 = ConvertTo-Json $1');
        assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(1, 19, 1, 19));
        editor.setSelection(new Selection(1, 19, 1, 19));
        // snippet mode should stop because $1 has two occurrences
        // and we only have one selection left
        assertContextKeys(contextKeys, false, false, false);
    });
    test('Problems with nested snippet insertion #39594 (part2)', function () {
        // ensure selection-change-to-cancel logic isn't too aggressive
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('a-\naaa-');
        editor.setSelections([new Selection(2, 5, 2, 5), new Selection(1, 3, 1, 3)]);
        ctrl.insert('log($1);$0');
        assertSelections(editor, new Selection(2, 9, 2, 9), new Selection(1, 7, 1, 7));
        assertContextKeys(contextKeys, true, false, true);
    });
    test('“Nested” snippets terminating abruptly in VSCode 1.19.2. #42012', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        ctrl.insert('var ${2:${1:name}} = ${1:name} + 1;${0}');
        assertSelections(editor, new Selection(1, 5, 1, 9), new Selection(1, 12, 1, 16));
        assertContextKeys(contextKeys, true, false, true);
        ctrl.next();
        assertContextKeys(contextKeys, true, true, true);
    });
    test('Placeholders order #58267', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        ctrl.insert('\\pth{$1}$0');
        assertSelections(editor, new Selection(1, 6, 1, 6));
        assertContextKeys(contextKeys, true, false, true);
        ctrl.insert('\\itv{${1:left}}{${2:right}}{${3:left_value}}{${4:right_value}}$0');
        assertSelections(editor, new Selection(1, 11, 1, 15));
        ctrl.next();
        assertSelections(editor, new Selection(1, 17, 1, 22));
        ctrl.next();
        assertSelections(editor, new Selection(1, 24, 1, 34));
        ctrl.next();
        assertSelections(editor, new Selection(1, 36, 1, 47));
        ctrl.next();
        assertSelections(editor, new Selection(1, 48, 1, 48));
        ctrl.next();
        assertSelections(editor, new Selection(1, 49, 1, 49));
        assertContextKeys(contextKeys, false, false, false);
    });
    test('Must tab through deleted tab stops in snippets #31619', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        ctrl.insert('foo${1:a${2:bar}baz}end$0');
        assertSelections(editor, new Selection(1, 4, 1, 11));
        editor.trigger('test', "cut" /* Handler.Cut */, null);
        assertSelections(editor, new Selection(1, 4, 1, 4));
        ctrl.next();
        assertSelections(editor, new Selection(1, 7, 1, 7));
        assertContextKeys(contextKeys, false, false, false);
    });
    test('Cancelling snippet mode should discard added cursors #68512 (soft cancel)', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        ctrl.insert('.REGION ${2:FUNCTION_NAME}\nCREATE.FUNCTION ${1:VOID} ${2:FUNCTION_NAME}(${3:})\n\t${4:}\nEND\n.ENDREGION$0');
        assertSelections(editor, new Selection(2, 17, 2, 21));
        ctrl.next();
        assertSelections(editor, new Selection(1, 9, 1, 22), new Selection(2, 22, 2, 35));
        assertContextKeys(contextKeys, true, true, true);
        editor.setSelections([new Selection(1, 22, 1, 22), new Selection(2, 35, 2, 35)]);
        assertContextKeys(contextKeys, true, true, true);
        editor.setSelections([new Selection(2, 1, 2, 1), new Selection(2, 36, 2, 36)]);
        assertContextKeys(contextKeys, false, false, false);
        assertSelections(editor, new Selection(2, 1, 2, 1), new Selection(2, 36, 2, 36));
    });
    test('Cancelling snippet mode should discard added cursors #68512 (hard cancel)', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        ctrl.insert('.REGION ${2:FUNCTION_NAME}\nCREATE.FUNCTION ${1:VOID} ${2:FUNCTION_NAME}(${3:})\n\t${4:}\nEND\n.ENDREGION$0');
        assertSelections(editor, new Selection(2, 17, 2, 21));
        ctrl.next();
        assertSelections(editor, new Selection(1, 9, 1, 22), new Selection(2, 22, 2, 35));
        assertContextKeys(contextKeys, true, true, true);
        editor.setSelections([new Selection(1, 22, 1, 22), new Selection(2, 35, 2, 35)]);
        assertContextKeys(contextKeys, true, true, true);
        ctrl.cancel(true);
        assertContextKeys(contextKeys, false, false, false);
        assertSelections(editor, new Selection(1, 22, 1, 22));
    });
    test('User defined snippet tab stops ignored #72862', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        ctrl.insert('export default $1');
        assertContextKeys(contextKeys, true, false, true);
    });
    test('Optional tabstop in snippets #72358', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        ctrl.insert('${1:prop: {$2\\},}\nmore$0');
        assertContextKeys(contextKeys, true, false, true);
        assertSelections(editor, new Selection(1, 1, 1, 10));
        editor.trigger('test', "cut" /* Handler.Cut */, {});
        assertSelections(editor, new Selection(1, 1, 1, 1));
        ctrl.next();
        assertSelections(editor, new Selection(2, 5, 2, 5));
        assertContextKeys(contextKeys, false, false, false);
    });
    test('issue #90135: confusing trim whitespace edits', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.runCommand(CoreEditingCommands.Tab, null);
        ctrl.insert('\nfoo');
        assertSelections(editor, new Selection(2, 8, 2, 8));
    });
    test('issue #145727: insertSnippet can put snippet selections in wrong positions (1 of 2)', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.runCommand(CoreEditingCommands.Tab, null);
        ctrl.insert('\naProperty: aClass<${2:boolean}> = new aClass<${2:boolean}>();\n', { adjustWhitespace: false });
        assertSelections(editor, new Selection(2, 19, 2, 26), new Selection(2, 41, 2, 48));
    });
    test('issue #145727: insertSnippet can put snippet selections in wrong positions (2 of 2)', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        editor.runCommand(CoreEditingCommands.Tab, null);
        ctrl.insert('\naProperty: aClass<${2:boolean}> = new aClass<${2:boolean}>();\n');
        // This will insert \n    aProperty....
        assertSelections(editor, new Selection(2, 23, 2, 30), new Selection(2, 45, 2, 52));
    });
    test('leading TAB by snippets won\'t replace by spaces #101870', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        model.updateOptions({ insertSpaces: true, tabSize: 4 });
        ctrl.insert('\tHello World\n\tNew Line');
        assert.strictEqual(model.getValue(), '    Hello World\n    New Line');
    });
    test('leading TAB by snippets won\'t replace by spaces #101870 (part 2)', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        model.updateOptions({ insertSpaces: true, tabSize: 4 });
        ctrl.insert('\tHello World\n\tNew Line\n${1:\tmore}');
        assert.strictEqual(model.getValue(), '    Hello World\n    New Line\n    more');
    });
    test.skip('Snippet transformation does not work after inserting variable using intellisense, #112362', function () {
        {
            // HAPPY - no nested snippet
            ctrl = instaService.createInstance(SnippetController2, editor);
            model.setValue('');
            model.updateOptions({ insertSpaces: true, tabSize: 4 });
            ctrl.insert('$1\n\n${1/([A-Za-z0-9]+): ([A-Za-z]+).*/$1: \'$2\',/gm}');
            assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(3, 1, 3, 1));
            editor.trigger('test', 'type', { text: 'foo: number;' });
            ctrl.next();
            assert.strictEqual(model.getValue(), `foo: number;\n\nfoo: 'number',`);
        }
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        model.updateOptions({ insertSpaces: true, tabSize: 4 });
        ctrl.insert('$1\n\n${1/([A-Za-z0-9]+): ([A-Za-z]+).*/$1: \'$2\',/gm}');
        assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(3, 1, 3, 1));
        editor.trigger('test', 'type', { text: 'foo: ' });
        ctrl.insert('number;');
        ctrl.next();
        assert.strictEqual(model.getValue(), `foo: number;\n\nfoo: 'number',`);
        // editor.trigger('test', 'type', { text: ';' });
    });
    suite('createEditsAndSnippetsFromEdits', function () {
        test('apply, tab, done', function () {
            ctrl = instaService.createInstance(SnippetController2, editor);
            model.setValue('foo("bar")');
            ctrl.apply([
                { range: new Range(1, 5, 1, 10), template: '$1' },
                { range: new Range(1, 1, 1, 1), template: 'const ${1:new_const} = "bar";\n' }
            ]);
            assert.strictEqual(model.getValue(), 'const new_const = "bar";\nfoo(new_const)');
            assertContextKeys(contextKeys, true, false, true);
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 16), new Selection(2, 5, 2, 14)]);
            ctrl.next();
            assertContextKeys(contextKeys, false, false, false);
            assert.deepStrictEqual(editor.getSelections(), [new Selection(2, 14, 2, 14)]);
        });
        test('apply, tab, done with special final tabstop', function () {
            model.setValue('foo("bar")');
            ctrl = instaService.createInstance(SnippetController2, editor);
            ctrl.apply([
                { range: new Range(1, 5, 1, 10), template: '$1' },
                { range: new Range(1, 1, 1, 1), template: 'const ${1:new_const}$0 = "bar";\n' }
            ]);
            assert.strictEqual(model.getValue(), 'const new_const = "bar";\nfoo(new_const)');
            assertContextKeys(contextKeys, true, false, true);
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 16), new Selection(2, 5, 2, 14)]);
            ctrl.next();
            assertContextKeys(contextKeys, false, false, false);
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 16, 1, 16)]);
        });
        test('apply, tab, tab, done', function () {
            model.setValue('foo\nbar');
            ctrl = instaService.createInstance(SnippetController2, editor);
            ctrl.apply([
                { range: new Range(1, 4, 1, 4), template: '${3}' },
                { range: new Range(2, 4, 2, 4), template: '$3' },
                { range: new Range(1, 1, 1, 1), template: '### ${2:Header}\n' }
            ]);
            assert.strictEqual(model.getValue(), '### Header\nfoo\nbar');
            assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 5, 1, 11)]);
            ctrl.next();
            assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: true, hasNext: true });
            assert.deepStrictEqual(editor.getSelections(), [new Selection(2, 4, 2, 4), new Selection(3, 4, 3, 4)]);
            ctrl.next();
            assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
            assert.deepStrictEqual(editor.getSelections(), [new Selection(3, 4, 3, 4)]);
        });
        test('nested into apply works', function () {
            ctrl = instaService.createInstance(SnippetController2, editor);
            model.setValue('onetwo');
            editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);
            ctrl.apply([{
                    range: new Range(1, 7, 1, 7),
                    template: '$0${1:three}'
                }]);
            assert.strictEqual(model.getValue(), 'onetwothree');
            assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 12)]);
            ctrl.insert('foo$1bar$1');
            assert.strictEqual(model.getValue(), 'onetwofoobar');
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 10, 1, 10), new Selection(1, 13, 1, 13)]);
            assert.deepStrictEqual(getContextState(), ({ inSnippet: true, hasPrev: false, hasNext: true }));
            ctrl.next();
            assert.deepStrictEqual(getContextState(), ({ inSnippet: true, hasPrev: true, hasNext: true }));
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 13, 1, 13)]);
            ctrl.next();
            assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 7)]);
        });
        test('nested into insert abort "outer" snippet', function () {
            ctrl = instaService.createInstance(SnippetController2, editor);
            model.setValue('one\ntwo');
            editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);
            ctrl.insert('foo${1:bar}bazz${1:bang}');
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 4, 1, 7), new Selection(1, 11, 1, 14), new Selection(2, 4, 2, 7), new Selection(2, 11, 2, 14)]);
            assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });
            ctrl.apply([{
                    range: new Range(1, 4, 1, 7),
                    template: '$0A'
                }]);
            assert.strictEqual(model.getValue(), 'fooAbazzbarone\nfoobarbazzbartwo');
            assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 4, 1, 4)]);
        });
        test('nested into "insert" abort "outer" snippet (2)', function () {
            ctrl = instaService.createInstance(SnippetController2, editor);
            model.setValue('one\ntwo');
            editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);
            ctrl.insert('foo${1:bar}bazz${1:bang}');
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 4, 1, 7), new Selection(1, 11, 1, 14), new Selection(2, 4, 2, 7), new Selection(2, 11, 2, 14)]);
            assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });
            const edits = [{
                    range: new Range(1, 4, 1, 7),
                    template: 'A'
                }, {
                    range: new Range(1, 11, 1, 14),
                    template: 'B'
                }, {
                    range: new Range(2, 4, 2, 7),
                    template: 'C'
                }, {
                    range: new Range(2, 11, 2, 14),
                    template: 'D'
                }];
            ctrl.apply(edits);
            assert.strictEqual(model.getValue(), 'fooAbazzBone\nfooCbazzDtwo');
            assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 5, 1, 5), new Selection(1, 10, 1, 10), new Selection(2, 5, 2, 5), new Selection(2, 10, 2, 10)]);
        });
    });
    test('Bug: cursor position $0 with user snippets #163808', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        ctrl.insert('<Element1 Attr1="foo" $1>\n  <Element2 Attr1="$2"/>\n$0"\n</Element1>');
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 23, 1, 23)]);
        ctrl.insert('Qualifier="$0"');
        assert.strictEqual(model.getValue(), '<Element1 Attr1="foo" Qualifier="">\n  <Element2 Attr1=""/>\n"\n</Element1>');
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 34, 1, 34)]);
    });
    test('EOL-Sequence (CRLF) shifts tab stop in isFileTemplate snippets #167386', function () {
        ctrl = instaService.createInstance(SnippetController2, editor);
        model.setValue('');
        model.setEOL(1 /* EndOfLineSequence.CRLF */);
        ctrl.apply([{
                range: model.getFullModelRange(),
                template: 'line 54321${1:FOO}\nline 54321${1:FOO}\n(no tab stop)\nline 54321${1:FOO}\nline 54321'
            }]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 11, 1, 14), new Selection(2, 11, 2, 14), new Selection(4, 11, 4, 14)]);
    });
    test('"Surround With" code action snippets use incorrect indentation levels and styles #169319', function () {
        model.setValue('function foo(f, x, condition) {\n    f();\n    return x;\n}');
        const sel = new Range(2, 5, 3, 14);
        editor.setSelection(sel);
        ctrl = instaService.createInstance(SnippetController2, editor);
        ctrl.apply([{
                range: sel,
                template: 'if (${1:condition}) {\n\t$TM_SELECTED_TEXT$0\n}'
            }]);
        assert.strictEqual(model.getValue(), `function foo(f, x, condition) {\n    if (condition) {\n        f();\n        return x;\n    }\n}`);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldENvbnRyb2xsZXIyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9zbmlwcGV0L3Rlc3QvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHekQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDekUsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLDRDQUE0QyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUU3RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUM1RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN0RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUNoSCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUVqRyxPQUFPLEVBQUUsdUNB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