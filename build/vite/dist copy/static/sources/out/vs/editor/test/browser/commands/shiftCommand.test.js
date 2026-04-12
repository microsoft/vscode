/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DocBlockCommentMode_1;
import assert from 'assert';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ShiftCommand } from '../../../common/commands/shiftCommand.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { getEditOperation, testCommand } from '../testCommand.js';
import { javascriptOnEnterRules } from '../../common/modes/supports/onEnterRules.js';
import { TestLanguageConfigurationService } from '../../common/modes/testLanguageConfigurationService.js';
import { withEditorModel } from '../../common/testTextModel.js';
/**
 * Create single edit operation
 */
function createSingleEditOp(text, positionLineNumber, positionColumn, selectionLineNumber = positionLineNumber, selectionColumn = positionColumn) {
    return {
        range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
        text: text,
        forceMoveMarkers: false
    };
}
let DocBlockCommentMode = class DocBlockCommentMode extends Disposable {
    static { DocBlockCommentMode_1 = this; }
    static { this.languageId = 'commentMode'; }
    constructor(languageService, languageConfigurationService) {
        super();
        this.languageId = DocBlockCommentMode_1.languageId;
        this._register(languageService.registerLanguage({ id: this.languageId }));
        this._register(languageConfigurationService.register(this.languageId, {
            brackets: [
                ['(', ')'],
                ['{', '}'],
                ['[', ']']
            ],
            onEnterRules: javascriptOnEnterRules
        }));
    }
};
DocBlockCommentMode = DocBlockCommentMode_1 = __decorate([
    __param(0, ILanguageService),
    __param(1, ILanguageConfigurationService)
], DocBlockCommentMode);
function testShiftCommand(lines, languageId, useTabStops, selection, expectedLines, expectedSelection, prepare) {
    testCommand(lines, languageId, selection, (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: false,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: false,
        useTabStops: useTabStops,
        autoIndent: 4 /* EditorAutoIndentStrategy.Full */,
    }, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection, undefined, prepare);
}
function testUnshiftCommand(lines, languageId, useTabStops, selection, expectedLines, expectedSelection, prepare) {
    testCommand(lines, languageId, selection, (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: true,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: false,
        useTabStops: useTabStops,
        autoIndent: 4 /* EditorAutoIndentStrategy.Full */,
    }, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection, undefined, prepare);
}
function prepareDocBlockCommentLanguage(accessor, disposables) {
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    const languageService = accessor.get(ILanguageService);
    disposables.add(new DocBlockCommentMode(languageService, languageConfigurationService));
}
suite('Editor Commands - ShiftCommand', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    // --------- shift
    test('Bug 9503: Shifting without any selection', () => {
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 1, 1, 1), [
            '\tMy First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(1, 2, 1, 2));
    });
    test('shift on single line selection 1', () => {
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 3, 1, 1), [
            '\tMy First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(1, 4, 1, 1));
    });
    test('shift on single line selection 2', () => {
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 1, 1, 3), [
            '\tMy First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(1, 1, 1, 4));
    });
    test('simple shift', () => {
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 1, 2, 1), [
            '\tMy First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(1, 1, 2, 1));
    });
    test('shifting on two separate lines', () => {
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 1, 2, 1), [
            '\tMy First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(1, 1, 2, 1));
        testShiftCommand([
            '\tMy First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(2, 1, 3, 1), [
            '\tMy First Line',
            '\t\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(2, 1, 3, 1));
    });
    test('shifting on two lines', () => {
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 2, 2, 2), [
            '\tMy First Line',
            '\t\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(1, 3, 2, 2));
    });
    test('shifting on two lines again', () => {
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(2, 2, 1, 2), [
            '\tMy First Line',
            '\t\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(2, 2, 1, 3));
    });
    test('shifting at end of file', () => {
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(4, 1, 5, 2), [
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '\t123'
        ], new Selection(4, 1, 5, 3));
    });
    test('issue #1120 TAB should not indent empty lines in a multi-line selection', () => {
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 1, 5, 2), [
            '\tMy First Line',
            '\t\t\tMy Second Line',
            '\t\tThird Line',
            '',
            '\t123'
        ], new Selection(1, 1, 5, 3));
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(4, 1, 5, 1), [
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '\t',
            '123'
        ], new Selection(4, 1, 5, 1));
    });
    // --------- unshift
    test('unshift on single line selection 1', () => {
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(2, 3, 2, 1), [
            'My First Line',
            '\t\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(2, 3, 2, 1));
    });
    test('unshift on single line selection 2', () => {
        testShiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(2, 1, 2, 3), [
            'My First Line',
            '\t\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(2, 1, 2, 3));
    });
    test('simple unshift', () => {
        testUnshiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 1, 2, 1), [
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(1, 1, 2, 1));
    });
    test('unshifting on two lines 1', () => {
        testUnshiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 2, 2, 2), [
            'My First Line',
            '\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(1, 2, 2, 2));
    });
    test('unshifting on two lines 2', () => {
        testUnshiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(2, 3, 2, 1), [
            'My First Line',
            '\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(2, 2, 2, 1));
    });
    test('unshifting at the end of the file', () => {
        testUnshiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(4, 1, 5, 2), [
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(4, 1, 5, 2));
    });
    test('unshift many times + shift', () => {
        testUnshiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 1, 5, 4), [
            'My First Line',
            '\tMy Second Line',
            'Third Line',
            '',
            '123'
        ], new Selection(1, 1, 5, 4));
        testUnshiftCommand([
            'My First Line',
            '\tMy Second Line',
            'Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 1, 5, 4), [
            'My First Line',
            'My Second Line',
            'Third Line',
            '',
            '123'
        ], new Selection(1, 1, 5, 4));
        testShiftCommand([
            'My First Line',
            'My Second Line',
            'Third Line',
            '',
            '123'
        ], null, true, new Selection(1, 1, 5, 4), [
            '\tMy First Line',
            '\tMy Second Line',
            '\tThird Line',
            '',
            '\t123'
        ], new Selection(1, 1, 5, 5));
    });
    test('Bug 9119: Unshift from first column doesn\'t work', () => {
        testUnshiftCommand([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], null, true, new Selection(2, 1, 2, 1), [
            'My First Line',
            '\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], new Selection(2, 1, 2, 1));
    });
    test('issue #348: indenting around doc block comments', () => {
        testShiftCommand([
            '',
            '/**',
            ' * a doc comment',
            ' */',
            'function hello() {}'
        ], DocBlockCommentMode.languageId, true, new Selection(1, 1, 5, 20), [
            '',
            '\t/**',
            '\t * a doc comment',
            '\t */',
            '\tfunction hello() {}'
        ], new Selection(1, 1, 5, 21), prepareDocBlockCommentLanguage);
        testUnshiftCommand([
            '',
            '/**',
            ' * a doc comment',
            ' */',
            'function hello() {}'
        ], DocBlockCommentMode.languageId, true, new Selection(1, 1, 5, 20), [
            '',
            '/**',
            ' * a doc comment',
            ' */',
            'function hello() {}'
        ], new Selection(1, 1, 5, 20), prepareDocBlockCommentLanguage);
        testUnshiftCommand([
            '\t',
            '\t/**',
            '\t * a doc comment',
            '\t */',
            '\tfunction hello() {}'
        ], DocBlockCommentMode.languageId, true, new Selection(1, 1, 5, 21), [
            '',
            '/**',
            ' * a doc comment',
            ' */',
            'function hello() {}'
        ], new Selection(1, 1, 5, 20), prepareDocBlockCommentLanguage);
    });
    test('issue #1609: Wrong indentation of block comments', () => {
        testShiftCommand([
            '',
            '/**',
            ' * test',
            ' *',
            ' * @type {number}',
            ' */',
            'var foo = 0;'
        ], DocBlockCommentMode.languageId, true, new Selection(1, 1, 7, 13), [
            '',
            '\t/**',
            '\t * test',
            '\t *',
            '\t * @type {number}',
            '\t */',
            '\tvar foo = 0;'
        ], new Selection(1, 1, 7, 14), prepareDocBlockCommentLanguage);
    });
    test('issue #1620: a) Line indent doesn\'t handle leading whitespace properly', () => {
        testCommand([
            '   Written | Numeric',
            '       one | 1',
            '       two | 2',
            '     three | 3',
            '      four | 4',
            '      five | 5',
            '       six | 6',
            '     seven | 7',
            '     eight | 8',
            '      nine | 9',
            '       ten | 10',
            '    eleven | 11',
            '',
        ], null, new Selection(1, 1, 13, 1), (accessor, sel) => new ShiftCommand(sel, {
            isUnshift: false,
            tabSize: 4,
            indentSize: 4,
            insertSpaces: true,
            useTabStops: false,
            autoIndent: 4 /* EditorAutoIndentStrategy.Full */,
        }, accessor.get(ILanguageConfigurationService)), [
            '       Written | Numeric',
            '           one | 1',
            '           two | 2',
            '         three | 3',
            '          four | 4',
            '          five | 5',
            '           six | 6',
            '         seven | 7',
            '         eight | 8',
            '          nine | 9',
            '           ten | 10',
            '        eleven | 11',
            '',
        ], new Selection(1, 1, 13, 1));
    });
    test('issue #1620: b) Line indent doesn\'t handle leading whitespace properly', () => {
        testCommand([
            '       Written | Numeric',
            '           one | 1',
            '           two | 2',
            '         three | 3',
            '          four | 4',
            '          five | 5',
            '           six | 6',
            '         seven | 7',
            '         eight | 8',
            '          nine | 9',
            '           ten | 10',
            '        eleven | 11',
            '',
        ], null, new Selection(1, 1, 13, 1), (accessor, sel) => new ShiftCommand(sel, {
            isUnshift: true,
            tabSize: 4,
            indentSize: 4,
            insertSpaces: true,
            useTabStops: false,
            autoIndent: 4 /* EditorAutoIndentStrategy.Full */,
        }, accessor.get(ILanguageConfigurationService)), [
            '   Written | Numeric',
            '       one | 1',
            '       two | 2',
            '     three | 3',
            '      four | 4',
            '      five | 5',
            '       six | 6',
            '     seven | 7',
            '     eight | 8',
            '      nine | 9',
            '       ten | 10',
            '    eleven | 11',
            '',
        ], new Selection(1, 1, 13, 1));
    });
    test('issue #1620: c) Line indent doesn\'t handle leading whitespace properly', () => {
        testCommand([
            '       Written | Numeric',
            '           one | 1',
            '           two | 2',
            '         three | 3',
            '          four | 4',
            '          five | 5',
            '           six | 6',
            '         seven | 7',
            '         eight | 8',
            '          nine | 9',
            '           ten | 10',
            '        eleven | 11',
            '',
        ], null, new Selection(1, 1, 13, 1), (accessor, sel) => new ShiftCommand(sel, {
            isUnshift: true,
            tabSize: 4,
            indentSize: 4,
            insertSpaces: false,
            useTabStops: false,
            autoIndent: 4 /* EditorAutoIndentStrategy.Full */,
        }, accessor.get(ILanguageConfigurationService)), [
            '   Written | Numeric',
            '       one | 1',
            '       two | 2',
            '     three | 3',
            '      four | 4',
            '      five | 5',
            '       six | 6',
            '     seven | 7',
            '     eight | 8',
            '      nine | 9',
            '       ten | 10',
            '    eleven | 11',
            '',
        ], new Selection(1, 1, 13, 1));
    });
    test('issue #1620: d) Line indent doesn\'t handle leading whitespace properly', () => {
        testCommand([
            '\t   Written | Numeric',
            '\t       one | 1',
            '\t       two | 2',
            '\t     three | 3',
            '\t      four | 4',
            '\t      five | 5',
            '\t       six | 6',
            '\t     seven | 7',
            '\t     eight | 8',
            '\t      nine | 9',
            '\t       ten | 10',
            '\t    eleven | 11',
            '',
        ], null, new Selection(1, 1, 13, 1), (accessor, sel) => new ShiftCommand(sel, {
            isUnshift: true,
            tabSize: 4,
            indentSize: 4,
            insertSpaces: true,
            useTabStops: false,
            autoIndent: 4 /* EditorAutoIndentStrategy.Full */,
        }, accessor.get(ILanguageConfigurationService)), [
            '   Written | Numeric',
            '       one | 1',
            '       two | 2',
            '     three | 3',
            '      four | 4',
            '      five | 5',
            '       six | 6',
            '     seven | 7',
            '     eight | 8',
            '      nine | 9',
            '       ten | 10',
            '    eleven | 11',
            '',
        ], new Selection(1, 1, 13, 1));
    });
    test('issue microsoft/monaco-editor#443: Indentation of a single row deletes selected text in some cases', () => {
        testCommand([
            'Hello world!',
            'another line'
        ], null, new Selection(1, 1, 1, 13), (accessor, sel) => new ShiftCommand(sel, {
            isUnshift: false,
            tabSize: 4,
            indentSize: 4,
            insertSpaces: false,
            useTabStops: true,
            autoIndent: 4 /* EditorAutoIndentStrategy.Full */,
        }, accessor.get(ILanguageConfigurationService)), [
            '\tHello world!',
            'another line'
        ], new Selection(1, 1, 1, 14));
    });
    test('bug #16815:Shift+Tab doesn\'t go back to tabstop', () => {
        const repeatStr = (str, cnt) => {
            let r = '';
            for (let i = 0; i < cnt; i++) {
                r += str;
            }
            return r;
        };
        const testOutdent = (tabSize, indentSize, insertSpaces, lineText, expectedIndents) => {
            const oneIndent = insertSpaces ? repeatStr(' ', indentSize) : '\t';
            const expectedIndent = repeatStr(oneIndent, expectedIndents);
            if (lineText.length > 0) {
                _assertUnshiftCommand(tabSize, indentSize, insertSpaces, [lineText + 'aaa'], [createSingleEditOp(expectedIndent, 1, 1, 1, lineText.length + 1)]);
            }
            else {
                _assertUnshiftCommand(tabSize, indentSize, insertSpaces, [lineText + 'aaa'], []);
            }
        };
        const testIndent = (tabSize, indentSize, insertSpaces, lineText, expectedIndents) => {
            const oneIndent = insertSpaces ? repeatStr(' ', indentSize) : '\t';
            const expectedIndent = repeatStr(oneIndent, expectedIndents);
            _assertShiftCommand(tabSize, indentSize, insertSpaces, [lineText + 'aaa'], [createSingleEditOp(expectedIndent, 1, 1, 1, lineText.length + 1)]);
        };
        const testIndentation = (tabSize, indentSize, lineText, expectedOnOutdent, expectedOnIndent) => {
            testOutdent(tabSize, indentSize, true, lineText, expectedOnOutdent);
            testOutdent(tabSize, indentSize, false, lineText, expectedOnOutdent);
            testIndent(tabSize, indentSize, true, lineText, expectedOnIndent);
            testIndent(tabSize, indentSize, false, lineText, expectedOnIndent);
        };
        // insertSpaces: true
        // 0 => 0
        testIndentation(4, 4, '', 0, 1);
        // 1 => 0
        testIndentation(4, 4, '\t', 0, 2);
        testIndentation(4, 4, ' ', 0, 1);
        testIndentation(4, 4, ' \t', 0, 2);
        testIndentation(4, 4, '  ', 0, 1);
        testIndentation(4, 4, '  \t', 0, 2);
        testIndentation(4, 4, '   ', 0, 1);
        testIndentation(4, 4, '   \t', 0, 2);
        testIndentation(4, 4, '    ', 0, 2);
        // 2 => 1
        testIndentation(4, 4, '\t\t', 1, 3);
        testIndentation(4, 4, '\t ', 1, 2);
        testIndentation(4, 4, '\t \t', 1, 3);
        testIndentation(4, 4, '\t  ', 1, 2);
        testIndentation(4, 4, '\t  \t', 1, 3);
        testIndentation(4, 4, '\t   ', 1, 2);
        testIndentation(4, 4, '\t   \t', 1, 3);
        testIndentation(4, 4, '\t    ', 1, 3);
        testIndentation(4, 4, ' \t\t', 1, 3);
        testIndentation(4, 4, ' \t ', 1, 2);
        testIndentation(4, 4, ' \t \t', 1, 3);
        testIndentation(4, 4, ' \t  ', 1, 2);
        testIndentation(4, 4, ' \t  \t', 1, 3);
        testIndentation(4, 4, ' \t   ', 1, 2);
        testIndentation(4, 4, ' \t   \t', 1, 3);
        testIndentation(4, 4, ' \t    ', 1, 3);
        testIndentation(4, 4, '  \t\t', 1, 3);
        testIndentation(4, 4, '  \t ', 1, 2);
        testIndentation(4, 4, '  \t \t', 1, 3);
        testIndentation(4, 4, '  \t  ', 1, 2);
        testIndentation(4, 4, '  \t  \t', 1, 3);
        testIndentation(4, 4, '  \t   ', 1, 2);
        testIndentation(4, 4, '  \t   \t', 1, 3);
        testIndentation(4, 4, '  \t    ', 1, 3);
        testIndentation(4, 4, '   \t\t', 1, 3);
        testIndentation(4, 4, '   \t ', 1, 2);
        testIndentation(4, 4, '   \t \t', 1, 3);
        testIndentation(4, 4, '   \t  ', 1, 2);
        testIndentation(4, 4, '   \t  \t', 1, 3);
        testIndentation(4, 4, '   \t   ', 1, 2);
        testIndentation(4, 4, '   \t   \t', 1, 3);
        testIndentation(4, 4, '   \t    ', 1, 3);
        testIndentation(4, 4, '    \t', 1, 3);
        testIndentation(4, 4, '     ', 1, 2);
        testIndentation(4, 4, '     \t', 1, 3);
        testIndentation(4, 4, '      ', 1, 2);
        testIndentation(4, 4, '      \t', 1, 3);
        testIndentation(4, 4, '       ', 1, 2);
        testIndentation(4, 4, '       \t', 1, 3);
        testIndentation(4, 4, '        ', 1, 3);
        // 3 => 2
        testIndentation(4, 4, '         ', 2, 3);
        function _assertUnshiftCommand(tabSize, indentSize, insertSpaces, text, expected) {
            return withEditorModel(text, (model) => {
                const testLanguageConfigurationService = new TestLanguageConfigurationService();
                const op = new ShiftCommand(new Selection(1, 1, text.length + 1, 1), {
                    isUnshift: true,
                    tabSize: tabSize,
                    indentSize: indentSize,
                    insertSpaces: insertSpaces,
                    useTabStops: true,
                    autoIndent: 4 /* EditorAutoIndentStrategy.Full */,
                }, testLanguageConfigurationService);
                const actual = getEditOperation(model, op);
                assert.deepStrictEqual(actual, expected);
                testLanguageConfigurationService.dispose();
            });
        }
        function _assertShiftCommand(tabSize, indentSize, insertSpaces, text, expected) {
            return withEditorModel(text, (model) => {
                const testLanguageConfigurationService = new TestLanguageConfigurationService();
                const op = new ShiftCommand(new Selection(1, 1, text.length + 1, 1), {
                    isUnshift: false,
                    tabSize: tabSize,
                    indentSize: indentSize,
                    insertSpaces: insertSpaces,
                    useTabStops: true,
                    autoIndent: 4 /* EditorAutoIndentStrategy.Full */,
                }, testLanguageConfigurationService);
                const actual = getEditOperation(model, op);
                assert.deepStrictEqual(actual, expected);
                testLanguageConfigurationService.dispose();
            });
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hpZnRDb21tYW5kLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9icm93c2VyL2NvbW1hbmRzL3NoaWZ0Q29tbWFuZC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFVBQVUsRUFBbUIsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFHeEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMzRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDbEUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDckYsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDMUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBR2hFOztHQUVHO0FBQ0gsU0FBUyxrQkFBa0IsQ0FBQyxJQUFZLEVBQUUsa0JBQTBCLEVBQUUsY0FBc0IsRUFBRSxzQkFBOEIsa0JBQWtCLEVBQUUsa0JBQTBCLGNBQWM7SUFDdkwsT0FBTztRQUNOLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxlQUFlLEVBQUUs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QUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbkMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsQyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbkMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyQyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXBDLFNBQVM7UUFDVCxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbkMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyQyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyQyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyQyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyQyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN4QyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyQyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN4QyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN4QyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN4QyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN4QyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFD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