/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { NavigationCommandRevealType } from '../../../browser/coreCommands.js';
import { ViewController } from '../../../browser/view/viewController.js';
import { ViewUserInputEvents } from '../../../browser/view/viewUserInputEvents.js';
import { Position } from '../../../common/core/position.js';
import { MetadataConsts, StandardTokenType } from '../../../common/encodedTokenAttributes.js';
import { EncodedTokenizationResult, ITokenizationSupport, TokenizationRegistry } from '../../../common/languages.js';
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
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let languageConfigurationService: ILanguageConfigurationService;
	let languageService: ILanguageService;
	let viewModel: ViewModel | undefined;

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

	function createViewControllerWithText(text: string): ViewController {
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

		viewModel = new ViewModel(
			1, // editorId
			configuration,
			disposables.add(instantiateTextModel(instantiationService, text, languageId)),
			monospaceLineBreaksComputerFactory,
			monospaceLineBreaksComputerFactory,
			null!,
			disposables.add(new TestLanguageConfigurationService()),
			new TestThemeService(),
			{ setVisibleLines() { } },
			{ batchChanges: (cb: any) => cb() }
		);

		return new ViewController(
			configuration,
			viewModel,
			new ViewUserInputEvents(viewModel.coordinatesConverter),
			{
				paste: () => { },
				type: () => { },
				compositionType: () => { },
				startComposition: () => { },
				endComposition: () => { },
				cut: () => { }
			}
		);
	}

	function testBracketSelection(text: string, position: Position, expectedText: string | undefined) {
		const controller = createViewControllerWithText(text);
		controller.dispatchMouse({
			position,
			mouseColumn: position.column,
			startedOnLineNumbers: false,
			revealType: NavigationCommandRevealType.Minimal,
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

		const selections = viewModel!.getSelections();
		const selectedText = viewModel!.model.getValueInRange(selections[0]);
		if (expectedText === undefined) {
			assert.notStrictEqual(selectedText, expectedText);
		} else {
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

interface TokenSpan {
	startIndex: number;
	type: StandardTokenType;
}

suite('ViewController - String content selection', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let languageConfigurationService: ILanguageConfigurationService;
	let languageService: ILanguageService;
	let viewModel: ViewModel | undefined;

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

	function createViewControllerWithTokens(text: string, lineTokens: TokenSpan[]): ViewController {
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
		const makeMetadata = (type: StandardTokenType) => (
			(encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
			| (type << MetadataConsts.TOKEN_TYPE_OFFSET)
		) >>> 0;

		const tokenizationSupport: ITokenizationSupport = {
			getInitialState: () => NullState,
			tokenize: undefined!,
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

		viewModel = new ViewModel(
			1,
			configuration,
			model,
			monospaceLineBreaksComputerFactory,
			monospaceLineBreaksComputerFactory,
			null!,
			disposables.add(new TestLanguageConfigurationService()),
			new TestThemeService(),
			{ setVisibleLines() { } },
			{ batchChanges: (cb: any) => cb() }
		);

		return new ViewController(
			configuration,
			viewModel,
			new ViewUserInputEvents(viewModel.coordinatesConverter),
			{
				paste: () => { },
				type: () => { },
				compositionType: () => { },
				startComposition: () => { },
				endComposition: () => { },
				cut: () => { }
			}
		);
	}

	function doubleClickAt(controller: ViewController, position: Position): string {
		controller.dispatchMouse({
			position,
			mouseColumn: position.column,
			startedOnLineNumbers: false,
			revealType: NavigationCommandRevealType.Minimal,
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
		const selections = viewModel!.getSelections();
		return viewModel!.model.getValueInRange(selections[0]);
	}

	// -- Happy-path: whole string as a single token including quotes --

	test('Select string content clicking right after opening double quote', () => {
		//                0123456789...
		const text = 'var x = "hello";';
		// Token layout: [0..8) Other  [8..15) String("hello")  [15..16) Other
		const controller = createViewControllerWithTokens(text, [
			{ startIndex: 0, type: StandardTokenType.Other },
			{ startIndex: 8, type: StandardTokenType.String },
			{ startIndex: 15, type: StandardTokenType.Other },
		]);
		// Column right after opening quote: offset 9 → column 10
		assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'hello');
	});

	test('Select string content clicking at closing double quote', () => {
		const text = 'var x = "hello";';
		const controller = createViewControllerWithTokens(text, [
			{ startIndex: 0, type: StandardTokenType.Other },
			{ startIndex: 8, type: StandardTokenType.String },
			{ startIndex: 15, type: StandardTokenType.Other },
		]);
		// Column at closing quote: offset 14 → column 15
		assert.strictEqual(doubleClickAt(controller, new Position(1, 15)), 'hello');
	});

	test('Select string content with single quotes', () => {
		const text = `var x = 'hello';`;
		const controller = createViewControllerWithTokens(text, [
			{ startIndex: 0, type: StandardTokenType.Other },
			{ startIndex: 8, type: StandardTokenType.String },
			{ startIndex: 15, type: StandardTokenType.Other },
		]);
		assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'hello');
	});

	test('Select string content with backtick quotes', () => {
		const text = 'var x = `hello`;';
		const controller = createViewControllerWithTokens(text, [
			{ startIndex: 0, type: StandardTokenType.Other },
			{ startIndex: 8, type: StandardTokenType.String },
			{ startIndex: 15, type: StandardTokenType.Other },
		]);
		assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'hello');
	});

	test('Select string content containing escape characters', () => {
		//                0123456789...
		const text = 'var x = "hello\\"world";';
		// Token layout: [0..8) Other  [8..22) String("hello\"world")  [22..23) Other
		const controller = createViewControllerWithTokens(text, [
			{ startIndex: 0, type: StandardTokenType.Other },
			{ startIndex: 8, type: StandardTokenType.String },
			{ startIndex: 9, type: StandardTokenType.String },
			{ startIndex: 14, type: StandardTokenType.String },
			{ startIndex: 16, type: StandardTokenType.String },
			{ startIndex: 21, type: StandardTokenType.String },
			{ startIndex: 22, type: StandardTokenType.Other },
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
			{ startIndex: 0, type: StandardTokenType.Other },
			{ startIndex: 8, type: StandardTokenType.String },
			{ startIndex: 21, type: StandardTokenType.Other },
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
			{ startIndex: 0, type: StandardTokenType.Other },
			{ startIndex: 8, type: StandardTokenType.Other },   // opening "
			{ startIndex: 9, type: StandardTokenType.String },  // hello world
			{ startIndex: 20, type: StandardTokenType.Other },  // closing "
			{ startIndex: 21, type: StandardTokenType.Other },
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
			{ startIndex: 0, type: StandardTokenType.Other },
			{ startIndex: 8, type: StandardTokenType.String },
			{ startIndex: 19, type: StandardTokenType.Other },
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
			{ startIndex: 0, type: StandardTokenType.Other },
			{ startIndex: 8, type: StandardTokenType.String },  // `"a ` — starts with " but doesn't end with "
			{ startIndex: 11, type: StandardTokenType.Other },  // `{}`
			{ startIndex: 13, type: StandardTokenType.String }, // ` b"` — ends with " but doesn't start with "
			{ startIndex: 16, type: StandardTokenType.Other },
		]);
		// First String token starts with " but ends with space → bail out → word select picks 'a'
		assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'a');
	});
});
