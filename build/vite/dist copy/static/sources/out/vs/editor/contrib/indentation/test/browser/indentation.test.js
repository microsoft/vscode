/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { EncodedTokenizationResult, TokenizationRegistry } from '../../../../common/languages.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { NullState } from '../../../../common/languages/nullTokenize.js';
import { AutoIndentOnPaste, IndentationToSpacesCommand, IndentationToTabsCommand } from '../../browser/indentation.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { testCommand } from '../../../../test/browser/testCommand.js';
import { goIndentationRules, htmlIndentationRules, javascriptIndentationRules, latexIndentationRules, luaIndentationRules, phpIndentationRules, rubyIndentationRules, vbIndentationRules } from '../../../../test/common/modes/supports/indentationRules.js';
import { cppOnEnterRules, htmlOnEnterRules, javascriptOnEnterRules, phpOnEnterRules, vbOnEnterRules } from '../../../../test/common/modes/supports/onEnterRules.js';
import { TypeOperations } from '../../../../common/cursor/cursorTypeOperations.js';
import { cppBracketRules, goBracketRules, htmlBracketRules, latexBracketRules, luaBracketRules, phpBracketRules, rubyBracketRules, typescriptBracketRules, vbBracketRules } from '../../../../test/common/modes/supports/bracketRules.js';
import { javascriptAutoClosingPairsRules, latexAutoClosingPairsRules } from '../../../../test/common/modes/supports/autoClosingPairsRules.js';
import { LanguageService } from '../../../../common/services/languageService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
export var Language;
(function (Language) {
    Language["TypeScript"] = "ts-test";
    Language["Ruby"] = "ruby-test";
    Language["PHP"] = "php-test";
    Language["Go"] = "go-test";
    Language["CPP"] = "cpp-test";
    Language["HTML"] = "html-test";
    Language["VB"] = "vb-test";
    Language["Latex"] = "latex-test";
    Language["Lua"] = "lua-test";
})(Language || (Language = {}));
function testIndentationToSpacesCommand(lines, selection, tabSize, expectedLines, expectedSelection) {
    testCommand(lines, null, selection, (accessor, sel) => new IndentationToSpacesCommand(sel, tabSize), expectedLines, expectedSelection);
}
function testIndentationToTabsCommand(lines, selection, tabSize, expectedLines, expectedSelection) {
    testCommand(lines, null, selection, (accessor, sel) => new IndentationToTabsCommand(sel, tabSize), expectedLines, expectedSelection);
}
export function registerLanguage(languageService, language) {
    return languageService.registerLanguage({ id: language });
}
export function registerLanguageConfiguration(languageConfigurationService, language) {
    switch (language) {
        case Language.TypeScript:
            return languageConfigurationService.register(language, {
                brackets: typescriptBracketRules,
                comments: {
                    lineComment: '//',
                    blockComment: ['/*', '*/']
                },
                autoClosingPairs: javascriptAutoClosingPairsRules,
                indentationRules: javascriptIndentationRules,
                onEnterRules: javascriptOnEnterRules
            });
        case Language.Ruby:
            return languageConfigurationService.register(language, {
                brackets: rubyBracketRules,
                indentationRules: rubyIndentationRules,
            });
        case Language.PHP:
            return languageConfigurationService.register(language, {
                brackets: phpBracketRules,
                indentationRules: phpIndentationRules,
                onEnterRules: phpOnEnterRules
            });
        case Language.Go:
            return languageConfigurationService.register(language, {
                brackets: goBracketRules,
                indentationRules: goIndentationRules
            });
        case Language.CPP:
            return languageConfigurationService.register(language, {
                brackets: cppBracketRules,
                onEnterRules: cppOnEnterRules
            });
        case Language.HTML:
            return languageConfigurationService.register(language, {
                brackets: htmlBracketRules,
                indentationRules: htmlIndentationRules,
                onEnterRules: htmlOnEnterRules
            });
        case Language.VB:
            return languageConfigurationService.register(language, {
                brackets: vbBracketRules,
                indentationRules: vbIndentationRules,
                onEnterRules: vbOnEnterRules,
            });
        case Language.Latex:
            return languageConfigurationService.register(language, {
                brackets: latexBracketRules,
                autoClosingPairs: latexAutoClosingPairsRules,
                indentationRules: latexIndentationRules
            });
        case Language.Lua:
            return languageConfigurationService.register(language, {
                brackets: luaBracketRules,
                indentationRules: luaIndentationRules
            });
    }
}
export function registerTokenizationSupport(instantiationService, tokens, languageId) {
    let lineIndex = 0;
    const languageService = instantiationService.get(ILanguageService);
    const tokenizationSupport = {
        getInitialState: () => NullState,
        tokenize: undefined,
        tokenizeEncoded: (line, hasEOL, state) => {
            const tokensOnLine = tokens[lineIndex++];
            const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
            const result = new Uint32Array(2 * tokensOnLine.length);
            for (let i = 0; i < tokensOnLine.length; i++) {
                result[2 * i] = tokensOnLine[i].startIndex;
                result[2 * i + 1] =
                    ((encodedLanguageId << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)
                        | (tokensOnLine[i].standardTokenType << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */));
            }
            return new EncodedTokenizationResult(result, [], state);
        }
    };
    return TokenizationRegistry.register(languageId, tokenizationSupport);
}
suite('Change Indentation to Spaces - TypeScript/Javascript', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('single tabs only at start of line', function () {
        testIndentationToSpacesCommand([
            'first',
            'second line',
            'third line',
            '\tfourth line',
            '\tfifth'
        ], new Selection(2, 3, 2, 3), 4, [
            'first',
            'second line',
            'third line',
            '    fourth line',
            '    fifth'
        ], new Selection(2, 3, 2, 3));
    });
    test('multiple tabs at start of line', function () {
        testIndentationToSpacesCommand([
            '\t\tfirst',
            '\tsecond line',
            '\t\t\t third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 5, 1, 5), 3, [
            '      first',
            '   second line',
            '          third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 9, 1, 9));
    });
    test('multiple tabs', function () {
        testIndentationToSpacesCommand([
            '\t\tfirst\t',
            '\tsecond  \t line \t',
            '\t\t\t third line',
            ' \tfourth line',
            'fifth'
        ], new Selection(1, 5, 1, 5), 2, [
            '    first\t',
            '  second  \t line \t',
            '       third line',
            '   fourth line',
            'fifth'
        ], new Selection(1, 7, 1, 7));
    });
    test('empty lines', function () {
        testIndentationToSpacesCommand([
            '\t\t\t',
            '\t',
            '\t\t'
        ], new Selection(1, 4, 1, 4), 2, [
            '      ',
            '  ',
            '    '
        ], new Selection(1, 4, 1, 4));
    });
});
suite('Change Indentation to Tabs -  TypeScript/Javascript', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('spaces only at start of line', function () {
        testIndentationToTabsCommand([
            '    first',
            'second line',
            '    third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 3, 2, 3), 4, [
            '\tfirst',
            'second line',
            '\tthird line',
            'fourth line',
            'fifth'
        ], new Selection(2, 3, 2, 3));
    });
    test('multiple spaces at start of line', function () {
        testIndentationToTabsCommand([
            'first',
            '   second line',
            '          third line',
            'fourth line',
            '     fifth'
        ], new Selection(1, 5, 1, 5), 3, [
            'first',
            '\tsecond line',
            '\t\t\t third line',
            'fourth line',
            '\t  fifth'
        ], new Selection(1, 5, 1, 5));
    });
    test('multiple spaces', function () {
        testIndentationToTabsCommand([
            '      first   ',
            '  second     line \t',
            '       third line',
            '   fourth line',
            'fifth'
        ], new Selection(1, 8, 1, 8), 2, [
            '\t\t\tfirst   ',
            '\tsecond     line \t',
            '\t\t\t third line',
            '\t fourth line',
            'fifth'
        ], new Selection(1, 5, 1, 5));
    });
    test('issue #45996', function () {
        testIndentationToSpacesCommand([
            '\tabc',
        ], new Selection(1, 3, 1, 3), 4, [
            '    abc',
        ], new Selection(1, 6, 1, 6));
    });
});
suite('Indent With Tab - TypeScript/JavaScript', () => {
    const languageId = Language.TypeScript;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('temp issue because there should be at least one passing test in a suite', () => {
        assert.ok(true);
    });
    test.skip('issue #63388: perserve correct indentation on tab 1', () => {
        // https://github.com/microsoft/vscode/issues/63388
        const model = createTextModel([
            '/*',
            ' * Comment',
            ' * /',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            editor.setSelection(new Selection(1, 1, 3, 5));
            editor.executeCommands('editor.action.indentLines', TypeOperations.indent(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
            assert.strictEqual(model.getValue(), [
                '    /*',
                '     * Comment',
                '     * /',
            ].join('\n'));
        });
    });
    test.skip('issue #63388: perserve correct indentation on tab 2', () => {
        // https://github.com/microsoft/vscode/issues/63388
        const model = createTextModel([
            'switch (something) {',
            '  case 1:',
            '    whatever();',
            '    break;',
            '}',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            editor.setSelection(new Selection(1, 1, 5, 2));
            editor.executeCommands('editor.action.indentLines', TypeOperations.indent(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
            assert.strictEqual(model.getValue(), [
                '    switch (something) {',
                '        case 1:',
                '            whatever();',
                '            break;',
                '    }',
            ].join('\n'));
        });
    });
});
suite('Auto Indent On Paste - TypeScript/JavaScript', () => {
    const languageId = Language.TypeScript;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('issue #119225: Do not add extra leading space when pasting JSDoc', () => {
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const pasteText = [
                '/**',
                ' * JSDoc',
                ' */',
                'function a() {}'
            ].join('\n');
            const tokens = [
                [
                    { startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 3, standardTokenType: 1 /* StandardTokenType.Comment */ },
                ],
                [
                    { startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 2, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 8, standardTokenType: 1 /* StandardTokenType.Comment */ },
                ],
                [
                    { startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 1, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 3, standardTokenType: 0 /* StandardTokenType.Other */ },
                ],
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 8, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 9, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 10, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 11, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 12, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 13, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 14, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 15, standardTokenType: 0 /* StandardTokenType.Other */ },
                ]
            ];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            viewModel.paste(pasteText, true, undefined, 'keyboard');
            autoIndentOnPasteController.trigger(new Range(1, 1, 4, 16));
            assert.strictEqual(model.getValue(), pasteText);
        });
    });
    test('issue #167299: Blank line removes indent', () => {
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            // no need for tokenization because there are no comments
            const pasteText = [
                '',
                'export type IncludeReference =',
                '	| BaseReference',
                '	| SelfReference',
                '	| RelativeReference;',
                '',
                'export const enum IncludeReferenceKind {',
                '	Base,',
                '	Self,',
                '	RelativeReference,',
                '}'
            ].join('\n');
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            viewModel.paste(pasteText, true, undefined, 'keyboard');
            autoIndentOnPasteController.trigger(new Range(1, 1, 11, 2));
            assert.strictEqual(model.getValue(), pasteText);
        });
    });
    test('issue #29803: do not indent when pasting text with only one line', () => {
        // https://github.com/microsoft/vscode/issues/29803
        const model = createTextModel([
            'const linkHandler = new Class(a, b, c,',
            '    d)'
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            editor.setSelection(new Selection(2, 6, 2, 6));
            const text = ', null';
            viewModel.paste(text, true, undefined, 'keyboard');
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            autoIndentOnPasteController.trigger(new Range(2, 6, 2, 11));
            assert.strictEqual(model.getValue(), [
                'const linkHandler = new Class(a, b, c,',
                '    d, null)'
            ].join('\n'));
        });
    });
    test('issue #29753: incorrect indentation after comment', () => {
        // https://github.com/microsoft/vscode/issues/29753
        const model = createTextModel([
            'class A {',
            '    /**',
            '     * used only for debug purposes.',
            '     */',
            '    private _codeInfo: KeyMapping[];',
            '}',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            editor.setSelection(new Selection(5, 24, 5, 34));
            const text = 'IMacLinuxKeyMapping';
            viewModel.paste(text, true, undefined, 'keyboard');
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            autoIndentOnPasteController.trigger(new Range(5, 24, 5, 43));
            assert.strictEqual(model.getValue(), [
                'class A {',
                '    /**',
                '     * used only for debug purposes.',
                '     */',
                '    private _codeInfo: IMacLinuxKeyMapping[];',
                '}',
            ].join('\n'));
        });
    });
    test('issue #29753: incorrect indentation of header comment', () => {
        // https://github.com/microsoft/vscode/issues/29753
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const text = [
                '/*----------------',
                ' *  Copyright (c) ',
                ' *  Licensed under ...',
                ' *-----------------*/',
            ].join('\n');
            viewModel.paste(text, true, undefined, 'keyboard');
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            autoIndentOnPasteController.trigger(new Range(1, 1, 4, 22));
            assert.strictEqual(model.getValue(), text);
        });
    });
    test('issue #209859: do not do change indentation when pasted inside of a string', () => {
        // issue: https://github.com/microsoft/vscode/issues/209859
        // issue: https://github.com/microsoft/vscode/issues/209418
        const initialText = [
            'const foo = "some text',
            '         which is strangely',
            '    indented"'
        ].join('\n');
        const model = createTextModel(initialText, languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const tokens = [
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 12, standardTokenType: 2 /* StandardTokenType.String */ },
                ],
                [
                    { startIndex: 0, standardTokenType: 2 /* StandardTokenType.String */ },
                ],
                [
                    { startIndex: 0, standardTokenType: 2 /* StandardTokenType.String */ },
                ]
            ];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            editor.setSelection(new Selection(2, 10, 2, 15));
            viewModel.paste('which', true, undefined, 'keyboard');
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            autoIndentOnPasteController.trigger(new Range(2, 1, 2, 28));
            assert.strictEqual(model.getValue(), initialText);
        });
    });
    // Failing tests found in issues...
    test.skip('issue #181065: Incorrect paste of object within comment', () => {
        // https://github.com/microsoft/vscode/issues/181065
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const text = [
                '/**',
                ' * @typedef {',
                ' * }',
                ' */'
            ].join('\n');
            const tokens = [
                [
                    { startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 3, standardTokenType: 1 /* StandardTokenType.Comment */ },
                ],
                [
                    { startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 2, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 3, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 11, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 12, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 13, standardTokenType: 0 /* StandardTokenType.Other */ },
                ],
                [
                    { startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 2, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 3, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 4, standardTokenType: 0 /* StandardTokenType.Other */ },
                ],
                [
                    { startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 1, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 3, standardTokenType: 0 /* StandardTokenType.Other */ },
                ]
            ];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            viewModel.paste(text, true, undefined, 'keyboard');
            autoIndentOnPasteController.trigger(new Range(1, 1, 4, 4));
            assert.strictEqual(model.getValue(), text);
        });
    });
    test.skip('issue #86301: preserve cursor at inserted indentation level', () => {
        // https://github.com/microsoft/vscode/issues/86301
        const model = createTextModel([
            '() => {',
            '',
            '}',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            editor.setSelection(new Selection(2, 1, 2, 1));
            const text = [
                '() => {',
                '',
                '}',
                ''
            ].join('\n');
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            viewModel.paste(text, true, undefined, 'keyboard');
            autoIndentOnPasteController.trigger(new Range(2, 1, 5, 1));
            // notes:
            // why is line 3 not indented to the same level as line 2?
            // looks like the indentation is inserted correctly at line 5, but the cursor does not appear at the maximum indentation level?
            assert.strictEqual(model.getValue(), [
                '() => {',
                '    () => {',
                '    ', // <- should also be indented
                '    }',
                '    ', // <- cursor should be at the end of the indentation
                '}',
            ].join('\n'));
            const selection = viewModel.getSelection();
            assert.deepStrictEqual(selection, new Selection(5, 5, 5, 5));
        });
    });
    test.skip('issue #85781: indent line with extra white space', () => {
        // https://github.com/microsoft/vscode/issues/85781
        // note: still to determine whether this is a bug or not
        const model = createTextModel([
            '() => {',
            '    console.log("a");',
            '}',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            const text = [
                '() => {',
                '    console.log("b")',
                '}',
                ' '
            ].join('\n');
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            viewModel.paste(text, true, undefined, 'keyboard');
            // todo@aiday-mar, make sure range is correct, and make test work as in real life
            autoIndentOnPasteController.trigger(new Range(2, 5, 5, 6));
            assert.strictEqual(model.getValue(), [
                '() => {',
                '    () => {',
                '        console.log("b")',
                '    }',
                '    console.log("a");',
                '}',
            ].join('\n'));
        });
    });
    test.skip('issue #29589: incorrect indentation of closing brace on paste', () => {
        // https://github.com/microsoft/vscode/issues/29589
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            const text = [
                'function makeSub(a,b) {',
                'subsent = sent.substring(a,b);',
                'return subsent;',
                '}',
            ].join('\n');
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            viewModel.paste(text, true, undefined, 'keyboard');
            // todo@aiday-mar, make sure range is correct, and make test work as in real life
            autoIndentOnPasteController.trigger(new Range(1, 1, 4, 2));
            assert.strictEqual(model.getValue(), [
                'function makeSub(a,b) {',
                'subsent = sent.substring(a,b);',
                'return subsent;',
                '}',
            ].join('\n'));
        });
    });
    test.skip('issue #201420: incorrect indentation when first line is comment', () => {
        // https://github.com/microsoft/vscode/issues/201420
        const model = createTextModel([
            'function bar() {',
            '',
            '}',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const tokens = [
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 8, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 9, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 12, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 13, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 14, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 15, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 16, standardTokenType: 0 /* StandardTokenType.Other */ }
                ],
                [
                    { startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 2, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 3, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 10, standardTokenType: 1 /* StandardTokenType.Comment */ }
                ],
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 5, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 6, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 9, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 10, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 11, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 12, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 14, standardTokenType: 0 /* StandardTokenType.Other */ }
                ],
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 1, standardTokenType: 0 /* StandardTokenType.Other */ }
                ]
            ];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            editor.setSelection(new Selection(2, 1, 2, 1));
            const text = [
                '// comment',
                'const foo = 42',
            ].join('\n');
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            viewModel.paste(text, true, undefined, 'keyboard');
            autoIndentOnPasteController.trigger(new Range(2, 1, 3, 15));
            assert.strictEqual(model.getValue(), [
                'function bar() {',
                '    // comment',
                '    const foo = 42',
                '}',
            ].join('\n'));
        });
    });
});
suite('Auto Indent On Type - TypeScript/JavaScript', () => {
    const languageId = Language.TypeScript;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    // Failing tests from issues...
    test('issue #208215: indent after arrow function', () => {
        // https://github.com/microsoft/vscode/issues/208215
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            viewModel.type('const add1 = (n) =>');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'const add1 = (n) =>',
                '    ',
            ].join('\n'));
        });
    });
    test('issue #208215: indent after arrow function 2', () => {
        // https://github.com/microsoft/vscode/issues/208215
        const model = createTextModel([
            'const array = [1, 2, 3, 4, 5];',
            'array.map(',
            '    v =>',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(3, 9, 3, 9));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'const array = [1, 2, 3, 4, 5];',
                'array.map(',
                '    v =>',
                '        '
            ].join('\n'));
        });
    });
    test('issue #116843: indent after arrow function', () => {
        // https://github.com/microsoft/vscode/issues/116843
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            viewModel.type([
                'const add1 = (n) =>',
                '    n + 1;',
            ].join('\n'));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'const add1 = (n) =>',
                '    n + 1;',
                '',
            ].join('\n'));
        });
    });
    test('issue #29755: do not add indentation on enter if indentation is already valid', () => {
        //https://github.com/microsoft/vscode/issues/29755
        const model = createTextModel([
            'function f() {',
            '    const one = 1;',
            '    const two = 2;',
            '}',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(3, 1, 3, 1));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'function f() {',
                '    const one = 1;',
                '',
                '    const two = 2;',
                '}',
            ].join('\n'));
        });
    });
    test('issue #36090', () => {
        // https://github.com/microsoft/vscode/issues/36090
        const model = createTextModel([
            'class ItemCtrl {',
            '    getPropertiesByItemId(id) {',
            '        return this.fetchItem(id)',
            '            .then(item => {',
            '                return this.getPropertiesOfItem(item);',
            '            });',
            '    }',
            '}',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'advanced', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(7, 6, 7, 6));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'class ItemCtrl {',
                '    getPropertiesByItemId(id) {',
                '        return this.fetchItem(id)',
                '            .then(item => {',
                '                return this.getPropertiesOfItem(item);',
                '            });',
                '    }',
                '    ',
                '}',
            ].join('\n'));
            assert.deepStrictEqual(editor.getSelection(), new Selection(8, 5, 8, 5));
        });
    });
    test('issue #115304: indent block comment onEnter', () => {
        // https://github.com/microsoft/vscode/issues/115304
        const model = createTextModel([
            '/** */',
            'function f() {}',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'advanced', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(1, 4, 1, 4));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                '/**',
                ' * ',
                ' */',
                'function f() {}',
            ].join('\n'));
            assert.deepStrictEqual(editor.getSelection(), new Selection(2, 4, 2, 4));
        });
    });
    test('issue #43244: indent when lambda arrow function is detected, outdent when end is reached', () => {
        // https://github.com/microsoft/vscode/issues/43244
        const model = createTextModel([
            'const array = [1, 2, 3, 4, 5];',
            'array.map(_)'
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 12, 2, 12));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'const array = [1, 2, 3, 4, 5];',
                'array.map(_',
                '    ',
                ')'
            ].join('\n'));
        });
    });
    test('issue #43244: incorrect indentation after if/for/while without braces', () => {
        // https://github.com/microsoft/vscode/issues/43244
        const model = createTextModel([
            'function f() {',
            '    if (condition)',
            '}'
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 19, 2, 19));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'function f() {',
                '    if (condition)',
                '        ',
                '}',
            ].join('\n'));
            viewModel.type('return;');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'function f() {',
                '    if (condition)',
                '        return;',
                '    ',
                '}',
            ].join('\n'));
        });
    });
    test('issue #208232: incorrect indentation inside of comments', () => {
        // https://github.com/microsoft/vscode/issues/208232
        const model = createTextModel([
            '/**',
            'indentation done for {',
            '*/'
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const tokens = [
                [{ startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ }],
                [{ startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ }],
                [{ startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ }]
            ];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            editor.setSelection(new Selection(2, 23, 2, 23));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                '/**',
                'indentation done for {',
                '',
                '*/'
            ].join('\n'));
        });
    });
    test('issue #209802: allman style braces in JavaScript', () => {
        // https://github.com/microsoft/vscode/issues/209802
        const model = createTextModel([
            'if (/*condition*/)',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(1, 19, 1, 19));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'if (/*condition*/)',
                '    '
            ].join('\n'));
            viewModel.type('{', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'if (/*condition*/)',
                '{}'
            ].join('\n'));
            editor.setSelection(new Selection(2, 2, 2, 2));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'if (/*condition*/)',
                '{',
                '    ',
                '}'
            ].join('\n'));
        });
    });
    // Failing tests...
    test.skip('issue #43244: indent after equal sign is detected', () => {
        // https://github.com/microsoft/vscode/issues/43244
        // issue: Should indent after an equal sign is detected followed by whitespace characters.
        // This should be outdented when a semi-colon is detected indicating the end of the assignment.
        // TODO: requires exploring indent/outdent pairs instead
        const model = createTextModel([
            'const array ='
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(1, 14, 1, 14));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'const array =',
                '    '
            ].join('\n'));
        });
    });
    test.skip('issue #43244: indent after dot detected after object/array signifying a method call', () => {
        // https://github.com/microsoft/vscode/issues/43244
        // issue: When a dot is written, we should detect that this is a method call and indent accordingly
        // TODO: requires exploring indent/outdent pairs instead
        const model = createTextModel([
            'const array = [1, 2, 3];',
            'array.'
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 7, 2, 7));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'const array = [1, 2, 3];',
                'array.',
                '    '
            ].join('\n'));
        });
    });
    test.skip('issue #43244: indent after dot detected on a subsequent line after object/array signifying a method call', () => {
        // https://github.com/microsoft/vscode/issues/43244
        // issue: When a dot is written, we should detect that this is a method call and indent accordingly
        // TODO: requires exploring indent/outdent pairs instead
        const model = createTextModel([
            'const array = [1, 2, 3]',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 7, 2, 7));
            viewModel.type('\n', 'keyboard');
            viewModel.type('.');
            assert.strictEqual(model.getValue(), [
                'const array = [1, 2, 3]',
                '    .'
            ].join('\n'));
        });
    });
    test.skip('issue #43244: keep indentation when methods called on object/array', () => {
        // https://github.com/microsoft/vscode/issues/43244
        // Currently passes, but should pass with all the tests above too
        // TODO: requires exploring indent/outdent pairs instead
        const model = createTextModel([
            'const array = [1, 2, 3]',
            '    .filter(() => true)'
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 24, 2, 24));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'const array = [1, 2, 3]',
                '    .filter(() => true)',
                '    '
            ].join('\n'));
        });
    });
    test.skip('issue #43244: keep indentation when chained methods called on object/array', () => {
        // https://github.com/microsoft/vscode/issues/43244
        // When the call chain is not finished yet, and we type a dot, we do not want to change the indentation
        // TODO: requires exploring indent/outdent pairs instead
        const model = createTextModel([
            'const array = [1, 2, 3]',
            '    .filter(() => true)',
            '    '
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(3, 5, 3, 5));
            viewModel.type('.');
            assert.strictEqual(model.getValue(), [
                'const array = [1, 2, 3]',
                '    .filter(() => true)',
                '    .' // here we don't want to increase the indentation because we have chained methods
            ].join('\n'));
        });
    });
    test.skip('issue #43244: outdent when a semi-color is detected indicating the end of the assignment', () => {
        // https://github.com/microsoft/vscode/issues/43244
        // TODO: requires exploring indent/outdent pairs instead
        const model = createTextModel([
            'const array = [1, 2, 3]',
            '    .filter(() => true);'
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 25, 2, 25));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'const array = [1, 2, 3]',
                '    .filter(() => true);',
                ''
            ].join('\n'));
        });
    });
    test.skip('issue #40115: keep indentation when added', () => {
        // https://github.com/microsoft/vscode/issues/40115
        const model = createTextModel('function foo() {}', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(1, 17, 1, 17));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'function foo() {',
                '    ',
                '}',
            ].join('\n'));
            editor.setSelection(new Selection(2, 5, 2, 5));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'function foo() {',
                '    ',
                '    ',
                '}',
            ].join('\n'));
        });
    });
    test.skip('issue #193875: incorrect indentation on enter', () => {
        // https://github.com/microsoft/vscode/issues/193875
        const model = createTextModel([
            '{',
            '    for(;;)',
            '    for(;;) {}',
            '}',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(3, 14, 3, 14));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                '{',
                '    for(;;)',
                '    for(;;) {',
                '        ',
                '    }',
                '}',
            ].join('\n'));
        });
    });
    test.skip('issue #67678: indent on typing curly brace', () => {
        // https://github.com/microsoft/vscode/issues/67678
        const model = createTextModel([
            'if (true) {',
            'console.log("a")',
            'console.log("b")',
            '',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(4, 1, 4, 1));
            viewModel.type('}', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'if (true) {',
                '    console.log("a")',
                '    console.log("b")',
                '}',
            ].join('\n'));
        });
    });
    test.skip('issue #46401: outdent when encountering bracket on line - allman style indentation', () => {
        // https://github.com/microsoft/vscode/issues/46401
        const model = createTextModel([
            'if (true)',
            '    ',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            viewModel.type('{}', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'if (true)',
                '{}',
            ].join('\n'));
            editor.setSelection(new Selection(2, 2, 2, 2));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'if (true)',
                '{',
                '    ',
                '}'
            ].join('\n'));
        });
    });
    test.skip('issue #125261: typing closing brace does not keep the current indentation', () => {
        // https://github.com/microsoft/vscode/issues/125261
        const model = createTextModel([
            'foo {',
            '    ',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'keep', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            viewModel.type('}', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'foo {',
                '}',
            ].join('\n'));
        });
    });
});
suite('Auto Indent On Type - Ruby', () => {
    const languageId = Language.Ruby;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('issue #198350: in or when incorrectly match non keywords for Ruby', () => {
        // https://github.com/microsoft/vscode/issues/198350
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            viewModel.type('def foo\n        i');
            viewModel.type('n', 'keyboard');
            assert.strictEqual(model.getValue(), 'def foo\n        in');
            viewModel.type(' ', 'keyboard');
            assert.strictEqual(model.getValue(), 'def foo\nin ');
            viewModel.model.setValue('');
            viewModel.type('  # in');
            assert.strictEqual(model.getValue(), '  # in');
            viewModel.type(' ', 'keyboard');
            assert.strictEqual(model.getValue(), '  # in ');
        });
    });
    // Failing tests...
    test.skip('issue #199846: in or when incorrectly match non keywords for Ruby', () => {
        // https://github.com/microsoft/vscode/issues/199846
        // explanation: happening because the # is detected probably as a comment
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            viewModel.type(`method('#foo') do`);
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                `method('#foo') do`,
                '    '
            ].join('\n'));
        });
    });
});
suite('Auto Indent On Type - PHP', () => {
    const languageId = Language.PHP;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('issue #199050: should not indent after { detected in a string', () => {
        // https://github.com/microsoft/vscode/issues/199050
        const model = createTextModel(`preg_replace('{');`, languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const tokens = [
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 13, standardTokenType: 2 /* StandardTokenType.String */ },
                    { startIndex: 16, standardTokenType: 0 /* StandardTokenType.Other */ },
                ]
            ];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            editor.setSelection(new Selection(1, 54, 1, 54));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                `preg_replace('{');`,
                ''
            ].join('\n'));
        });
    });
});
suite('Auto Indent On Paste - Go', () => {
    const languageId = Language.Go;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('temp issue because there should be at least one passing test in a suite', () => {
        assert.ok(true);
    });
    test.skip('issue #199050: should not indent after { detected in a string', () => {
        // https://github.com/microsoft/vscode/issues/199050
        const model = createTextModel([
            'var s = `',
            'quick  brown',
            'fox',
            '`',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(3, 1, 3, 1));
            const text = '  ';
            const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
            viewModel.paste(text, true, undefined, 'keyboard');
            autoIndentOnPasteController.trigger(new Range(3, 1, 3, 3));
            assert.strictEqual(model.getValue(), [
                'var s = `',
                'quick  brown',
                '  fox',
                '`',
            ].join('\n'));
        });
    });
});
suite('Auto Indent On Type - CPP', () => {
    const languageId = Language.CPP;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('temp issue because there should be at least one passing test in a suite', () => {
        assert.ok(true);
    });
    test.skip('issue #178334: incorrect outdent of } when signature spans multiple lines', () => {
        // https://github.com/microsoft/vscode/issues/178334
        const model = createTextModel([
            'int WINAPI WinMain(bool instance,',
            '    int nshowcmd) {}',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 20, 2, 20));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'int WINAPI WinMain(bool instance,',
                '    int nshowcmd) {',
                '    ',
                '}'
            ].join('\n'));
        });
    });
    test.skip('issue #118929: incorrect indent when // follows curly brace', () => {
        // https://github.com/microsoft/vscode/issues/118929
        const model = createTextModel([
            'if (true) { // jaja',
            '}',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(1, 20, 1, 20));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'if (true) { // jaja',
                '    ',
                '}',
            ].join('\n'));
        });
    });
    test.skip('issue #111265: auto indentation set to "none" still changes the indentation', () => {
        // https://github.com/microsoft/vscode/issues/111265
        const model = createTextModel([
            'int func() {',
            '		',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'none', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 3, 2, 3));
            viewModel.type('}', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'int func() {',
                '		}',
            ].join('\n'));
        });
    });
});
suite('Auto Indent On Type - HTML', () => {
    const languageId = Language.HTML;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('temp issue because there should be at least one passing test in a suite', () => {
        assert.ok(true);
    });
    test.skip('issue #61510: incorrect indentation after // in html file', () => {
        // https://github.com/microsoft/vscode/issues/178334
        const model = createTextModel([
            '<pre>',
            '  foo //I press <Enter> at the end of this line',
            '</pre>',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 48, 2, 48));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                '<pre>',
                '  foo //I press <Enter> at the end of this line',
                '  ',
                '</pre>',
            ].join('\n'));
        });
    });
});
suite('Auto Indent On Type - Visual Basic', () => {
    const languageId = Language.VB;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('temp issue because there should be at least one passing test in a suite', () => {
        assert.ok(true);
    });
    test('issue #118932: no indentation in visual basic files', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'If True Then',
            '    Some code',
            '    End I',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            editor.setSelection(new Selection(3, 10, 3, 10));
            viewModel.type('f', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'If True Then',
                '    Some code',
                'End If',
            ].join('\n'));
        });
    });
    test('issue #118932: indent after Module declaration', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            viewModel.type('Module Test');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Module Test',
                '    ',
            ].join('\n'));
        });
    });
    test('issue #118932: indent after Sub declaration', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Module Test',
            '    ',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            viewModel.type('Sub Main()');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Module Test',
                '    Sub Main()',
                '        ',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent on End Sub', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Module Test',
            '    Sub Main()',
            '        Console.WriteLine("Hello")',
            '        End Su',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(4, 15, 4, 15));
            viewModel.type('b', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Module Test',
                '    Sub Main()',
                '        Console.WriteLine("Hello")',
                '    End Sub',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent on End Module', () => {
        // https://github.com/microsoft/vscode/issues/118932
        // When End Module is typed right after Module (no nested blocks), it dedents correctly
        const model = createTextModel([
            'Module Test',
            '    Private x As Integer',
            '    End Modul',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(3, 14, 3, 14));
            viewModel.type('e', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Module Test',
                '    Private x As Integer',
                'End Module',
            ].join('\n'));
        });
    });
    test('issue #118932: indent after Function declaration', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Module Test',
            '    ',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            viewModel.type('Function Add(a As Integer, b As Integer) As Integer');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Module Test',
                '    Function Add(a As Integer, b As Integer) As Integer',
                '        ',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent on End Function', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Module Test',
            '    Function Add(a, b)',
            '        Return a + b',
            '        End Functio',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(4, 20, 4, 20));
            viewModel.type('n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Module Test',
                '    Function Add(a, b)',
                '        Return a + b',
                '    End Function',
            ].join('\n'));
        });
    });
    test('issue #118932: indent after If Then', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    ',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            viewModel.type('If x > 0 Then');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    If x > 0 Then',
                '        ',
            ].join('\n'));
        });
    });
    test('issue #118932: indent after ElseIf Then', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    If x > 0 Then',
            '        DoSomething()',
            '    ElseIf x < 0 Then',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(4, 22, 4, 22));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    If x > 0 Then',
                '        DoSomething()',
                '    ElseIf x < 0 Then',
                '        ',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent and indent on Else', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    If x > 0 Then',
            '        DoSomething()',
            '        Els',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(4, 12, 4, 12));
            viewModel.type('e', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    If x > 0 Then',
                '        DoSomething()',
                '    Else',
            ].join('\n'));
        });
    });
    test('issue #118932: indent after While', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    ',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            viewModel.type('While x > 0');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    While x > 0',
                '        ',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent on End While', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    While x > 0',
            '        x = x - 1',
            '        End Whil',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(4, 17, 4, 17));
            viewModel.type('e', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    While x > 0',
                '        x = x - 1',
                '    End While',
            ].join('\n'));
        });
    });
    test('issue #118932: indent after For', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    ',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            viewModel.type('For i = 1 To 10');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    For i = 1 To 10',
                '        ',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent on Next', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    For i = 1 To 10',
            '        DoSomething(i)',
            '        Nex',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(4, 12, 4, 12));
            viewModel.type('t', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    For i = 1 To 10',
                '        DoSomething(i)',
                '    Next',
            ].join('\n'));
        });
    });
    test('issue #118932: indent after Do', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    ',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            viewModel.type('Do');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    Do',
                '        ',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent on Loop', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    Do',
            '        x = x + 1',
            '        Loo',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(4, 12, 4, 12));
            viewModel.type('p', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    Do',
                '        x = x + 1',
                '    Loop',
            ].join('\n'));
        });
    });
    test('issue #118932: indent after Select Case', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    ',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            viewModel.type('Select Case x');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    Select Case x',
                '        ',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent on End Select', () => {
        // https://github.com/microsoft/vscode/issues/118932
        // When End Select is typed, it dedents to match Select Case level
        const model = createTextModel([
            'Sub Test()',
            '    Select Case x',
            '        End Selec',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(3, 18, 3, 18));
            viewModel.type('t', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    Select Case x',
                '    End Select',
            ].join('\n'));
        });
    });
    test('issue #118932: indent after Try', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    ',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 5, 2, 5));
            viewModel.type('Try');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    Try',
                '        ',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent and indent on Catch', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    Try',
            '        DoSomething()',
            '        Catc',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(4, 13, 4, 13));
            viewModel.type('h', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    Try',
                '        DoSomething()',
                '    Catch',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent and indent on Finally', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    Try',
            '        DoSomething()',
            '    Catch',
            '        HandleError()',
            '        Finall',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(6, 15, 6, 15));
            viewModel.type('y', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    Try',
                '        DoSomething()',
                '    Catch',
                '        HandleError()',
                '    Finally',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent on End Try', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Sub Test()',
            '    Try',
            '        DoSomething()',
            '    Catch',
            '        HandleError()',
            '    Finally',
            '        Cleanup()',
            '        End Tr',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(8, 15, 8, 15));
            viewModel.type('y', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Sub Test()',
                '    Try',
                '        DoSomething()',
                '    Catch',
                '        HandleError()',
                '    Finally',
                '        Cleanup()',
                '    End Try',
            ].join('\n'));
        });
    });
    test('issue #118932: indent after Class', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            viewModel.type('Class MyClass');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Class MyClass',
                '    ',
            ].join('\n'));
        });
    });
    test('issue #118932: dedent on End Class', () => {
        // https://github.com/microsoft/vscode/issues/118932
        const model = createTextModel([
            'Class MyClass',
            '    Private x As Integer',
            '    End Clas',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(3, 14, 3, 14));
            viewModel.type('s', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Class MyClass',
                '    Private x As Integer',
                'End Class',
            ].join('\n'));
        });
    });
    test('issue #118932: full program indentation flow', () => {
        // https://github.com/microsoft/vscode/issues/118932
        // Verify the complete flow as described in the verification comment
        // Note: Auto-indent only triggers on typing the last character that completes a keyword
        // and only decreases by one indentation level per keyword completion
        const model = createTextModel('', languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            // Type Module Test and press Enter
            viewModel.type('Module Test');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Module Test',
                '    ',
            ].join('\n'), 'After Module Test');
            // Type Sub Main() and press Enter
            viewModel.type('Sub Main()');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Module Test',
                '    Sub Main()',
                '        ',
            ].join('\n'), 'After Sub Main()');
            // Type Console.WriteLine and press Enter
            viewModel.type('Console.WriteLine("Hello, World!")');
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Module Test',
                '    Sub Main()',
                '        Console.WriteLine("Hello, World!")',
                '        ',
            ].join('\n'), 'After Console.WriteLine');
            // Type End Su then 'b' to complete End Sub (auto-indent triggers on last char)
            viewModel.type('End Su');
            viewModel.type('b', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Module Test',
                '    Sub Main()',
                '        Console.WriteLine("Hello, World!")',
                '    End Sub',
            ].join('\n'), 'After End Sub');
            // Press Enter - should maintain same indent level after End Sub
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'Module Test',
                '    Sub Main()',
                '        Console.WriteLine("Hello, World!")',
                '    End Sub',
                '    ',
            ].join('\n'), 'After Enter after End Sub');
        });
    });
});
suite('Auto Indent On Type - Latex', () => {
    const languageId = Language.Latex;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('temp issue because there should be at least one passing test in a suite', () => {
        assert.ok(true);
    });
    test.skip('issue #178075: no auto closing pair when indentation done', () => {
        // https://github.com/microsoft/vscode/issues/178075
        const model = createTextModel([
            '\\begin{theorem}',
            '    \\end',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(2, 9, 2, 9));
            viewModel.type('{', 'keyboard');
            assert.strictEqual(model.getValue(), [
                '\\begin{theorem}',
                '\\end{}',
            ].join('\n'));
        });
    });
});
suite('Auto Indent On Type - Lua', () => {
    const languageId = Language.Lua;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('temp issue because there should be at least one passing test in a suite', () => {
        assert.ok(true);
    });
    test.skip('issue #178075: no auto closing pair when indentation done', () => {
        // https://github.com/microsoft/vscode/issues/178075
        const model = createTextModel([
            'print("asdf function asdf")',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel) => {
            editor.setSelection(new Selection(1, 28, 1, 28));
            viewModel.type('\n', 'keyboard');
            assert.strictEqual(model.getValue(), [
                'print("asdf function asdf")',
                ''
            ].join('\n'));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZW50YXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2luZGVudGF0aW9uL3Rlc3QvYnJvd3Nlci9pbmRlbnRhdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDdkYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDOUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakUsT0FBTyxFQUFFLHlCQUF5QixFQUFnQyxvQkFBb0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsMEJBQTBCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN2SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNoRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLDBCQUEwQixFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLG1CQUFtQixFQUFFLG9CQUFv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O1lBQ2IsTUFBTSxNQUFNLEdBQThCO2dCQUN6QztvQkFDQyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLG1DQUEyQixFQUFFO29CQUMvRCxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLG1DQUEyQixFQUFFO2lCQUMvRDtnQkFDRDtvQkFDQyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLG1DQUEyQixFQUFFO29CQUMvRCxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLG1DQUEyQixFQUFFO29CQUMvRCxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLG1DQUEyQixFQUFFO2lCQUMvRDtnQkFDRDtvQkFDQyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLG1DQUEyQixFQUFFO29CQUMvRCxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLG1DQUEyQixFQUFFO29CQUMvRCxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO2lCQUM3RDtnQkFDRDtvQkFDQyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO29CQUM3RCxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO29CQUM3RCxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO29CQUM3RCxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO29CQUM5RCxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO29CQUM5RCxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO29CQUM5RCxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO29CQUM5RCxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO29CQUM5RCxFQUFFLFVBQVUsRUFB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