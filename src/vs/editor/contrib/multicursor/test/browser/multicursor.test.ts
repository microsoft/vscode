/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { Handler } from '../../../../common/editorCommon.js';
import { EndOfLineSequence } from '../../../../common/model.js';
import { CommonFindController } from '../../../find/browser/findController.js';
import { AddSelectionToNextFindMatchAction, AddSelectionToPreviousFindMatchAction, InsertCursorAbove, InsertCursorBelow, MoveSelectionToNextFindMatchAction, MoveSelectionToPreviousFindMatchAction, MultiCursorSelectionController, SelectHighlightsAction, SelectionHighlighter } from '../../browser/multicursor.js';
import { ITestCodeEditor, TestCodeEditor, TestCodeEditorInstantiationOptions, withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';

suite('Multicursor', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #26393: Multiple cursors + Word wrap', () => {
		withTestCodeEditor([
			'a'.repeat(20),
			'a'.repeat(20),
		], { wordWrap: 'wordWrapColumn', wordWrapColumn: 10 }, (editor, viewModel) => {
			const addCursorDownAction = new InsertCursorBelow();
			addCursorDownAction.run(null!, editor, {});

			assert.strictEqual(viewModel.getCursorStates().length, 2);

			assert.strictEqual(viewModel.getCursorStates()[0].viewState.position.lineNumber, 1);
			assert.strictEqual(viewModel.getCursorStates()[1].viewState.position.lineNumber, 3);

			editor.setPosition({ lineNumber: 4, column: 1 });
			const addCursorUpAction = new InsertCursorAbove();
			addCursorUpAction.run(null!, editor, {});

			assert.strictEqual(viewModel.getCursorStates().length, 2);

			assert.strictEqual(viewModel.getCursorStates()[0].viewState.position.lineNumber, 4);
			assert.strictEqual(viewModel.getCursorStates()[1].viewState.position.lineNumber, 2);
		});
	});

	test('issue #2205: Multi-cursor pastes in reverse order', () => {
		withTestCodeEditor([
			'abc',
			'def'
		], {}, (editor, viewModel) => {
			const addCursorUpAction = new InsertCursorAbove();

			editor.setSelection(new Selection(2, 1, 2, 1));
			addCursorUpAction.run(null!, editor, {});
			assert.strictEqual(viewModel.getSelections().length, 2);

			editor.trigger('test', Handler.Paste, {
				text: '1\n2',
				multicursorText: [
					'1',
					'2'
				]
			});

			assert.strictEqual(editor.getModel()!.getLineContent(1), '1abc');
			assert.strictEqual(editor.getModel()!.getLineContent(2), '2def');
		});
	});

	test('issue #1336: Insert cursor below on last line adds a cursor to the end of the current line', () => {
		withTestCodeEditor([
			'abc'
		], {}, (editor, viewModel) => {
			const addCursorDownAction = new InsertCursorBelow();
			addCursorDownAction.run(null!, editor, {});
			assert.strictEqual(viewModel.getSelections().length, 1);
		});
	});

});

function fromRange(rng: Range): number[] {
	return [rng.startLineNumber, rng.startColumn, rng.endLineNumber, rng.endColumn];
}

suite('Multicursor selection', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	const serviceCollection = new ServiceCollection();
	serviceCollection.set(IStorageService, new InMemoryStorageService());

	test('issue #8817: Cursor position changes when you cancel multicursor', () => {
		withTestCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3 * 5)',
		], { serviceCollection: serviceCollection }, (editor) => {

			const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
			const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
			const selectHighlightsAction = new SelectHighlightsAction();

			editor.setSelection(new Selection(2, 9, 2, 16));

			selectHighlightsAction.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections()!.map(fromRange), [
				[2, 9, 2, 16],
				[1, 9, 1, 16],
				[3, 9, 3, 16],
			]);

			editor.trigger('test', 'removeSecondaryCursors', null);

			assert.deepStrictEqual(fromRange(editor.getSelection()!), [2, 9, 2, 16]);

			multiCursorSelectController.dispose();
			findController.dispose();
		});
	});

	test('issue #5400: "Select All Occurrences of Find Match" does not select all if find uses regex', () => {
		withTestCodeEditor([
			'something',
			'someething',
			'someeething',
			'nothing'
		], { serviceCollection: serviceCollection, hasTextFocus: false }, (editor) => {

			const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
			const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
			const selectHighlightsAction = new SelectHighlightsAction();

			editor.setSelection(new Selection(1, 1, 1, 1));
			findController.getState().change({ searchString: 'some+thing', isRegex: true, isRevealed: true }, false);

			selectHighlightsAction.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections()!.map(fromRange), [
				[1, 1, 1, 10],
				[2, 1, 2, 11],
				[3, 1, 3, 12],
			]);

			assert.strictEqual(findController.getState().searchString, 'some+thing');

			multiCursorSelectController.dispose();
			findController.dispose();
		});
	});

	test('AddSelectionToNextFindMatchAction can work with multiline', () => {
		withTestCodeEditor([
			'',
			'qwe',
			'rty',
			'',
			'qwe',
			'',
			'rty',
			'qwe',
			'rty'
		], { serviceCollection: serviceCollection }, (editor) => {

			const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
			const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
			const addSelectionToNextFindMatch = new AddSelectionToNextFindMatchAction();

			editor.setSelection(new Selection(2, 1, 3, 4));

			addSelectionToNextFindMatch.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections()!.map(fromRange), [
				[2, 1, 3, 4],
				[8, 1, 9, 4]
			]);

			editor.trigger('test', 'removeSecondaryCursors', null);

			assert.deepStrictEqual(fromRange(editor.getSelection()!), [2, 1, 3, 4]);

			multiCursorSelectController.dispose();
			findController.dispose();
		});
	});

	test('issue #6661: AddSelectionToNextFindMatchAction can work with touching ranges', () => {
		withTestCodeEditor([
			'abcabc',
			'abc',
			'abcabc',
		], { serviceCollection: serviceCollection }, (editor) => {

			const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
			const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
			const addSelectionToNextFindMatch = new AddSelectionToNextFindMatchAction();

			editor.setSelection(new Selection(1, 1, 1, 4));

			addSelectionToNextFindMatch.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections()!.map(fromRange), [
				[1, 1, 1, 4],
				[1, 4, 1, 7]
			]);

			addSelectionToNextFindMatch.run(null!, editor);
			addSelectionToNextFindMatch.run(null!, editor);
			addSelectionToNextFindMatch.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections()!.map(fromRange), [
				[1, 1, 1, 4],
				[1, 4, 1, 7],
				[2, 1, 2, 4],
				[3, 1, 3, 4],
				[3, 4, 3, 7]
			]);

			editor.trigger('test', Handler.Type, { text: 'z' });
			assert.deepStrictEqual(editor.getSelections()!.map(fromRange), [
				[1, 2, 1, 2],
				[1, 3, 1, 3],
				[2, 2, 2, 2],
				[3, 2, 3, 2],
				[3, 3, 3, 3]
			]);
			assert.strictEqual(editor.getValue(), [
				'zz',
				'z',
				'zz',
			].join('\n'));

			multiCursorSelectController.dispose();
			findController.dispose();
		});
	});

	test('issue #23541: Multiline Ctrl+D does not work in CRLF files', () => {
		withTestCodeEditor([
			'',
			'qwe',
			'rty',
			'',
			'qwe',
			'',
			'rty',
			'qwe',
			'rty'
		], { serviceCollection: serviceCollection }, (editor) => {

			editor.getModel()!.setEOL(EndOfLineSequence.CRLF);

			const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
			const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
			const addSelectionToNextFindMatch = new AddSelectionToNextFindMatchAction();

			editor.setSelection(new Selection(2, 1, 3, 4));

			addSelectionToNextFindMatch.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections()!.map(fromRange), [
				[2, 1, 3, 4],
				[8, 1, 9, 4]
			]);

			editor.trigger('test', 'removeSecondaryCursors', null);

			assert.deepStrictEqual(fromRange(editor.getSelection()!), [2, 1, 3, 4]);

			multiCursorSelectController.dispose();
			findController.dispose();
		});
	});

	function testMulticursor(text: string[], callback: (editor: ITestCodeEditor, findController: CommonFindController) => void, options: TestCodeEditorInstantiationOptions = {}): void {
		const storageService = disposables.add(new InMemoryStorageService());
		withTestCodeEditor(text, { ...options, serviceCollection: new ServiceCollection([IStorageService, storageService]) }, (editor) => {
			const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
			const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);

			callback(editor, findController);

			multiCursorSelectController.dispose();
			findController.dispose();
		});
	}

	function testAddSelectionToNextFindMatchAction(text: string[], callback: (editor: ITestCodeEditor, action: AddSelectionToNextFindMatchAction, findController: CommonFindController) => void): void {
		testMulticursor(text, (editor, findController) => {
			const action = new AddSelectionToNextFindMatchAction();
			callback(editor, action, findController);
		});
	}

	function setTextFocus(editor: ITestCodeEditor, hasFocus: boolean): void {
		assert.ok(editor instanceof TestCodeEditor);
		editor.setHasTextFocus(hasFocus);
		editor.getViewModel()!.setHasFocus(hasFocus);
	}

	test('AddSelectionToNextFindMatchAction starting with single collapsed selection', () => {
		const text = [
			'abc pizza',
			'abc house',
			'abc bar'
		];
		testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
			editor.setSelections([
				new Selection(1, 2, 1, 2),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
				new Selection(2, 1, 2, 4),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
				new Selection(2, 1, 2, 4),
				new Selection(3, 1, 3, 4),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
				new Selection(2, 1, 2, 4),
				new Selection(3, 1, 3, 4),
			]);
		});
	});

	test('AddSelectionToNextFindMatchAction starting with two selections, one being collapsed 1)', () => {
		const text = [
			'abc pizza',
			'abc house',
			'abc bar'
		];
		testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
			editor.setSelections([
				new Selection(1, 1, 1, 4),
				new Selection(2, 2, 2, 2),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
				new Selection(2, 1, 2, 4),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
				new Selection(2, 1, 2, 4),
				new Selection(3, 1, 3, 4),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
				new Selection(2, 1, 2, 4),
				new Selection(3, 1, 3, 4),
			]);
		});
	});

	test('AddSelectionToNextFindMatchAction starting with two selections, one being collapsed 2)', () => {
		const text = [
			'abc pizza',
			'abc house',
			'abc bar'
		];
		testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
			editor.setSelections([
				new Selection(1, 2, 1, 2),
				new Selection(2, 1, 2, 4),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
				new Selection(2, 1, 2, 4),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
				new Selection(2, 1, 2, 4),
				new Selection(3, 1, 3, 4),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
				new Selection(2, 1, 2, 4),
				new Selection(3, 1, 3, 4),
			]);
		});
	});

	test('AddSelectionToNextFindMatchAction starting with all collapsed selections', () => {
		const text = [
			'abc pizza',
			'abc house',
			'abc bar'
		];
		testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
			editor.setSelections([
				new Selection(1, 2, 1, 2),
				new Selection(2, 2, 2, 2),
				new Selection(3, 1, 3, 1),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
				new Selection(2, 1, 2, 4),
				new Selection(3, 1, 3, 4),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 4),
				new Selection(2, 1, 2, 4),
				new Selection(3, 1, 3, 4),
			]);
		});
	});

	test('AddSelectionToNextFindMatchAction starting with all collapsed selections on different words', () => {
		const text = [
			'abc pizza',
			'abc house',
			'abc bar'
		];
		testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
			editor.setSelections([
				new Selection(1, 6, 1, 6),
				new Selection(2, 6, 2, 6),
				new Selection(3, 6, 3, 6),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 5, 1, 10),
				new Selection(2, 5, 2, 10),
				new Selection(3, 5, 3, 8),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 5, 1, 10),
				new Selection(2, 5, 2, 10),
				new Selection(3, 5, 3, 8),
			]);
		});
	});

	test('issue #20651: AddSelectionToNextFindMatchAction case insensitive', () => {
		const text = [
			'test',
			'testte',
			'Test',
			'testte',
			'test'
		];
		testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
			editor.setSelections([
				new Selection(1, 1, 1, 5),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 5),
				new Selection(2, 1, 2, 5),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 5),
				new Selection(2, 1, 2, 5),
				new Selection(3, 1, 3, 5),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 5),
				new Selection(2, 1, 2, 5),
				new Selection(3, 1, 3, 5),
				new Selection(4, 1, 4, 5),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 5),
				new Selection(2, 1, 2, 5),
				new Selection(3, 1, 3, 5),
				new Selection(4, 1, 4, 5),
				new Selection(5, 1, 5, 5),
			]);

			action.run(null!, editor);
			assert.deepStrictEqual(editor.getSelections(), [
				new Selection(1, 1, 1, 5),
				new Selection(2, 1, 2, 5),
				new Selection(3, 1, 3, 5),
				new Selection(4, 1, 4, 5),
				new Selection(5, 1, 5, 5),
			]);
		});
	});

	suite('Selection match case', () => {

		const text = ['foo', 'FOObar', 'foobar', 'FOO', 'foo'];
		const addSelectionToNext = new AddSelectionToNextFindMatchAction();
		const addSelectionToPrevious = new AddSelectionToPreviousFindMatchAction();
		const moveSelectionToNext = new MoveSelectionToNextFindMatchAction();
		const moveSelectionToPrevious = new MoveSelectionToPreviousFindMatchAction();
		const selectHighlights = new SelectHighlightsAction();

		function assertSelectedText(runAction: (editor: ITestCodeEditor) => void, startLine: number, expectedLines: number[], selectionMatchCase: boolean, isRevealed: boolean): void {
			testMulticursor(text, (editor, findController) => {
				const state = findController.getState();
				state.change({ searchString: 'FOO.*', isRevealed, matchCase: !selectionMatchCase, wholeWord: true, isRegex: true }, false);
				editor.setSelection(new Selection(startLine, 1, startLine, 4));

				runAction(editor);

				assert.deepStrictEqual({
					selections: editor.getSelections().map(fromRange),
					findOptions: [state.matchCase, state.wholeWord, state.isRegex],
				}, {
					selections: expectedLines.map(line => [line, 1, line, 4]),
					findOptions: [!selectionMatchCase, true, true],
				});
			}, { selectionMatchCase });
		}

		function assertEmptySelection(runAction: (editor: ITestCodeEditor) => void, startLine: number, expectedLines: number[], selectionMatchCase: boolean): void {
			testMulticursor(text, (editor, findController) => {
				const state = findController.getState();
				state.change({ matchCase: false, wholeWord: false, isRegex: true }, false);
				editor.setSelection(new Selection(startLine, 2, startLine, 2));

				runAction(editor);
				runAction(editor);

				assert.deepStrictEqual({
					selections: editor.getSelections().map(fromRange),
					findOptions: [state.matchCase, state.wholeWord, state.isRegex],
				}, {
					selections: expectedLines.map(line => [line, 1, line, 4]),
					findOptions: [false, false, true],
				});
			}, { selectionMatchCase });
		}

		function assertFindOptionsFeedback(runAction: (editor: ITestCodeEditor) => void, startLine: number, expectedLines: number[], hasTextFocus: boolean): void {
			let actual: { selections: number[][]; findOptions: boolean[]; highlightCount: number } | undefined;
			testMulticursor(text, (editor, findController) => {
				const state = findController.getState();
				state.change({ searchString: 'foo', isRevealed: !hasTextFocus, matchCase: true, wholeWord: true, isRegex: true }, false);
				editor.setSelection(new Selection(startLine, 1, startLine, 4));
				const highlightFindOptions = sinon.spy(findController, 'highlightFindOptions');

				runAction(editor);

				actual = {
					selections: editor.getSelections().map(fromRange),
					findOptions: [state.matchCase, state.wholeWord, state.isRegex],
					highlightCount: highlightFindOptions.callCount,
				};
			}, { hasTextFocus, selectionMatchCase: false });

			assert.deepStrictEqual(actual, {
				selections: expectedLines.map(line => [line, 1, line, 4]),
				findOptions: [true, true, true],
				highlightCount: hasTextFocus ? 0 : 1,
			});
		}

		test('defaults to case-insensitive and reports live option changes', () => {
			testMulticursor(text, editor => {
				const values = [editor.getOption(EditorOption.selectionMatchCase)];
				const changes: boolean[] = [];
				disposables.add(editor.onDidChangeConfiguration(e => changes.push(e.hasChanged(EditorOption.selectionMatchCase))));
				for (const selectionMatchCase of [true, false]) {
					editor.updateOptions({ selectionMatchCase });
					values.push(editor.getOption(EditorOption.selectionMatchCase));
				}
				assert.deepStrictEqual({ values, changes }, { values: [false, true, false], changes: [true, true] });
			});
		});

		test(`${addSelectionToNext.id}: selected text, match case false, Find visible false`, () => {
			assertSelectedText(editor => addSelectionToNext.run(null!, editor), 1, [1, 2], false, false);
		});

		test(`${addSelectionToNext.id}: selected text, match case false, Find visible true`, () => {
			assertSelectedText(editor => addSelectionToNext.run(null!, editor), 1, [1, 2], false, true);
		});

		test(`${addSelectionToNext.id}: empty selection always starts whole-word and case-sensitive, setting false`, () => {
			assertEmptySelection(editor => addSelectionToNext.run(null!, editor), 1, [1, 5], false);
		});

		test(`${addSelectionToNext.id}: selected text, match case true, Find visible false`, () => {
			assertSelectedText(editor => addSelectionToNext.run(null!, editor), 1, [1, 3], true, false);
		});

		test(`${addSelectionToNext.id}: selected text, match case true, Find visible true`, () => {
			assertSelectedText(editor => addSelectionToNext.run(null!, editor), 1, [1, 3], true, true);
		});

		test(`${addSelectionToNext.id}: empty selection always starts whole-word and case-sensitive, setting true`, () => {
			assertEmptySelection(editor => addSelectionToNext.run(null!, editor), 1, [1, 5], true);
		});

		test(`${addSelectionToPrevious.id}: selected text, match case false, Find visible false`, () => {
			assertSelectedText(editor => addSelectionToPrevious.run(null!, editor), 5, [5, 4], false, false);
		});

		test(`${addSelectionToPrevious.id}: selected text, match case false, Find visible true`, () => {
			assertSelectedText(editor => addSelectionToPrevious.run(null!, editor), 5, [5, 4], false, true);
		});

		test(`${addSelectionToPrevious.id}: empty selection always starts whole-word and case-sensitive, setting false`, () => {
			assertEmptySelection(editor => addSelectionToPrevious.run(null!, editor), 5, [5, 1], false);
		});

		test(`${addSelectionToPrevious.id}: selected text, match case true, Find visible false`, () => {
			assertSelectedText(editor => addSelectionToPrevious.run(null!, editor), 5, [5, 3], true, false);
		});

		test(`${addSelectionToPrevious.id}: selected text, match case true, Find visible true`, () => {
			assertSelectedText(editor => addSelectionToPrevious.run(null!, editor), 5, [5, 3], true, true);
		});

		test(`${addSelectionToPrevious.id}: empty selection always starts whole-word and case-sensitive, setting true`, () => {
			assertEmptySelection(editor => addSelectionToPrevious.run(null!, editor), 5, [5, 1], true);
		});

		test(`${moveSelectionToNext.id}: selected text, match case false, Find visible false`, () => {
			assertSelectedText(editor => moveSelectionToNext.run(null!, editor), 1, [2], false, false);
		});

		test(`${moveSelectionToNext.id}: selected text, match case false, Find visible true`, () => {
			assertSelectedText(editor => moveSelectionToNext.run(null!, editor), 1, [2], false, true);
		});

		test(`${moveSelectionToNext.id}: empty selection always starts whole-word and case-sensitive, setting false`, () => {
			assertEmptySelection(editor => moveSelectionToNext.run(null!, editor), 1, [5], false);
		});

		test(`${moveSelectionToNext.id}: selected text, match case true, Find visible false`, () => {
			assertSelectedText(editor => moveSelectionToNext.run(null!, editor), 1, [3], true, false);
		});

		test(`${moveSelectionToNext.id}: selected text, match case true, Find visible true`, () => {
			assertSelectedText(editor => moveSelectionToNext.run(null!, editor), 1, [3], true, true);
		});

		test(`${moveSelectionToNext.id}: empty selection always starts whole-word and case-sensitive, setting true`, () => {
			assertEmptySelection(editor => moveSelectionToNext.run(null!, editor), 1, [5], true);
		});

		test(`${moveSelectionToPrevious.id}: selected text, match case false, Find visible false`, () => {
			assertSelectedText(editor => moveSelectionToPrevious.run(null!, editor), 5, [4], false, false);
		});

		test(`${moveSelectionToPrevious.id}: selected text, match case false, Find visible true`, () => {
			assertSelectedText(editor => moveSelectionToPrevious.run(null!, editor), 5, [4], false, true);
		});

		test(`${moveSelectionToPrevious.id}: empty selection always starts whole-word and case-sensitive, setting false`, () => {
			assertEmptySelection(editor => moveSelectionToPrevious.run(null!, editor), 5, [1], false);
		});

		test(`${moveSelectionToPrevious.id}: selected text, match case true, Find visible false`, () => {
			assertSelectedText(editor => moveSelectionToPrevious.run(null!, editor), 5, [3], true, false);
		});

		test(`${moveSelectionToPrevious.id}: selected text, match case true, Find visible true`, () => {
			assertSelectedText(editor => moveSelectionToPrevious.run(null!, editor), 5, [3], true, true);
		});

		test(`${moveSelectionToPrevious.id}: empty selection always starts whole-word and case-sensitive, setting true`, () => {
			assertEmptySelection(editor => moveSelectionToPrevious.run(null!, editor), 5, [1], true);
		});

		test(`${selectHighlights.id}: selected text, match case false, Find visible false`, () => {
			assertSelectedText(editor => selectHighlights.run(null!, editor), 1, [1, 2, 3, 4, 5], false, false);
		});

		test(`${selectHighlights.id}: selected text, match case false, Find visible true`, () => {
			assertSelectedText(editor => selectHighlights.run(null!, editor), 1, [1, 2, 3, 4, 5], false, true);
		});

		test(`${selectHighlights.id}: empty selection always starts whole-word and case-sensitive, setting false`, () => {
			assertEmptySelection(editor => selectHighlights.run(null!, editor), 1, [1, 5], false);
		});

		test(`${selectHighlights.id}: selected text, match case true, Find visible false`, () => {
			assertSelectedText(editor => selectHighlights.run(null!, editor), 1, [1, 3, 5], true, false);
		});

		test(`${selectHighlights.id}: selected text, match case true, Find visible true`, () => {
			assertSelectedText(editor => selectHighlights.run(null!, editor), 1, [1, 3, 5], true, true);
		});

		test(`${selectHighlights.id}: empty selection always starts whole-word and case-sensitive, setting true`, () => {
			assertEmptySelection(editor => selectHighlights.run(null!, editor), 1, [1, 5], true);
		});

		test('issue #18239: replacing selected prefixes preserves differently cased identifiers', () => {
			testMulticursor([
				'accountQryConn *grpc.ClientConn',
				'accountQryClient proto.AccountQueryClient'
			], (editor, findController) => {
				findController.getState().change({ matchCase: false, wholeWord: true }, false);
				editor.setSelection(new Selection(1, 1, 1, 8));
				new AddSelectionToNextFindMatchAction().run(null!, editor);
				editor.trigger('test', Handler.Type, { text: 'voucher' });

				assert.strictEqual(editor.getValue(), 'voucherQryConn *grpc.ClientConn\nvoucherQryClient proto.AccountQueryClient');
			}, { selectionMatchCase: true });
		});

		test('select all replaces only selected-text occurrences while regex Find is visible', () => {
			let actual: string | undefined;
			testMulticursor(text, (editor, findController) => {
				findController.getState().change({ searchString: 'FOO.*', isRevealed: true, matchCase: false, wholeWord: true, isRegex: true }, false);
				editor.setSelection(new Selection(1, 1, 1, 4));

				selectHighlights.run(null!, editor);
				editor.trigger('test', Handler.Type, { text: 'baz' });

				actual = editor.getValue();
			}, { selectionMatchCase: true });

			assert.strictEqual(actual, 'baz\nFOObar\nbazbar\nFOO\nbaz');
		});

		test('changing Find options does not end a caret-started selection sequence', () => {
			testMulticursor(text, (editor, findController) => {
				editor.setSelection(new Selection(1, 2, 1, 2));
				const action = new AddSelectionToNextFindMatchAction();
				action.run(null!, editor);
				findController.getState().change({ matchCase: true, wholeWord: true }, false);
				findController.getState().change({ matchCase: false, wholeWord: false }, false);
				action.run(null!, editor);

				assert.deepStrictEqual(editor.getSelections().map(fromRange), [[1, 1, 1, 4], [5, 1, 5, 4]]);
			});
		});

		test('mixed-case initial selections are compared using the selection setting, not Find', () => {
			testMulticursor(['foo', 'FOO', 'fooBar'], (editor, findController) => {
				findController.getState().change({ matchCase: true }, false);
				editor.setSelections([new Selection(1, 1, 1, 4), new Selection(2, 1, 2, 4)]);
				new AddSelectionToNextFindMatchAction().run(null!, editor);

				assert.deepStrictEqual(editor.getSelections().map(fromRange), [[1, 1, 1, 4], [2, 1, 2, 4], [3, 1, 3, 4]]);
			}, { selectionMatchCase: false });
		});

		test('Find-focused mixed-case initial selections respect Find match case false', () => {
			testMulticursor(['foo', 'FOO', 'fooBar'], (editor, findController) => {
				findController.getState().change({ searchString: 'foo', isRevealed: true, matchCase: false }, false);
				editor.setSelections([new Selection(1, 1, 1, 4), new Selection(2, 1, 2, 4)]);
				new AddSelectionToNextFindMatchAction().run(null!, editor);

				assert.deepStrictEqual(editor.getSelections().map(fromRange), [[1, 1, 1, 4], [2, 1, 2, 4], [3, 1, 3, 4]]);
			}, { hasTextFocus: false, selectionMatchCase: true });
		});

		test('Find-focused mixed-case initial selections respect Find match case true', () => {
			testMulticursor(['foo', 'FOO', 'fooBar'], (editor, findController) => {
				findController.getState().change({ searchString: 'foo', isRevealed: true, matchCase: true }, false);
				editor.setSelections([new Selection(1, 1, 1, 4), new Selection(2, 1, 2, 4)]);
				new AddSelectionToNextFindMatchAction().run(null!, editor);

				assert.deepStrictEqual(editor.getSelections().map(fromRange), [[1, 1, 1, 4], [2, 1, 2, 4]]);
			}, { hasTextFocus: false, selectionMatchCase: false });
		});

		test('switching focus transfers matching rules between selection and Find sessions', () => {
			testMulticursor(['foo', 'FOO', 'fooqux', 'foobar', 'bar', 'BAR', 'barista'], (editor, findController) => {
				const action = new MoveSelectionToNextFindMatchAction();
				editor.setSelection(new Selection(1, 1, 1, 4));
				action.run(null!, editor);
				const actual = [editor.getSelections().map(fromRange)];

				findController.getState().change({ searchString: 'bar', isRevealed: true, matchCase: false, wholeWord: true }, false);
				setTextFocus(editor, false);
				action.run(null!, editor);
				actual.push(editor.getSelections().map(fromRange));

				setTextFocus(editor, true);
				action.run(null!, editor);
				actual.push(editor.getSelections().map(fromRange));

				assert.deepStrictEqual(actual, [[[3, 1, 3, 4]], [[5, 1, 5, 4]], [[7, 1, 7, 4]]]);
			}, { selectionMatchCase: true });
		});

		test('a selection session does not survive replacing the editor model', () => {
			testMulticursor(text, editor => {
				const action = new AddSelectionToNextFindMatchAction();
				editor.setSelection(new Selection(1, 1, 1, 4));
				action.run(null!, editor);
				const replacement = disposables.add(createTextModel('bar\nBAR\nbarista'));
				editor.setModel(replacement);
				editor.setSelection(new Selection(1, 1, 1, 4));
				editor.updateOptions({ selectionMatchCase: true });
				action.run(null!, editor);

				assert.deepStrictEqual(editor.getSelections().map(fromRange), [[1, 1, 1, 4], [3, 1, 3, 4]]);
			});
		});

		test('multiline CRLF selections match literal substrings with match case false', () => {
			testMulticursor(['foo.', 'bar', 'FOO.', 'BAR', 'xfoo.', 'bar'], (editor, findController) => {
				editor.getModel().setEOL(EndOfLineSequence.CRLF);
				findController.getState().change({ searchString: 'unrelated.*', isRevealed: true, matchCase: true, wholeWord: true, isRegex: true }, false);
				editor.setSelection(new Selection(1, 1, 2, 4));
				new SelectHighlightsAction().run(null!, editor);

				assert.deepStrictEqual(editor.getSelections().map(fromRange), [[1, 1, 2, 4], [3, 1, 4, 4], [5, 2, 6, 4]]);
			}, { selectionMatchCase: false });
		});

		test('multiline CRLF selections match literal substrings with match case true', () => {
			testMulticursor(['foo.', 'bar', 'FOO.', 'BAR', 'xfoo.', 'bar'], (editor, findController) => {
				editor.getModel().setEOL(EndOfLineSequence.CRLF);
				findController.getState().change({ searchString: 'unrelated.*', isRevealed: true, matchCase: false, wholeWord: true, isRegex: true }, false);
				editor.setSelection(new Selection(1, 1, 2, 4));
				new SelectHighlightsAction().run(null!, editor);

				assert.deepStrictEqual(editor.getSelections().map(fromRange), [[1, 1, 2, 4], [5, 2, 6, 4]]);
			}, { selectionMatchCase: true });
		});

		test(`${addSelectionToNext.id}: Find-focused commands retain Find matching rules`, () => {
			testMulticursor(['foo', 'BAR', 'bar', 'barista', 'foo'], (editor, findController) => {
				editor.setSelection(new Selection(1, 1, 1, 4));
				findController.getState().change({ searchString: 'bar', isRevealed: true, matchCase: false, wholeWord: true }, false);
				editor.updateOptions({ selectionMatchCase: false });
				editor.updateOptions({ selectionMatchCase: true });
				addSelectionToNext.run(null!, editor);

				assert.deepStrictEqual(editor.getSelections().map(fromRange), [[1, 1, 1, 4], [2, 1, 2, 4]]);
			}, { hasTextFocus: false, selectionMatchCase: true });
		});

		test(`${addSelectionToPrevious.id}: Find-focused commands retain Find matching rules`, () => {
			testMulticursor(['foo', 'BAR', 'bar', 'barista', 'foo'], (editor, findController) => {
				editor.setSelection(new Selection(5, 1, 5, 4));
				findController.getState().change({ searchString: 'bar', isRevealed: true, matchCase: false, wholeWord: true }, false);
				editor.updateOptions({ selectionMatchCase: false });
				editor.updateOptions({ selectionMatchCase: true });
				addSelectionToPrevious.run(null!, editor);

				assert.deepStrictEqual(editor.getSelections().map(fromRange), [[5, 1, 5, 4], [3, 1, 3, 4]]);
			}, { hasTextFocus: false, selectionMatchCase: true });
		});

		test(`${selectHighlights.id}: Find-focused commands retain Find matching rules`, () => {
			testMulticursor(['foo', 'BAR', 'bar', 'barista', 'foo'], (editor, findController) => {
				editor.setSelection(new Selection(1, 1, 1, 4));
				findController.getState().change({ searchString: 'bar', isRevealed: true, matchCase: false, wholeWord: true }, false);
				editor.updateOptions({ selectionMatchCase: false });
				editor.updateOptions({ selectionMatchCase: true });
				selectHighlights.run(null!, editor);

				assert.deepStrictEqual(editor.getSelections().map(fromRange), [[2, 1, 2, 4], [3, 1, 3, 4]]);
			}, { hasTextFocus: false, selectionMatchCase: true });
		});

		test('add next occurrence does not highlight unrelated Find options', () => {
			assertFindOptionsFeedback(editor => addSelectionToNext.run(null!, editor), 1, [1, 2], true);
		});

		test('add previous occurrence does not highlight unrelated Find options', () => {
			assertFindOptionsFeedback(editor => addSelectionToPrevious.run(null!, editor), 5, [5, 4], true);
		});

		test('select all occurrences does not highlight unrelated Find options', () => {
			assertFindOptionsFeedback(editor => selectHighlights.run(null!, editor), 1, [1, 2, 3, 4, 5], true);
		});

		test('Find-focused occurrence selection still highlights Find options', () => {
			assertFindOptionsFeedback(editor => addSelectionToNext.run(null!, editor), 1, [1, 5], false);
		});
	});

	suite('Selection highlighting match case', () => {
		const text = ['foo', 'FOO', 'fooBar', 'FOOBar'];

		function highlights(editor: ITestCodeEditor): number[][] {
			return editor.getModel().getAllDecorations()
				.filter(decoration => decoration.options.className === 'selectionHighlight')
				.map(decoration => decoration.range)
				.sort(Range.compareRangesUsingStarts)
				.map(fromRange);
		}

		function assertSelectionHighlighting(selectionMatchCase: boolean, hasTextFocus: boolean, expectedLines: number[]): void {
			testMulticursor(text, (editor, findController) => {
				editor.registerAndInstantiateContribution(SelectionHighlighter.ID, SelectionHighlighter);
				findController.getState().change({ searchString: 'f.*', isRevealed: true, matchCase: !selectionMatchCase, wholeWord: true, isRegex: true }, false);
				editor.setSelection(new Selection(1, 1, 1, 4));

				assert.deepStrictEqual(highlights(editor), expectedLines.map(line => [line, 1, line, 4]));
			}, { selectionMatchCase, hasTextFocus });
		}

		function assertDuplicateFindHighlights(selectionMatchCase: boolean, expectedDifferentCaseLines: number[]): void {
			testMulticursor(text, (editor, findController) => {
				editor.registerAndInstantiateContribution(SelectionHighlighter.ID, SelectionHighlighter);
				editor.setSelection(new Selection(1, 1, 1, 4));
				findController.getState().change({ searchString: 'foo', isRevealed: true, matchCase: selectionMatchCase, wholeWord: false }, false);
				const sameOptions = highlights(editor);

				findController.getState().change({ matchCase: !selectionMatchCase }, false);
				assert.deepStrictEqual({ sameOptions, differentCase: highlights(editor) }, {
					sameOptions: [],
					differentCase: expectedDifferentCaseLines.map(line => [line, 1, line, 4]),
				});
			}, { selectionMatchCase });
		}

		test('selection highlighting uses match case false, editor focused true', () => {
			assertSelectionHighlighting(false, true, [2, 3, 4]);
		});

		test('only suppress duplicate Find highlights with the same matching rules, match case false', () => {
			assertDuplicateFindHighlights(false, [2, 3, 4]);
		});

		test('selection highlighting uses match case true, editor focused true', () => {
			assertSelectionHighlighting(true, true, [3]);
		});

		test('only suppress duplicate Find highlights with the same matching rules, match case true', () => {
			assertDuplicateFindHighlights(true, [3]);
		});

		test('selection highlighting refreshes on case-only configuration changes without cursor movement', () => {
			const clock = sinon.useFakeTimers();
			const actual: number[][][] = [];
			testMulticursor(text, editor => {
				editor.registerAndInstantiateContribution(SelectionHighlighter.ID, SelectionHighlighter);
				editor.setSelection(new Selection(1, 1, 1, 4));
				// Drain the initial scheduled update so it cannot mask missing configuration invalidation.
				clock.runAll();
				actual.push(highlights(editor));

				editor.updateOptions({ selectionMatchCase: true });
				clock.runAll();
				actual.push(highlights(editor));

				editor.updateOptions({ selectionMatchCase: false });
				clock.runAll();
				actual.push(highlights(editor));
			});

			assert.deepStrictEqual(actual, [[2, 3, 4], [3], [2, 3, 4]].map(lines => lines.map(line => [line, 1, line, 4])));
		});

		test('Find regex select-all discards an existing selection-driven session', () => {
			testMulticursor(['foo', 'fooBar', 'bar', 'barista'], (editor, findController) => {
				editor.registerAndInstantiateContribution(SelectionHighlighter.ID, SelectionHighlighter);
				editor.setSelection(new Selection(1, 1, 1, 4));
				const action = new AddSelectionToNextFindMatchAction();
				action.run(null!, editor);

				findController.getState().change({ searchString: 'bar$', isRevealed: true, isRegex: true, matchCase: true }, false);
				setTextFocus(editor, false);
				new SelectHighlightsAction().run(null!, editor);
				findController.getState().change({ isRevealed: false }, false);
				const afterFind = highlights(editor);

				setTextFocus(editor, true);
				action.run(null!, editor);

				assert.deepStrictEqual({ afterFind, selections: editor.getSelections().map(fromRange) }, {
					afterFind: [[2, 4, 2, 7], [4, 1, 4, 4]],
					selections: [[3, 1, 3, 4], [4, 1, 4, 4]],
				});
			});
		});
	});

	suite('Find state disassociation', () => {

		const text = [
			'app',
			'apples',
			'whatsapp',
			'app',
			'App',
			' app'
		];

		test('enters mode', () => {
			testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
				editor.setSelections([
					new Selection(1, 2, 1, 2),
				]);

				action.run(null!, editor);
				assert.deepStrictEqual(editor.getSelections(), [
					new Selection(1, 1, 1, 4),
				]);

				action.run(null!, editor);
				assert.deepStrictEqual(editor.getSelections(), [
					new Selection(1, 1, 1, 4),
					new Selection(4, 1, 4, 4),
				]);

				action.run(null!, editor);
				assert.deepStrictEqual(editor.getSelections(), [
					new Selection(1, 1, 1, 4),
					new Selection(4, 1, 4, 4),
					new Selection(6, 2, 6, 5),
				]);
			});
		});

		test('leaves mode when selection changes', () => {
			testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
				editor.setSelections([
					new Selection(1, 2, 1, 2),
				]);

				action.run(null!, editor);
				assert.deepStrictEqual(editor.getSelections(), [
					new Selection(1, 1, 1, 4),
				]);

				action.run(null!, editor);
				assert.deepStrictEqual(editor.getSelections(), [
					new Selection(1, 1, 1, 4),
					new Selection(4, 1, 4, 4),
				]);

				// change selection
				editor.setSelections([
					new Selection(1, 1, 1, 4),
				]);

				action.run(null!, editor);
				assert.deepStrictEqual(editor.getSelections(), [
					new Selection(1, 1, 1, 4),
					new Selection(2, 1, 2, 4),
				]);
			});
		});
	});
});
