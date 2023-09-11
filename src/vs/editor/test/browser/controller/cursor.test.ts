/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CoreEditingCommands, CoreNavigationCommands } from 'vs/editor/browser/coreCommands';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from 'vs/editor/common/editorCommon';
import { EndOfLinePreference, EndOfLineSequence, ITextModel } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { EncodedTokenizationResult, IState, ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/languages';
import { StandardTokenType, MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';
import { IndentAction, IndentationRule } from 'vs/editor/common/languages/languageConfiguration';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { NullState } from 'vs/editor/common/languages/nullTokenize';
import { withTestCodeEditor, TestCodeEditorInstantiationOptions, ITestCodeEditor, createCodeEditorServices, instantiateTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { IRelaxedTextModelCreationOptions, createTextModel, instantiateTextModel } from 'vs/editor/test/common/testTextModel';
import { javascriptOnEnterRules } from 'vs/editor/test/common/modes/supports/javascriptOnEnterRules';
import { ViewModel } from 'vs/editor/common/viewModel/viewModelImpl';
import { OutgoingViewModelEventKind } from 'vs/editor/common/viewModelEventDispatcher';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICursorPositionChangedEvent } from 'vs/editor/common/cursorEvents';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { URI } from 'vs/base/common/uri';

// --------- utils

function moveTo(editor: ITestCodeEditor, viewModel: ViewModel, lineNumber: number, column: number, inSelectionMode: boolean = false) {
	if (inSelectionMode) {
		CoreNavigationCommands.MoveToSelect.runCoreEditorCommand(viewModel, {
			position: new Position(lineNumber, column)
		});
	} else {
		CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, {
			position: new Position(lineNumber, column)
		});
	}
}

function moveLeft(editor: ITestCodeEditor, viewModel: ViewModel, inSelectionMode: boolean = false) {
	if (inSelectionMode) {
		CoreNavigationCommands.CursorLeftSelect.runCoreEditorCommand(viewModel, {});
	} else {
		CoreNavigationCommands.CursorLeft.runCoreEditorCommand(viewModel, {});
	}
}

function moveRight(editor: ITestCodeEditor, viewModel: ViewModel, inSelectionMode: boolean = false) {
	if (inSelectionMode) {
		CoreNavigationCommands.CursorRightSelect.runCoreEditorCommand(viewModel, {});
	} else {
		CoreNavigationCommands.CursorRight.runCoreEditorCommand(viewModel, {});
	}
}

function moveDown(editor: ITestCodeEditor, viewModel: ViewModel, inSelectionMode: boolean = false) {
	if (inSelectionMode) {
		CoreNavigationCommands.CursorDownSelect.runCoreEditorCommand(viewModel, {});
	} else {
		CoreNavigationCommands.CursorDown.runCoreEditorCommand(viewModel, {});
	}
}

function moveUp(editor: ITestCodeEditor, viewModel: ViewModel, inSelectionMode: boolean = false) {
	if (inSelectionMode) {
		CoreNavigationCommands.CursorUpSelect.runCoreEditorCommand(viewModel, {});
	} else {
		CoreNavigationCommands.CursorUp.runCoreEditorCommand(viewModel, {});
	}
}

function moveToBeginningOfLine(editor: ITestCodeEditor, viewModel: ViewModel, inSelectionMode: boolean = false) {
	if (inSelectionMode) {
		CoreNavigationCommands.CursorHomeSelect.runCoreEditorCommand(viewModel, {});
	} else {
		CoreNavigationCommands.CursorHome.runCoreEditorCommand(viewModel, {});
	}
}

function moveToEndOfLine(editor: ITestCodeEditor, viewModel: ViewModel, inSelectionMode: boolean = false) {
	if (inSelectionMode) {
		CoreNavigationCommands.CursorEndSelect.runCoreEditorCommand(viewModel, {});
	} else {
		CoreNavigationCommands.CursorEnd.runCoreEditorCommand(viewModel, {});
	}
}

function moveToBeginningOfBuffer(editor: ITestCodeEditor, viewModel: ViewModel, inSelectionMode: boolean = false) {
	if (inSelectionMode) {
		CoreNavigationCommands.CursorTopSelect.runCoreEditorCommand(viewModel, {});
	} else {
		CoreNavigationCommands.CursorTop.runCoreEditorCommand(viewModel, {});
	}
}

function moveToEndOfBuffer(editor: ITestCodeEditor, viewModel: ViewModel, inSelectionMode: boolean = false) {
	if (inSelectionMode) {
		CoreNavigationCommands.CursorBottomSelect.runCoreEditorCommand(viewModel, {});
	} else {
		CoreNavigationCommands.CursorBottom.runCoreEditorCommand(viewModel, {});
	}
}

function assertCursor(viewModel: ViewModel, what: Position | Selection | Selection[]): void {
	let selections: Selection[];
	if (what instanceof Position) {
		selections = [new Selection(what.lineNumber, what.column, what.lineNumber, what.column)];
	} else if (what instanceof Selection) {
		selections = [what];
	} else {
		selections = what;
	}
	const actual = viewModel.getSelections().map(s => s.toString());
	const expected = selections.map(s => s.toString());

	assert.deepStrictEqual(actual, expected);
}

suite('Editor Controller - Cursor', () => {
	const LINE1 = '    \tMy First Line\t ';
	const LINE2 = '\tMy Second Line';
	const LINE3 = '    Third Line🐶';
	const LINE4 = '';
	const LINE5 = '1';

	const TEXT =
		LINE1 + '\r\n' +
		LINE2 + '\n' +
		LINE3 + '\n' +
		LINE4 + '\r\n' +
		LINE5;

	function runTest(callback: (editor: ITestCodeEditor, viewModel: ViewModel) => void): void {
		withTestCodeEditor(TEXT, {}, (editor, viewModel) => {
			callback(editor, viewModel);
		});
	}

	test('cursor initialized', () => {
		runTest((editor, viewModel) => {
			assertCursor(viewModel, new Position(1, 1));
		});
	});

	// --------- absolute move

	test('no move', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 1);
			assertCursor(viewModel, new Position(1, 1));
		});
	});

	test('move', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 2);
			assertCursor(viewModel, new Position(1, 2));
		});
	});

	test('move in selection mode', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 2, true);
			assertCursor(viewModel, new Selection(1, 1, 1, 2));
		});
	});

	test('move beyond line end', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 25);
			assertCursor(viewModel, new Position(1, LINE1.length + 1));
		});
	});

	test('move empty line', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 4, 20);
			assertCursor(viewModel, new Position(4, 1));
		});
	});

	test('move one char line', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 5, 20);
			assertCursor(viewModel, new Position(5, 2));
		});
	});

	test('selection down', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 2, 1, true);
			assertCursor(viewModel, new Selection(1, 1, 2, 1));
		});
	});

	test('move and then select', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 2, 3);
			assertCursor(viewModel, new Position(2, 3));

			moveTo(editor, viewModel, 2, 15, true);
			assertCursor(viewModel, new Selection(2, 3, 2, 15));

			moveTo(editor, viewModel, 1, 2, true);
			assertCursor(viewModel, new Selection(2, 3, 1, 2));
		});
	});

	// --------- move left

	test('move left on top left position', () => {
		runTest((editor, viewModel) => {
			moveLeft(editor, viewModel);
			assertCursor(viewModel, new Position(1, 1));
		});
	});

	test('move left', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 3);
			assertCursor(viewModel, new Position(1, 3));
			moveLeft(editor, viewModel);
			assertCursor(viewModel, new Position(1, 2));
		});
	});

	test('move left with surrogate pair', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 17);
			assertCursor(viewModel, new Position(3, 17));
			moveLeft(editor, viewModel);
			assertCursor(viewModel, new Position(3, 15));
		});
	});

	test('move left goes to previous row', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 2, 1);
			assertCursor(viewModel, new Position(2, 1));
			moveLeft(editor, viewModel);
			assertCursor(viewModel, new Position(1, 21));
		});
	});

	test('move left selection', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 2, 1);
			assertCursor(viewModel, new Position(2, 1));
			moveLeft(editor, viewModel, true);
			assertCursor(viewModel, new Selection(2, 1, 1, 21));
		});
	});

	// --------- move right

	test('move right on bottom right position', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 5, 2);
			assertCursor(viewModel, new Position(5, 2));
			moveRight(editor, viewModel);
			assertCursor(viewModel, new Position(5, 2));
		});
	});

	test('move right', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 3);
			assertCursor(viewModel, new Position(1, 3));
			moveRight(editor, viewModel);
			assertCursor(viewModel, new Position(1, 4));
		});
	});

	test('move right with surrogate pair', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 15);
			assertCursor(viewModel, new Position(3, 15));
			moveRight(editor, viewModel);
			assertCursor(viewModel, new Position(3, 17));
		});
	});

	test('move right goes to next row', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 21);
			assertCursor(viewModel, new Position(1, 21));
			moveRight(editor, viewModel);
			assertCursor(viewModel, new Position(2, 1));
		});
	});

	test('move right selection', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 21);
			assertCursor(viewModel, new Position(1, 21));
			moveRight(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 21, 2, 1));
		});
	});

	// --------- move down

	test('move down', () => {
		runTest((editor, viewModel) => {
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(2, 1));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(3, 1));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(4, 1));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(5, 1));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(5, 2));
		});
	});

	test('move down with selection', () => {
		runTest((editor, viewModel) => {
			moveDown(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 1, 2, 1));
			moveDown(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 1, 3, 1));
			moveDown(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 1, 4, 1));
			moveDown(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 1, 5, 1));
			moveDown(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 1, 5, 2));
		});
	});

	test('move down with tabs', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 5);
			assertCursor(viewModel, new Position(1, 5));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(2, 2));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(3, 5));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(4, 1));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(5, 2));
		});
	});

	// --------- move up

	test('move up', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 5);
			assertCursor(viewModel, new Position(3, 5));

			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(2, 2));

			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(1, 5));
		});
	});

	test('move up with selection', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 5);
			assertCursor(viewModel, new Position(3, 5));

			moveUp(editor, viewModel, true);
			assertCursor(viewModel, new Selection(3, 5, 2, 2));

			moveUp(editor, viewModel, true);
			assertCursor(viewModel, new Selection(3, 5, 1, 5));
		});
	});

	test('move up and down with tabs', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 5);
			assertCursor(viewModel, new Position(1, 5));
			moveDown(editor, viewModel);
			moveDown(editor, viewModel);
			moveDown(editor, viewModel);
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(5, 2));
			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(4, 1));
			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(3, 5));
			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(2, 2));
			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(1, 5));
		});
	});

	test('move up and down with end of lines starting from a long one', () => {
		runTest((editor, viewModel) => {
			moveToEndOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, LINE1.length + 1));
			moveToEndOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, LINE1.length + 1));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(2, LINE2.length + 1));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(3, LINE3.length + 1));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(4, LINE4.length + 1));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(5, LINE5.length + 1));
			moveUp(editor, viewModel);
			moveUp(editor, viewModel);
			moveUp(editor, viewModel);
			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(1, LINE1.length + 1));
		});
	});

	test('issue #44465: cursor position not correct when move', () => {
		runTest((editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 5, 1, 5)]);
			// going once up on the first line remembers the offset visual columns
			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(1, 1));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(2, 2));
			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(1, 5));

			// going twice up on the first line discards the offset visual columns
			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(1, 1));
			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(1, 1));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(2, 1));
		});
	});

	test('issue #144041: Cursor up/down works', () => {
		const model = createTextModel(
			[
				'Word1 Word2 Word3 Word4',
				'Word5 Word6 Word7 Word8',
			].join('\n')
		);

		withTestCodeEditor(model, { wrappingIndent: 'indent', wordWrap: 'wordWrapColumn', wordWrapColumn: 20 }, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 1, 1, 1)]);

			const cursorPositions: any[] = [];
			function reportCursorPosition() {
				cursorPositions.push(viewModel.getCursorStates()[0].viewState.position.toString());
			}

			reportCursorPosition();
			CoreNavigationCommands.CursorDown.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorDown.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorDown.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorDown.runEditorCommand(null, editor, null);

			reportCursorPosition();
			CoreNavigationCommands.CursorUp.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorUp.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorUp.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorUp.runEditorCommand(null, editor, null);
			reportCursorPosition();

			assert.deepStrictEqual(cursorPositions, [
				'(1,1)',
				'(2,5)',
				'(3,1)',
				'(4,5)',
				'(4,10)',
				'(3,1)',
				'(2,5)',
				'(1,1)',
				'(1,1)',
			]);
		});

		model.dispose();
	});

	test('issue #140195: Cursor up/down makes progress', () => {
		const model = createTextModel(
			[
				'Word1 Word2 Word3 Word4',
				'Word5 Word6 Word7 Word8',
			].join('\n')
		);

		withTestCodeEditor(model, { wrappingIndent: 'indent', wordWrap: 'wordWrapColumn', wordWrapColumn: 20 }, (editor, viewModel) => {
			editor.changeDecorations((changeAccessor) => {
				changeAccessor.deltaDecorations([], [
					{
						range: new Range(1, 22, 1, 22),
						options: {
							showIfCollapsed: true,
							description: 'test',
							after: {
								content: 'some very very very very very very very very long text',
							}
						}
					}
				]);
			});
			viewModel.setSelections('test', [new Selection(1, 1, 1, 1)]);

			const cursorPositions: any[] = [];
			function reportCursorPosition() {
				cursorPositions.push(viewModel.getCursorStates()[0].viewState.position.toString());
			}

			reportCursorPosition();
			CoreNavigationCommands.CursorDown.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorDown.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorDown.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorDown.runEditorCommand(null, editor, null);

			reportCursorPosition();
			CoreNavigationCommands.CursorUp.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorUp.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorUp.runEditorCommand(null, editor, null);
			reportCursorPosition();
			CoreNavigationCommands.CursorUp.runEditorCommand(null, editor, null);
			reportCursorPosition();

			assert.deepStrictEqual(cursorPositions, [
				'(1,1)',
				'(2,5)',
				'(5,19)',
				'(6,1)',
				'(7,5)',
				'(6,1)',
				'(2,8)',
				'(1,1)',
				'(1,1)',
			]);
		});

		model.dispose();
	});

	// --------- move to beginning of line

	test('move to beginning of line', () => {
		runTest((editor, viewModel) => {
			moveToBeginningOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, 6));
			moveToBeginningOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, 1));
		});
	});

	test('move to beginning of line from within line', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 8);
			moveToBeginningOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, 6));
			moveToBeginningOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, 1));
		});
	});

	test('move to beginning of line from whitespace at beginning of line', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 2);
			moveToBeginningOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, 6));
			moveToBeginningOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, 1));
		});
	});

	test('move to beginning of line from within line selection', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 8);
			moveToBeginningOfLine(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 8, 1, 6));
			moveToBeginningOfLine(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 8, 1, 1));
		});
	});

	test('move to beginning of line with selection multiline forward', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 8);
			moveTo(editor, viewModel, 3, 9, true);
			moveToBeginningOfLine(editor, viewModel, false);
			assertCursor(viewModel, new Selection(3, 5, 3, 5));
		});
	});

	test('move to beginning of line with selection multiline backward', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 9);
			moveTo(editor, viewModel, 1, 8, true);
			moveToBeginningOfLine(editor, viewModel, false);
			assertCursor(viewModel, new Selection(1, 6, 1, 6));
		});
	});

	test('move to beginning of line with selection single line forward', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 2);
			moveTo(editor, viewModel, 3, 9, true);
			moveToBeginningOfLine(editor, viewModel, false);
			assertCursor(viewModel, new Selection(3, 5, 3, 5));
		});
	});

	test('move to beginning of line with selection single line backward', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 9);
			moveTo(editor, viewModel, 3, 2, true);
			moveToBeginningOfLine(editor, viewModel, false);
			assertCursor(viewModel, new Selection(3, 5, 3, 5));
		});
	});

	test('issue #15401: "End" key is behaving weird when text is selected part 1', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 8);
			moveTo(editor, viewModel, 3, 9, true);
			moveToBeginningOfLine(editor, viewModel, false);
			assertCursor(viewModel, new Selection(3, 5, 3, 5));
		});
	});

	test('issue #17011: Shift+home/end now go to the end of the selection start\'s line, not the selection\'s end', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 8);
			moveTo(editor, viewModel, 3, 9, true);
			moveToBeginningOfLine(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 8, 3, 5));
		});
	});

	// --------- move to end of line

	test('move to end of line', () => {
		runTest((editor, viewModel) => {
			moveToEndOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, LINE1.length + 1));
			moveToEndOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, LINE1.length + 1));
		});
	});

	test('move to end of line from within line', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 6);
			moveToEndOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, LINE1.length + 1));
			moveToEndOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, LINE1.length + 1));
		});
	});

	test('move to end of line from whitespace at end of line', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 20);
			moveToEndOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, LINE1.length + 1));
			moveToEndOfLine(editor, viewModel);
			assertCursor(viewModel, new Position(1, LINE1.length + 1));
		});
	});

	test('move to end of line from within line selection', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 6);
			moveToEndOfLine(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 6, 1, LINE1.length + 1));
			moveToEndOfLine(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 6, 1, LINE1.length + 1));
		});
	});

	test('move to end of line with selection multiline forward', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 1);
			moveTo(editor, viewModel, 3, 9, true);
			moveToEndOfLine(editor, viewModel, false);
			assertCursor(viewModel, new Selection(3, 17, 3, 17));
		});
	});

	test('move to end of line with selection multiline backward', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 9);
			moveTo(editor, viewModel, 1, 1, true);
			moveToEndOfLine(editor, viewModel, false);
			assertCursor(viewModel, new Selection(1, 21, 1, 21));
		});
	});

	test('move to end of line with selection single line forward', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 1);
			moveTo(editor, viewModel, 3, 9, true);
			moveToEndOfLine(editor, viewModel, false);
			assertCursor(viewModel, new Selection(3, 17, 3, 17));
		});
	});

	test('move to end of line with selection single line backward', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 9);
			moveTo(editor, viewModel, 3, 1, true);
			moveToEndOfLine(editor, viewModel, false);
			assertCursor(viewModel, new Selection(3, 17, 3, 17));
		});
	});

	test('issue #15401: "End" key is behaving weird when text is selected part 2', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 1);
			moveTo(editor, viewModel, 3, 9, true);
			moveToEndOfLine(editor, viewModel, false);
			assertCursor(viewModel, new Selection(3, 17, 3, 17));
		});
	});

	// --------- move to beginning of buffer

	test('move to beginning of buffer', () => {
		runTest((editor, viewModel) => {
			moveToBeginningOfBuffer(editor, viewModel);
			assertCursor(viewModel, new Position(1, 1));
		});
	});

	test('move to beginning of buffer from within first line', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 3);
			moveToBeginningOfBuffer(editor, viewModel);
			assertCursor(viewModel, new Position(1, 1));
		});
	});

	test('move to beginning of buffer from within another line', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 3);
			moveToBeginningOfBuffer(editor, viewModel);
			assertCursor(viewModel, new Position(1, 1));
		});
	});

	test('move to beginning of buffer from within first line selection', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 1, 3);
			moveToBeginningOfBuffer(editor, viewModel, true);
			assertCursor(viewModel, new Selection(1, 3, 1, 1));
		});
	});

	test('move to beginning of buffer from within another line selection', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 3);
			moveToBeginningOfBuffer(editor, viewModel, true);
			assertCursor(viewModel, new Selection(3, 3, 1, 1));
		});
	});

	// --------- move to end of buffer

	test('move to end of buffer', () => {
		runTest((editor, viewModel) => {
			moveToEndOfBuffer(editor, viewModel);
			assertCursor(viewModel, new Position(5, LINE5.length + 1));
		});
	});

	test('move to end of buffer from within last line', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 5, 1);
			moveToEndOfBuffer(editor, viewModel);
			assertCursor(viewModel, new Position(5, LINE5.length + 1));
		});
	});

	test('move to end of buffer from within another line', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 3);
			moveToEndOfBuffer(editor, viewModel);
			assertCursor(viewModel, new Position(5, LINE5.length + 1));
		});
	});

	test('move to end of buffer from within last line selection', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 5, 1);
			moveToEndOfBuffer(editor, viewModel, true);
			assertCursor(viewModel, new Selection(5, 1, 5, LINE5.length + 1));
		});
	});

	test('move to end of buffer from within another line selection', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 3, 3);
			moveToEndOfBuffer(editor, viewModel, true);
			assertCursor(viewModel, new Selection(3, 3, 5, LINE5.length + 1));
		});
	});

	// --------- misc

	test('select all', () => {
		runTest((editor, viewModel) => {
			CoreNavigationCommands.SelectAll.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, new Selection(1, 1, 5, LINE5.length + 1));
		});
	});

	// --------- eventing

	test('no move doesn\'t trigger event', () => {
		runTest((editor, viewModel) => {
			viewModel.onEvent((e) => {
				assert.ok(false, 'was not expecting event');
			});
			moveTo(editor, viewModel, 1, 1);
		});
	});

	test('move eventing', () => {
		runTest((editor, viewModel) => {
			let events = 0;
			viewModel.onEvent((e) => {
				if (e.kind === OutgoingViewModelEventKind.CursorStateChanged) {
					events++;
					assert.deepStrictEqual(e.selections, [new Selection(1, 2, 1, 2)]);
				}
			});
			moveTo(editor, viewModel, 1, 2);
			assert.strictEqual(events, 1, 'receives 1 event');
		});
	});

	test('move in selection mode eventing', () => {
		runTest((editor, viewModel) => {
			let events = 0;
			viewModel.onEvent((e) => {
				if (e.kind === OutgoingViewModelEventKind.CursorStateChanged) {
					events++;
					assert.deepStrictEqual(e.selections, [new Selection(1, 1, 1, 2)]);
				}
			});
			moveTo(editor, viewModel, 1, 2, true);
			assert.strictEqual(events, 1, 'receives 1 event');
		});
	});

	// --------- state save & restore

	test('saveState & restoreState', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 2, 1, true);
			assertCursor(viewModel, new Selection(1, 1, 2, 1));

			const savedState = JSON.stringify(viewModel.saveCursorState());

			moveTo(editor, viewModel, 1, 1, false);
			assertCursor(viewModel, new Position(1, 1));

			viewModel.restoreCursorState(JSON.parse(savedState));
			assertCursor(viewModel, new Selection(1, 1, 2, 1));
		});
	});

	// --------- updating cursor

	test('Independent model edit 1', () => {
		runTest((editor, viewModel) => {
			moveTo(editor, viewModel, 2, 16, true);

			editor.getModel().applyEdits([EditOperation.delete(new Range(2, 1, 2, 2))]);
			assertCursor(viewModel, new Selection(1, 1, 2, 15));
		});
	});

	test('column select 1', () => {
		withTestCodeEditor([
			'\tprivate compute(a:number): boolean {',
			'\t\tif (a + 3 === 0 || a + 5 === 0) {',
			'\t\t\treturn false;',
			'\t\t}',
			'\t}'
		], {}, (editor, viewModel) => {

			moveTo(editor, viewModel, 1, 7, false);
			assertCursor(viewModel, new Position(1, 7));

			CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
				position: new Position(4, 4),
				viewPosition: new Position(4, 4),
				mouseColumn: 15,
				doColumnSelect: true
			});

			const expectedSelections = [
				new Selection(1, 7, 1, 12),
				new Selection(2, 4, 2, 9),
				new Selection(3, 3, 3, 6),
				new Selection(4, 4, 4, 4),
			];

			assertCursor(viewModel, expectedSelections);

		});
	});

	test('grapheme breaking', () => {
		withTestCodeEditor([
			'abcabc',
			'ãããããã',
			'辻󠄀辻󠄀辻󠄀',
			'பு',
		], {}, (editor, viewModel) => {

			viewModel.setSelections('test', [new Selection(2, 1, 2, 1)]);
			moveRight(editor, viewModel);
			assertCursor(viewModel, new Position(2, 3));
			moveLeft(editor, viewModel);
			assertCursor(viewModel, new Position(2, 1));

			viewModel.setSelections('test', [new Selection(3, 1, 3, 1)]);
			moveRight(editor, viewModel);
			assertCursor(viewModel, new Position(3, 4));
			moveLeft(editor, viewModel);
			assertCursor(viewModel, new Position(3, 1));

			viewModel.setSelections('test', [new Selection(4, 1, 4, 1)]);
			moveRight(editor, viewModel);
			assertCursor(viewModel, new Position(4, 3));
			moveLeft(editor, viewModel);
			assertCursor(viewModel, new Position(4, 1));

			viewModel.setSelections('test', [new Selection(1, 3, 1, 3)]);
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(2, 5));
			moveDown(editor, viewModel);
			assertCursor(viewModel, new Position(3, 4));
			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(2, 5));
			moveUp(editor, viewModel);
			assertCursor(viewModel, new Position(1, 3));

		});
	});

	test('issue #4905 - column select is biased to the right', () => {
		withTestCodeEditor([
			'var gulp = require("gulp");',
			'var path = require("path");',
			'var rimraf = require("rimraf");',
			'var isarray = require("isarray");',
			'var merge = require("merge-stream");',
			'var concat = require("gulp-concat");',
			'var newer = require("gulp-newer");',
		].join('\n'), {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 1, 4, false);
			assertCursor(viewModel, new Position(1, 4));

			CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
				position: new Position(4, 1),
				viewPosition: new Position(4, 1),
				mouseColumn: 1,
				doColumnSelect: true
			});

			assertCursor(viewModel, [
				new Selection(1, 4, 1, 1),
				new Selection(2, 4, 2, 1),
				new Selection(3, 4, 3, 1),
				new Selection(4, 4, 4, 1),
			]);
		});
	});

	test('issue #20087: column select with mouse', () => {
		withTestCodeEditor([
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" Key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SoMEKEy" value="000"/>',
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SomeKey" valuE="000"/>',
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SomeKey" value="00X"/>',
		].join('\n'), {}, (editor, viewModel) => {

			moveTo(editor, viewModel, 10, 10, false);
			assertCursor(viewModel, new Position(10, 10));

			CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
				position: new Position(1, 1),
				viewPosition: new Position(1, 1),
				mouseColumn: 1,
				doColumnSelect: true
			});
			assertCursor(viewModel, [
				new Selection(10, 10, 10, 1),
				new Selection(9, 10, 9, 1),
				new Selection(8, 10, 8, 1),
				new Selection(7, 10, 7, 1),
				new Selection(6, 10, 6, 1),
				new Selection(5, 10, 5, 1),
				new Selection(4, 10, 4, 1),
				new Selection(3, 10, 3, 1),
				new Selection(2, 10, 2, 1),
				new Selection(1, 10, 1, 1),
			]);

			CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
				position: new Position(1, 1),
				viewPosition: new Position(1, 1),
				mouseColumn: 1,
				doColumnSelect: true
			});
			assertCursor(viewModel, [
				new Selection(10, 10, 10, 1),
				new Selection(9, 10, 9, 1),
				new Selection(8, 10, 8, 1),
				new Selection(7, 10, 7, 1),
				new Selection(6, 10, 6, 1),
				new Selection(5, 10, 5, 1),
				new Selection(4, 10, 4, 1),
				new Selection(3, 10, 3, 1),
				new Selection(2, 10, 2, 1),
				new Selection(1, 10, 1, 1),
			]);

		});
	});

	test('issue #20087: column select with keyboard', () => {
		withTestCodeEditor([
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" Key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SoMEKEy" value="000"/>',
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SomeKey" valuE="000"/>',
			'<property id="SomeThing" key="SomeKey" value="000"/>',
			'<property id="SomeThing" key="SomeKey" value="00X"/>',
		].join('\n'), {}, (editor, viewModel) => {

			moveTo(editor, viewModel, 10, 10, false);
			assertCursor(viewModel, new Position(10, 10));

			CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(10, 10, 10, 9)
			]);

			CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(10, 10, 10, 8)
			]);

			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(10, 10, 10, 9)
			]);

			CoreNavigationCommands.CursorColumnSelectUp.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(10, 10, 10, 9),
				new Selection(9, 10, 9, 9),
			]);

			CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(10, 10, 10, 9)
			]);
		});
	});

	test('issue #118062: Column selection cannot select first position of a line', () => {
		withTestCodeEditor([
			'hello world',
		].join('\n'), {}, (editor, viewModel) => {

			moveTo(editor, viewModel, 1, 2, false);
			assertCursor(viewModel, new Position(1, 2));

			CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 2, 1, 1)
			]);
		});
	});

	test('column select with keyboard', () => {
		withTestCodeEditor([
			'var gulp = require("gulp");',
			'var path = require("path");',
			'var rimraf = require("rimraf");',
			'var isarray = require("isarray");',
			'var merge = require("merge-stream");',
			'var concat = require("gulp-concat");',
			'var newer = require("gulp-newer");',
		].join('\n'), {}, (editor, viewModel) => {

			moveTo(editor, viewModel, 1, 4, false);
			assertCursor(viewModel, new Position(1, 4));

			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 5)
			]);

			CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 5),
				new Selection(2, 4, 2, 5)
			]);

			CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 5),
				new Selection(2, 4, 2, 5),
				new Selection(3, 4, 3, 5),
			]);

			CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 5),
				new Selection(2, 4, 2, 5),
				new Selection(3, 4, 3, 5),
				new Selection(4, 4, 4, 5),
				new Selection(5, 4, 5, 5),
				new Selection(6, 4, 6, 5),
				new Selection(7, 4, 7, 5),
			]);

			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 6),
				new Selection(2, 4, 2, 6),
				new Selection(3, 4, 3, 6),
				new Selection(4, 4, 4, 6),
				new Selection(5, 4, 5, 6),
				new Selection(6, 4, 6, 6),
				new Selection(7, 4, 7, 6),
			]);

			// 10 times
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 16),
				new Selection(2, 4, 2, 16),
				new Selection(3, 4, 3, 16),
				new Selection(4, 4, 4, 16),
				new Selection(5, 4, 5, 16),
				new Selection(6, 4, 6, 16),
				new Selection(7, 4, 7, 16),
			]);

			// 10 times
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 26),
				new Selection(2, 4, 2, 26),
				new Selection(3, 4, 3, 26),
				new Selection(4, 4, 4, 26),
				new Selection(5, 4, 5, 26),
				new Selection(6, 4, 6, 26),
				new Selection(7, 4, 7, 26),
			]);

			// 2 times => reaching the ending of lines 1 and 2
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 28),
				new Selection(2, 4, 2, 28),
				new Selection(3, 4, 3, 28),
				new Selection(4, 4, 4, 28),
				new Selection(5, 4, 5, 28),
				new Selection(6, 4, 6, 28),
				new Selection(7, 4, 7, 28),
			]);

			// 4 times => reaching the ending of line 3
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 28),
				new Selection(2, 4, 2, 28),
				new Selection(3, 4, 3, 32),
				new Selection(4, 4, 4, 32),
				new Selection(5, 4, 5, 32),
				new Selection(6, 4, 6, 32),
				new Selection(7, 4, 7, 32),
			]);

			// 2 times => reaching the ending of line 4
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 28),
				new Selection(2, 4, 2, 28),
				new Selection(3, 4, 3, 32),
				new Selection(4, 4, 4, 34),
				new Selection(5, 4, 5, 34),
				new Selection(6, 4, 6, 34),
				new Selection(7, 4, 7, 34),
			]);

			// 1 time => reaching the ending of line 7
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 28),
				new Selection(2, 4, 2, 28),
				new Selection(3, 4, 3, 32),
				new Selection(4, 4, 4, 34),
				new Selection(5, 4, 5, 35),
				new Selection(6, 4, 6, 35),
				new Selection(7, 4, 7, 35),
			]);

			// 3 times => reaching the ending of lines 5 & 6
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 28),
				new Selection(2, 4, 2, 28),
				new Selection(3, 4, 3, 32),
				new Selection(4, 4, 4, 34),
				new Selection(5, 4, 5, 37),
				new Selection(6, 4, 6, 37),
				new Selection(7, 4, 7, 35),
			]);

			// cannot go anywhere anymore
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 28),
				new Selection(2, 4, 2, 28),
				new Selection(3, 4, 3, 32),
				new Selection(4, 4, 4, 34),
				new Selection(5, 4, 5, 37),
				new Selection(6, 4, 6, 37),
				new Selection(7, 4, 7, 35),
			]);

			// cannot go anywhere anymore even if we insist
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 28),
				new Selection(2, 4, 2, 28),
				new Selection(3, 4, 3, 32),
				new Selection(4, 4, 4, 34),
				new Selection(5, 4, 5, 37),
				new Selection(6, 4, 6, 37),
				new Selection(7, 4, 7, 35),
			]);

			// can easily go back
			CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 28),
				new Selection(2, 4, 2, 28),
				new Selection(3, 4, 3, 32),
				new Selection(4, 4, 4, 34),
				new Selection(5, 4, 5, 36),
				new Selection(6, 4, 6, 36),
				new Selection(7, 4, 7, 35),
			]);
		});
	});

	test('setSelection / setPosition with source', () => {

		const tokenizationSupport: ITokenizationSupport = {
			getInitialState: () => NullState,
			tokenize: undefined!,
			tokenizeEncoded: (line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult => {
				return new EncodedTokenizationResult(new Uint32Array(0), state);
			}
		};

		const LANGUAGE_ID = 'modelModeTest1';
		const languageRegistration = TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
		const model = createTextModel('Just text', LANGUAGE_ID);

		withTestCodeEditor(model, {}, (editor1, cursor1) => {
			let event: ICursorPositionChangedEvent | undefined = undefined;
			editor1.onDidChangeCursorPosition(e => {
				event = e;
			});

			editor1.setSelection(new Range(1, 2, 1, 3), 'navigation');
			assert.strictEqual(event!.source, 'navigation');

			event = undefined;
			editor1.setPosition(new Position(1, 2), 'navigation');
			assert.strictEqual(event!.source, 'navigation');
		});

		languageRegistration.dispose();
		model.dispose();
	});
});

suite('Editor Controller', () => {

	const surroundingLanguageId = 'surroundingLanguage';
	const indentRulesLanguageId = 'indentRulesLanguage';
	const electricCharLanguageId = 'electricCharLanguage';
	const autoClosingLanguageId = 'autoClosingLanguage';

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let languageConfigurationService: ILanguageConfigurationService;
	let languageService: ILanguageService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = createCodeEditorServices(disposables);
		languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
		languageService = instantiationService.get(ILanguageService);

		disposables.add(languageService.registerLanguage({ id: surroundingLanguageId }));
		disposables.add(languageConfigurationService.register(surroundingLanguageId, {
			autoClosingPairs: [{ open: '(', close: ')' }]
		}));

		setupIndentRulesLanguage(indentRulesLanguageId, {
			decreaseIndentPattern: /^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
			increaseIndentPattern: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
			indentNextLinePattern: /^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$)/,
			unIndentedLinePattern: /^(?!.*([;{}]|\S:)\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!.*(\{[^}"']*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$))/
		});

		disposables.add(languageService.registerLanguage({ id: electricCharLanguageId }));
		disposables.add(languageConfigurationService.register(electricCharLanguageId, {
			__electricCharacterSupport: {
				docComment: { open: '/**', close: ' */' }
			},
			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			]
		}));

		setupAutoClosingLanguage();
	});

	teardown(() => {
		disposables.dispose();
	});

	function setupOnEnterLanguage(indentAction: IndentAction): string {
		const onEnterLanguageId = 'onEnterMode';

		disposables.add(languageService.registerLanguage({ id: onEnterLanguageId }));
		disposables.add(languageConfigurationService.register(onEnterLanguageId, {
			onEnterRules: [{
				beforeText: /.*/,
				action: {
					indentAction: indentAction
				}
			}]
		}));
		return onEnterLanguageId;
	}

	function setupIndentRulesLanguage(languageId: string, indentationRules: IndentationRule): string {
		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			indentationRules: indentationRules
		}));
		return languageId;
	}

	function setupAutoClosingLanguage() {
		disposables.add(languageService.registerLanguage({ id: autoClosingLanguageId }));
		disposables.add(languageConfigurationService.register(autoClosingLanguageId, {
			comments: {
				blockComment: ['/*', '*/']
			},
			autoClosingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: '\"', close: '\"', notIn: ['string'] },
				{ open: '`', close: '`', notIn: ['string', 'comment'] },
				{ open: '/**', close: ' */', notIn: ['string'] },
				{ open: 'begin', close: 'end', notIn: ['string'] }
			],
			__electricCharacterSupport: {
				docComment: { open: '/**', close: ' */' }
			}
		}));
	}

	function setupAutoClosingLanguageTokenization() {
		class BaseState implements IState {
			constructor(
				public readonly parent: State | null = null
			) { }
			clone(): IState { return this; }
			equals(other: IState): boolean {
				if (!(other instanceof BaseState)) {
					return false;
				}
				if (!this.parent && !other.parent) {
					return true;
				}
				if (!this.parent || !other.parent) {
					return false;
				}
				return this.parent.equals(other.parent);
			}
		}
		class StringState implements IState {
			constructor(
				public readonly char: string,
				public readonly parentState: State
			) { }
			clone(): IState { return this; }
			equals(other: IState): boolean { return other instanceof StringState && this.char === other.char && this.parentState.equals(other.parentState); }
		}
		class BlockCommentState implements IState {
			constructor(
				public readonly parentState: State
			) { }
			clone(): IState { return this; }
			equals(other: IState): boolean { return other instanceof StringState && this.parentState.equals(other.parentState); }
		}
		type State = BaseState | StringState | BlockCommentState;

		const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(autoClosingLanguageId);
		disposables.add(TokenizationRegistry.register(autoClosingLanguageId, {
			getInitialState: () => new BaseState(),
			tokenize: undefined!,
			tokenizeEncoded: function (line: string, hasEOL: boolean, _state: IState): EncodedTokenizationResult {
				let state = <State>_state;
				const tokens: { length: number; type: StandardTokenType }[] = [];
				const generateToken = (length: number, type: StandardTokenType, newState?: State) => {
					if (tokens.length > 0 && tokens[tokens.length - 1].type === type) {
						// grow last tokens
						tokens[tokens.length - 1].length += length;
					} else {
						tokens.push({ length, type });
					}
					line = line.substring(length);
					if (newState) {
						state = newState;
					}
				};
				while (line.length > 0) {
					advance();
				}
				const result = new Uint32Array(tokens.length * 2);
				let startIndex = 0;
				for (let i = 0; i < tokens.length; i++) {
					result[2 * i] = startIndex;
					result[2 * i + 1] = (
						(encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
						| (tokens[i].type << MetadataConsts.TOKEN_TYPE_OFFSET)
					);
					startIndex += tokens[i].length;
				}
				return new EncodedTokenizationResult(result, state);

				function advance(): void {
					if (state instanceof BaseState) {
						const m1 = line.match(/^[^'"`{}/]+/g);
						if (m1) {
							return generateToken(m1[0].length, StandardTokenType.Other);
						}
						if (/^['"`]/.test(line)) {
							return generateToken(1, StandardTokenType.String, new StringState(line.charAt(0), state));
						}
						if (/^{/.test(line)) {
							return generateToken(1, StandardTokenType.Other, new BaseState(state));
						}
						if (/^}/.test(line)) {
							return generateToken(1, StandardTokenType.Other, state.parent || new BaseState());
						}
						if (/^\/\//.test(line)) {
							return generateToken(line.length, StandardTokenType.Comment, state);
						}
						if (/^\/\*/.test(line)) {
							return generateToken(2, StandardTokenType.Comment, new BlockCommentState(state));
						}
						return generateToken(1, StandardTokenType.Other, state);
					} else if (state instanceof StringState) {
						const m1 = line.match(/^[^\\'"`\$]+/g);
						if (m1) {
							return generateToken(m1[0].length, StandardTokenType.String);
						}
						if (/^\\/.test(line)) {
							return generateToken(2, StandardTokenType.String);
						}
						if (line.charAt(0) === state.char) {
							return generateToken(1, StandardTokenType.String, state.parentState);
						}
						if (/^\$\{/.test(line)) {
							return generateToken(2, StandardTokenType.Other, new BaseState(state));
						}
						return generateToken(1, StandardTokenType.Other, state);
					} else if (state instanceof BlockCommentState) {
						const m1 = line.match(/^[^*]+/g);
						if (m1) {
							return generateToken(m1[0].length, StandardTokenType.String);
						}
						if (/^\*\//.test(line)) {
							return generateToken(2, StandardTokenType.Comment, state.parentState);
						}
						return generateToken(1, StandardTokenType.Other, state);
					} else {
						throw new Error(`unknown state`);
					}
				}
			}
		}));
	}

	function setAutoClosingLanguageEnabledSet(chars: string): void {
		disposables.add(languageConfigurationService.register(autoClosingLanguageId, {
			autoCloseBefore: chars,
			autoClosingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: '\"', close: '\"', notIn: ['string'] },
				{ open: '`', close: '`', notIn: ['string', 'comment'] },
				{ open: '/**', close: ' */', notIn: ['string'] }
			],
		}));
	}

	function createTextModel(text: string, languageId: string | null = null, options: IRelaxedTextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS, uri: URI | null = null): TextModel {
		return disposables.add(instantiateTextModel(instantiationService, text, languageId, options, uri));
	}

	function withTestCodeEditor(text: ITextModel | string | string[], options: TestCodeEditorInstantiationOptions, callback: (editor: ITestCodeEditor, viewModel: ViewModel) => void): void {
		let model: ITextModel;
		if (typeof text === 'string') {
			model = createTextModel(text);
		} else if (Array.isArray(text)) {
			model = createTextModel(text.join('\n'));
		} else {
			model = text;
		}
		const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model, options));
		const viewModel = editor.getViewModel()!;
		viewModel.setHasFocus(true);
		callback(editor, viewModel);
	}

	interface ICursorOpts {
		text: string[];
		languageId?: string | null;
		modelOpts?: IRelaxedTextModelCreationOptions;
		editorOpts?: IEditorOptions;
	}

	function usingCursor(opts: ICursorOpts, callback: (editor: ITestCodeEditor, model: TextModel, viewModel: ViewModel) => void): void {
		const model = createTextModel(opts.text.join('\n'), opts.languageId, opts.modelOpts);
		const editorOptions: TestCodeEditorInstantiationOptions = opts.editorOpts || {};
		withTestCodeEditor(model, editorOptions, (editor, viewModel) => {
			callback(editor, model, viewModel);
		});
	}

	const enum AutoClosingColumnType {
		Normal = 0,
		Special1 = 1,
		Special2 = 2
	}

	function extractAutoClosingSpecialColumns(maxColumn: number, annotatedLine: string): AutoClosingColumnType[] {
		const result: AutoClosingColumnType[] = [];
		for (let j = 1; j <= maxColumn; j++) {
			result[j] = AutoClosingColumnType.Normal;
		}
		let column = 1;
		for (let j = 0; j < annotatedLine.length; j++) {
			if (annotatedLine.charAt(j) === '|') {
				result[column] = AutoClosingColumnType.Special1;
			} else if (annotatedLine.charAt(j) === '!') {
				result[column] = AutoClosingColumnType.Special2;
			} else {
				column++;
			}
		}
		return result;
	}

	function assertType(editor: ITestCodeEditor, model: ITextModel, viewModel: ViewModel, lineNumber: number, column: number, chr: string, expectedInsert: string, message: string): void {
		const lineContent = model.getLineContent(lineNumber);
		const expected = lineContent.substr(0, column - 1) + expectedInsert + lineContent.substr(column - 1);
		moveTo(editor, viewModel, lineNumber, column);
		viewModel.type(chr, 'keyboard');
		assert.deepStrictEqual(model.getLineContent(lineNumber), expected, message);
		model.undo();
	}

	test('issue microsoft/monaco-editor#443: Indentation of a single row deletes selected text in some cases', () => {
		const model = createTextModel(
			[
				'Hello world!',
				'another line'
			].join('\n'),
			undefined,
			{
				insertSpaces: false
			},
		);
		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 1, 1, 13)]);

			// Check that indenting maintains the selection start at column 1
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 1, 1, 14));
		});
	});

	test('Bug 9121: Auto indent + undo + redo is funky', () => {
		const model = createTextModel(
			[
				''
			].join('\n'),
			undefined,
			{
				insertSpaces: false,
				trimAutoWhitespace: false
			},
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n', 'assert1');

			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\t', 'assert2');

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\t\n\t', 'assert3');

			viewModel.type('x');
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\t\n\tx', 'assert4');

			CoreNavigationCommands.CursorLeft.runCoreEditorCommand(viewModel, {});
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\t\n\tx', 'assert5');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\t\nx', 'assert6');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\tx', 'assert7');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\nx', 'assert8');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'x', 'assert9');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\nx', 'assert10');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\t\nx', 'assert11');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\t\n\tx', 'assert12');

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\t\nx', 'assert13');

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\nx', 'assert14');

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'x', 'assert15');
		});
	});

	test('issue #23539: Setting model EOL isn\'t undoable', () => {
		withTestCodeEditor([
			'Hello',
			'world'
		], {}, (editor, viewModel) => {
			const model = editor.getModel()!;

			assertCursor(viewModel, new Position(1, 1));
			model.setEOL(EndOfLineSequence.LF);
			assert.strictEqual(model.getValue(), 'Hello\nworld');

			model.pushEOL(EndOfLineSequence.CRLF);
			assert.strictEqual(model.getValue(), 'Hello\r\nworld');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(), 'Hello\nworld');
		});
	});

	test('issue #47733: Undo mangles unicode characters', () => {
		const languageId = 'myMode';

		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			surroundingPairs: [{ open: '%', close: '%' }]
		}));

		const model = createTextModel('\'👁\'', languageId);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			editor.setSelection(new Selection(1, 1, 1, 2));

			viewModel.type('%', 'keyboard');
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '%\'%👁\'', 'assert1');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\'👁\'', 'assert2');
		});
	});

	test('issue #46208: Allow empty selections in the undo/redo stack', () => {
		const model = createTextModel('');

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.type('Hello', 'keyboard');
			viewModel.type(' ', 'keyboard');
			viewModel.type('world', 'keyboard');
			viewModel.type(' ', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'Hello world ');
			assertCursor(viewModel, new Position(1, 13));

			moveLeft(editor, viewModel);
			moveRight(editor, viewModel);

			model.pushEditOperations([], [EditOperation.replaceMove(new Range(1, 12, 1, 13), '')], () => []);
			assert.strictEqual(model.getLineContent(1), 'Hello world');
			assertCursor(viewModel, new Position(1, 12));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'Hello world ');
			assertCursor(viewModel, new Selection(1, 13, 1, 13));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'Hello world');
			assertCursor(viewModel, new Position(1, 12));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'Hello');
			assertCursor(viewModel, new Position(1, 6));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), '');
			assertCursor(viewModel, new Position(1, 1));

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'Hello');
			assertCursor(viewModel, new Position(1, 6));

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'Hello world');
			assertCursor(viewModel, new Position(1, 12));

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'Hello world ');
			assertCursor(viewModel, new Position(1, 13));

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'Hello world');
			assertCursor(viewModel, new Position(1, 12));

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'Hello world');
			assertCursor(viewModel, new Position(1, 12));
		});
	});

	test('bug #16815:Shift+Tab doesn\'t go back to tabstop', () => {
		const languageId = setupOnEnterLanguage(IndentAction.IndentOutdent);
		const model = createTextModel(
			[
				'     function baz() {'
			].join('\n'),
			languageId
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 1, 6, false);
			assertCursor(viewModel, new Selection(1, 6, 1, 6));

			CoreEditingCommands.Outdent.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), '    function baz() {');
			assertCursor(viewModel, new Selection(1, 5, 1, 5));
		});
	});

	test('Bug #18293:[regression][editor] Can\'t outdent whitespace line', () => {
		const model = createTextModel(
			[
				'      '
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 1, 7, false);
			assertCursor(viewModel, new Selection(1, 7, 1, 7));

			CoreEditingCommands.Outdent.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), '    ');
			assertCursor(viewModel, new Selection(1, 5, 1, 5));
		});
	});

	test('issue #95591: Unindenting moves cursor to beginning of line', () => {
		const model = createTextModel(
			[
				'        '
			].join('\n')
		);

		withTestCodeEditor(model, { useTabStops: false }, (editor, viewModel) => {
			moveTo(editor, viewModel, 1, 9, false);
			assertCursor(viewModel, new Selection(1, 9, 1, 9));

			CoreEditingCommands.Outdent.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), '    ');
			assertCursor(viewModel, new Selection(1, 5, 1, 5));
		});
	});

	test('Bug #16657: [editor] Tab on empty line of zero indentation moves cursor to position (1,1)', () => {
		const model = createTextModel(
			[
				'function baz() {',
				'\tfunction hello() { // something here',
				'\t',
				'',
				'\t}',
				'}',
				''
			].join('\n'),
			undefined,
			{
				insertSpaces: false,
			},
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 7, 1, false);
			assertCursor(viewModel, new Selection(7, 1, 7, 1));

			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(7), '\t');
			assertCursor(viewModel, new Selection(7, 2, 7, 2));
		});
	});

	test('bug #16740: [editor] Cut line doesn\'t quite cut the last line', () => {

		// Part 1 => there is text on the last line
		withTestCodeEditor([
			'asdasd',
			'qwerty'
		], {}, (editor, viewModel) => {
			const model = editor.getModel()!;

			moveTo(editor, viewModel, 2, 1, false);
			assertCursor(viewModel, new Selection(2, 1, 2, 1));

			viewModel.cut('keyboard');
			assert.strictEqual(model.getLineCount(), 1);
			assert.strictEqual(model.getLineContent(1), 'asdasd');

		});

		// Part 2 => there is no text on the last line
		withTestCodeEditor([
			'asdasd',
			''
		], {}, (editor, viewModel) => {
			const model = editor.getModel()!;

			moveTo(editor, viewModel, 2, 1, false);
			assertCursor(viewModel, new Selection(2, 1, 2, 1));

			viewModel.cut('keyboard');
			assert.strictEqual(model.getLineCount(), 1);
			assert.strictEqual(model.getLineContent(1), 'asdasd');

			viewModel.cut('keyboard');
			assert.strictEqual(model.getLineCount(), 1);
			assert.strictEqual(model.getLineContent(1), '');
		});
	});

	test('issue #128602: When cutting multiple lines (ctrl x), the last line will not be erased', () => {
		withTestCodeEditor([
			'a1',
			'a2',
			'a3'
		], {}, (editor, viewModel) => {
			const model = editor.getModel()!;

			viewModel.setSelections('test', [
				new Selection(1, 1, 1, 1),
				new Selection(2, 1, 2, 1),
				new Selection(3, 1, 3, 1),
			]);

			viewModel.cut('keyboard');
			assert.strictEqual(model.getLineCount(), 1);
			assert.strictEqual(model.getLineContent(1), '');
		});
	});

	test('Bug #11476: Double bracket surrounding + undo is broken', () => {
		usingCursor({
			text: [
				'hello'
			],
			languageId: surroundingLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 3, false);
			moveTo(editor, viewModel, 1, 5, true);
			assertCursor(viewModel, new Selection(1, 3, 1, 5));

			viewModel.type('(', 'keyboard');
			assertCursor(viewModel, new Selection(1, 4, 1, 6));

			viewModel.type('(', 'keyboard');
			assertCursor(viewModel, new Selection(1, 5, 1, 7));
		});
	});

	test('issue #1140: Backspace stops prematurely', () => {
		const model = createTextModel(
			[
				'function baz() {',
				'  return 1;',
				'};'
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 3, 2, false);
			moveTo(editor, viewModel, 1, 14, true);
			assertCursor(viewModel, new Selection(3, 2, 1, 14));

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assertCursor(viewModel, new Selection(1, 14, 1, 14));
			assert.strictEqual(model.getLineCount(), 1);
			assert.strictEqual(model.getLineContent(1), 'function baz(;');
		});
	});

	test('issue #10212: Pasting entire line does not replace selection', () => {
		usingCursor({
			text: [
				'line1',
				'line2'
			],
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 1, false);
			moveTo(editor, viewModel, 2, 6, true);

			viewModel.paste('line1\n', true);

			assert.strictEqual(model.getLineContent(1), 'line1');
			assert.strictEqual(model.getLineContent(2), 'line1');
			assert.strictEqual(model.getLineContent(3), '');
		});
	});

	test('issue #74722: Pasting whole line does not replace selection', () => {
		usingCursor({
			text: [
				'line1',
				'line sel 2',
				'line3'
			],
		}, (editor, model, viewModel) => {
			viewModel.setSelections('test', [new Selection(2, 6, 2, 9)]);

			viewModel.paste('line1\n', true);

			assert.strictEqual(model.getLineContent(1), 'line1');
			assert.strictEqual(model.getLineContent(2), 'line line1');
			assert.strictEqual(model.getLineContent(3), ' 2');
			assert.strictEqual(model.getLineContent(4), 'line3');
		});
	});

	test('issue #4996: Multiple cursor paste pastes contents of all cursors', () => {
		usingCursor({
			text: [
				'line1',
				'line2',
				'line3'
			],
		}, (editor, model, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);

			viewModel.paste(
				'a\nb\nc\nd',
				false,
				[
					'a\nb',
					'c\nd'
				]
			);

			assert.strictEqual(model.getValue(), [
				'a',
				'bline1',
				'c',
				'dline2',
				'line3'
			].join('\n'));
		});
	});

	test('issue #16155: Paste into multiple cursors has edge case when number of lines equals number of cursors - 1', () => {
		usingCursor({
			text: [
				'test',
				'test',
				'test',
				'test'
			],
		}, (editor, model, viewModel) => {
			viewModel.setSelections('test', [
				new Selection(1, 1, 1, 5),
				new Selection(2, 1, 2, 5),
				new Selection(3, 1, 3, 5),
				new Selection(4, 1, 4, 5),
			]);

			viewModel.paste(
				'aaa\nbbb\nccc\n',
				false,
				null
			);

			assert.strictEqual(model.getValue(), [
				'aaa',
				'bbb',
				'ccc',
				'',
				'aaa',
				'bbb',
				'ccc',
				'',
				'aaa',
				'bbb',
				'ccc',
				'',
				'aaa',
				'bbb',
				'ccc',
				'',
			].join('\n'));
		});
	});

	test('issue #43722: Multiline paste doesn\'t work anymore', () => {
		usingCursor({
			text: [
				'test',
				'test',
				'test',
				'test'
			],
		}, (editor, model, viewModel) => {
			viewModel.setSelections('test', [
				new Selection(1, 1, 1, 5),
				new Selection(2, 1, 2, 5),
				new Selection(3, 1, 3, 5),
				new Selection(4, 1, 4, 5),
			]);

			viewModel.paste(
				'aaa\r\nbbb\r\nccc\r\nddd\r\n',
				false,
				null
			);

			assert.strictEqual(model.getValue(), [
				'aaa',
				'bbb',
				'ccc',
				'ddd',
			].join('\n'));
		});
	});

	test('issue #46440: (1) Pasting a multi-line selection pastes entire selection into every insertion point', () => {
		usingCursor({
			text: [
				'line1',
				'line2',
				'line3'
			],
		}, (editor, model, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1), new Selection(3, 1, 3, 1)]);

			viewModel.paste(
				'a\nb\nc',
				false,
				null
			);

			assert.strictEqual(model.getValue(), [
				'aline1',
				'bline2',
				'cline3'
			].join('\n'));
		});
	});

	test('issue #46440: (2) Pasting a multi-line selection pastes entire selection into every insertion point', () => {
		usingCursor({
			text: [
				'line1',
				'line2',
				'line3'
			],
		}, (editor, model, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1), new Selection(3, 1, 3, 1)]);

			viewModel.paste(
				'a\nb\nc\n',
				false,
				null
			);

			assert.strictEqual(model.getValue(), [
				'aline1',
				'bline2',
				'cline3'
			].join('\n'));
		});
	});

	test('issue #3071: Investigate why undo stack gets corrupted', () => {
		const model = createTextModel(
			[
				'some lines',
				'and more lines',
				'just some text',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 1, 1, false);
			moveTo(editor, viewModel, 3, 4, true);

			let isFirst = true;
			model.onDidChangeContent(() => {
				if (isFirst) {
					isFirst = false;
					viewModel.type('\t', 'keyboard');
				}
			});

			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(), [
				'\t just some text'
			].join('\n'), '001');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(), [
				'    some lines',
				'    and more lines',
				'    just some text',
			].join('\n'), '002');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(), [
				'some lines',
				'and more lines',
				'just some text',
			].join('\n'), '003');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(), [
				'some lines',
				'and more lines',
				'just some text',
			].join('\n'), '004');
		});
	});

	test('issue #12950: Cannot Double Click To Insert Emoji Using OSX Emoji Panel', () => {
		usingCursor({
			text: [
				'some lines',
				'and more lines',
				'just some text',
			],
			languageId: null
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 1, false);

			viewModel.type('😍', 'keyboard');

			assert.strictEqual(model.getValue(), [
				'some lines',
				'and more lines',
				'😍just some text',
			].join('\n'));
		});
	});

	test('issue #3463: pressing tab adds spaces, but not as many as for a tab', () => {
		const model = createTextModel(
			[
				'function a() {',
				'\tvar a = {',
				'\t\tx: 3',
				'\t};',
				'}',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 3, 2, false);
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(3), '\t    \tx: 3');
		});
	});

	test('issue #4312: trying to type a tab character over a sequence of spaces results in unexpected behaviour', () => {
		const model = createTextModel(
			[
				'var foo = 123;       // this is a comment',
				'var bar = 4;       // another comment'
			].join('\n'),
			undefined,
			{
				insertSpaces: false,
			}
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 1, 15, false);
			moveTo(editor, viewModel, 1, 22, true);
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'var foo = 123;\t// this is a comment');
		});
	});

	test('issue #832: word right', () => {

		usingCursor({
			text: [
				'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
			],
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 1, false);

			function assertWordRight(col: number, expectedCol: number) {
				const args = {
					position: {
						lineNumber: 1,
						column: col
					}
				};
				if (col === 1) {
					CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, args);
				} else {
					CoreNavigationCommands.WordSelectDrag.runCoreEditorCommand(viewModel, args);
				}

				assert.strictEqual(viewModel.getSelection().startColumn, 1, 'TEST FOR ' + col);
				assert.strictEqual(viewModel.getSelection().endColumn, expectedCol, 'TEST FOR ' + col);
			}

			assertWordRight(1, '   '.length + 1);
			assertWordRight(2, '   '.length + 1);
			assertWordRight(3, '   '.length + 1);
			assertWordRight(4, '   '.length + 1);
			assertWordRight(5, '   /'.length + 1);
			assertWordRight(6, '   /*'.length + 1);
			assertWordRight(7, '   /* '.length + 1);
			assertWordRight(8, '   /* Just'.length + 1);
			assertWordRight(9, '   /* Just'.length + 1);
			assertWordRight(10, '   /* Just'.length + 1);
			assertWordRight(11, '   /* Just'.length + 1);
			assertWordRight(12, '   /* Just '.length + 1);
			assertWordRight(13, '   /* Just some'.length + 1);
			assertWordRight(14, '   /* Just some'.length + 1);
			assertWordRight(15, '   /* Just some'.length + 1);
			assertWordRight(16, '   /* Just some'.length + 1);
			assertWordRight(17, '   /* Just some '.length + 1);
			assertWordRight(18, '   /* Just some  '.length + 1);
			assertWordRight(19, '   /* Just some   '.length + 1);
			assertWordRight(20, '   /* Just some   more'.length + 1);
			assertWordRight(21, '   /* Just some   more'.length + 1);
			assertWordRight(22, '   /* Just some   more'.length + 1);
			assertWordRight(23, '   /* Just some   more'.length + 1);
			assertWordRight(24, '   /* Just some   more '.length + 1);
			assertWordRight(25, '   /* Just some   more  '.length + 1);
			assertWordRight(26, '   /* Just some   more   '.length + 1);
			assertWordRight(27, '   /* Just some   more   text'.length + 1);
			assertWordRight(28, '   /* Just some   more   text'.length + 1);
			assertWordRight(29, '   /* Just some   more   text'.length + 1);
			assertWordRight(30, '   /* Just some   more   text'.length + 1);
			assertWordRight(31, '   /* Just some   more   text '.length + 1);
			assertWordRight(32, '   /* Just some   more   text a'.length + 1);
			assertWordRight(33, '   /* Just some   more   text a+'.length + 1);
			assertWordRight(34, '   /* Just some   more   text a+='.length + 1);
			assertWordRight(35, '   /* Just some   more   text a+= '.length + 1);
			assertWordRight(36, '   /* Just some   more   text a+= 3'.length + 1);
			assertWordRight(37, '   /* Just some   more   text a+= 3 '.length + 1);
			assertWordRight(38, '   /* Just some   more   text a+= 3 +'.length + 1);
			assertWordRight(39, '   /* Just some   more   text a+= 3 +5'.length + 1);
			assertWordRight(40, '   /* Just some   more   text a+= 3 +5-'.length + 1);
			assertWordRight(41, '   /* Just some   more   text a+= 3 +5-3'.length + 1);
			assertWordRight(42, '   /* Just some   more   text a+= 3 +5-3 '.length + 1);
			assertWordRight(43, '   /* Just some   more   text a+= 3 +5-3 +'.length + 1);
			assertWordRight(44, '   /* Just some   more   text a+= 3 +5-3 + '.length + 1);
			assertWordRight(45, '   /* Just some   more   text a+= 3 +5-3 + 7'.length + 1);
			assertWordRight(46, '   /* Just some   more   text a+= 3 +5-3 + 7 '.length + 1);
			assertWordRight(47, '   /* Just some   more   text a+= 3 +5-3 + 7 *'.length + 1);
			assertWordRight(48, '   /* Just some   more   text a+= 3 +5-3 + 7 */'.length + 1);
			assertWordRight(49, '   /* Just some   more   text a+= 3 +5-3 + 7 */ '.length + 1);
			assertWordRight(50, '   /* Just some   more   text a+= 3 +5-3 + 7 */  '.length + 1);
		});
	});

	test('issue #33788: Wrong cursor position when double click to select a word', () => {
		const model = createTextModel(
			[
				'Just some text'
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 8) });
			assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 6, 1, 10));

			CoreNavigationCommands.WordSelectDrag.runCoreEditorCommand(viewModel, { position: new Position(1, 8) });
			assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 6, 1, 10));
		});
	});

	test('issue #12887: Double-click highlighting separating white space', () => {
		const model = createTextModel(
			[
				'abc def'
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 5) });
			assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 5, 1, 8));
		});
	});

	test('issue #9675: Undo/Redo adds a stop in between CHN Characters', () => {
		withTestCodeEditor([], {}, (editor, viewModel) => {
			const model = editor.getModel()!;
			assertCursor(viewModel, new Position(1, 1));

			// Typing sennsei in Japanese - Hiragana
			viewModel.type('ｓ', 'keyboard');
			viewModel.compositionType('せ', 1, 0, 0);
			viewModel.compositionType('せｎ', 1, 0, 0);
			viewModel.compositionType('せん', 2, 0, 0);
			viewModel.compositionType('せんｓ', 2, 0, 0);
			viewModel.compositionType('せんせ', 3, 0, 0);
			viewModel.compositionType('せんせ', 3, 0, 0);
			viewModel.compositionType('せんせい', 3, 0, 0);
			viewModel.compositionType('せんせい', 4, 0, 0);
			viewModel.compositionType('せんせい', 4, 0, 0);
			viewModel.compositionType('せんせい', 4, 0, 0);

			assert.strictEqual(model.getLineContent(1), 'せんせい');
			assertCursor(viewModel, new Position(1, 5));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), '');
			assertCursor(viewModel, new Position(1, 1));
		});
	});

	test('issue #23983: Calling model.setEOL does not reset cursor position', () => {
		usingCursor({
			text: [
				'first line',
				'second line'
			]
		}, (editor, model, viewModel) => {
			model.setEOL(EndOfLineSequence.CRLF);

			viewModel.setSelections('test', [new Selection(2, 2, 2, 2)]);
			model.setEOL(EndOfLineSequence.LF);

			assertCursor(viewModel, new Selection(2, 2, 2, 2));
		});
	});

	test('issue #23983: Calling model.setValue() resets cursor position', () => {
		usingCursor({
			text: [
				'first line',
				'second line'
			]
		}, (editor, model, viewModel) => {
			model.setEOL(EndOfLineSequence.CRLF);

			viewModel.setSelections('test', [new Selection(2, 2, 2, 2)]);
			model.setValue([
				'different first line',
				'different second line',
				'new third line'
			].join('\n'));

			assertCursor(viewModel, new Selection(1, 1, 1, 1));
		});
	});

	test('issue #36740: wordwrap creates an extra step / character at the wrapping point', () => {
		// a single model line => 4 view lines
		withTestCodeEditor([
			[
				'Lorem ipsum ',
				'dolor sit amet ',
				'consectetur ',
				'adipiscing elit',
			].join('')
		], { wordWrap: 'wordWrapColumn', wordWrapColumn: 16 }, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 7, 1, 7)]);

			moveRight(editor, viewModel);
			assertCursor(viewModel, new Selection(1, 8, 1, 8));

			moveRight(editor, viewModel);
			assertCursor(viewModel, new Selection(1, 9, 1, 9));

			moveRight(editor, viewModel);
			assertCursor(viewModel, new Selection(1, 10, 1, 10));

			moveRight(editor, viewModel);
			assertCursor(viewModel, new Selection(1, 11, 1, 11));

			moveRight(editor, viewModel);
			assertCursor(viewModel, new Selection(1, 12, 1, 12));

			moveRight(editor, viewModel);
			assertCursor(viewModel, new Selection(1, 13, 1, 13));

			// moving to view line 2
			moveRight(editor, viewModel);
			assertCursor(viewModel, new Selection(1, 14, 1, 14));

			moveLeft(editor, viewModel);
			assertCursor(viewModel, new Selection(1, 13, 1, 13));

			// moving back to view line 1
			moveLeft(editor, viewModel);
			assertCursor(viewModel, new Selection(1, 12, 1, 12));
		});
	});

	test('issue #110376: multiple selections with wordwrap behave differently', () => {
		// a single model line => 4 view lines
		withTestCodeEditor([
			[
				'just a sentence. just a ',
				'sentence. just a sentence.',
			].join('')
		], { wordWrap: 'wordWrapColumn', wordWrapColumn: 25 }, (editor, viewModel) => {
			viewModel.setSelections('test', [
				new Selection(1, 1, 1, 16),
				new Selection(1, 18, 1, 33),
				new Selection(1, 35, 1, 50),
			]);

			moveLeft(editor, viewModel);
			assertCursor(viewModel, [
				new Selection(1, 1, 1, 1),
				new Selection(1, 18, 1, 18),
				new Selection(1, 35, 1, 35),
			]);

			viewModel.setSelections('test', [
				new Selection(1, 1, 1, 16),
				new Selection(1, 18, 1, 33),
				new Selection(1, 35, 1, 50),
			]);

			moveRight(editor, viewModel);
			assertCursor(viewModel, [
				new Selection(1, 16, 1, 16),
				new Selection(1, 33, 1, 33),
				new Selection(1, 50, 1, 50),
			]);
		});
	});

	test('issue #98320: Multi-Cursor, Wrap lines and cursorSelectRight ==> cursors out of sync', () => {
		// a single model line => 4 view lines
		withTestCodeEditor([
			[
				'lorem_ipsum-1993x11x13',
				'dolor_sit_amet-1998x04x27',
				'consectetur-2007x10x08',
				'adipiscing-2012x07x27',
				'elit-2015x02x27',
			].join('\n')
		], { wordWrap: 'wordWrapColumn', wordWrapColumn: 16 }, (editor, viewModel) => {
			viewModel.setSelections('test', [
				new Selection(1, 13, 1, 13),
				new Selection(2, 16, 2, 16),
				new Selection(3, 13, 3, 13),
				new Selection(4, 12, 4, 12),
				new Selection(5, 6, 5, 6),
			]);
			assertCursor(viewModel, [
				new Selection(1, 13, 1, 13),
				new Selection(2, 16, 2, 16),
				new Selection(3, 13, 3, 13),
				new Selection(4, 12, 4, 12),
				new Selection(5, 6, 5, 6),
			]);

			moveRight(editor, viewModel, true);
			assertCursor(viewModel, [
				new Selection(1, 13, 1, 14),
				new Selection(2, 16, 2, 17),
				new Selection(3, 13, 3, 14),
				new Selection(4, 12, 4, 13),
				new Selection(5, 6, 5, 7),
			]);

			moveRight(editor, viewModel, true);
			assertCursor(viewModel, [
				new Selection(1, 13, 1, 15),
				new Selection(2, 16, 2, 18),
				new Selection(3, 13, 3, 15),
				new Selection(4, 12, 4, 14),
				new Selection(5, 6, 5, 8),
			]);

			moveRight(editor, viewModel, true);
			assertCursor(viewModel, [
				new Selection(1, 13, 1, 16),
				new Selection(2, 16, 2, 19),
				new Selection(3, 13, 3, 16),
				new Selection(4, 12, 4, 15),
				new Selection(5, 6, 5, 9),
			]);

			moveRight(editor, viewModel, true);
			assertCursor(viewModel, [
				new Selection(1, 13, 1, 17),
				new Selection(2, 16, 2, 20),
				new Selection(3, 13, 3, 17),
				new Selection(4, 12, 4, 16),
				new Selection(5, 6, 5, 10),
			]);
		});
	});

	test('issue #41573 - delete across multiple lines does not shrink the selection when word wraps', () => {
		withTestCodeEditor([
			'Authorization: \'Bearer pHKRfCTFSnGxs6akKlb9ddIXcca0sIUSZJutPHYqz7vEeHdMTMh0SGN0IGU3a0n59DXjTLRsj5EJ2u33qLNIFi9fk5XF8pK39PndLYUZhPt4QvHGLScgSkK0L4gwzkzMloTQPpKhqiikiIOvyNNSpd2o8j29NnOmdTUOKi9DVt74PD2ohKxyOrWZ6oZprTkb3eKajcpnS0LABKfaw2rmv4\','
		].join('\n'), { wordWrap: 'wordWrapColumn', wordWrapColumn: 100 }, (editor, viewModel) => {
			moveTo(editor, viewModel, 1, 43, false);
			moveTo(editor, viewModel, 1, 147, true);
			assertCursor(viewModel, new Selection(1, 43, 1, 147));

			editor.getModel().applyEdits([{
				range: new Range(1, 1, 1, 43),
				text: ''
			}]);

			assertCursor(viewModel, new Selection(1, 1, 1, 105));
		});
	});

	test('issue #22717: Moving text cursor cause an incorrect position in Chinese', () => {
		// a single model line => 4 view lines
		withTestCodeEditor([
			[
				'一二三四五六七八九十',
				'12345678901234567890',
			].join('\n')
		], {}, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 5, 1, 5)]);

			moveDown(editor, viewModel);
			assertCursor(viewModel, new Selection(2, 9, 2, 9));

			moveRight(editor, viewModel);
			assertCursor(viewModel, new Selection(2, 10, 2, 10));

			moveRight(editor, viewModel);
			assertCursor(viewModel, new Selection(2, 11, 2, 11));

			moveUp(editor, viewModel);
			assertCursor(viewModel, new Selection(1, 6, 1, 6));
		});
	});

	test('issue #112301: new stickyTabStops feature interferes with word wrap', () => {
		withTestCodeEditor([
			[
				'function hello() {',
				'        console.log(`this is a long console message`)',
				'}',
			].join('\n')
		], { wordWrap: 'wordWrapColumn', wordWrapColumn: 32, stickyTabStops: true }, (editor, viewModel) => {
			viewModel.setSelections('test', [
				new Selection(2, 31, 2, 31)
			]);
			moveRight(editor, viewModel, false);
			assertCursor(viewModel, new Position(2, 32));

			moveRight(editor, viewModel, false);
			assertCursor(viewModel, new Position(2, 33));

			moveRight(editor, viewModel, false);
			assertCursor(viewModel, new Position(2, 34));

			moveLeft(editor, viewModel, false);
			assertCursor(viewModel, new Position(2, 33));

			moveLeft(editor, viewModel, false);
			assertCursor(viewModel, new Position(2, 32));

			moveLeft(editor, viewModel, false);
			assertCursor(viewModel, new Position(2, 31));
		});
	});

	test('issue #44805: Should not be able to undo in readonly editor', () => {
		const model = createTextModel(
			[
				''
			].join('\n')
		);

		withTestCodeEditor(model, { readOnly: true }, (editor, viewModel) => {
			model.pushEditOperations([new Selection(1, 1, 1, 1)], [{
				range: new Range(1, 1, 1, 1),
				text: 'Hello world!'
			}], () => [new Selection(1, 1, 1, 1)]);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'Hello world!');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'Hello world!');
		});
	});

	test('issue #46314: ViewModel is out of sync with Model!', () => {

		const tokenizationSupport: ITokenizationSupport = {
			getInitialState: () => NullState,
			tokenize: undefined!,
			tokenizeEncoded: (line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult => {
				return new EncodedTokenizationResult(new Uint32Array(0), state);
			}
		};

		const LANGUAGE_ID = 'modelModeTest1';
		const languageRegistration = TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
		const model = createTextModel('Just text', LANGUAGE_ID);

		withTestCodeEditor(model, {}, (editor1, cursor1) => {
			withTestCodeEditor(model, {}, (editor2, cursor2) => {

				editor1.onDidChangeCursorPosition(() => {
					model.tokenization.tokenizeIfCheap(1);
				});

				model.applyEdits([{ range: new Range(1, 1, 1, 1), text: '-' }]);
			});
		});

		languageRegistration.dispose();
		model.dispose();
	});

	test('issue #37967: problem replacing consecutive characters', () => {
		const model = createTextModel(
			[
				'const a = "foo";',
				'const b = ""'
			].join('\n')
		);

		withTestCodeEditor(model, { multiCursorMergeOverlapping: false }, (editor, viewModel) => {
			editor.setSelections([
				new Selection(1, 12, 1, 12),
				new Selection(1, 16, 1, 16),
				new Selection(2, 12, 2, 12),
				new Selection(2, 13, 2, 13),
			]);

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);

			assertCursor(viewModel, [
				new Selection(1, 11, 1, 11),
				new Selection(1, 14, 1, 14),
				new Selection(2, 11, 2, 11),
				new Selection(2, 11, 2, 11),
			]);

			viewModel.type('\'', 'keyboard');

			assert.strictEqual(model.getLineContent(1), 'const a = \'foo\';');
			assert.strictEqual(model.getLineContent(2), 'const b = \'\'');
		});
	});

	test('issue #15761: Cursor doesn\'t move in a redo operation', () => {
		const model = createTextModel(
			[
				'hello'
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			editor.setSelections([
				new Selection(1, 4, 1, 4)
			]);

			editor.executeEdits('test', [{
				range: new Range(1, 1, 1, 1),
				text: '*',
				forceMoveMarkers: true
			}]);
			assertCursor(viewModel, [
				new Selection(1, 5, 1, 5),
			]);

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assertCursor(viewModel, [
				new Selection(1, 4, 1, 4),
			]);

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assertCursor(viewModel, [
				new Selection(1, 5, 1, 5),
			]);
		});
	});

	test('issue #42783: API Calls with Undo Leave Cursor in Wrong Position', () => {
		const model = createTextModel(
			[
				'ab'
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			editor.setSelections([
				new Selection(1, 1, 1, 1)
			]);

			editor.executeEdits('test', [{
				range: new Range(1, 1, 1, 3),
				text: ''
			}]);
			assertCursor(viewModel, [
				new Selection(1, 1, 1, 1),
			]);

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assertCursor(viewModel, [
				new Selection(1, 1, 1, 1),
			]);

			editor.executeEdits('test', [{
				range: new Range(1, 1, 1, 2),
				text: ''
			}]);
			assertCursor(viewModel, [
				new Selection(1, 1, 1, 1),
			]);
		});
	});

	test('issue #85712: Paste line moves cursor to start of current line rather than start of next line', () => {
		const model = createTextModel(
			[
				'abc123',
				''
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			editor.setSelections([
				new Selection(2, 1, 2, 1)
			]);
			viewModel.paste('something\n', true);
			assert.strictEqual(model.getValue(), [
				'abc123',
				'something',
				''
			].join('\n'));
			assertCursor(viewModel, new Position(3, 1));
		});
	});

	test('issue #84897: Left delete behavior in some languages is changed', () => {
		const model = createTextModel(
			[
				'สวัสดี'
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			editor.setSelections([
				new Selection(1, 7, 1, 7)
			]);

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'สวัสด');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'สวัส');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'สวั');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'สว');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'ส');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '');
		});
	});

	test('issue #122914: Left delete behavior in some languages is changed (useTabStops: false)', () => {
		const model = createTextModel(
			[
				'สวัสดี'
			].join('\n')
		);

		withTestCodeEditor(model, { useTabStops: false }, (editor, viewModel) => {
			editor.setSelections([
				new Selection(1, 7, 1, 7)
			]);

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'สวัสด');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'สวัส');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'สวั');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'สว');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'ส');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '');
		});
	});

	test('issue #99629: Emoji modifiers in text treated separately when using backspace', () => {
		const model = createTextModel(
			[
				'👶🏾'
			].join('\n')
		);

		withTestCodeEditor(model, { useTabStops: false }, (editor, viewModel) => {
			const len = model.getValueLength();
			editor.setSelections([
				new Selection(1, 1 + len, 1, 1 + len)
			]);

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '');
		});
	});

	test('issue #99629: Emoji modifiers in text treated separately when using backspace (ZWJ sequence)', () => {
		const model = createTextModel(
			[
				'👨‍👩🏽‍👧‍👦'
			].join('\n')
		);

		withTestCodeEditor(model, { useTabStops: false }, (editor, viewModel) => {
			const len = model.getValueLength();
			editor.setSelections([
				new Selection(1, 1 + len, 1, 1 + len)
			]);

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '👨‍👩🏽‍👧');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '👨‍👩🏽');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '👨');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '');
		});
	});

	test('issue #105730: move left behaves differently for multiple cursors', () => {
		const model = createTextModel('asdfghjkl, asdfghjkl, asdfghjkl, ');

		withTestCodeEditor(
			model,
			{
				wordWrap: 'wordWrapColumn',
				wordWrapColumn: 24
			},
			(editor, viewModel) => {
				viewModel.setSelections('test', [
					new Selection(1, 10, 1, 12),
					new Selection(1, 21, 1, 23),
					new Selection(1, 32, 1, 34)
				]);
				moveLeft(editor, viewModel, false);
				assertCursor(viewModel, [
					new Selection(1, 10, 1, 10),
					new Selection(1, 21, 1, 21),
					new Selection(1, 32, 1, 32)
				]);

				viewModel.setSelections('test', [
					new Selection(1, 10, 1, 12),
					new Selection(1, 21, 1, 23),
					new Selection(1, 32, 1, 34)
				]);
				moveLeft(editor, viewModel, true);
				assertCursor(viewModel, [
					new Selection(1, 10, 1, 11),
					new Selection(1, 21, 1, 22),
					new Selection(1, 32, 1, 33)
				]);
			});
	});

	test('issue #105730: move right should always skip wrap point', () => {
		const model = createTextModel('asdfghjkl, asdfghjkl, asdfghjkl, \nasdfghjkl,');

		withTestCodeEditor(
			model,
			{
				wordWrap: 'wordWrapColumn',
				wordWrapColumn: 24
			},
			(editor, viewModel) => {
				viewModel.setSelections('test', [
					new Selection(1, 22, 1, 22)
				]);
				moveRight(editor, viewModel, false);
				moveRight(editor, viewModel, false);
				assertCursor(viewModel, [
					new Selection(1, 24, 1, 24),
				]);

				viewModel.setSelections('test', [
					new Selection(1, 22, 1, 22)
				]);
				moveRight(editor, viewModel, true);
				moveRight(editor, viewModel, true);
				assertCursor(viewModel, [
					new Selection(1, 22, 1, 24),
				]);
			}
		);
	});

	test('issue #123178: sticky tab in consecutive wrapped lines', () => {
		const model = createTextModel('    aaaa        aaaa', undefined, { tabSize: 4 });

		withTestCodeEditor(
			model,
			{
				wordWrap: 'wordWrapColumn',
				wordWrapColumn: 8,
				stickyTabStops: true,
			},
			(editor, viewModel) => {
				viewModel.setSelections('test', [
					new Selection(1, 9, 1, 9)
				]);
				moveRight(editor, viewModel, false);
				assertCursor(viewModel, [
					new Selection(1, 10, 1, 10),
				]);

				moveLeft(editor, viewModel, false);
				assertCursor(viewModel, [
					new Selection(1, 9, 1, 9),
				]);
			}
		);
	});

	test('Cursor honors insertSpaces configuration on new line', () => {
		usingCursor({
			text: [
				'    \tMy First Line\t ',
				'\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		}, (editor, model, viewModel) => {
			CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(1, 21), source: 'keyboard' });
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '    \tMy First Line\t ');
			assert.strictEqual(model.getLineContent(2), '        ');
		});
	});

	test('Cursor honors insertSpaces configuration on tab', () => {
		const model = createTextModel(
			[
				'    \tMy First Line\t ',
				'My Second Line123',
				'    Third Line',
				'',
				'1'
			].join('\n'),
			undefined,
			{
				tabSize: 13,
				indentSize: 13,
			}
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			// Tab on column 1
			CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 1) });
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), '             My Second Line123');
			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);

			// Tab on column 2
			assert.strictEqual(model.getLineContent(2), 'My Second Line123');
			CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 2) });
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'M            y Second Line123');
			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);

			// Tab on column 3
			assert.strictEqual(model.getLineContent(2), 'My Second Line123');
			CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 3) });
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'My            Second Line123');
			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);

			// Tab on column 4
			assert.strictEqual(model.getLineContent(2), 'My Second Line123');
			CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 4) });
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'My           Second Line123');
			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);

			// Tab on column 5
			assert.strictEqual(model.getLineContent(2), 'My Second Line123');
			CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 5) });
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'My S         econd Line123');
			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);

			// Tab on column 5
			assert.strictEqual(model.getLineContent(2), 'My Second Line123');
			CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 5) });
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'My S         econd Line123');
			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);

			// Tab on column 13
			assert.strictEqual(model.getLineContent(2), 'My Second Line123');
			CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 13) });
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'My Second Li ne123');
			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);

			// Tab on column 14
			assert.strictEqual(model.getLineContent(2), 'My Second Line123');
			CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 14) });
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'My Second Lin             e123');
		});
	});

	test('Enter auto-indents with insertSpaces setting 1', () => {
		const languageId = setupOnEnterLanguage(IndentAction.Indent);
		usingCursor({
			text: [
				'\thello'
			],
			languageId: languageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 7, false);
			assertCursor(viewModel, new Selection(1, 7, 1, 7));

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(EndOfLinePreference.CRLF), '\thello\r\n        ');
		});
	});

	test('Enter auto-indents with insertSpaces setting 2', () => {
		const languageId = setupOnEnterLanguage(IndentAction.None);
		usingCursor({
			text: [
				'\thello'
			],
			languageId: languageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 7, false);
			assertCursor(viewModel, new Selection(1, 7, 1, 7));

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(EndOfLinePreference.CRLF), '\thello\r\n    ');
		});
	});

	test('Enter auto-indents with insertSpaces setting 3', () => {
		const languageId = setupOnEnterLanguage(IndentAction.IndentOutdent);
		usingCursor({
			text: [
				'\thell()'
			],
			languageId: languageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 7, false);
			assertCursor(viewModel, new Selection(1, 7, 1, 7));

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(EndOfLinePreference.CRLF), '\thell(\r\n        \r\n    )');
		});
	});

	test('issue #148256: Pressing Enter creates line with bad indent with insertSpaces: true', () => {
		usingCursor({
			text: [
				'  \t'
			],
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 4, false);
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(), '  \t\n    ');
		});
	});

	test('issue #148256: Pressing Enter creates line with bad indent with insertSpaces: false', () => {
		usingCursor({
			text: [
				'  \t'
			]
		}, (editor, model, viewModel) => {
			model.updateOptions({
				insertSpaces: false
			});
			moveTo(editor, viewModel, 1, 4, false);
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(), '  \t\n\t');
		});
	});

	test('removeAutoWhitespace off', () => {
		usingCursor({
			text: [
				'    some  line abc  '
			],
			modelOpts: {
				trimAutoWhitespace: false
			}
		}, (editor, model, viewModel) => {

			// Move cursor to the end, verify that we do not trim whitespaces if line has values
			moveTo(editor, viewModel, 1, model.getLineContent(1).length + 1);
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '    some  line abc  ');
			assert.strictEqual(model.getLineContent(2), '    ');

			// Try to enter again, we should trimmed previous line
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '    some  line abc  ');
			assert.strictEqual(model.getLineContent(2), '    ');
			assert.strictEqual(model.getLineContent(3), '    ');
		});
	});

	test('removeAutoWhitespace on: removes only whitespace the cursor added 1', () => {
		usingCursor({
			text: [
				'    '
			]
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, model.getLineContent(1).length + 1);
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '    ');
			assert.strictEqual(model.getLineContent(2), '    ');

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '    ');
			assert.strictEqual(model.getLineContent(2), '');
			assert.strictEqual(model.getLineContent(3), '    ');
		});
	});

	test('issue #115033: indent and appendText', () => {
		const languageId = 'onEnterMode';

		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			onEnterRules: [{
				beforeText: /.*/,
				action: {
					indentAction: IndentAction.Indent,
					appendText: 'x'
				}
			}]
		}));
		usingCursor({
			text: [
				'text'
			],
			languageId: languageId,
		}, (editor, model, viewModel) => {

			moveTo(editor, viewModel, 1, 5);
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'text');
			assert.strictEqual(model.getLineContent(2), '    x');
			assertCursor(viewModel, new Position(2, 6));
		});
	});

	test('issue #6862: Editor removes auto inserted indentation when formatting on type', () => {
		const languageId = setupOnEnterLanguage(IndentAction.IndentOutdent);
		usingCursor({
			text: [
				'function foo (params: string) {}'
			],
			languageId: languageId,
		}, (editor, model, viewModel) => {

			moveTo(editor, viewModel, 1, 32);
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'function foo (params: string) {');
			assert.strictEqual(model.getLineContent(2), '    ');
			assert.strictEqual(model.getLineContent(3), '}');

			class TestCommand implements ICommand {

				private _selectionId: string | null = null;

				public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
					builder.addEditOperation(new Range(1, 13, 1, 14), '');
					this._selectionId = builder.trackSelection(viewModel.getSelection());
				}

				public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
					return helper.getTrackedSelection(this._selectionId!);
				}

			}

			viewModel.executeCommand(new TestCommand(), 'autoFormat');
			assert.strictEqual(model.getLineContent(1), 'function foo(params: string) {');
			assert.strictEqual(model.getLineContent(2), '    ');
			assert.strictEqual(model.getLineContent(3), '}');
		});
	});

	test('removeAutoWhitespace on: removes only whitespace the cursor added 2', () => {
		const languageId = 'testLang';
		const registration = languageService.registerLanguage({ id: languageId });
		const model = createTextModel(
			[
				'    if (a) {',
				'        ',
				'',
				'',
				'    }'
			].join('\n'),
			languageId
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {

			moveTo(editor, viewModel, 3, 1);
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), '    if (a) {');
			assert.strictEqual(model.getLineContent(2), '        ');
			assert.strictEqual(model.getLineContent(3), '    ');
			assert.strictEqual(model.getLineContent(4), '');
			assert.strictEqual(model.getLineContent(5), '    }');

			moveTo(editor, viewModel, 4, 1);
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), '    if (a) {');
			assert.strictEqual(model.getLineContent(2), '        ');
			assert.strictEqual(model.getLineContent(3), '');
			assert.strictEqual(model.getLineContent(4), '    ');
			assert.strictEqual(model.getLineContent(5), '    }');

			moveTo(editor, viewModel, 5, model.getLineMaxColumn(5));
			viewModel.type('something', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '    if (a) {');
			assert.strictEqual(model.getLineContent(2), '        ');
			assert.strictEqual(model.getLineContent(3), '');
			assert.strictEqual(model.getLineContent(4), '');
			assert.strictEqual(model.getLineContent(5), '    }something');
		});

		registration.dispose();
	});

	test('removeAutoWhitespace on: test 1', () => {
		const model = createTextModel(
			[
				'    some  line abc  '
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {

			// Move cursor to the end, verify that we do not trim whitespaces if line has values
			moveTo(editor, viewModel, 1, model.getLineContent(1).length + 1);
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '    some  line abc  ');
			assert.strictEqual(model.getLineContent(2), '    ');

			// Try to enter again, we should trimmed previous line
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '    some  line abc  ');
			assert.strictEqual(model.getLineContent(2), '');
			assert.strictEqual(model.getLineContent(3), '    ');

			// More whitespaces
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), '    some  line abc  ');
			assert.strictEqual(model.getLineContent(2), '');
			assert.strictEqual(model.getLineContent(3), '        ');

			// Enter and verify that trimmed again
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '    some  line abc  ');
			assert.strictEqual(model.getLineContent(2), '');
			assert.strictEqual(model.getLineContent(3), '');
			assert.strictEqual(model.getLineContent(4), '        ');

			// Trimmed if we will keep only text
			moveTo(editor, viewModel, 1, 5);
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '    ');
			assert.strictEqual(model.getLineContent(2), '    some  line abc  ');
			assert.strictEqual(model.getLineContent(3), '');
			assert.strictEqual(model.getLineContent(4), '');
			assert.strictEqual(model.getLineContent(5), '');

			// Trimmed if we will keep only text by selection
			moveTo(editor, viewModel, 2, 5);
			moveTo(editor, viewModel, 3, 1, true);
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '    ');
			assert.strictEqual(model.getLineContent(2), '    ');
			assert.strictEqual(model.getLineContent(3), '    ');
			assert.strictEqual(model.getLineContent(4), '');
			assert.strictEqual(model.getLineContent(5), '');
		});
	});

	test('issue #15118: remove auto whitespace when pasting entire line', () => {
		const model = createTextModel(
			[
				'    function f() {',
				'        // I\'m gonna copy this line',
				'        return 3;',
				'    }',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {

			moveTo(editor, viewModel, 3, model.getLineMaxColumn(3));
			viewModel.type('\n', 'keyboard');

			assert.strictEqual(model.getValue(), [
				'    function f() {',
				'        // I\'m gonna copy this line',
				'        return 3;',
				'        ',
				'    }',
			].join('\n'));
			assertCursor(viewModel, new Position(4, model.getLineMaxColumn(4)));

			viewModel.paste('        // I\'m gonna copy this line\n', true);
			assert.strictEqual(model.getValue(), [
				'    function f() {',
				'        // I\'m gonna copy this line',
				'        return 3;',
				'        // I\'m gonna copy this line',
				'',
				'    }',
			].join('\n'));
			assertCursor(viewModel, new Position(5, 1));
		});
	});

	test('issue #40695: maintain cursor position when copying lines using ctrl+c, ctrl+v', () => {
		const model = createTextModel(
			[
				'    function f() {',
				'        // I\'m gonna copy this line',
				'        // Another line',
				'        return 3;',
				'    }',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {

			editor.setSelections([new Selection(4, 10, 4, 10)]);
			viewModel.paste('        // I\'m gonna copy this line\n', true);

			assert.strictEqual(model.getValue(), [
				'    function f() {',
				'        // I\'m gonna copy this line',
				'        // Another line',
				'        // I\'m gonna copy this line',
				'        return 3;',
				'    }',
			].join('\n'));
			assertCursor(viewModel, new Position(5, 10));
		});
	});

	test('UseTabStops is off', () => {
		const model = createTextModel(
			[
				'    x',
				'        a    ',
				'    '
			].join('\n')
		);

		withTestCodeEditor(model, { useTabStops: false }, (editor, viewModel) => {
			// DeleteLeft removes just one whitespace
			moveTo(editor, viewModel, 2, 9);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), '       a    ');
		});
	});

	test('Backspace removes whitespaces with tab size', () => {
		const model = createTextModel(
			[
				' \t \t     x',
				'        a    ',
				'    '
			].join('\n')
		);

		withTestCodeEditor(model, { useTabStops: true }, (editor, viewModel) => {
			// DeleteLeft does not remove tab size, because some text exists before
			moveTo(editor, viewModel, 2, model.getLineContent(2).length + 1);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), '        a   ');

			// DeleteLeft removes tab size = 4
			moveTo(editor, viewModel, 2, 9);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), '    a   ');

			// DeleteLeft removes tab size = 4
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'a   ');

			// Undo DeleteLeft - get us back to original indentation
			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), '        a   ');

			// Nothing is broken when cursor is in (1,1)
			moveTo(editor, viewModel, 1, 1);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), ' \t \t     x');

			// DeleteLeft stops at tab stops even in mixed whitespace case
			moveTo(editor, viewModel, 1, 10);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), ' \t \t    x');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), ' \t \tx');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), ' \tx');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'x');

			// DeleteLeft on last line
			moveTo(editor, viewModel, 3, model.getLineContent(3).length + 1);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(3), '');

			// DeleteLeft with removing new line symbol
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'x\n        a   ');

			// In case of selection DeleteLeft only deletes selected text
			moveTo(editor, viewModel, 2, 3);
			moveTo(editor, viewModel, 2, 4, true);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), '       a   ');
		});
	});

	test('PR #5423: Auto indent + undo + redo is funky', () => {
		const model = createTextModel(
			[
				''
			].join('\n'),
			undefined,
			{
				insertSpaces: false,
			}
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n', 'assert1');

			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\t', 'assert2');

			viewModel.type('y', 'keyboard');
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\ty', 'assert2');

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\ty\n\t', 'assert3');

			viewModel.type('x');
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\ty\n\tx', 'assert4');

			CoreNavigationCommands.CursorLeft.runCoreEditorCommand(viewModel, {});
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\ty\n\tx', 'assert5');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\ty\nx', 'assert6');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\tyx', 'assert7');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\tx', 'assert8');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\nx', 'assert9');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'x', 'assert10');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\nx', 'assert11');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\ty\nx', 'assert12');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\ty\n\tx', 'assert13');

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\n\ty\nx', 'assert14');

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '\nx', 'assert15');

			CoreEditingCommands.Redo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'x', 'assert16');
		});
	});

	test('issue #90973: Undo brings back model alternative version', () => {
		const model = createTextModel(
			[
				''
			].join('\n'),
			undefined,
			{
				insertSpaces: false,
			}
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			const beforeVersion = model.getVersionId();
			const beforeAltVersion = model.getAlternativeVersionId();
			viewModel.type('Hello', 'keyboard');
			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			const afterVersion = model.getVersionId();
			const afterAltVersion = model.getAlternativeVersionId();

			assert.notStrictEqual(beforeVersion, afterVersion);
			assert.strictEqual(beforeAltVersion, afterAltVersion);
		});
	});

	test('Enter honors increaseIndentPattern', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {'
			],
			languageId: indentRulesLanguageId,
			modelOpts: { insertSpaces: false },
			editorOpts: { autoIndent: 'full' }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 12, false);
			assertCursor(viewModel, new Selection(1, 12, 1, 12));

			viewModel.type('\n', 'keyboard');
			model.tokenization.forceTokenization(model.getLineCount());
			assertCursor(viewModel, new Selection(2, 2, 2, 2));

			moveTo(editor, viewModel, 3, 13, false);
			assertCursor(viewModel, new Selection(3, 13, 3, 13));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 3, 4, 3));
		});
	});

	test('Type honors decreaseIndentPattern', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\t'
			],
			languageId: indentRulesLanguageId,
			editorOpts: { autoIndent: 'full' }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 2, false);
			assertCursor(viewModel, new Selection(2, 2, 2, 2));

			viewModel.type('}', 'keyboard');
			assertCursor(viewModel, new Selection(2, 2, 2, 2));
			assert.strictEqual(model.getLineContent(2), '}', '001');
		});
	});

	test('Enter honors unIndentedLinePattern', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\t\t\treturn true'
			],
			languageId: indentRulesLanguageId,
			modelOpts: { insertSpaces: false },
			editorOpts: { autoIndent: 'full' }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 15, false);
			assertCursor(viewModel, new Selection(2, 15, 2, 15));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(3, 2, 3, 2));
		});
	});

	test('Enter honors indentNextLinePattern', () => {
		usingCursor({
			text: [
				'if (true)',
				'\treturn true;',
				'if (true)',
				'\t\t\t\treturn true'
			],
			languageId: indentRulesLanguageId,
			modelOpts: { insertSpaces: false },
			editorOpts: { autoIndent: 'full' }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 14, false);
			assertCursor(viewModel, new Selection(2, 14, 2, 14));

			viewModel.type('\n', 'keyboard');
			model.tokenization.forceTokenization(model.getLineCount());
			assertCursor(viewModel, new Selection(3, 1, 3, 1));

			moveTo(editor, viewModel, 5, 16, false);
			assertCursor(viewModel, new Selection(5, 16, 5, 16));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(6, 2, 6, 2));
		});
	});

	test('Enter honors indentNextLinePattern 2', () => {
		const model = createTextModel(
			[
				'if (true)',
				'\tif (true)'
			].join('\n'),
			indentRulesLanguageId,
			{
				insertSpaces: false,
			}
		);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel) => {
			moveTo(editor, viewModel, 2, 11, false);
			assertCursor(viewModel, new Selection(2, 11, 2, 11));

			viewModel.type('\n', 'keyboard');
			model.tokenization.forceTokenization(model.getLineCount());
			assertCursor(viewModel, new Selection(3, 3, 3, 3));

			viewModel.type('console.log();', 'keyboard');
			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 1, 4, 1));
		});
	});

	test('Enter honors intential indent', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {',
				'return true;',
				'}}'
			],
			languageId: indentRulesLanguageId,
			editorOpts: { autoIndent: 'full' }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 13, false);
			assertCursor(viewModel, new Selection(3, 13, 3, 13));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 1, 4, 1));
			assert.strictEqual(model.getLineContent(3), 'return true;', '001');
		});
	});

	test('Enter supports selection 1', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {',
				'\t\treturn true;',
				'\t}a}'
			],
			languageId: indentRulesLanguageId,
			modelOpts: { insertSpaces: false }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 4, 3, false);
			moveTo(editor, viewModel, 4, 4, true);
			assertCursor(viewModel, new Selection(4, 3, 4, 4));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(5, 1, 5, 1));
			assert.strictEqual(model.getLineContent(4), '\t}', '001');
		});
	});

	test('Enter supports selection 2', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {'
			],
			languageId: indentRulesLanguageId,
			modelOpts: { insertSpaces: false }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 12, false);
			moveTo(editor, viewModel, 2, 13, true);
			assertCursor(viewModel, new Selection(2, 12, 2, 13));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(3, 3, 3, 3));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 3, 4, 3));
		});
	});

	test('Enter honors tabSize and insertSpaces 1', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {'
			],
			languageId: indentRulesLanguageId,
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 12, false);
			assertCursor(viewModel, new Selection(1, 12, 1, 12));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(2, 5, 2, 5));

			model.tokenization.forceTokenization(model.getLineCount());

			moveTo(editor, viewModel, 3, 13, false);
			assertCursor(viewModel, new Selection(3, 13, 3, 13));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 9, 4, 9));
		});
	});

	test('Enter honors tabSize and insertSpaces 2', () => {
		usingCursor({
			text: [
				'if (true) {',
				'    if (true) {'
			],
			languageId: indentRulesLanguageId,
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 12, false);
			assertCursor(viewModel, new Selection(1, 12, 1, 12));

			viewModel.type('\n', 'keyboard');
			model.tokenization.forceTokenization(model.getLineCount());
			assertCursor(viewModel, new Selection(2, 5, 2, 5));

			moveTo(editor, viewModel, 3, 16, false);
			assertCursor(viewModel, new Selection(3, 16, 3, 16));

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(3), '    if (true) {');
			assertCursor(viewModel, new Selection(4, 9, 4, 9));
		});
	});

	test('Enter honors tabSize and insertSpaces 3', () => {
		usingCursor({
			text: [
				'if (true) {',
				'    if (true) {'
			],
			languageId: indentRulesLanguageId,
			modelOpts: { insertSpaces: false }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 12, false);
			assertCursor(viewModel, new Selection(1, 12, 1, 12));

			viewModel.type('\n', 'keyboard');
			model.tokenization.forceTokenization(model.getLineCount());
			assertCursor(viewModel, new Selection(2, 2, 2, 2));

			moveTo(editor, viewModel, 3, 16, false);
			assertCursor(viewModel, new Selection(3, 16, 3, 16));

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(3), '    if (true) {');
			assertCursor(viewModel, new Selection(4, 3, 4, 3));
		});
	});

	test('Enter supports intentional indentation', () => {
		usingCursor({
			text: [
				'\tif (true) {',
				'\t\tswitch(true) {',
				'\t\t\tcase true:',
				'\t\t\t\tbreak;',
				'\t\t}',
				'\t}'
			],
			languageId: indentRulesLanguageId,
			modelOpts: { insertSpaces: false },
			editorOpts: { autoIndent: 'full' }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 5, 4, false);
			assertCursor(viewModel, new Selection(5, 4, 5, 4));

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(5), '\t\t}');
			assertCursor(viewModel, new Selection(6, 3, 6, 3));
		});
	});

	test('Enter should not adjust cursor position when press enter in the middle of a line 1', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {',
				'\t\treturn true;',
				'\t}a}'
			],
			languageId: indentRulesLanguageId,
			modelOpts: { insertSpaces: false }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 9, false);
			assertCursor(viewModel, new Selection(3, 9, 3, 9));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 3, 4, 3));
			assert.strictEqual(model.getLineContent(4), '\t\t true;', '001');
		});
	});

	test('Enter should not adjust cursor position when press enter in the middle of a line 2', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {',
				'\t\treturn true;',
				'\t}a}'
			],
			languageId: indentRulesLanguageId,
			modelOpts: { insertSpaces: false }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 3, false);
			assertCursor(viewModel, new Selection(3, 3, 3, 3));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 3, 4, 3));
			assert.strictEqual(model.getLineContent(4), '\t\treturn true;', '001');
		});
	});

	test('Enter should not adjust cursor position when press enter in the middle of a line 3', () => {
		usingCursor({
			text: [
				'if (true) {',
				'  if (true) {',
				'    return true;',
				'  }a}'
			],
			languageId: indentRulesLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 11, false);
			assertCursor(viewModel, new Selection(3, 11, 3, 11));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 5, 4, 5));
			assert.strictEqual(model.getLineContent(4), '     true;', '001');
		});
	});

	test('Enter should adjust cursor position when press enter in the middle of leading whitespaces 1', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {',
				'\t\treturn true;',
				'\t}a}'
			],
			languageId: indentRulesLanguageId,
			modelOpts: { insertSpaces: false }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 2, false);
			assertCursor(viewModel, new Selection(3, 2, 3, 2));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 2, 4, 2));
			assert.strictEqual(model.getLineContent(4), '\t\treturn true;', '001');

			moveTo(editor, viewModel, 4, 1, false);
			assertCursor(viewModel, new Selection(4, 1, 4, 1));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(5, 1, 5, 1));
			assert.strictEqual(model.getLineContent(5), '\t\treturn true;', '002');
		});
	});

	test('Enter should adjust cursor position when press enter in the middle of leading whitespaces 2', () => {
		usingCursor({
			text: [
				'\tif (true) {',
				'\t\tif (true) {',
				'\t    \treturn true;',
				'\t\t}a}'
			],
			languageId: indentRulesLanguageId,
			modelOpts: { insertSpaces: false }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 4, false);
			assertCursor(viewModel, new Selection(3, 4, 3, 4));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 3, 4, 3));
			assert.strictEqual(model.getLineContent(4), '\t\t\treturn true;', '001');

			moveTo(editor, viewModel, 4, 1, false);
			assertCursor(viewModel, new Selection(4, 1, 4, 1));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(5, 1, 5, 1));
			assert.strictEqual(model.getLineContent(5), '\t\t\treturn true;', '002');
		});
	});

	test('Enter should adjust cursor position when press enter in the middle of leading whitespaces 3', () => {
		usingCursor({
			text: [
				'if (true) {',
				'  if (true) {',
				'    return true;',
				'}a}'
			],
			languageId: indentRulesLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 2, false);
			assertCursor(viewModel, new Selection(3, 2, 3, 2));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 2, 4, 2));
			assert.strictEqual(model.getLineContent(4), '    return true;', '001');

			moveTo(editor, viewModel, 4, 3, false);
			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(5, 3, 5, 3));
			assert.strictEqual(model.getLineContent(5), '    return true;', '002');
		});
	});

	test('Enter should adjust cursor position when press enter in the middle of leading whitespaces 4', () => {
		usingCursor({
			text: [
				'if (true) {',
				'  if (true) {',
				'\t  return true;',
				'}a}',
				'',
				'if (true) {',
				'  if (true) {',
				'\t  return true;',
				'}a}'
			],
			languageId: indentRulesLanguageId,
			modelOpts: {
				tabSize: 2,
				indentSize: 2
			}
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 3, false);
			assertCursor(viewModel, new Selection(3, 3, 3, 3));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 4, 4, 4));
			assert.strictEqual(model.getLineContent(4), '    return true;', '001');

			moveTo(editor, viewModel, 9, 4, false);
			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(10, 5, 10, 5));
			assert.strictEqual(model.getLineContent(10), '    return true;', '001');
		});
	});

	test('Enter should adjust cursor position when press enter in the middle of leading whitespaces 5', () => {
		usingCursor({
			text: [
				'if (true) {',
				'  if (true) {',
				'    return true;',
				'    return true;',
				''
			],
			languageId: indentRulesLanguageId,
			modelOpts: { tabSize: 2 }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 5, false);
			moveTo(editor, viewModel, 4, 3, true);
			assertCursor(viewModel, new Selection(3, 5, 4, 3));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 3, 4, 3));
			assert.strictEqual(model.getLineContent(4), '    return true;', '001');
		});
	});

	test('issue microsoft/monaco-editor#108 part 1/2: Auto indentation on Enter with selection is half broken', () => {
		usingCursor({
			text: [
				'function baz() {',
				'\tvar x = 1;',
				'\t\t\t\t\t\t\treturn x;',
				'}'
			],
			modelOpts: {
				insertSpaces: false,
			},
			languageId: indentRulesLanguageId,
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 8, false);
			moveTo(editor, viewModel, 2, 12, true);
			assertCursor(viewModel, new Selection(3, 8, 2, 12));

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(3), '\treturn x;');
			assertCursor(viewModel, new Position(3, 2));
		});
	});

	test('issue microsoft/monaco-editor#108 part 2/2: Auto indentation on Enter with selection is half broken', () => {
		usingCursor({
			text: [
				'function baz() {',
				'\tvar x = 1;',
				'\t\t\t\t\t\t\treturn x;',
				'}'
			],
			modelOpts: {
				insertSpaces: false,
			},
			languageId: indentRulesLanguageId,
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 12, false);
			moveTo(editor, viewModel, 3, 8, true);
			assertCursor(viewModel, new Selection(2, 12, 3, 8));

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(3), '\treturn x;');
			assertCursor(viewModel, new Position(3, 2));
		});
	});

	test('onEnter works if there are no indentation rules', () => {
		usingCursor({
			text: [
				'<?',
				'\tif (true) {',
				'\t\techo $hi;',
				'\t\techo $bye;',
				'\t}',
				'?>'
			],
			modelOpts: { insertSpaces: false }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 5, 3, false);
			assertCursor(viewModel, new Selection(5, 3, 5, 3));

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getLineContent(6), '\t');
			assertCursor(viewModel, new Selection(6, 2, 6, 2));
			assert.strictEqual(model.getLineContent(5), '\t}');
		});
	});

	test('onEnter works if there are no indentation rules 2', () => {
		usingCursor({
			text: [
				'	if (5)',
				'		return 5;',
				'	'
			],
			modelOpts: { insertSpaces: false }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 2, false);
			assertCursor(viewModel, new Selection(3, 2, 3, 2));

			viewModel.type('\n', 'keyboard');
			assertCursor(viewModel, new Selection(4, 2, 4, 2));
			assert.strictEqual(model.getLineContent(4), '\t');
		});
	});

	test('bug #16543: Tab should indent to correct indentation spot immediately', () => {
		const model = createTextModel(
			[
				'function baz() {',
				'\tfunction hello() { // something here',
				'\t',
				'',
				'\t}',
				'}'
			].join('\n'),
			indentRulesLanguageId,
			{
				insertSpaces: false,
			}
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 4, 1, false);
			assertCursor(viewModel, new Selection(4, 1, 4, 1));

			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(4), '\t\t');
		});
	});


	test('bug #2938 (1): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)', () => {
		const model = createTextModel(
			[
				'\tfunction baz() {',
				'\t\tfunction hello() { // something here',
				'\t\t',
				'\t',
				'\t\t}',
				'\t}'
			].join('\n'),
			indentRulesLanguageId,
			{
				insertSpaces: false,
			}
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 4, 2, false);
			assertCursor(viewModel, new Selection(4, 2, 4, 2));

			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(4), '\t\t\t');
		});
	});


	test('bug #2938 (2): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)', () => {
		const model = createTextModel(
			[
				'\tfunction baz() {',
				'\t\tfunction hello() { // something here',
				'\t\t',
				'    ',
				'\t\t}',
				'\t}'
			].join('\n'),
			indentRulesLanguageId,
			{
				insertSpaces: false,
			}
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 4, 1, false);
			assertCursor(viewModel, new Selection(4, 1, 4, 1));

			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(4), '\t\t\t');
		});
	});

	test('bug #2938 (3): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)', () => {
		const model = createTextModel(
			[
				'\tfunction baz() {',
				'\t\tfunction hello() { // something here',
				'\t\t',
				'\t\t\t',
				'\t\t}',
				'\t}'
			].join('\n'),
			indentRulesLanguageId,
			{
				insertSpaces: false,
			}
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 4, 3, false);
			assertCursor(viewModel, new Selection(4, 3, 4, 3));

			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(4), '\t\t\t\t');
		});
	});

	test('bug #2938 (4): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)', () => {
		const model = createTextModel(
			[
				'\tfunction baz() {',
				'\t\tfunction hello() { // something here',
				'\t\t',
				'\t\t\t\t',
				'\t\t}',
				'\t}'
			].join('\n'),
			indentRulesLanguageId,
			{
				insertSpaces: false,
			}
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			moveTo(editor, viewModel, 4, 4, false);
			assertCursor(viewModel, new Selection(4, 4, 4, 4));

			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(4), '\t\t\t\t\t');
		});
	});

	test('bug #31015: When pressing Tab on lines and Enter rules are avail, indent straight to the right spotTab', () => {
		const onEnterLanguageId = setupOnEnterLanguage(IndentAction.Indent);
		const model = createTextModel(
			[
				'    if (a) {',
				'        ',
				'',
				'',
				'    }'
			].join('\n'),
			onEnterLanguageId
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {

			moveTo(editor, viewModel, 3, 1);
			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), '    if (a) {');
			assert.strictEqual(model.getLineContent(2), '        ');
			assert.strictEqual(model.getLineContent(3), '        ');
			assert.strictEqual(model.getLineContent(4), '');
			assert.strictEqual(model.getLineContent(5), '    }');
		});
	});

	test('type honors indentation rules: ruby keywords', () => {
		const rubyLanguageId = setupIndentRulesLanguage('ruby', {
			increaseIndentPattern: /^\s*((begin|class|def|else|elsif|ensure|for|if|module|rescue|unless|until|when|while)|(.*\sdo\b))\b[^\{;]*$/,
			decreaseIndentPattern: /^\s*([}\]]([,)]?\s*(#|$)|\.[a-zA-Z_]\w*\b)|(end|rescue|ensure|else|elsif|when)\b)/
		});
		const model = createTextModel(
			[
				'class Greeter',
				'  def initialize(name)',
				'    @name = name',
				'    en'
			].join('\n'),
			rubyLanguageId
		);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel) => {
			moveTo(editor, viewModel, 4, 7, false);
			assertCursor(viewModel, new Selection(4, 7, 4, 7));

			viewModel.type('d', 'keyboard');
			assert.strictEqual(model.getLineContent(4), '  end');
		});
	});

	test('Auto indent on type: increaseIndentPattern has higher priority than decreaseIndent when inheriting', () => {
		usingCursor({
			text: [
				'\tif (true) {',
				'\t\tconsole.log();',
				'\t} else if {',
				'\t\tconsole.log()',
				'\t}'
			],
			languageId: indentRulesLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 5, 3, false);
			assertCursor(viewModel, new Selection(5, 3, 5, 3));

			viewModel.type('e', 'keyboard');
			assertCursor(viewModel, new Selection(5, 4, 5, 4));
			assert.strictEqual(model.getLineContent(5), '\t}e', 'This line should not decrease indent');
		});
	});

	test('type honors users indentation adjustment', () => {
		usingCursor({
			text: [
				'\tif (true ||',
				'\t ) {',
				'\t}',
				'if (true ||',
				') {',
				'}'
			],
			languageId: indentRulesLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 3, false);
			assertCursor(viewModel, new Selection(2, 3, 2, 3));

			viewModel.type(' ', 'keyboard');
			assertCursor(viewModel, new Selection(2, 4, 2, 4));
			assert.strictEqual(model.getLineContent(2), '\t  ) {', 'This line should not decrease indent');
		});
	});

	test('bug 29972: if a line is line comment, open bracket should not indent next line', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\t// {',
				'\t\t'
			],
			languageId: indentRulesLanguageId,
			editorOpts: { autoIndent: 'full' }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 3, false);
			assertCursor(viewModel, new Selection(3, 3, 3, 3));

			viewModel.type('}', 'keyboard');
			assertCursor(viewModel, new Selection(3, 2, 3, 2));
			assert.strictEqual(model.getLineContent(3), '}');
		});
	});

	test('issue #36090: JS: editor.autoIndent seems to be broken', () => {
		const languageId = 'jsMode';

		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			],
			indentationRules: {
				// ^(.*\*/)?\s*\}.*$
				decreaseIndentPattern: /^((?!.*?\/\*).*\*\/)?\s*[\}\]\)].*$/,
				// ^.*\{[^}"']*$
				increaseIndentPattern: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/
			},
			onEnterRules: javascriptOnEnterRules
		}));

		const model = createTextModel(
			[
				'class ItemCtrl {',
				'    getPropertiesByItemId(id) {',
				'        return this.fetchItem(id)',
				'            .then(item => {',
				'                return this.getPropertiesOfItem(item);',
				'            });',
				'    }',
				'}',
			].join('\n'),
			languageId
		);

		withTestCodeEditor(model, { autoIndent: 'advanced' }, (editor, viewModel) => {
			moveTo(editor, viewModel, 7, 6, false);
			assertCursor(viewModel, new Selection(7, 6, 7, 6));

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(),
				[
					'class ItemCtrl {',
					'    getPropertiesByItemId(id) {',
					'        return this.fetchItem(id)',
					'            .then(item => {',
					'                return this.getPropertiesOfItem(item);',
					'            });',
					'    }',
					'    ',
					'}',
				].join('\n')
			);
			assertCursor(viewModel, new Selection(8, 5, 8, 5));
		});
	});

	test('issue #115304: OnEnter broken for TS', () => {
		const languageId = 'jsMode';

		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			onEnterRules: javascriptOnEnterRules
		}));

		const model = createTextModel(
			[
				'/** */',
				'function f() {}',
			].join('\n'),
			languageId
		);

		withTestCodeEditor(model, { autoIndent: 'advanced' }, (editor, viewModel) => {
			moveTo(editor, viewModel, 1, 4, false);
			assertCursor(viewModel, new Selection(1, 4, 1, 4));

			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(),
				[
					'/**',
					' * ',
					' */',
					'function f() {}',
				].join('\n')
			);
			assertCursor(viewModel, new Selection(2, 4, 2, 4));
		});
	});

	test('issue #38261: TAB key results in bizarre indentation in C++ mode ', () => {
		const languageId = 'indentRulesMode';

		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			],
			indentationRules: {
				increaseIndentPattern: new RegExp("(^.*\\{[^}]*$)"),
				decreaseIndentPattern: new RegExp("^\\s*\\}")
			}
		}));

		const model = createTextModel(
			[
				'int main() {',
				'  return 0;',
				'}',
				'',
				'bool Foo::bar(const string &a,',
				'              const string &b) {',
				'  foo();',
				'',
				')',
			].join('\n'),
			languageId,
			{
				tabSize: 2,
				indentSize: 2
			}
		);

		withTestCodeEditor(model, { autoIndent: 'advanced' }, (editor, viewModel) => {
			moveTo(editor, viewModel, 8, 1, false);
			assertCursor(viewModel, new Selection(8, 1, 8, 1));

			CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(),
				[
					'int main() {',
					'  return 0;',
					'}',
					'',
					'bool Foo::bar(const string &a,',
					'              const string &b) {',
					'  foo();',
					'  ',
					')',
				].join('\n')
			);
			assert.deepStrictEqual(viewModel.getSelection(), new Selection(8, 3, 8, 3));
		});
	});

	test('issue #57197: indent rules regex should be stateless', () => {
		const languageId = setupIndentRulesLanguage('lang', {
			decreaseIndentPattern: /^\s*}$/gm,
			increaseIndentPattern: /^(?![^\S\n]*(?!--|––|——)(?:[-❍❑■⬜□☐▪▫–—≡→›✘xX✔✓☑+]|\[[ xX+-]?\])\s[^\n]*)[^\S\n]*(.+:)[^\S\n]*(?:(?=@[^\s*~(]+(?::\/\/[^\s*~(:]+)?(?:\([^)]*\))?)|$)/gm,
		});
		usingCursor({
			text: [
				'Project:',
			],
			languageId: languageId,
			modelOpts: { insertSpaces: false },
			editorOpts: { autoIndent: 'full' }
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 9, false);
			assertCursor(viewModel, new Selection(1, 9, 1, 9));

			viewModel.type('\n', 'keyboard');
			model.tokenization.forceTokenization(model.getLineCount());
			assertCursor(viewModel, new Selection(2, 2, 2, 2));

			moveTo(editor, viewModel, 1, 9, false);
			assertCursor(viewModel, new Selection(1, 9, 1, 9));
			viewModel.type('\n', 'keyboard');
			model.tokenization.forceTokenization(model.getLineCount());
			assertCursor(viewModel, new Selection(2, 2, 2, 2));
		});
	});

	test('typing in json', () => {
		const languageId = 'indentRulesMode';

		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			],
			indentationRules: {
				increaseIndentPattern: new RegExp("({+(?=([^\"]*\"[^\"]*\")*[^\"}]*$))|(\\[+(?=([^\"]*\"[^\"]*\")*[^\"\\]]*$))"),
				decreaseIndentPattern: new RegExp("^\\s*[}\\]],?\\s*$")
			}
		}));

		const model = createTextModel(
			[
				'{',
				'  "scripts: {"',
				'    "watch": "a {"',
				'    "build{": "b"',
				'    "tasks": []',
				'    "tasks": ["a"]',
				'  "}"',
				'"}"'
			].join('\n'),
			languageId,
			{
				tabSize: 2,
				indentSize: 2
			}
		);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel) => {
			moveTo(editor, viewModel, 3, 19, false);
			assertCursor(viewModel, new Selection(3, 19, 3, 19));

			viewModel.type('\n', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(4), '    ');

			moveTo(editor, viewModel, 5, 18, false);
			assertCursor(viewModel, new Selection(5, 18, 5, 18));

			viewModel.type('\n', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(6), '    ');

			moveTo(editor, viewModel, 7, 15, false);
			assertCursor(viewModel, new Selection(7, 15, 7, 15));

			viewModel.type('\n', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(8), '      ');
			assert.deepStrictEqual(model.getLineContent(9), '    ]');

			moveTo(editor, viewModel, 10, 18, false);
			assertCursor(viewModel, new Selection(10, 18, 10, 18));

			viewModel.type('\n', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(11), '    ]');
		});
	});

	test('issue #111128: Multicursor `Enter` issue with indentation', () => {
		const model = createTextModel('    let a, b, c;', indentRulesLanguageId, { detectIndentation: false, insertSpaces: false, tabSize: 4 });
		withTestCodeEditor(model, {}, (editor, viewModel) => {
			editor.setSelections([
				new Selection(1, 11, 1, 11),
				new Selection(1, 14, 1, 14),
			]);
			viewModel.type('\n', 'keyboard');
			assert.strictEqual(model.getValue(), '    let a,\n\t b,\n\t c;');
		});
	});

	test('issue #122714: tabSize=1 prevent typing a string matching decreaseIndentPattern in an empty file', () => {
		const latextLanguageId = setupIndentRulesLanguage('latex', {
			increaseIndentPattern: new RegExp('\\\\begin{(?!document)([^}]*)}(?!.*\\\\end{\\1})'),
			decreaseIndentPattern: new RegExp('^\\s*\\\\end{(?!document)')
		});
		const model = createTextModel(
			'\\end',
			latextLanguageId,
			{ tabSize: 1 }
		);

		withTestCodeEditor(model, { autoIndent: 'full' }, (editor, viewModel) => {
			moveTo(editor, viewModel, 1, 5, false);
			assertCursor(viewModel, new Selection(1, 5, 1, 5));

			viewModel.type('{', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '\\end{}');
		});
	});

	test('ElectricCharacter - does nothing if no electric char', () => {
		usingCursor({
			text: [
				'  if (a) {',
				''
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 1);
			viewModel.type('*', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(2), '*');
		});
	});

	test('ElectricCharacter - indents in order to match bracket', () => {
		usingCursor({
			text: [
				'  if (a) {',
				''
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 1);
			viewModel.type('}', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(2), '  }');
		});
	});

	test('ElectricCharacter - unindents in order to match bracket', () => {
		usingCursor({
			text: [
				'  if (a) {',
				'    '
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 5);
			viewModel.type('}', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(2), '  }');
		});
	});

	test('ElectricCharacter - matches with correct bracket', () => {
		usingCursor({
			text: [
				'  if (a) {',
				'    if (b) {',
				'    }',
				'    '
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 4, 1);
			viewModel.type('}', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(4), '  }    ');
		});
	});

	test('ElectricCharacter - does nothing if bracket does not match', () => {
		usingCursor({
			text: [
				'  if (a) {',
				'    if (b) {',
				'    }',
				'  }  '
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 4, 6);
			viewModel.type('}', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(4), '  }  }');
		});
	});

	test('ElectricCharacter - matches bracket even in line with content', () => {
		usingCursor({
			text: [
				'  if (a) {',
				'// hello'
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 1);
			viewModel.type('}', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(2), '  }// hello');
		});
	});

	test('ElectricCharacter - is no-op if bracket is lined up', () => {
		usingCursor({
			text: [
				'  if (a) {',
				'  '
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 3);
			viewModel.type('}', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(2), '  }');
		});
	});

	test('ElectricCharacter - is no-op if there is non-whitespace text before', () => {
		usingCursor({
			text: [
				'  if (a) {',
				'a'
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 2);
			viewModel.type('}', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(2), 'a}');
		});
	});

	test('ElectricCharacter - is no-op if pairs are all matched before', () => {
		usingCursor({
			text: [
				'foo(() => {',
				'  ( 1 + 2 ) ',
				'})'
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 13);
			viewModel.type('*', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(2), '  ( 1 + 2 ) *');
		});
	});

	test('ElectricCharacter - is no-op if matching bracket is on the same line', () => {
		usingCursor({
			text: [
				'(div',
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 1, 5);
			let changeText: string | null = null;
			model.onDidChangeContent(e => {
				changeText = e.changes[0].text;
			});
			viewModel.type(')', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(1), '(div)');
			assert.deepStrictEqual(changeText, ')');
		});
	});

	test('ElectricCharacter - is no-op if the line has other content', () => {
		usingCursor({
			text: [
				'Math.max(',
				'\t2',
				'\t3'
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 3, 3);
			viewModel.type(')', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(3), '\t3)');
		});
	});

	test('ElectricCharacter - appends text', () => {
		usingCursor({
			text: [
				'  if (a) {',
				'/*'
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 3);
			viewModel.type('*', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(2), '/** */');
		});
	});

	test('ElectricCharacter - appends text 2', () => {
		usingCursor({
			text: [
				'  if (a) {',
				'  /*'
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 5);
			viewModel.type('*', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(2), '  /** */');
		});
	});

	test('ElectricCharacter - issue #23711: Replacing selected text with )]} fails to delete old text with backwards-dragged selection', () => {
		usingCursor({
			text: [
				'{',
				'word'
			],
			languageId: electricCharLanguageId
		}, (editor, model, viewModel) => {
			moveTo(editor, viewModel, 2, 5);
			moveTo(editor, viewModel, 2, 1, true);
			viewModel.type('}', 'keyboard');
			assert.deepStrictEqual(model.getLineContent(2), '}');
		});
	});

	test('issue #61070: backtick (`) should auto-close after a word character', () => {
		usingCursor({
			text: ['const markup = highlight'],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			model.tokenization.forceTokenization(1);
			assertType(editor, model, viewModel, 1, 25, '`', '``', `auto closes \` @ (1, 25)`);
		});
	});

	test('issue #132912: quotes should not auto-close if they are closing a string', () => {
		setupAutoClosingLanguageTokenization();
		const model = createTextModel('const t2 = `something ${t1}', autoClosingLanguageId);
		withTestCodeEditor(
			model,
			{},
			(editor, viewModel) => {
				const model = viewModel.model;
				model.tokenization.forceTokenization(1);
				assertType(editor, model, viewModel, 1, 28, '`', '`', `does not auto close \` @ (1, 28)`);
			}
		);
	});

	test('autoClosingPairs - open parens: default', () => {
		usingCursor({
			text: [
				'var a = [];',
				'var b = `asd`;',
				'var c = \'asd\';',
				'var d = "asd";',
				'var e = /*3*/	3;',
				'var f = /** 3 */3;',
				'var g = (3+5);',
				'var h = { a: \'value\' };',
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {

			const autoClosePositions = [
				'var| a| |=| [|]|;|',
				'var| b| |=| |`asd|`|;|',
				'var| c| |=| |\'asd|\'|;|',
				'var| d| |=| |"asd|"|;|',
				'var| e| |=| /*3*/|	3|;|',
				'var| f| |=| /**| 3| */3|;|',
				'var| g| |=| (3+5|)|;|',
				'var| h| |=| {| a|:| |\'value|\'| |}|;|',
			];
			for (let i = 0, len = autoClosePositions.length; i < len; i++) {
				const lineNumber = i + 1;
				const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);

				for (let column = 1; column < autoCloseColumns.length; column++) {
					model.tokenization.forceTokenization(lineNumber);
					if (autoCloseColumns[column] === AutoClosingColumnType.Special1) {
						assertType(editor, model, viewModel, lineNumber, column, '(', '()', `auto closes @ (${lineNumber}, ${column})`);
					} else {
						assertType(editor, model, viewModel, lineNumber, column, '(', '(', `does not auto close @ (${lineNumber}, ${column})`);
					}
				}
			}
		});
	});

	test('autoClosingPairs - open parens: whitespace', () => {
		usingCursor({
			text: [
				'var a = [];',
				'var b = `asd`;',
				'var c = \'asd\';',
				'var d = "asd";',
				'var e = /*3*/	3;',
				'var f = /** 3 */3;',
				'var g = (3+5);',
				'var h = { a: \'value\' };',
			],
			languageId: autoClosingLanguageId,
			editorOpts: {
				autoClosingBrackets: 'beforeWhitespace'
			}
		}, (editor, model, viewModel) => {

			const autoClosePositions = [
				'var| a| =| [|];|',
				'var| b| =| `asd`;|',
				'var| c| =| \'asd\';|',
				'var| d| =| "asd";|',
				'var| e| =| /*3*/|	3;|',
				'var| f| =| /**| 3| */3;|',
				'var| g| =| (3+5|);|',
				'var| h| =| {| a:| \'value\'| |};|',
			];
			for (let i = 0, len = autoClosePositions.length; i < len; i++) {
				const lineNumber = i + 1;
				const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);

				for (let column = 1; column < autoCloseColumns.length; column++) {
					model.tokenization.forceTokenization(lineNumber);
					if (autoCloseColumns[column] === AutoClosingColumnType.Special1) {
						assertType(editor, model, viewModel, lineNumber, column, '(', '()', `auto closes @ (${lineNumber}, ${column})`);
					} else {
						assertType(editor, model, viewModel, lineNumber, column, '(', '(', `does not auto close @ (${lineNumber}, ${column})`);
					}
				}
			}
		});
	});

	test('autoClosingPairs - open parens disabled/enabled open quotes enabled/disabled', () => {
		usingCursor({
			text: [
				'var a = [];',
			],
			languageId: autoClosingLanguageId,
			editorOpts: {
				autoClosingBrackets: 'beforeWhitespace',
				autoClosingQuotes: 'never'
			}
		}, (editor, model, viewModel) => {

			const autoClosePositions = [
				'var| a| =| [|];|',
			];
			for (let i = 0, len = autoClosePositions.length; i < len; i++) {
				const lineNumber = i + 1;
				const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);

				for (let column = 1; column < autoCloseColumns.length; column++) {
					model.tokenization.forceTokenization(lineNumber);
					if (autoCloseColumns[column] === AutoClosingColumnType.Special1) {
						assertType(editor, model, viewModel, lineNumber, column, '(', '()', `auto closes @ (${lineNumber}, ${column})`);
					} else {
						assertType(editor, model, viewModel, lineNumber, column, '(', '(', `does not auto close @ (${lineNumber}, ${column})`);
					}
					assertType(editor, model, viewModel, lineNumber, column, '\'', '\'', `does not auto close @ (${lineNumber}, ${column})`);
				}
			}
		});

		usingCursor({
			text: [
				'var b = [];',
			],
			languageId: autoClosingLanguageId,
			editorOpts: {
				autoClosingBrackets: 'never',
				autoClosingQuotes: 'beforeWhitespace'
			}
		}, (editor, model, viewModel) => {

			const autoClosePositions = [
				'var b =| [|];|',
			];
			for (let i = 0, len = autoClosePositions.length; i < len; i++) {
				const lineNumber = i + 1;
				const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);

				for (let column = 1; column < autoCloseColumns.length; column++) {
					model.tokenization.forceTokenization(lineNumber);
					if (autoCloseColumns[column] === AutoClosingColumnType.Special1) {
						assertType(editor, model, viewModel, lineNumber, column, '\'', '\'\'', `auto closes @ (${lineNumber}, ${column})`);
					} else {
						assertType(editor, model, viewModel, lineNumber, column, '\'', '\'', `does not auto close @ (${lineNumber}, ${column})`);
					}
					assertType(editor, model, viewModel, lineNumber, column, '(', '(', `does not auto close @ (${lineNumber}, ${column})`);
				}
			}
		});
	});

	test('autoClosingPairs - configurable open parens', () => {
		setAutoClosingLanguageEnabledSet('abc');
		usingCursor({
			text: [
				'var a = [];',
				'var b = `asd`;',
				'var c = \'asd\';',
				'var d = "asd";',
				'var e = /*3*/	3;',
				'var f = /** 3 */3;',
				'var g = (3+5);',
				'var h = { a: \'value\' };',
			],
			languageId: autoClosingLanguageId,
			editorOpts: {
				autoClosingBrackets: 'languageDefined'
			}
		}, (editor, model, viewModel) => {

			const autoClosePositions = [
				'v|ar |a = [|];|',
				'v|ar |b = `|asd`;|',
				'v|ar |c = \'|asd\';|',
				'v|ar d = "|asd";|',
				'v|ar e = /*3*/	3;|',
				'v|ar f = /** 3| */3;|',
				'v|ar g = (3+5|);|',
				'v|ar h = { |a: \'v|alue\' |};|',
			];
			for (let i = 0, len = autoClosePositions.length; i < len; i++) {
				const lineNumber = i + 1;
				const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);

				for (let column = 1; column < autoCloseColumns.length; column++) {
					model.tokenization.forceTokenization(lineNumber);
					if (autoCloseColumns[column] === AutoClosingColumnType.Special1) {
						assertType(editor, model, viewModel, lineNumber, column, '(', '()', `auto closes @ (${lineNumber}, ${column})`);
					} else {
						assertType(editor, model, viewModel, lineNumber, column, '(', '(', `does not auto close @ (${lineNumber}, ${column})`);
					}
				}
			}
		});
	});

	test('autoClosingPairs - auto-pairing can be disabled', () => {
		usingCursor({
			text: [
				'var a = [];',
				'var b = `asd`;',
				'var c = \'asd\';',
				'var d = "asd";',
				'var e = /*3*/	3;',
				'var f = /** 3 */3;',
				'var g = (3+5);',
				'var h = { a: \'value\' };',
			],
			languageId: autoClosingLanguageId,
			editorOpts: {
				autoClosingBrackets: 'never',
				autoClosingQuotes: 'never'
			}
		}, (editor, model, viewModel) => {

			const autoClosePositions = [
				'var a = [];',
				'var b = `asd`;',
				'var c = \'asd\';',
				'var d = "asd";',
				'var e = /*3*/	3;',
				'var f = /** 3 */3;',
				'var g = (3+5);',
				'var h = { a: \'value\' };',
			];
			for (let i = 0, len = autoClosePositions.length; i < len; i++) {
				const lineNumber = i + 1;
				const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);

				for (let column = 1; column < autoCloseColumns.length; column++) {
					model.tokenization.forceTokenization(lineNumber);
					if (autoCloseColumns[column] === AutoClosingColumnType.Special1) {
						assertType(editor, model, viewModel, lineNumber, column, '(', '()', `auto closes @ (${lineNumber}, ${column})`);
						assertType(editor, model, viewModel, lineNumber, column, '"', '""', `auto closes @ (${lineNumber}, ${column})`);
					} else {
						assertType(editor, model, viewModel, lineNumber, column, '(', '(', `does not auto close @ (${lineNumber}, ${column})`);
						assertType(editor, model, viewModel, lineNumber, column, '"', '"', `does not auto close @ (${lineNumber}, ${column})`);
					}
				}
			}
		});
	});

	test('autoClosingPairs - auto wrapping is configurable', () => {
		usingCursor({
			text: [
				'var a = asd'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {

			viewModel.setSelections('test', [
				new Selection(1, 1, 1, 4),
				new Selection(1, 9, 1, 12),
			]);

			// type a `
			viewModel.type('`', 'keyboard');

			assert.strictEqual(model.getValue(), '`var` a = `asd`');

			// type a (
			viewModel.type('(', 'keyboard');

			assert.strictEqual(model.getValue(), '`(var)` a = `(asd)`');
		});

		usingCursor({
			text: [
				'var a = asd'
			],
			languageId: autoClosingLanguageId,
			editorOpts: {
				autoSurround: 'never'
			}
		}, (editor, model, viewModel) => {

			viewModel.setSelections('test', [
				new Selection(1, 1, 1, 4),
			]);

			// type a `
			viewModel.type('`', 'keyboard');

			assert.strictEqual(model.getValue(), '` a = asd');
		});

		usingCursor({
			text: [
				'var a = asd'
			],
			languageId: autoClosingLanguageId,
			editorOpts: {
				autoSurround: 'quotes'
			}
		}, (editor, model, viewModel) => {

			viewModel.setSelections('test', [
				new Selection(1, 1, 1, 4),
			]);

			// type a `
			viewModel.type('`', 'keyboard');
			assert.strictEqual(model.getValue(), '`var` a = asd');

			// type a (
			viewModel.type('(', 'keyboard');
			assert.strictEqual(model.getValue(), '`(` a = asd');
		});

		usingCursor({
			text: [
				'var a = asd'
			],
			languageId: autoClosingLanguageId,
			editorOpts: {
				autoSurround: 'brackets'
			}
		}, (editor, model, viewModel) => {

			viewModel.setSelections('test', [
				new Selection(1, 1, 1, 4),
			]);

			// type a (
			viewModel.type('(', 'keyboard');
			assert.strictEqual(model.getValue(), '(var) a = asd');

			// type a `
			viewModel.type('`', 'keyboard');
			assert.strictEqual(model.getValue(), '(`) a = asd');
		});
	});

	test('autoClosingPairs - quote', () => {
		usingCursor({
			text: [
				'var a = [];',
				'var b = `asd`;',
				'var c = \'asd\';',
				'var d = "asd";',
				'var e = /*3*/	3;',
				'var f = /** 3 */3;',
				'var g = (3+5);',
				'var h = { a: \'value\' };',
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {

			const autoClosePositions = [
				'var a |=| [|]|;|',
				'var b |=| `asd`|;|',
				'var c |=| \'asd\'|;|',
				'var d |=| "asd"|;|',
				'var e |=| /*3*/|	3;|',
				'var f |=| /**| 3 */3;|',
				'var g |=| (3+5)|;|',
				'var h |=| {| a:| \'value\'| |}|;|',
			];
			for (let i = 0, len = autoClosePositions.length; i < len; i++) {
				const lineNumber = i + 1;
				const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);

				for (let column = 1; column < autoCloseColumns.length; column++) {
					model.tokenization.forceTokenization(lineNumber);
					if (autoCloseColumns[column] === AutoClosingColumnType.Special1) {
						assertType(editor, model, viewModel, lineNumber, column, '\'', '\'\'', `auto closes @ (${lineNumber}, ${column})`);
					} else if (autoCloseColumns[column] === AutoClosingColumnType.Special2) {
						assertType(editor, model, viewModel, lineNumber, column, '\'', '', `over types @ (${lineNumber}, ${column})`);
					} else {
						assertType(editor, model, viewModel, lineNumber, column, '\'', '\'', `does not auto close @ (${lineNumber}, ${column})`);
					}
				}
			}
		});
	});

	test('autoClosingPairs - multi-character autoclose', () => {
		usingCursor({
			text: [
				'',
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {

			model.setValue('begi');
			viewModel.setSelections('test', [new Selection(1, 5, 1, 5)]);
			viewModel.type('n', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'beginend');

			model.setValue('/*');
			viewModel.setSelections('test', [new Selection(1, 3, 1, 3)]);
			viewModel.type('*', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '/** */');
		});
	});

	test('autoClosingPairs - doc comments can be turned off', () => {
		usingCursor({
			text: [
				'',
			],
			languageId: autoClosingLanguageId,
			editorOpts: {
				autoClosingComments: 'never'
			}
		}, (editor, model, viewModel) => {

			model.setValue('/*');
			viewModel.setSelections('test', [new Selection(1, 3, 1, 3)]);
			viewModel.type('*', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '/**');
		});
	});

	test('issue #72177: multi-character autoclose with conflicting patterns', () => {
		const languageId = 'autoClosingModeMultiChar';

		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			autoClosingPairs: [
				{ open: '(', close: ')' },
				{ open: '(*', close: '*)' },
				{ open: '<@', close: '@>' },
				{ open: '<@@', close: '@@>' },
			],
		}));

		usingCursor({
			text: [
				'',
			],
			languageId: languageId
		}, (editor, model, viewModel) => {
			viewModel.type('(', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '()');
			viewModel.type('*', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '(**)', `doesn't add entire close when already closed substring is there`);

			model.setValue('(');
			viewModel.setSelections('test', [new Selection(1, 2, 1, 2)]);
			viewModel.type('*', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '(**)', `does add entire close if not already there`);

			model.setValue('');
			viewModel.type('<@', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '<@@>');
			viewModel.type('@', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '<@@@@>', `autocloses when before multi-character closing brace`);
			viewModel.type('(', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '<@@()@@>', `autocloses when before multi-character closing brace`);
		});
	});

	test('issue #55314: Do not auto-close when ending with open', () => {
		const languageId = 'myElectricMode';

		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			autoClosingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: '\"', close: '\"', notIn: ['string'] },
				{ open: 'B\"', close: '\"', notIn: ['string', 'comment'] },
				{ open: '`', close: '`', notIn: ['string', 'comment'] },
				{ open: '/**', close: ' */', notIn: ['string'] }
			],
		}));

		usingCursor({
			text: [
				'little goat',
				'little LAMB',
				'little sheep',
				'Big LAMB'
			],
			languageId: languageId
		}, (editor, model, viewModel) => {
			model.tokenization.forceTokenization(model.getLineCount());
			assertType(editor, model, viewModel, 1, 4, '"', '"', `does not double quote when ending with open`);
			model.tokenization.forceTokenization(model.getLineCount());
			assertType(editor, model, viewModel, 2, 4, '"', '"', `does not double quote when ending with open`);
			model.tokenization.forceTokenization(model.getLineCount());
			assertType(editor, model, viewModel, 3, 4, '"', '"', `does not double quote when ending with open`);
			model.tokenization.forceTokenization(model.getLineCount());
			assertType(editor, model, viewModel, 4, 2, '"', '"', `does not double quote when ending with open`);
			model.tokenization.forceTokenization(model.getLineCount());
			assertType(editor, model, viewModel, 4, 3, '"', '"', `does not double quote when ending with open`);
		});
	});

	test('issue #27937: Trying to add an item to the front of a list is cumbersome', () => {
		usingCursor({
			text: [
				'var arr = ["b", "c"];'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			assertType(editor, model, viewModel, 1, 12, '"', '"', `does not over type and will not auto close`);
		});
	});

	test('issue #25658 - Do not auto-close single/double quotes after word characters', () => {
		usingCursor({
			text: [
				'',
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {

			function typeCharacters(viewModel: ViewModel, chars: string): void {
				for (let i = 0, len = chars.length; i < len; i++) {
					viewModel.type(chars[i], 'keyboard');
				}
			}

			// First gif
			model.tokenization.forceTokenization(model.getLineCount());
			typeCharacters(viewModel, 'teste1 = teste\' ok');
			assert.strictEqual(model.getLineContent(1), 'teste1 = teste\' ok');

			viewModel.setSelections('test', [new Selection(1, 1000, 1, 1000)]);
			typeCharacters(viewModel, '\n');
			model.tokenization.forceTokenization(model.getLineCount());
			typeCharacters(viewModel, 'teste2 = teste \'ok');
			assert.strictEqual(model.getLineContent(2), 'teste2 = teste \'ok\'');

			viewModel.setSelections('test', [new Selection(2, 1000, 2, 1000)]);
			typeCharacters(viewModel, '\n');
			model.tokenization.forceTokenization(model.getLineCount());
			typeCharacters(viewModel, 'teste3 = teste" ok');
			assert.strictEqual(model.getLineContent(3), 'teste3 = teste" ok');

			viewModel.setSelections('test', [new Selection(3, 1000, 3, 1000)]);
			typeCharacters(viewModel, '\n');
			model.tokenization.forceTokenization(model.getLineCount());
			typeCharacters(viewModel, 'teste4 = teste "ok');
			assert.strictEqual(model.getLineContent(4), 'teste4 = teste "ok"');

			// Second gif
			viewModel.setSelections('test', [new Selection(4, 1000, 4, 1000)]);
			typeCharacters(viewModel, '\n');
			model.tokenization.forceTokenization(model.getLineCount());
			typeCharacters(viewModel, 'teste \'');
			assert.strictEqual(model.getLineContent(5), 'teste \'\'');

			viewModel.setSelections('test', [new Selection(5, 1000, 5, 1000)]);
			typeCharacters(viewModel, '\n');
			model.tokenization.forceTokenization(model.getLineCount());
			typeCharacters(viewModel, 'teste "');
			assert.strictEqual(model.getLineContent(6), 'teste ""');

			viewModel.setSelections('test', [new Selection(6, 1000, 6, 1000)]);
			typeCharacters(viewModel, '\n');
			model.tokenization.forceTokenization(model.getLineCount());
			typeCharacters(viewModel, 'teste\'');
			assert.strictEqual(model.getLineContent(7), 'teste\'');

			viewModel.setSelections('test', [new Selection(7, 1000, 7, 1000)]);
			typeCharacters(viewModel, '\n');
			model.tokenization.forceTokenization(model.getLineCount());
			typeCharacters(viewModel, 'teste"');
			assert.strictEqual(model.getLineContent(8), 'teste"');
		});
	});

	test('issue #37315 - overtypes only those characters that it inserted', () => {
		usingCursor({
			text: [
				'',
				'y=();'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			assertCursor(viewModel, new Position(1, 1));

			viewModel.type('x=(', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=()');

			viewModel.type('asd', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=(asd)');

			// overtype!
			viewModel.type(')', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=(asd)');

			// do not overtype!
			viewModel.setSelections('test', [new Selection(2, 4, 2, 4)]);
			viewModel.type(')', 'keyboard');
			assert.strictEqual(model.getLineContent(2), 'y=());');

		});
	});

	test('issue #37315 - stops overtyping once cursor leaves area', () => {
		usingCursor({
			text: [
				'',
				'y=();'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			assertCursor(viewModel, new Position(1, 1));

			viewModel.type('x=(', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=()');

			viewModel.setSelections('test', [new Selection(1, 5, 1, 5)]);
			viewModel.type(')', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=())');
		});
	});

	test('issue #37315 - it overtypes only once', () => {
		usingCursor({
			text: [
				'',
				'y=();'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			assertCursor(viewModel, new Position(1, 1));

			viewModel.type('x=(', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=()');

			viewModel.type(')', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=()');

			viewModel.setSelections('test', [new Selection(1, 4, 1, 4)]);
			viewModel.type(')', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=())');
		});
	});

	test('issue #37315 - it can remember multiple auto-closed instances', () => {
		usingCursor({
			text: [
				'',
				'y=();'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			assertCursor(viewModel, new Position(1, 1));

			viewModel.type('x=(', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=()');

			viewModel.type('(', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=(())');

			viewModel.type(')', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=(())');

			viewModel.type(')', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=(())');
		});
	});

	test('issue #118270 - auto closing deletes only those characters that it inserted', () => {
		usingCursor({
			text: [
				'',
				'y=();'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			assertCursor(viewModel, new Position(1, 1));

			viewModel.type('x=(', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=()');

			viewModel.type('asd', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=(asd)');

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'x=()');

			// delete closing char!
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'x=');

			// do not delete closing char!
			viewModel.setSelections('test', [new Selection(2, 4, 2, 4)]);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'y=);');

		});
	});

	test('issue #78527 - does not close quote on odd count', () => {
		usingCursor({
			text: [
				'std::cout << \'"\' << entryMap'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 29, 1, 29)]);

			viewModel.type('[', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'std::cout << \'"\' << entryMap[]');

			viewModel.type('"', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'std::cout << \'"\' << entryMap[""]');

			viewModel.type('a', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'std::cout << \'"\' << entryMap["a"]');

			viewModel.type('"', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'std::cout << \'"\' << entryMap["a"]');

			viewModel.type(']', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'std::cout << \'"\' << entryMap["a"]');
		});
	});

	test('issue #85983 - editor.autoClosingBrackets: beforeWhitespace is incorrect for Python', () => {
		const languageId = 'pythonMode';

		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			autoClosingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '\"', close: '\"', notIn: ['string'] },
				{ open: 'r\"', close: '\"', notIn: ['string', 'comment'] },
				{ open: 'R\"', close: '\"', notIn: ['string', 'comment'] },
				{ open: 'u\"', close: '\"', notIn: ['string', 'comment'] },
				{ open: 'U\"', close: '\"', notIn: ['string', 'comment'] },
				{ open: 'f\"', close: '\"', notIn: ['string', 'comment'] },
				{ open: 'F\"', close: '\"', notIn: ['string', 'comment'] },
				{ open: 'b\"', close: '\"', notIn: ['string', 'comment'] },
				{ open: 'B\"', close: '\"', notIn: ['string', 'comment'] },
				{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: 'r\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: 'R\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: 'u\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: 'U\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: 'f\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: 'F\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: 'b\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: 'B\'', close: '\'', notIn: ['string', 'comment'] },
				{ open: '`', close: '`', notIn: ['string'] }
			],
		}));

		usingCursor({
			text: [
				'foo\'hello\''
			],
			editorOpts: {
				autoClosingBrackets: 'beforeWhitespace'
			},
			languageId: languageId
		}, (editor, model, viewModel) => {
			assertType(editor, model, viewModel, 1, 4, '(', '(', `does not auto close @ (1, 4)`);
		});
	});

	test('issue #78975 - Parentheses swallowing does not work when parentheses are inserted by autocomplete', () => {
		usingCursor({
			text: [
				'<div id'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 8, 1, 8)]);

			viewModel.executeEdits('snippet', [{ range: new Range(1, 6, 1, 8), text: 'id=""' }], () => [new Selection(1, 10, 1, 10)]);
			assert.strictEqual(model.getLineContent(1), '<div id=""');

			viewModel.type('a', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '<div id="a"');

			viewModel.type('"', 'keyboard');
			assert.strictEqual(model.getLineContent(1), '<div id="a"');
		});
	});

	test('issue #78833 - Add config to use old brackets/quotes overtyping', () => {
		usingCursor({
			text: [
				'',
				'y=();'
			],
			languageId: autoClosingLanguageId,
			editorOpts: {
				autoClosingOvertype: 'always'
			}
		}, (editor, model, viewModel) => {
			assertCursor(viewModel, new Position(1, 1));

			viewModel.type('x=(', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=()');

			viewModel.type(')', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=()');

			viewModel.setSelections('test', [new Selection(1, 4, 1, 4)]);
			viewModel.type(')', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'x=()');

			viewModel.setSelections('test', [new Selection(2, 4, 2, 4)]);
			viewModel.type(')', 'keyboard');
			assert.strictEqual(model.getLineContent(2), 'y=();');
		});
	});

	test('issue #15825: accents on mac US intl keyboard', () => {
		usingCursor({
			text: [
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			assertCursor(viewModel, new Position(1, 1));

			// Typing ` + e on the mac US intl kb layout
			viewModel.startComposition();
			viewModel.type('`', 'keyboard');
			viewModel.compositionType('è', 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');

			assert.strictEqual(model.getValue(), 'è');
		});
	});

	test('issue #90016: allow accents on mac US intl keyboard to surround selection', () => {
		usingCursor({
			text: [
				'test'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 1, 1, 5)]);

			// Typing ` + e on the mac US intl kb layout
			viewModel.startComposition();
			viewModel.type('\'', 'keyboard');
			viewModel.compositionType('\'', 1, 0, 0, 'keyboard');
			viewModel.compositionType('\'', 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');

			assert.strictEqual(model.getValue(), '\'test\'');
		});
	});

	test('issue #53357: Over typing ignores characters after backslash', () => {
		usingCursor({
			text: [
				'console.log();'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {

			viewModel.setSelections('test', [new Selection(1, 13, 1, 13)]);

			viewModel.type('\'', 'keyboard');
			assert.strictEqual(model.getValue(), 'console.log(\'\');');

			viewModel.type('it', 'keyboard');
			assert.strictEqual(model.getValue(), 'console.log(\'it\');');

			viewModel.type('\\', 'keyboard');
			assert.strictEqual(model.getValue(), 'console.log(\'it\\\');');

			viewModel.type('\'', 'keyboard');
			assert.strictEqual(model.getValue(), 'console.log(\'it\\\'\');');
		});
	});

	test('issue #84998: Overtyping Brackets doesn\'t work after backslash', () => {
		usingCursor({
			text: [
				''
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {

			viewModel.setSelections('test', [new Selection(1, 1, 1, 1)]);

			viewModel.type('\\', 'keyboard');
			assert.strictEqual(model.getValue(), '\\');

			viewModel.type('(', 'keyboard');
			assert.strictEqual(model.getValue(), '\\()');

			viewModel.type('abc', 'keyboard');
			assert.strictEqual(model.getValue(), '\\(abc)');

			viewModel.type('\\', 'keyboard');
			assert.strictEqual(model.getValue(), '\\(abc\\)');

			viewModel.type(')', 'keyboard');
			assert.strictEqual(model.getValue(), '\\(abc\\)');
		});
	});

	test('issue #2773: Accents (´`¨^, others?) are inserted in the wrong position (Mac)', () => {
		usingCursor({
			text: [
				'hello',
				'world'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			assertCursor(viewModel, new Position(1, 1));

			// Typing ` and pressing shift+down on the mac US intl kb layout
			// Here we're just replaying what the cursor gets
			viewModel.startComposition();
			viewModel.type('`', 'keyboard');
			moveDown(editor, viewModel, true);
			viewModel.compositionType('`', 1, 0, 0, 'keyboard');
			viewModel.compositionType('`', 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');

			assert.strictEqual(model.getValue(), '`hello\nworld');
			assertCursor(viewModel, new Selection(1, 2, 2, 2));
		});
	});

	test('issue #26820: auto close quotes when not used as accents', () => {
		usingCursor({
			text: [
				''
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			assertCursor(viewModel, new Position(1, 1));

			// on the mac US intl kb layout

			// Typing ' + space
			viewModel.startComposition();
			viewModel.type('\'', 'keyboard');
			viewModel.compositionType('\'', 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');
			assert.strictEqual(model.getValue(), '\'\'');

			// Typing one more ' + space
			viewModel.startComposition();
			viewModel.type('\'', 'keyboard');
			viewModel.compositionType('\'', 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');
			assert.strictEqual(model.getValue(), '\'\'');

			// Typing ' as a closing tag
			model.setValue('\'abc');
			viewModel.setSelections('test', [new Selection(1, 5, 1, 5)]);
			viewModel.startComposition();
			viewModel.type('\'', 'keyboard');
			viewModel.compositionType('\'', 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');

			assert.strictEqual(model.getValue(), '\'abc\'');

			// quotes before the newly added character are all paired.
			model.setValue('\'abc\'def ');
			viewModel.setSelections('test', [new Selection(1, 10, 1, 10)]);
			viewModel.startComposition();
			viewModel.type('\'', 'keyboard');
			viewModel.compositionType('\'', 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');

			assert.strictEqual(model.getValue(), '\'abc\'def \'\'');

			// No auto closing if there is non-whitespace character after the cursor
			model.setValue('abc');
			viewModel.setSelections('test', [new Selection(1, 1, 1, 1)]);
			viewModel.startComposition();
			viewModel.type('\'', 'keyboard');
			viewModel.compositionType('\'', 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');

			// No auto closing if it's after a word.
			model.setValue('abc');
			viewModel.setSelections('test', [new Selection(1, 4, 1, 4)]);
			viewModel.startComposition();
			viewModel.type('\'', 'keyboard');
			viewModel.compositionType('\'', 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');

			assert.strictEqual(model.getValue(), 'abc\'');
		});
	});

	test('issue #144690: Quotes do not overtype when using US Intl PC keyboard layout', () => {
		usingCursor({
			text: [
				''
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			assertCursor(viewModel, new Position(1, 1));

			// Pressing ' + ' + ;

			viewModel.startComposition();
			viewModel.type(`'`, 'keyboard');
			viewModel.compositionType(`'`, 1, 0, 0, 'keyboard');
			viewModel.compositionType(`'`, 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');
			viewModel.startComposition();
			viewModel.type(`'`, 'keyboard');
			viewModel.compositionType(`';`, 1, 0, 0, 'keyboard');
			viewModel.compositionType(`';`, 2, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');

			assert.strictEqual(model.getValue(), `'';`);
		});
	});

	test('issue #144693: Typing a quote using US Intl PC keyboard layout always surrounds words', () => {
		usingCursor({
			text: [
				'const hello = 3;'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 7, 1, 12)]);

			// Pressing ' + e

			viewModel.startComposition();
			viewModel.type(`'`, 'keyboard');
			viewModel.compositionType(`é`, 1, 0, 0, 'keyboard');
			viewModel.compositionType(`é`, 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');

			assert.strictEqual(model.getValue(), `const é = 3;`);
		});
	});

	test('issue #82701: auto close does not execute when IME is canceled via backspace', () => {
		usingCursor({
			text: [
				'{}'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 2, 1, 2)]);

			// Typing a + backspace
			viewModel.startComposition();
			viewModel.type('a', 'keyboard');
			viewModel.compositionType('', 1, 0, 0, 'keyboard');
			viewModel.endComposition('keyboard');
			assert.strictEqual(model.getValue(), '{}');
		});
	});

	test('issue #20891: All cursors should do the same thing', () => {
		usingCursor({
			text: [
				'var a = asd'
			],
			languageId: autoClosingLanguageId
		}, (editor, model, viewModel) => {

			viewModel.setSelections('test', [
				new Selection(1, 9, 1, 9),
				new Selection(1, 12, 1, 12),
			]);

			// type a `
			viewModel.type('`', 'keyboard');

			assert.strictEqual(model.getValue(), 'var a = `asd`');
		});
	});

	test('issue #41825: Special handling of quotes in surrounding pairs', () => {
		const languageId = 'myMode';

		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languageConfigurationService.register(languageId, {
			surroundingPairs: [
				{ open: '"', close: '"' },
				{ open: '\'', close: '\'' },
			]
		}));

		const model = createTextModel('var x = \'hi\';', languageId);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			editor.setSelections([
				new Selection(1, 9, 1, 10),
				new Selection(1, 12, 1, 13)
			]);
			viewModel.type('"', 'keyboard');
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'var x = "hi";', 'assert1');

			editor.setSelections([
				new Selection(1, 9, 1, 10),
				new Selection(1, 12, 1, 13)
			]);
			viewModel.type('\'', 'keyboard');
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'var x = \'hi\';', 'assert2');
		});
	});

	test('All cursors should do the same thing when deleting left', () => {
		const model = createTextModel(
			[
				'var a = ()'
			].join('\n'),
			autoClosingLanguageId
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.setSelections('test', [
				new Selection(1, 4, 1, 4),
				new Selection(1, 10, 1, 10),
			]);

			// delete left
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);

			assert.strictEqual(model.getValue(), 'va a = )');
		});
	});

	test('issue #7100: Mouse word selection is strange when non-word character is at the end of line', () => {
		const model = createTextModel(
			[
				'before.a',
				'before',
				'hello:',
				'there:',
				'this is strange:',
				'here',
				'it',
				'is',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			CoreNavigationCommands.WordSelect.runEditorCommand(null, editor, {
				position: new Position(3, 7)
			});
			assertCursor(viewModel, new Selection(3, 7, 3, 7));

			CoreNavigationCommands.WordSelectDrag.runEditorCommand(null, editor, {
				position: new Position(4, 7)
			});
			assertCursor(viewModel, new Selection(3, 7, 4, 7));
		});
	});

	test('issue #112039: shift-continuing a double/triple-click and drag selection does not remember its starting mode', () => {
		const model = createTextModel(
			[
				'just some text',
				'and another line',
				'and another one',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			CoreNavigationCommands.WordSelect.runEditorCommand(null, editor, {
				position: new Position(2, 6)
			});
			CoreNavigationCommands.MoveToSelect.runEditorCommand(null, editor, {
				position: new Position(1, 8),
			});
			assertCursor(viewModel, new Selection(2, 12, 1, 6));
		});
	});

	test('issue #158236: Shift click selection does not work on line number indicator', () => {
		const model = createTextModel(
			[
				'just some text',
				'and another line',
				'and another one',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			CoreNavigationCommands.MoveTo.runEditorCommand(null, editor, {
				position: new Position(3, 5)
			});
			CoreNavigationCommands.LineSelectDrag.runEditorCommand(null, editor, {
				position: new Position(2, 1)
			});
			assertCursor(viewModel, new Selection(3, 5, 2, 1));
		});
	});

	test('issue #111513: Text gets automatically selected when typing at the same location in another editor', () => {
		const model = createTextModel(
			[
				'just',
				'',
				'some text',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor1, viewModel1) => {
			editor1.setSelections([
				new Selection(2, 1, 2, 1)
			]);
			withTestCodeEditor(model, {}, (editor2, viewModel2) => {
				editor2.setSelections([
					new Selection(2, 1, 2, 1)
				]);
				viewModel2.type('e', 'keyboard');
				assertCursor(viewModel2, new Position(2, 2));
				assertCursor(viewModel1, new Position(2, 2));
			});
		});
	});
});

suite('Undo stops', () => {

	test('there is an undo stop between typing and deleting left', () => {
		const model = createTextModel(
			[
				'A  line',
				'Another line',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 3, 1, 3)]);
			viewModel.type('first', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'A first line');
			assertCursor(viewModel, new Selection(1, 8, 1, 8));

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'A fir line');
			assertCursor(viewModel, new Selection(1, 6, 1, 6));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'A first line');
			assertCursor(viewModel, new Selection(1, 8, 1, 8));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'A  line');
			assertCursor(viewModel, new Selection(1, 3, 1, 3));
		});

		model.dispose();
	});

	test('there is an undo stop between typing and deleting right', () => {
		const model = createTextModel(
			[
				'A  line',
				'Another line',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 3, 1, 3)]);
			viewModel.type('first', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'A first line');
			assertCursor(viewModel, new Selection(1, 8, 1, 8));

			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'A firstine');
			assertCursor(viewModel, new Selection(1, 8, 1, 8));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'A first line');
			assertCursor(viewModel, new Selection(1, 8, 1, 8));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'A  line');
			assertCursor(viewModel, new Selection(1, 3, 1, 3));
		});

		model.dispose();
	});

	test('there is an undo stop between deleting left and typing', () => {
		const model = createTextModel(
			[
				'A  line',
				'Another line',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(2, 8, 2, 8)]);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), ' line');
			assertCursor(viewModel, new Selection(2, 1, 2, 1));

			viewModel.type('Second', 'keyboard');
			assert.strictEqual(model.getLineContent(2), 'Second line');
			assertCursor(viewModel, new Selection(2, 7, 2, 7));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), ' line');
			assertCursor(viewModel, new Selection(2, 1, 2, 1));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'Another line');
			assertCursor(viewModel, new Selection(2, 8, 2, 8));
		});

		model.dispose();
	});

	test('there is an undo stop between deleting left and deleting right', () => {
		const model = createTextModel(
			[
				'A  line',
				'Another line',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(2, 8, 2, 8)]);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), ' line');
			assertCursor(viewModel, new Selection(2, 1, 2, 1));

			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), '');
			assertCursor(viewModel, new Selection(2, 1, 2, 1));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), ' line');
			assertCursor(viewModel, new Selection(2, 1, 2, 1));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'Another line');
			assertCursor(viewModel, new Selection(2, 8, 2, 8));
		});

		model.dispose();
	});

	test('there is an undo stop between deleting right and typing', () => {
		const model = createTextModel(
			[
				'A  line',
				'Another line',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(2, 9, 2, 9)]);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'Another ');
			assertCursor(viewModel, new Selection(2, 9, 2, 9));

			viewModel.type('text', 'keyboard');
			assert.strictEqual(model.getLineContent(2), 'Another text');
			assertCursor(viewModel, new Selection(2, 13, 2, 13));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'Another ');
			assertCursor(viewModel, new Selection(2, 9, 2, 9));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'Another line');
			assertCursor(viewModel, new Selection(2, 9, 2, 9));
		});

		model.dispose();
	});

	test('there is an undo stop between deleting right and deleting left', () => {
		const model = createTextModel(
			[
				'A  line',
				'Another line',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(2, 9, 2, 9)]);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'Another ');
			assertCursor(viewModel, new Selection(2, 9, 2, 9));

			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			CoreEditingCommands.DeleteLeft.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'An');
			assertCursor(viewModel, new Selection(2, 3, 2, 3));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'Another ');
			assertCursor(viewModel, new Selection(2, 9, 2, 9));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(2), 'Another line');
			assertCursor(viewModel, new Selection(2, 9, 2, 9));
		});

		model.dispose();
	});

	test('inserts undo stop when typing space', () => {
		const model = createTextModel(
			[
				'A  line',
				'Another line',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 3, 1, 3)]);
			viewModel.type('first and interesting', 'keyboard');
			assert.strictEqual(model.getLineContent(1), 'A first and interesting line');
			assertCursor(viewModel, new Selection(1, 24, 1, 24));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'A first and line');
			assertCursor(viewModel, new Selection(1, 12, 1, 12));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'A first line');
			assertCursor(viewModel, new Selection(1, 8, 1, 8));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getLineContent(1), 'A  line');
			assertCursor(viewModel, new Selection(1, 3, 1, 3));
		});

		model.dispose();
	});

	test('can undo typing and EOL change in one undo stop', () => {
		const model = createTextModel(
			[
				'A  line',
				'Another line',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.setSelections('test', [new Selection(1, 3, 1, 3)]);
			viewModel.type('first', 'keyboard');
			assert.strictEqual(model.getValue(), 'A first line\nAnother line');
			assertCursor(viewModel, new Selection(1, 8, 1, 8));

			model.pushEOL(EndOfLineSequence.CRLF);
			assert.strictEqual(model.getValue(), 'A first line\r\nAnother line');
			assertCursor(viewModel, new Selection(1, 8, 1, 8));

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(), 'A  line\nAnother line');
			assertCursor(viewModel, new Selection(1, 3, 1, 3));
		});

		model.dispose();
	});

	test('issue #93585: Undo multi cursor edit corrupts document', () => {
		const model = createTextModel(
			[
				'hello world',
				'hello world',
			].join('\n')
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.setSelections('test', [
				new Selection(2, 7, 2, 12),
				new Selection(1, 7, 1, 12),
			]);
			viewModel.type('no', 'keyboard');
			assert.strictEqual(model.getValue(), 'hello no\nhello no');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(), 'hello world\nhello world');
		});

		model.dispose();
	});

	test('there is a single undo stop for consecutive whitespaces', () => {
		const model = createTextModel(
			[
				''
			].join('\n'),
			undefined,
			{
				insertSpaces: false,
			}
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.type('a', 'keyboard');
			viewModel.type('b', 'keyboard');
			viewModel.type(' ', 'keyboard');
			viewModel.type(' ', 'keyboard');
			viewModel.type('c', 'keyboard');
			viewModel.type('d', 'keyboard');

			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'ab  cd', 'assert1');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'ab  ', 'assert2');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'ab', 'assert3');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '', 'assert4');
		});

		model.dispose();
	});

	test('there is no undo stop after a single whitespace', () => {
		const model = createTextModel(
			[
				''
			].join('\n'),
			undefined,
			{
				insertSpaces: false,
			}
		);

		withTestCodeEditor(model, {}, (editor, viewModel) => {
			viewModel.type('a', 'keyboard');
			viewModel.type('b', 'keyboard');
			viewModel.type(' ', 'keyboard');
			viewModel.type('c', 'keyboard');
			viewModel.type('d', 'keyboard');

			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'ab cd', 'assert1');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'ab', 'assert3');

			CoreEditingCommands.Undo.runEditorCommand(null, editor, null);
			assert.strictEqual(model.getValue(EndOfLinePreference.LF), '', 'assert4');
		});

		model.dispose();
	});
});
