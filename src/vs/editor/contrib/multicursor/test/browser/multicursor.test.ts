/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { Handler } from '../../../../common/editorCommon.js';
import { EndOfLineSequence } from '../../../../common/model.js';
import { CommonFindController } from '../../../find/browser/findController.js';
import { AddSelectionToNextFindMatchAction, AddSelectionToPreviousFindMatchAction, InsertCursorAbove, InsertCursorBelow, MoveSelectionToNextFindMatchAction, MoveSelectionToPreviousFindMatchAction, MultiCursorSelectionController, SelectHighlightsAction, SelectionHighlighter } from '../../browser/multicursor.js';
import { createTestCodeEditor, ITestCodeEditor, TestCodeEditor, TestCodeEditorInstantiationOptions, withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
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
		const actions = [
			{ action: new AddSelectionToNextFindMatchAction(), startLine: 1, sensitive: [1, 3], insensitive: [1, 2], wholeWord: [1, 5] },
			{ action: new AddSelectionToPreviousFindMatchAction(), startLine: 5, sensitive: [5, 3], insensitive: [5, 4], wholeWord: [5, 1] },
			{ action: new MoveSelectionToNextFindMatchAction(), startLine: 1, sensitive: [3], insensitive: [2], wholeWord: [5] },
			{ action: new MoveSelectionToPreviousFindMatchAction(), startLine: 5, sensitive: [3], insensitive: [4], wholeWord: [1] },
			{ action: new SelectHighlightsAction(), startLine: 1, sensitive: [1, 3, 5], insensitive: [1, 2, 3, 4, 5], wholeWord: [1, 5] },
		];

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

		for (const { action, startLine, sensitive, insensitive, wholeWord } of actions) {
			for (const selectionMatchCase of [false, true]) {
				for (const isRevealed of [false, true]) {
					test(`${action.id}: selected text, match case ${selectionMatchCase}, Find visible ${isRevealed}`, () => {
						testMulticursor(text, (editor, findController) => {
							const state = findController.getState();
							state.change({ searchString: 'FOO.*', isRevealed, matchCase: !selectionMatchCase, wholeWord: true, isRegex: true }, false);
							editor.setSelection(new Selection(startLine, 1, startLine, 4));

							action.run(null!, editor);

							assert.deepStrictEqual({
								selections: editor.getSelections().map(fromRange),
								findOptions: [state.matchCase, state.wholeWord, state.isRegex],
							}, {
								selections: (selectionMatchCase ? sensitive : insensitive).map(line => [line, 1, line, 4]),
								findOptions: [!selectionMatchCase, true, true],
							});
						}, { selectionMatchCase });
					});
				}

				test(`${action.id}: empty selection always starts whole-word and case-sensitive, setting ${selectionMatchCase}`, () => {
					testMulticursor(text, (editor, findController) => {
						const state = findController.getState();
						state.change({ matchCase: false, wholeWord: false, isRegex: true }, false);
						editor.setSelection(new Selection(startLine, 2, startLine, 2));

						action.run(null!, editor);
						action.run(null!, editor);

						assert.deepStrictEqual({
							selections: editor.getSelections().map(fromRange),
							findOptions: [state.matchCase, state.wholeWord, state.isRegex],
						}, {
							selections: wholeWord.map(line => [line, 1, line, 4]),
							findOptions: [false, false, true],
						});
					}, { selectionMatchCase });
				});
			}
		}

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

		const liveActions = [
			{ action: new AddSelectionToNextFindMatchAction(), startLine: 1, stages: [[1, 2], [1, 2, 3], [1, 2, 3, 4]] },
			{ action: new AddSelectionToPreviousFindMatchAction(), startLine: 7, stages: [[7, 6], [7, 6, 5], [7, 6, 5, 4]] },
			{ action: new MoveSelectionToNextFindMatchAction(), startLine: 1, stages: [[2], [3], [4]] },
			{ action: new MoveSelectionToPreviousFindMatchAction(), startLine: 7, stages: [[6], [5], [4]] },
			{ action: new SelectHighlightsAction(), startLine: 1, stages: [[1, 2, 3, 4, 5, 6, 7], [1, 3, 5, 7], [1, 2, 3, 4, 5, 6, 7]] },
		];

		for (const { action, startLine, stages } of liveActions) {
			test(`${action.id}: live changes preserve the search text and existing mixed-case selections`, () => {
				testMulticursor(['foo', 'FOO', 'fooBar', 'FOOBar', 'foo', 'FOO', 'foo'], editor => {
					editor.setSelection(new Selection(startLine, 1, startLine, 4));
					const actual = [];
					for (const selectionMatchCase of [false, true, false]) {
						const before = editor.getSelections();
						editor.updateOptions({ selectionMatchCase });
						const after = editor.getSelections();
						action.run(null!, editor);
						actual.push({
							preservedSelections: Selection.selectionsEqual(before, after),
							selections: editor.getSelections().map(fromRange),
						});
					}
					assert.deepStrictEqual(actual, stages.map(lines => ({
						preservedSelections: true,
						selections: lines.map(line => [line, 1, line, 4]),
					})));
				});
			});
		}

		for (const { action, lines } of [
			{ action: new AddSelectionToNextFindMatchAction(), lines: [4, 5, 6] },
			{ action: new AddSelectionToPreviousFindMatchAction(), lines: [4, 3, 2] },
		]) {
			test(`${action.id}: changing the setting switches a caret-started sequence to substring matching`, () => {
				testMulticursor(['foo', 'FOOBar', 'fooBar', 'foo', 'fooBar', 'FOOBar', 'foo'], editor => {
					editor.setSelection(new Selection(4, 2, 4, 2));
					action.run(null!, editor);
					editor.updateOptions({ selectionMatchCase: true });
					action.run(null!, editor);
					editor.updateOptions({ selectionMatchCase: false });
					action.run(null!, editor);

					assert.deepStrictEqual(editor.getSelections().map(fromRange), lines.map(line => [line, 1, line, 4]));
				});
			});
		}

		test('select all uses the updated setting after adding mixed-case selections', () => {
			testMulticursor(text, editor => {
				editor.setSelection(new Selection(1, 1, 1, 4));
				new AddSelectionToNextFindMatchAction().run(null!, editor);
				editor.updateOptions({ selectionMatchCase: true });
				new SelectHighlightsAction().run(null!, editor);

				assert.deepStrictEqual(editor.getSelections().map(fromRange), [[1, 1, 1, 4], [3, 1, 3, 4], [5, 1, 5, 4]]);
			});
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

		test('changing selection match case while blurred preserves the active mixed-case sequence', () => {
			testMulticursor(text, editor => {
				const action = new AddSelectionToNextFindMatchAction();
				editor.setSelection(new Selection(1, 1, 1, 4));
				action.run(null!, editor);
				let blurEvents = 0;
				disposables.add(editor.onDidBlurEditorText(() => blurEvents++));

				setTextFocus(editor, false);
				editor.updateOptions({ selectionMatchCase: true });
				setTextFocus(editor, true);
				action.run(null!, editor);

				assert.deepStrictEqual({ blurEvents, selections: editor.getSelections().map(fromRange) }, {
					blurEvents: 1,
					selections: [[1, 1, 1, 4], [2, 1, 2, 4], [3, 1, 3, 4]],
				});
			});
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

		for (const selectionMatchCase of [false, true]) {
			test(`multiline CRLF selections match literal substrings with match case ${selectionMatchCase}`, () => {
				testMulticursor(['foo.', 'bar', 'FOO.', 'BAR', 'xfoo.', 'bar'], (editor, findController) => {
					editor.getModel().setEOL(EndOfLineSequence.CRLF);
					findController.getState().change({ searchString: 'unrelated.*', isRevealed: true, matchCase: !selectionMatchCase, wholeWord: true, isRegex: true }, false);
					editor.setSelection(new Selection(1, 1, 2, 4));
					new SelectHighlightsAction().run(null!, editor);

					assert.deepStrictEqual(editor.getSelections().map(fromRange), selectionMatchCase
						? [[1, 1, 2, 4], [5, 2, 6, 4]]
						: [[1, 1, 2, 4], [3, 1, 4, 4], [5, 2, 6, 4]]);
				}, { selectionMatchCase });
			});
		}

		for (const { action, startLine, lines } of [
			{ action: new AddSelectionToNextFindMatchAction(), startLine: 1, lines: [1, 2] },
			{ action: new AddSelectionToPreviousFindMatchAction(), startLine: 5, lines: [5, 3] },
			{ action: new SelectHighlightsAction(), startLine: 1, lines: [2, 3] },
		]) {
			test(`${action.id}: Find-focused commands retain Find matching rules`, () => {
				testMulticursor(['foo', 'BAR', 'bar', 'barista', 'foo'], (editor, findController) => {
					editor.setSelection(new Selection(startLine, 1, startLine, 4));
					findController.getState().change({ searchString: 'bar', isRevealed: true, matchCase: false, wholeWord: true }, false);
					editor.updateOptions({ selectionMatchCase: false });
					editor.updateOptions({ selectionMatchCase: true });
					action.run(null!, editor);

					assert.deepStrictEqual(editor.getSelections().map(fromRange), lines.map(line => [line, 1, line, 4]));
				}, { hasTextFocus: false, selectionMatchCase: true });
			});
		}
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

		for (const selectionMatchCase of [false, true]) {
			for (const hasTextFocus of [false, true]) {
				test(`selection highlighting uses match case ${selectionMatchCase}, editor focused ${hasTextFocus}`, () => {
					testMulticursor(text, (editor, findController) => {
						editor.registerAndInstantiateContribution(SelectionHighlighter.ID, SelectionHighlighter);
						findController.getState().change({ searchString: 'f.*', isRevealed: true, matchCase: !selectionMatchCase, wholeWord: true, isRegex: true }, false);
						editor.setSelection(new Selection(1, 1, 1, 4));

						assert.deepStrictEqual(highlights(editor), (selectionMatchCase ? [3] : [2, 3, 4]).map(line => [line, 1, line, 4]));
					}, { selectionMatchCase, hasTextFocus });
				});
			}

			test(`mixed-case selection highlighting compares selections using match case ${selectionMatchCase}`, () => {
				testMulticursor(text, (editor, findController) => {
					editor.registerAndInstantiateContribution(SelectionHighlighter.ID, SelectionHighlighter);
					findController.getState().change({ matchCase: !selectionMatchCase }, false);
					editor.setSelections([new Selection(1, 1, 1, 4), new Selection(2, 1, 2, 4)]);

					assert.deepStrictEqual(highlights(editor), (selectionMatchCase ? [] : [3, 4]).map(line => [line, 1, line, 4]));
				}, { selectionMatchCase });
			});

			test(`only suppress duplicate Find highlights with the same matching rules, match case ${selectionMatchCase}`, () => {
				testMulticursor(text, (editor, findController) => {
					editor.registerAndInstantiateContribution(SelectionHighlighter.ID, SelectionHighlighter);
					editor.setSelection(new Selection(1, 1, 1, 4));
					findController.getState().change({ searchString: 'foo', isRevealed: true, matchCase: selectionMatchCase, wholeWord: false }, false);
					const sameOptions = highlights(editor);

					findController.getState().change({ matchCase: !selectionMatchCase }, false);
					assert.deepStrictEqual({ sameOptions, differentCase: highlights(editor) }, {
						sameOptions: [],
						differentCase: (selectionMatchCase ? [3] : [2, 3, 4]).map(line => [line, 1, line, 4]),
					});
				}, { selectionMatchCase });
			});
		}

		test('highlights keep the original search text across live changes with mixed-case cursors', () => {
			testMulticursor(['foo', 'FOO', 'fooBar', 'FOOBar', 'fooBaz', 'FOOBaz'], editor => {
				editor.registerAndInstantiateContribution(SelectionHighlighter.ID, SelectionHighlighter);
				editor.setSelection(new Selection(1, 1, 1, 4));
				const action = new AddSelectionToNextFindMatchAction();
				action.run(null!, editor);
				const actual = [highlights(editor)];

				editor.updateOptions({ selectionMatchCase: true });
				action.run(null!, editor);
				actual.push(highlights(editor));
				editor.updateOptions({ selectionMatchCase: false });
				action.run(null!, editor);
				actual.push(highlights(editor));

				assert.deepStrictEqual(actual, [[3, 4, 5, 6], [5], [5, 6]].map(lines => lines.map(line => [line, 1, line, 4])));
			});
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

		test('live setting changes refresh highlights and preserve disabled and empty-selection behavior', async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const model = disposables.add(createTextModel('foo\nFOO\nfooBar\nfoo\nFOOBar'));
				const storageService = disposables.add(new InMemoryStorageService());
				const editor = disposables.add(createTestCodeEditor(model, {
					serviceCollection: new ServiceCollection([IStorageService, storageService]),
				}));
				editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
				editor.registerAndInstantiateContribution(SelectionHighlighter.ID, SelectionHighlighter);
				editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
				editor.setSelection(new Selection(1, 2, 1, 2));
				new AddSelectionToNextFindMatchAction().run(null!, editor);
				const actual = [highlights(editor)];

				for (const options of [
					{ selectionMatchCase: true },
					{ selectionMatchCase: false },
					{ selectionHighlight: false },
					{ selectionMatchCase: true },
					{ selectionHighlight: true },
				]) {
					editor.updateOptions(options);
					await timeout(0);
					actual.push(highlights(editor));
				}

				editor.setSelection(new Selection(1, 2, 1, 2));
				await timeout(300);
				actual.push(highlights(editor));

				assert.deepStrictEqual(actual, [[4], [3, 4], [2, 3, 4, 5], [], [], [3, 4], []].map(lines => lines.map(line => [line, 1, line, 4])));
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

		test('Select Highlights respects mode ', () => {
			testMulticursor(text, (editor, findController) => {
				const action = new SelectHighlightsAction();
				editor.setSelections([
					new Selection(1, 2, 1, 2),
				]);

				action.run(null!, editor);
				assert.deepStrictEqual(editor.getSelections(), [
					new Selection(1, 1, 1, 4),
					new Selection(4, 1, 4, 4),
					new Selection(6, 2, 6, 5),
				]);

				action.run(null!, editor);
				assert.deepStrictEqual(editor.getSelections(), [
					new Selection(1, 1, 1, 4),
					new Selection(4, 1, 4, 4),
					new Selection(6, 2, 6, 5),
				]);
			});
		});

	});
});
