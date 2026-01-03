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
import { ILanguageService } from '../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
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
