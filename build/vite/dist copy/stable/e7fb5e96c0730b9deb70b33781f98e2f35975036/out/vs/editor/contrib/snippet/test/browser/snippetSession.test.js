/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { SnippetParser } from '../../browser/snippetParser.js';
import { SnippetSession } from '../../browser/snippetSession.js';
import { createTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
suite('SnippetSession', function () {
    let languageConfigurationService;
    let editor;
    let model;
    function assertSelections(editor, ...s) {
        for (const selection of editor.getSelections()) {
            const actual = s.shift();
            assert.ok(selection.equalsSelection(actual), `actual=${selection.toString()} <> expected=${actual.toString()}`);
        }
        assert.strictEqual(s.length, 0);
    }
    setup(function () {
        model = createTextModel('function foo() {\n    console.log(a);\n}');
        languageConfigurationService = new TestLanguageConfigurationService();
        const serviceCollection = new ServiceCollection([ILabelService, new class extends mock() {
            }], [ILanguageConfigurationService, languageConfigurationService], [IWorkspaceContextService, new class extends mock() {
                getWorkspace() {
                    return {
                        id: 'workspace-id',
                        folders: [],
                    };
                }
            }]);
        editor = createTestCodeEditor(model, { serviceCollection });
        editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5)]);
        assert.strictEqual(model.getEOL(), '\n');
    });
    teardown(function () {
        model.dispose();
        editor.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('normalize whitespace', function () {
        function assertNormalized(position, input, expected) {
            const snippet = new SnippetParser().parse(input);
            SnippetSession.adjustWhitespace(model, position, true, snippet);
            assert.strictEqual(snippet.toTextmateString(), expected);
        }
        assertNormalized(new Position(1, 1), 'foo', 'foo');
        assertNormalized(new Position(1, 1), 'foo\rbar', 'foo\nbar');
        assertNormalized(new Position(1, 1), 'foo\rbar', 'foo\nbar');
        assertNormalized(new Position(2, 5), 'foo\r\tbar', 'foo\n        bar');
        assertNormalized(new Position(2, 3), 'foo\r\tbar', 'foo\n    bar');
        assertNormalized(new Position(2, 5), 'foo\r\tbar\nfoo', 'foo\n        bar\n    foo');
        //Indentation issue with choice elements that span multiple lines #46266
        assertNormalized(new Position(2, 5), 'a\nb${1|foo,\nbar|}', 'a\n    b${1|foo,\nbar|}');
    });
    test('adjust selection (overwrite[Before|After])', function () {
        let range = SnippetSession.adjustSelection(model, new Selection(1, 2, 1, 2), 1, 0);
        assert.ok(range.equalsRange(new Range(1, 1, 1, 2)));
        range = SnippetSession.adjustSelection(model, new Selection(1, 2, 1, 2), 1111, 0);
        assert.ok(range.equalsRange(new Range(1, 1, 1, 2)));
        range = SnippetSession.adjustSelection(model, new Selection(1, 2, 1, 2), 0, 10);
        assert.ok(range.equalsRange(new Range(1, 2, 1, 12)));
        range = SnippetSession.adjustSelection(model, new Selection(1, 2, 1, 2), 0, 10111);
        assert.ok(range.equalsRange(new Range(1, 2, 1, 17)));
    });
    test('text edits & selection', function () {
        const session = new SnippetSession(editor, 'foo${1:bar}foo$0', undefined, languageConfigurationService);
        session.insert();
        assert.strictEqual(editor.getModel().getValue(), 'foobarfoofunction foo() {\n    foobarfooconsole.log(a);\n}');
        assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
        session.next();
        assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
    });
    test('text edit with reversed selection', function () {
        const session = new SnippetSession(editor, '${1:bar}$0', undefined, languageConfigurationService);
        editor.setSelections([new Selection(2, 5, 2, 5), new Selection(1, 1, 1, 1)]);
        session.insert();
        assert.strictEqual(model.getValue(), 'barfunction foo() {\n    barconsole.log(a);\n}');
        assertSelections(editor, new Selection(2, 5, 2, 8), new Selection(1, 1, 1, 4));
    });
    test('snippets, repeated tabstops', function () {
        const session = new SnippetSession(editor, '${1:abc}foo${1:abc}$0', undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(1, 1, 1, 4), new Selection(1, 7, 1, 10), new Selection(2, 5, 2, 8), new Selection(2, 11, 2, 14));
        session.next();
        assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
    });
    test('snippets, just text', function () {
        const session = new SnippetSession(editor, 'foobar', undefined, languageConfigurationService);
        session.insert();
        assert.strictEqual(model.getValue(), 'foobarfunction foo() {\n    foobarconsole.log(a);\n}');
        assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
    });
    test('snippets, selections and new text with newlines', () => {
        const session = new SnippetSession(editor, 'foo\n\t${1:bar}\n$0', undefined, languageConfigurationService);
        session.insert();
        assert.strictEqual(editor.getModel().getValue(), 'foo\n    bar\nfunction foo() {\n    foo\n        bar\n    console.log(a);\n}');
        assertSelections(editor, new Selection(2, 5, 2, 8), new Selection(5, 9, 5, 12));
        session.next();
        assertSelections(editor, new Selection(3, 1, 3, 1), new Selection(6, 5, 6, 5));
    });
    test('snippets, newline NO whitespace adjust', () => {
        editor.setSelection(new Selection(2, 5, 2, 5));
        const session = new SnippetSession(editor, 'abc\n    foo\n        bar\n$0', { overwriteBefore: 0, overwriteAfter: 0, adjustWhitespace: false, clipboardText: undefined, overtypingCapturer: undefined }, languageConfigurationService);
        session.insert();
        assert.strictEqual(editor.getModel().getValue(), 'function foo() {\n    abc\n    foo\n        bar\nconsole.log(a);\n}');
    });
    test('snippets, selections -> next/prev', () => {
        const session = new SnippetSession(editor, 'f$1oo${2:bar}foo$0', undefined, languageConfigurationService);
        session.insert();
        // @ $2
        assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(2, 6, 2, 6));
        // @ $1
        session.next();
        assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
        // @ $2
        session.prev();
        assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(2, 6, 2, 6));
        // @ $1
        session.next();
        assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
        // @ $0
        session.next();
        assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
    });
    test('snippets, selections & typing', function () {
        const session = new SnippetSession(editor, 'f${1:oo}_$2_$0', undefined, languageConfigurationService);
        session.insert();
        editor.trigger('test', 'type', { text: 'X' });
        session.next();
        editor.trigger('test', 'type', { text: 'bar' });
        // go back to ${2:oo} which is now just 'X'
        session.prev();
        assertSelections(editor, new Selection(1, 2, 1, 3), new Selection(2, 6, 2, 7));
        // go forward to $1 which is now 'bar'
        session.next();
        assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
        // go to final tabstop
        session.next();
        assert.strictEqual(model.getValue(), 'fX_bar_function foo() {\n    fX_bar_console.log(a);\n}');
        assertSelections(editor, new Selection(1, 8, 1, 8), new Selection(2, 12, 2, 12));
    });
    test('snippets, insert shorter snippet into non-empty selection', function () {
        model.setValue('foo_bar_foo');
        editor.setSelections([new Selection(1, 1, 1, 4), new Selection(1, 9, 1, 12)]);
        new SnippetSession(editor, 'x$0', undefined, languageConfigurationService).insert();
        assert.strictEqual(model.getValue(), 'x_bar_x');
        assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(1, 8, 1, 8));
    });
    test('snippets, insert longer snippet into non-empty selection', function () {
        model.setValue('foo_bar_foo');
        editor.setSelections([new Selection(1, 1, 1, 4), new Selection(1, 9, 1, 12)]);
        new SnippetSession(editor, 'LONGER$0', undefined, languageConfigurationService).insert();
        assert.strictEqual(model.getValue(), 'LONGER_bar_LONGER');
        assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(1, 18, 1, 18));
    });
    test('snippets, don\'t grow final tabstop', function () {
        model.setValue('foo_zzz_foo');
        editor.setSelection(new Selection(1, 5, 1, 8));
        const session = new SnippetSession(editor, '$1bar$0', undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(1, 5, 1, 5));
        editor.trigger('test', 'type', { text: 'foo-' });
        session.next();
        assert.strictEqual(model.getValue(), 'foo_foo-bar_foo');
        assertSelections(editor, new Selection(1, 12, 1, 12));
        editor.trigger('test', 'type', { text: 'XXX' });
        assert.strictEqual(model.getValue(), 'foo_foo-barXXX_foo');
        session.prev();
        assertSelections(editor, new Selection(1, 5, 1, 9));
        session.next();
        assertSelections(editor, new Selection(1, 15, 1, 15));
    });
    test('snippets, don\'t merge touching tabstops 1/2', function () {
        const session = new SnippetSession(editor, '$1$2$3$0', undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
        session.next();
        assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
        session.next();
        assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
        session.next();
        assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
        session.prev();
        session.prev();
        session.prev();
        assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
        editor.trigger('test', 'type', { text: '111' });
        session.next();
        editor.trigger('test', 'type', { text: '222' });
        session.next();
        editor.trigger('test', 'type', { text: '333' });
        session.next();
        assert.strictEqual(model.getValue(), '111222333function foo() {\n    111222333console.log(a);\n}');
        assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
        session.prev();
        assertSelections(editor, new Selection(1, 7, 1, 10), new Selection(2, 11, 2, 14));
        session.prev();
        assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
        session.prev();
        assertSelections(editor, new Selection(1, 1, 1, 4), new Selection(2, 5, 2, 8));
    });
    test('snippets, don\'t merge touching tabstops 2/2', function () {
        const session = new SnippetSession(editor, '$1$2$3$0', undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
        editor.trigger('test', 'type', { text: '111' });
        session.next();
        assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
        editor.trigger('test', 'type', { text: '222' });
        session.next();
        assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
        editor.trigger('test', 'type', { text: '333' });
        session.next();
        assert.strictEqual(session.isAtLastPlaceholder, true);
    });
    test('snippets, gracefully move over final tabstop', function () {
        const session = new SnippetSession(editor, '${1}bar$0', undefined, languageConfigurationService);
        session.insert();
        assert.strictEqual(session.isAtLastPlaceholder, false);
        assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
        session.next();
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
        session.next();
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
    });
    test('snippets, overwriting nested placeholder', function () {
        const session = new SnippetSession(editor, 'log(${1:"$2"});$0', undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(1, 5, 1, 7), new Selection(2, 9, 2, 11));
        editor.trigger('test', 'type', { text: 'XXX' });
        assert.strictEqual(model.getValue(), 'log(XXX);function foo() {\n    log(XXX);console.log(a);\n}');
        session.next();
        assert.strictEqual(session.isAtLastPlaceholder, false);
        // assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
        session.next();
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
    });
    test('snippets, selections and snippet ranges', function () {
        const session = new SnippetSession(editor, '${1:foo}farboo${2:bar}$0', undefined, languageConfigurationService);
        session.insert();
        assert.strictEqual(model.getValue(), 'foofarboobarfunction foo() {\n    foofarboobarconsole.log(a);\n}');
        assertSelections(editor, new Selection(1, 1, 1, 4), new Selection(2, 5, 2, 8));
        assert.strictEqual(session.isSelectionWithinPlaceholders(), true);
        editor.setSelections([new Selection(1, 1, 1, 1)]);
        assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
        editor.setSelections([new Selection(1, 6, 1, 6), new Selection(2, 10, 2, 10)]);
        assert.strictEqual(session.isSelectionWithinPlaceholders(), false); // in snippet, outside placeholder
        editor.setSelections([new Selection(1, 6, 1, 6), new Selection(2, 10, 2, 10), new Selection(1, 1, 1, 1)]);
        assert.strictEqual(session.isSelectionWithinPlaceholders(), false); // in snippet, outside placeholder
        editor.setSelections([new Selection(1, 6, 1, 6), new Selection(2, 10, 2, 10), new Selection(2, 20, 2, 21)]);
        assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
        // reset selection to placeholder
        session.next();
        assert.strictEqual(session.isSelectionWithinPlaceholders(), true);
        assertSelections(editor, new Selection(1, 10, 1, 13), new Selection(2, 14, 2, 17));
        // reset selection to placeholder
        session.next();
        assert.strictEqual(session.isSelectionWithinPlaceholders(), true);
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(1, 13, 1, 13), new Selection(2, 17, 2, 17));
    });
    test('snippets, nested sessions', function () {
        model.setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        const first = new SnippetSession(editor, 'foo${2:bar}foo$0', undefined, languageConfigurationService);
        first.insert();
        assert.strictEqual(model.getValue(), 'foobarfoo');
        assertSelections(editor, new Selection(1, 4, 1, 7));
        const second = new SnippetSession(editor, 'ba${1:zzzz}$0', undefined, languageConfigurationService);
        second.insert();
        assert.strictEqual(model.getValue(), 'foobazzzzfoo');
        assertSelections(editor, new Selection(1, 6, 1, 10));
        second.next();
        assert.strictEqual(second.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(1, 10, 1, 10));
        first.next();
        assert.strictEqual(first.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(1, 13, 1, 13));
    });
    test('snippets, typing at final tabstop', function () {
        const session = new SnippetSession(editor, 'farboo$0', undefined, languageConfigurationService);
        session.insert();
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
        editor.trigger('test', 'type', { text: 'XXX' });
        assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
    });
    test('snippets, typing at beginning', function () {
        editor.setSelection(new Selection(1, 2, 1, 2));
        const session = new SnippetSession(editor, 'farboo$0', undefined, languageConfigurationService);
        session.insert();
        editor.setSelection(new Selection(1, 2, 1, 2));
        assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
        assert.strictEqual(session.isAtLastPlaceholder, true);
        editor.trigger('test', 'type', { text: 'XXX' });
        assert.strictEqual(model.getLineContent(1), 'fXXXfarboounction foo() {');
        assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
        session.next();
        assertSelections(editor, new Selection(1, 11, 1, 11));
    });
    test('snippets, typing with nested placeholder', function () {
        editor.setSelection(new Selection(1, 1, 1, 1));
        const session = new SnippetSession(editor, 'This ${1:is ${2:nested}}.$0', undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(1, 6, 1, 15));
        session.next();
        assertSelections(editor, new Selection(1, 9, 1, 15));
        editor.trigger('test', 'cut', {});
        assertSelections(editor, new Selection(1, 9, 1, 9));
        editor.trigger('test', 'type', { text: 'XXX' });
        session.prev();
        assertSelections(editor, new Selection(1, 6, 1, 12));
    });
    test('snippets, snippet with variables', function () {
        const session = new SnippetSession(editor, '@line=$TM_LINE_NUMBER$0', undefined, languageConfigurationService);
        session.insert();
        assert.strictEqual(model.getValue(), '@line=1function foo() {\n    @line=2console.log(a);\n}');
        assertSelections(editor, new Selection(1, 8, 1, 8), new Selection(2, 12, 2, 12));
    });
    test('snippets, merge', function () {
        editor.setSelection(new Selection(1, 1, 1, 1));
        const session = new SnippetSession(editor, 'This ${1:is ${2:nested}}.$0', undefined, languageConfigurationService);
        session.insert();
        session.next();
        assertSelections(editor, new Selection(1, 9, 1, 15));
        session.merge('really ${1:nested}$0');
        assertSelections(editor, new Selection(1, 16, 1, 22));
        session.next();
        assertSelections(editor, new Selection(1, 22, 1, 22));
        assert.strictEqual(session.isAtLastPlaceholder, false);
        session.next();
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(1, 23, 1, 23));
        session.prev();
        editor.trigger('test', 'type', { text: 'AAA' });
        // back to `really ${1:nested}`
        session.prev();
        assertSelections(editor, new Selection(1, 16, 1, 22));
        // back to `${1:is ...}` which now grew
        session.prev();
        assertSelections(editor, new Selection(1, 6, 1, 25));
    });
    test('snippets, transform', function () {
        editor.getModel().setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        const session = new SnippetSession(editor, '${1/foo/bar/}$0', undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(1, 1, 1, 1));
        editor.trigger('test', 'type', { text: 'foo' });
        session.next();
        assert.strictEqual(model.getValue(), 'bar');
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(1, 4, 1, 4));
    });
    test('snippets, multi placeholder same index one transform', function () {
        editor.getModel().setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        const session = new SnippetSession(editor, '$1 baz ${1/foo/bar/}$0', undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(1, 6, 1, 6));
        editor.trigger('test', 'type', { text: 'foo' });
        session.next();
        assert.strictEqual(model.getValue(), 'foo baz bar');
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(1, 12, 1, 12));
    });
    test('snippets, transform example', function () {
        editor.getModel().setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        const session = new SnippetSession(editor, '${1:name} : ${2:type}${3/\\s:=(.*)/${1:+ :=}${1}/};\n$0', undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(1, 1, 1, 5));
        editor.trigger('test', 'type', { text: 'clk' });
        session.next();
        assertSelections(editor, new Selection(1, 7, 1, 11));
        editor.trigger('test', 'type', { text: 'std_logic' });
        session.next();
        assertSelections(editor, new Selection(1, 16, 1, 16));
        session.next();
        assert.strictEqual(model.getValue(), 'clk : std_logic;\n');
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(2, 1, 2, 1));
    });
    test('snippets, transform with indent', function () {
        const snippet = [
            'private readonly ${1} = new Emitter<$2>();',
            'readonly ${1/^_(.*)/$1/}: Event<$2> = this.$1.event;',
            '$0'
        ].join('\n');
        const expected = [
            '{',
            '\tprivate readonly _prop = new Emitter<string>();',
            '\treadonly prop: Event<string> = this._prop.event;',
            '\t',
            '}'
        ].join('\n');
        const base = [
            '{',
            '\t',
            '}'
        ].join('\n');
        editor.getModel().setValue(base);
        editor.getModel().updateOptions({ insertSpaces: false });
        editor.setSelection(new Selection(2, 2, 2, 2));
        const session = new SnippetSession(editor, snippet, undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(2, 19, 2, 19), new Selection(3, 11, 3, 11), new Selection(3, 28, 3, 28));
        editor.trigger('test', 'type', { text: '_prop' });
        session.next();
        assertSelections(editor, new Selection(2, 39, 2, 39), new Selection(3, 23, 3, 23));
        editor.trigger('test', 'type', { text: 'string' });
        session.next();
        assert.strictEqual(model.getValue(), expected);
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(4, 2, 4, 2));
    });
    test('snippets, transform example hit if', function () {
        editor.getModel().setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        const session = new SnippetSession(editor, '${1:name} : ${2:type}${3/\\s:=(.*)/${1:+ :=}${1}/};\n$0', undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(1, 1, 1, 5));
        editor.trigger('test', 'type', { text: 'clk' });
        session.next();
        assertSelections(editor, new Selection(1, 7, 1, 11));
        editor.trigger('test', 'type', { text: 'std_logic' });
        session.next();
        assertSelections(editor, new Selection(1, 16, 1, 16));
        editor.trigger('test', 'type', { text: ' := \'1\'' });
        session.next();
        assert.strictEqual(model.getValue(), 'clk : std_logic := \'1\';\n');
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(2, 1, 2, 1));
    });
    test('Snippet tab stop selection issue #96545, snippets, transform adjacent to previous placeholder', function () {
        editor.getModel().setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        const session = new SnippetSession(editor, '${1:{}${2:fff}${1/{/}/}', undefined, languageConfigurationService);
        session.insert();
        assertSelections(editor, new Selection(1, 1, 1, 2), new Selection(1, 5, 1, 6));
        session.next();
        assert.strictEqual(model.getValue(), '{fff}');
        assertSelections(editor, new Selection(1, 2, 1, 5));
        editor.trigger('test', 'type', { text: 'ggg' });
        session.next();
        assert.strictEqual(model.getValue(), '{ggg}');
        assert.strictEqual(session.isAtLastPlaceholder, true);
        assertSelections(editor, new Selection(1, 6, 1, 6));
    });
    test('Snippet tab stop selection issue #96545', function () {
        editor.getModel().setValue('');
        const session = new SnippetSession(editor, '${1:{}${2:fff}${1/[\\{]/}/}$0', undefined, languageConfigurationService);
        session.insert();
        assert.strictEqual(editor.getModel().getValue(), '{fff{');
        assertSelections(editor, new Selection(1, 1, 1, 2), new Selection(1, 5, 1, 6));
        session.next();
        assertSelections(editor, new Selection(1, 2, 1, 5));
    });
    test('Snippet placeholder index incorrect after using 2+ snippets in a row that each end with a placeholder, #30769', function () {
        editor.getModel().setValue('');
        editor.setSelection(new Selection(1, 1, 1, 1));
        const session = new SnippetSession(editor, 'test ${1:replaceme}', undefined, languageConfigurationService);
        session.insert();
        editor.trigger('test', 'type', { text: '1' });
        editor.trigger('test', 'type', { text: '\n' });
        assert.strictEqual(editor.getModel().getValue(), 'test 1\n');
        session.merge('test ${1:replaceme}');
        editor.trigger('test', 'type', { text: '2' });
        editor.trigger('test', 'type', { text: '\n' });
        assert.strictEqual(editor.getModel().getValue(), 'test 1\ntest 2\n');
        session.merge('test ${1:replaceme}');
        editor.trigger('test', 'type', { text: '3' });
        editor.trigger('test', 'type', { text: '\n' });
        assert.strictEqual(editor.getModel().getValue(), 'test 1\ntest 2\ntest 3\n');
        session.merge('test ${1:replaceme}');
        editor.trigger('test', 'type', { text: '4' });
        editor.trigger('test', 'type', { text: '\n' });
        assert.strictEqual(editor.getModel().getValue(), 'test 1\ntest 2\ntest 3\ntest 4\n');
    });
    test('Snippet variable text isn\'t whitespace normalised, #31124', function () {
        editor.getModel().setValue([
            'start',
            '\t\t-one',
            '\t\t-two',
            'end'
        ].join('\n'));
        editor.getModel().updateOptions({ insertSpaces: false });
        editor.setSelection(new Selection(2, 2, 3, 7));
        new SnippetSession(editor, '<div>\n\t$TM_SELECTED_TEXT\n</div>$0', undefined, languageConfigurationService).insert();
        let expected = [
            'start',
            '\t<div>',
            '\t\t\t-one',
            '\t\t\t-two',
            '\t</div>',
            'end'
        ].join('\n');
        assert.strictEqual(editor.getModel().getValue(), expected);
        editor.getModel().setValue([
            'start',
            '\t\t-one',
            '\t-two',
            'end'
        ].join('\n'));
        editor.getModel().updateOptions({ insertSpaces: false });
        editor.setSelection(new Selection(2, 2, 3, 7));
        new SnippetSession(editor, '<div>\n\t$TM_SELECTED_TEXT\n</div>$0', undefined, languageConfigurationService).insert();
        expected = [
            'start',
            '\t<div>',
            '\t\t\t-one',
            '\t\t-two',
            '\t</div>',
            'end'
        ].join('\n');
        assert.strictEqual(editor.getModel().getValue(), expected);
    });
    test('Selecting text from left to right, and choosing item messes up code, #31199', function () {
        const model = editor.getModel();
        model.setValue('console.log');
        let actual = SnippetSession.adjustSelection(model, new Selection(1, 12, 1, 9), 3, 0);
        assert.ok(actual.equalsSelection(new Selection(1, 9, 1, 6)));
        actual = SnippetSession.adjustSelection(model, new Selection(1, 9, 1, 12), 3, 0);
        assert.ok(actual.equalsSelection(new Selection(1, 9, 1, 12)));
        editor.setSelections([new Selection(1, 9, 1, 12)]);
        new SnippetSession(editor, 'far', { overwriteBefore: 3, overwriteAfter: 0, adjustWhitespace: true, clipboardText: undefined, overtypingCapturer: undefined }, languageConfigurationService).insert();
        assert.strictEqual(model.getValue(), 'console.far');
    });
    test('Tabs don\'t get replaced with spaces in snippet transformations #103818', function () {
        const model = editor.getModel();
        model.setValue('\n{\n  \n}');
        model.updateOptions({ insertSpaces: true, indentSize: 2 });
        editor.setSelections([new Selection(1, 1, 1, 1), new Selection(3, 6, 3, 6)]);
        const session = new SnippetSession(editor, [
            'function animate () {',
            '\tvar ${1:a} = 12;',
            '\tconsole.log(${1/(.*)/\n\t\t$1\n\t/})',
            '}'
        ].join('\n'), undefined, languageConfigurationService);
        session.insert();
        assert.strictEqual(model.getValue(), [
            'function animate () {',
            '  var a = 12;',
            '  console.log(a)',
            '}',
            '{',
            '  function animate () {',
            '    var a = 12;',
            '    console.log(a)',
            '  }',
            '}',
        ].join('\n'));
        editor.trigger('test', 'type', { text: 'bbb' });
        session.next();
        assert.strictEqual(model.getValue(), [
            'function animate () {',
            '  var bbb = 12;',
            '  console.log(',
            '    bbb',
            '  )',
            '}',
            '{',
            '  function animate () {',
            '    var bbb = 12;',
            '    console.log(',
            '      bbb',
            '    )',
            '  }',
            '}',
        ].join('\n'));
    });
    suite('createEditsAndSnippetsFromEdits', function () {
        test('empty', function () {
            const result = SnippetSession.createEditsAndSnippetsFromEdits(editor, [], true, true, undefined, undefined, languageConfigurationService);
            assert.deepStrictEqual(result.edits, []);
            assert.deepStrictEqual(result.snippets, []);
        });
        test('basic', function () {
            editor.getModel().setValue('foo("bar")');
            const result = SnippetSession.createEditsAndSnippetsFromEdits(editor, [{ range: new Range(1, 5, 1, 9), template: '$1' }, { range: new Range(1, 1, 1, 1), template: 'const ${1:new_const} = "bar"' }], true, true, undefined, undefined, languageConfigurationService);
            assert.strictEqual(result.edits.length, 2);
            assert.deepStrictEqual(result.edits[0].range, new Range(1, 1, 1, 1));
            assert.deepStrictEqual(result.edits[0].text, 'const new_const = "bar"');
            assert.deepStrictEqual(result.edits[1].range, new Range(1, 5, 1, 9));
            assert.deepStrictEqual(result.edits[1].text, 'new_const');
            assert.strictEqual(result.snippets.length, 1);
            assert.strictEqual(result.snippets[0].isTrivialSnippet, false);
        });
        test('with $SELECTION variable', function () {
            editor.getModel().setValue('Some text and a selection');
            editor.setSelections([new Selection(1, 17, 1, 26)]);
            const result = SnippetSession.createEditsAndSnippetsFromEdits(editor, [{ range: new Range(1, 17, 1, 26), template: 'wrapped <$SELECTION>' }], true, true, undefined, undefined, languageConfigurationService);
            assert.strictEqual(result.edits.length, 1);
            assert.deepStrictEqual(result.edits[0].range, new Range(1, 17, 1, 26));
            assert.deepStrictEqual(result.edits[0].text, 'wrapped <selection>');
            assert.strictEqual(result.snippets.length, 1);
            assert.strictEqual(result.snippets[0].isTrivialSnippet, true);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldFNlc3Npb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3NuaXBwZXQvdGVzdC9icm93c2VyL3NuaXBwZXRTZXNzaW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQWEsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDMUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUU5RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3JILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN0RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDOUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFakcsS0FBSyxDQUFDLGdCQUFnQixFQUFFO0lBRXZCLElBQUksNEJB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QUMsTUFBTSxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0UsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2YsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0UsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2YsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0UsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2YsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0UsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2YsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0UsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFFaEQsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2YsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFFaEQsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2YsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFFaEQsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEVBQUUsNERBQTRELENBQUMsQ0FBQztRQUNuRyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsSUFBSSxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVuRixPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDZixnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsSUFBSSxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDZixnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsSUFBSSxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxTQUFTLENBQUMs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L0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFOUQsT0FBTyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRS9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFFdEUsT0FBTyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRS9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLDBCQUEwQixDQUFDLENBQUM7UUFFOUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRS9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEs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