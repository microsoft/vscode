/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { ViewController } from '../../../browser/view/viewController.js';
import { ViewUserInputEvents } from '../../../browser/view/viewUserInputEvents.js';
import { Position } from '../../../common/core/position.js';
import { EncodedTokenizationResult, TokenizationRegistry } from '../../../common/languages.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { NullState } from '../../../common/languages/nullTokenize.js';
import { MonospaceLineBreaksComputerFactory } from '../../../common/viewModel/monospaceLineBreaksComputer.js';
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { instantiateTextModel } from '../../../test/common/testTextModel.js';
import { TestLanguageConfigurationService } from '../../common/modes/testLanguageConfigurationService.js';
import { TestConfiguration } from '../config/testConfiguration.js';
import { createCodeEditorServices } from '../testCodeEditor.js';
suite('ViewController - Bracket content selection', () => {
    let disposables;
    let instantiationService;
    let languageConfigurationService;
    let languageService;
    let viewModel;
    setup(() => {
        disposables = new DisposableStore();
        instantiationService = createCodeEditorServices(disposables);
        languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        languageService = instantiationService.get(ILanguageService);
        viewModel = undefined;
    });
    teardown(() => {
        viewModel?.dispose();
        viewModel = undefined;
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createViewControllerWithText(text) {
        const languageId = 'testMode';
        disposables.add(languageService.registerLanguage({ id: languageId }));
        disposables.add(languageConfigurationService.register(languageId, {
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')'],
            ]
        }));
        const configuration = disposables.add(new TestConfiguration({}));
        const monospaceLineBreaksComputerFactory = MonospaceLineBreaksComputerFactory.create(configuration.options);
        viewModel = new ViewModel(1, // editorId
        configuration, disposables.add(instantiateTextModel(instantiationService, text, languageId)), monospaceLineBreaksComputerFactory, monospaceLineBreaksComputerFactory, null, disposables.add(new TestLanguageConfigurationService()), new TestThemeService(), { setVisibleLines() { } }, { batchChanges: (cb) => cb() });
        return new ViewController(configuration, viewModel, new ViewUserInputEvents(viewModel.coordinatesConverter), {
            paste: () => { },
            type: () => { },
            compositionType: () => { },
            startComposition: () => { },
            endComposition: () => { },
            cut: () => { }
        });
    }
    function testBracketSelection(text, position, expectedText) {
        const controller = createViewControllerWithText(text);
        controller.dispatchMouse({
            position,
            mouseColumn: position.column,
            startedOnLineNumbers: false,
            revealType: 1 /* NavigationCommandRevealType.Minimal */,
            mouseDownCount: 2,
            inSelectionMode: false,
            altKey: false,
            ctrlKey: false,
            metaKey: false,
            shiftKey: false,
            leftButton: true,
            middleButton: false,
            onInjectedText: false
        });
        const selections = viewModel.getSelections();
        const selectedText = viewModel.model.getValueInRange(selections[0]);
        if (expectedText === undefined) {
            assert.notStrictEqual(selectedText, expectedText);
        }
        else {
            assert.strictEqual(selectedText, expectedText);
        }
    }
    test('Select content after opening curly brace', () => {
        testBracketSelection('var x = { hello };', new Position(1, 10), ' hello ');
    });
    test('Select content before closing curly brace', () => {
        testBracketSelection('var x = { hello };', new Position(1, 17), ' hello ');
    });
    test('Select content after opening parenthesis', () => {
        testBracketSelection('function foo(arg1, arg2) {}', new Position(1, 14), 'arg1, arg2');
    });
    test('Select content before closing parenthesis', () => {
        testBracketSelection('function foo(arg1, arg2) {}', new Position(1, 24), 'arg1, arg2');
    });
    test('Select content after opening square bracket', () => {
        testBracketSelection('const arr = [ 1, 2, 3 ];', new Position(1, 14), ' 1, 2, 3 ');
    });
    test('Select content before closing square bracket', () => {
        testBracketSelection('const arr = [ 1, 2, 3 ];', new Position(1, 23), ' 1, 2, 3 ');
    });
    test('Select innermost bracket content with nested brackets', () => {
        testBracketSelection('var x = { a: { b: 123 }};', new Position(1, 15), ' b: 123 ');
    });
    test('Empty brackets create empty selection', () => {
        testBracketSelection('var x = {};', new Position(1, 10), '');
    });
});
suite('ViewController - String content selection', () => {
    let disposables;
    let instantiationService;
    let languageConfigurationService;
    let languageService;
    let viewModel;
    setup(() => {
        disposables = new DisposableStore();
        instantiationService = createCodeEditorServices(disposables);
        languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        languageService = instantiationService.get(ILanguageService);
        viewModel = undefined;
    });
    teardown(() => {
        viewModel?.dispose();
        viewModel = undefined;
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createViewControllerWithTokens(text, lineTokens) {
        const languageId = 'stringTestMode';
        disposables.add(languageService.registerLanguage({ id: languageId }));
        disposables.add(languageConfigurationService.register(languageId, {
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')'],
            ]
        }));
        const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
        const makeMetadata = (type) => ((encodedLanguageId << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)
            | (type << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */)) >>> 0;
        const tokenizationSupport = {
            getInitialState: () => NullState,
            tokenize: undefined,
            tokenizeEncoded: (_line, _hasEOL, state) => {
                const arr = new Uint32Array(lineTokens.length * 2);
                for (let i = 0; i < lineTokens.length; i++) {
                    arr[i * 2] = lineTokens[i].startIndex;
                    arr[i * 2 + 1] = makeMetadata(lineTokens[i].type);
                }
                return new EncodedTokenizationResult(arr, [], state);
            }
        };
        disposables.add(TokenizationRegistry.register(languageId, tokenizationSupport));
        const configuration = disposables.add(new TestConfiguration({}));
        const monospaceLineBreaksComputerFactory = MonospaceLineBreaksComputerFactory.create(configuration.options);
        const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
        model.tokenization.forceTokenization(1);
        viewModel = new ViewModel(1, configuration, model, monospaceLineBreaksComputerFactory, monospaceLineBreaksComputerFactory, null, disposables.add(new TestLanguageConfigurationService()), new TestThemeService(), { setVisibleLines() { } }, { batchChanges: (cb) => cb() });
        return new ViewController(configuration, viewModel, new ViewUserInputEvents(viewModel.coordinatesConverter), {
            paste: () => { },
            type: () => { },
            compositionType: () => { },
            startComposition: () => { },
            endComposition: () => { },
            cut: () => { }
        });
    }
    function doubleClickAt(controller, position) {
        controller.dispatchMouse({
            position,
            mouseColumn: position.column,
            startedOnLineNumbers: false,
            revealType: 1 /* NavigationCommandRevealType.Minimal */,
            mouseDownCount: 2,
            inSelectionMode: false,
            altKey: false,
            ctrlKey: false,
            metaKey: false,
            shiftKey: false,
            leftButton: true,
            middleButton: false,
            onInjectedText: false
        });
        const selections = viewModel.getSelections();
        return viewModel.model.getValueInRange(selections[0]);
    }
    // -- Happy-path: whole string as a single token including quotes --
    test('Select string content clicking right after opening double quote', () => {
        //                0123456789...
        const text = 'var x = "hello";';
        // Token layout: [0..8) Other  [8..15) String("hello")  [15..16) Other
        const controller = createViewControllerWithTokens(text, [
            { startIndex: 0, type: 0 /* StandardTokenType.Other */ },
            { startIndex: 8, type: 2 /* StandardTokenType.String */ },
            { startIndex: 15, type: 0 /* StandardTokenType.Other */ },
        ]);
        // Column right after opening quote: offset 9 → column 10
        assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'hello');
    });
    test('Select string content clicking at closing double quote', () => {
        const text = 'var x = "hello";';
        const controller = createViewControllerWithTokens(text, [
            { startIndex: 0, type: 0 /* StandardTokenType.Other */ },
            { startIndex: 8, type: 2 /* StandardTokenType.String */ },
            { startIndex: 15, type: 0 /* StandardTokenType.Other */ },
        ]);
        // Column at closing quote: offset 14 → column 15
        assert.strictEqual(doubleClickAt(controller, new Position(1, 15)), 'hello');
    });
    test('Select string content with single quotes', () => {
        const text = `var x = 'hello';`;
        const controller = createViewControllerWithTokens(text, [
            { startIndex: 0, type: 0 /* StandardTokenType.Other */ },
            { startIndex: 8, type: 2 /* StandardTokenType.String */ },
            { startIndex: 15, type: 0 /* StandardTokenType.Other */ },
        ]);
        assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'hello');
    });
    test('Select string content with backtick quotes', () => {
        const text = 'var x = `hello`;';
        const controller = createViewControllerWithTokens(text, [
            { startIndex: 0, type: 0 /* StandardTokenType.Other */ },
            { startIndex: 8, type: 2 /* StandardTokenType.String */ },
            { startIndex: 15, type: 0 /* StandardTokenType.Other */ },
        ]);
        assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'hello');
    });
    test('Select string content containing escape characters', () => {
        //                0123456789...
        const text = 'var x = "hello\\"world";';
        // Token layout: [0..8) Other  [8..22) String("hello\"world")  [22..23) Other
        const controller = createViewControllerWithTokens(text, [
            { startIndex: 0, type: 0 /* StandardTokenType.Other */ },
            { startIndex: 8, type: 2 /* StandardTokenType.String */ },
            { startIndex: 9, type: 2 /* StandardTokenType.String */ },
            { startIndex: 14, type: 2 /* StandardTokenType.String */ },
            { startIndex: 16, type: 2 /* StandardTokenType.String */ },
            { startIndex: 21, type: 2 /* StandardTokenType.String */ },
            { startIndex: 22, type: 0 /* StandardTokenType.Other */ },
        ]);
        // Column right after opening quote: offset 9 → column 10
        assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'hello\\"world');
    });
    // -- Click in middle of string should NOT select the whole string --
    test('Click in middle of string does not select whole string', () => {
        //                0123456789012345678901
        const text = 'var x = "hello world";';
        // Token layout: [0..8) Other  [8..21) String("hello world")  [21..22) Other
        const controller = createViewControllerWithTokens(text, [
            { startIndex: 0, type: 0 /* StandardTokenType.Other */ },
            { startIndex: 8, type: 2 /* StandardTokenType.String */ },
            { startIndex: 21, type: 0 /* StandardTokenType.Other */ },
        ]);
        // Click on 'w' in "world" — word select should pick 'world', not 'hello world'
        assert.strictEqual(doubleClickAt(controller, new Position(1, 16)), 'world');
    });
    // -- Bail-out: quotes as separate tokens (theme issue #292784) --
    test('Separate quote tokens fall back to word select', () => {
        //                0         1         2
        //                0123456789012345678901234
        const text = 'var x = "hello world";';
        // Theme tokenizes quotes as separate Other tokens:
        // [0..8) Other  [8..9) Other(")  [9..20) String(hello world)  [20..21) Other(")  [21..22) Other
        const controller = createViewControllerWithTokens(text, [
            { startIndex: 0, type: 0 /* StandardTokenType.Other */ },
            { startIndex: 8, type: 0 /* StandardTokenType.Other */ }, // opening "
            { startIndex: 9, type: 2 /* StandardTokenType.String */ }, // hello world
            { startIndex: 20, type: 0 /* StandardTokenType.Other */ }, // closing "
            { startIndex: 21, type: 0 /* StandardTokenType.Other */ },
        ]);
        // The String token "hello world" doesn't start with a quote char → should bail out.
        // Click right after opening quote (column 10) → word select picks just 'hello'.
        assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'hello');
    });
    // -- Bail-out: RTL content in string (#293384) --
    test('RTL content in string falls back to word select', () => {
        const text = 'var x = "שלום עולם";';
        // Token layout: [0..8) Other  [8..19) String("שלום עולם")  [19..20) Other
        const controller = createViewControllerWithTokens(text, [
            { startIndex: 0, type: 0 /* StandardTokenType.Other */ },
            { startIndex: 8, type: 2 /* StandardTokenType.String */ },
            { startIndex: 19, type: 0 /* StandardTokenType.Other */ },
        ]);
        // Should bail out due to RTL content → word select picks first word
        assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'שלום');
    });
    // -- Bail-out: mismatched quotes (#293203 — string split at braces) --
    test('String token without matching closing quote falls back to word select', () => {
        //                0123456789012345
        const text = 'var x = "a {} b";';
        // Hypothetical tokenizer splits: [0..8) Other  [8..11) String("a )  [11..13) Other({})  [13..17) String( b")  [17..18) Other
        const controller = createViewControllerWithTokens(text, [
            { startIndex: 0, type: 0 /* StandardTokenType.Other */ },
            { startIndex: 8, type: 2 /* StandardTokenType.String */ }, // `"a ` — starts with " but doesn't end with "
            { startIndex: 11, type: 0 /* StandardTokenType.Other */ }, // `{}`
            { startIndex: 13, type: 2 /* StandardTokenType.String */ }, // ` b"` — ends with " but doesn't start with "
            { startIndex: 16, type: 0 /* StandardTokenType.Other */ },
        ]);
        // First String token starts with " but ends with space → bail out → word select picks 'a'
        assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'a');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0NvbnRyb2xsZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvdmlldy92aWV3Q29udHJvbGxlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFOUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU1RCxPQUFPLEVBQUUseUJBQXlCLEVBQXdCLG9CQUFvQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDckgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDekUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDM0csT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxn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