/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { BracketMatchingController } from 'vs/editor/contrib/bracketMatching/browser/bracketMatching';
import { createCodeEditorServices, instantiateTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { instantiateTextModel } from 'vs/editor/test/common/testTextModel';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('bracket matching', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let languageConfigurationService: ILanguageConfigurationService;
	let languageService: ILanguageService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = createCodeEditorServices(disposables);
		languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
		languageService = instantiationService.get(ILanguageService);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createTextModelWithBrackets(text: string) {
		const languageId = 'bracketMode';
		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')'],
			]
		}));
		return disposables.add(instantiateTextModel(instantiationService, text, languageId));
	}

	function createCodeEditorWithBrackets(text: string) {
		return disposables.add(instantiateTestCodeEditor(instantiationService, createTextModelWithBrackets(text)));
	}

	test('issue #183: jump to matching bracket position', () => {
		const editor = createCodeEditorWithBrackets('var x = (3 + (5-7)) + ((5+3)+5);');
		const bracketMatchingController = disposables.add(editor.registerAndInstantiateContribution(BracketMatchingController.ID, BracketMatchingController));

		// start on closing bracket
		editor.setPosition(new Position(1, 20));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 9));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 19));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 9));

		// start on opening bracket
		editor.setPosition(new Position(1, 23));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 31));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 23));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 31));
	});

	test('Jump to next bracket', () => {
		const editor = createCodeEditorWithBrackets('var x = (3 + (5-7)); y();');
		const bracketMatchingController = disposables.add(editor.registerAndInstantiateContribution(BracketMatchingController.ID, BracketMatchingController));

		// start position between brackets
		editor.setPosition(new Position(1, 16));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 18));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 14));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 18));

		// skip brackets in comments
		editor.setPosition(new Position(1, 21));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 23));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 24));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 23));

		// do not break if no brackets are available
		editor.setPosition(new Position(1, 26));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 26));
	});

	test('Select to next bracket', () => {
		const editor = createCodeEditorWithBrackets('var x = (3 + (5-7)); y();');
		const bracketMatchingController = disposables.add(editor.registerAndInstantiateContribution(BracketMatchingController.ID, BracketMatchingController));

		// start position in open brackets
		editor.setPosition(new Position(1, 9));
		bracketMatchingController.selectToBracket(true);
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 20));
		assert.deepStrictEqual(editor.getSelection(), new Selection(1, 9, 1, 20));

		// start position in close brackets (should select backwards)
		editor.setPosition(new Position(1, 20));
		bracketMatchingController.selectToBracket(true);
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 9));
		assert.deepStrictEqual(editor.getSelection(), new Selection(1, 20, 1, 9));

		// start position between brackets
		editor.setPosition(new Position(1, 16));
		bracketMatchingController.selectToBracket(true);
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 19));
		assert.deepStrictEqual(editor.getSelection(), new Selection(1, 14, 1, 19));

		// start position outside brackets
		editor.setPosition(new Position(1, 21));
		bracketMatchingController.selectToBracket(true);
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 25));
		assert.deepStrictEqual(editor.getSelection(), new Selection(1, 23, 1, 25));

		// do not break if no brackets are available
		editor.setPosition(new Position(1, 26));
		bracketMatchingController.selectToBracket(true);
		assert.deepStrictEqual(editor.getPosition(), new Position(1, 26));
		assert.deepStrictEqual(editor.getSelection(), new Selection(1, 26, 1, 26));
	});

	test('issue #1772: jump to enclosing brackets', () => {
		const text = [
			'const x = {',
			'    something: [0, 1, 2],',
			'    another: true,',
			'    somethingmore: [0, 2, 4]',
			'};',
		].join('\n');
		const editor = createCodeEditorWithBrackets(text);
		const bracketMatchingController = disposables.add(editor.registerAndInstantiateContribution(BracketMatchingController.ID, BracketMatchingController));

		editor.setPosition(new Position(3, 5));
		bracketMatchingController.jumpToBracket();
		assert.deepStrictEqual(editor.getSelection(), new Selection(5, 1, 5, 1));
	});

	test('issue #43371: argument to not select brackets', () => {
		const text = [
			'const x = {',
			'    something: [0, 1, 2],',
			'    another: true,',
			'    somethingmore: [0, 2, 4]',
			'};',
		].join('\n');
		const editor = createCodeEditorWithBrackets(text);
		const bracketMatchingController = disposables.add(editor.registerAndInstantiateContribution(BracketMatchingController.ID, BracketMatchingController));

		editor.setPosition(new Position(3, 5));
		bracketMatchingController.selectToBracket(false);
		assert.deepStrictEqual(editor.getSelection(), new Selection(1, 12, 5, 1));
	});

	test('issue #45369: Select to Bracket with multicursor', () => {
		const editor = createCodeEditorWithBrackets('{  }   {   }   { }');
		const bracketMatchingController = disposables.add(editor.registerAndInstantiateContribution(BracketMatchingController.ID, BracketMatchingController));

		// cursors inside brackets become selections of the entire bracket contents
		editor.setSelections([
			new Selection(1, 3, 1, 3),
			new Selection(1, 10, 1, 10),
			new Selection(1, 17, 1, 17)
		]);
		bracketMatchingController.selectToBracket(true);
		assert.deepStrictEqual(editor.getSelections(), [
			new Selection(1, 1, 1, 5),
			new Selection(1, 8, 1, 13),
			new Selection(1, 16, 1, 19)
		]);

		// cursors to the left of bracket pairs become selections of the entire pair
		editor.setSelections([
			new Selection(1, 1, 1, 1),
			new Selection(1, 6, 1, 6),
			new Selection(1, 14, 1, 14)
		]);
		bracketMatchingController.selectToBracket(true);
		assert.deepStrictEqual(editor.getSelections(), [
			new Selection(1, 1, 1, 5),
			new Selection(1, 8, 1, 13),
			new Selection(1, 16, 1, 19)
		]);

		// cursors just right of a bracket pair become selections of the entire pair
		editor.setSelections([
			new Selection(1, 5, 1, 5),
			new Selection(1, 13, 1, 13),
			new Selection(1, 19, 1, 19)
		]);
		bracketMatchingController.selectToBracket(true);
		assert.deepStrictEqual(editor.getSelections(), [
			new Selection(1, 5, 1, 1),
			new Selection(1, 13, 1, 8),
			new Selection(1, 19, 1, 16)
		]);
	});

	test('Removes brackets', () => {
		const editor = createCodeEditorWithBrackets('var x = (3 + (5-7)); y();');
		const bracketMatchingController = disposables.add(editor.registerAndInstantiateContribution(BracketMatchingController.ID, BracketMatchingController));
		function removeBrackets() {
			bracketMatchingController.removeBrackets();
		}

		// position before the bracket
		editor.setPosition(new Position(1, 9));
		removeBrackets();
		assert.deepStrictEqual(editor.getModel().getValue(), 'var x = 3 + (5-7); y();');
		editor.getModel().setValue('var x = (3 + (5-7)); y();');

		// position between brackets
		editor.setPosition(new Position(1, 16));
		removeBrackets();
		assert.deepStrictEqual(editor.getModel().getValue(), 'var x = (3 + 5-7); y();');
		removeBrackets();
		assert.deepStrictEqual(editor.getModel().getValue(), 'var x = 3 + 5-7; y();');
		removeBrackets();
		assert.deepStrictEqual(editor.getModel().getValue(), 'var x = 3 + 5-7; y();');
	});
});
