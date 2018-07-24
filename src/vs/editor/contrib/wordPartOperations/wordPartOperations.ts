/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ITextModel } from 'vs/editor/common/model';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { Selection } from 'vs/editor/common/core/selection';
import { registerEditorCommand } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { WordNavigationType, WordPartOperations } from 'vs/editor/common/controller/cursorWordOperations';
import { WordCharacterClassifier } from 'vs/editor/common/controller/wordCharacterClassifier';
import { DeleteWordCommand, MoveWordCommand } from '../wordOperations/wordOperations';
import { Position } from 'vs/editor/common/core/position';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';

export class DeleteWordPartLeft extends DeleteWordCommand {
	constructor() {
		super({
			whitespaceHeuristics: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'deleteWordPartLeft',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Backspace,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Backspace },
				weight: KeybindingsRegistry.WEIGHT.editorContrib()
			}
		});
	}

	protected _delete(wordSeparators: WordCharacterClassifier, model: ITextModel, selection: Selection, whitespaceHeuristics: boolean, wordNavigationType: WordNavigationType): Range {
		let r = WordPartOperations.deleteWordPartLeft(wordSeparators, model, selection, whitespaceHeuristics, wordNavigationType);
		if (r) {
			return r;
		}
		return new Range(1, 1, 1, 1);
	}
}

export class DeleteWordPartRight extends DeleteWordCommand {
	constructor() {
		super({
			whitespaceHeuristics: true,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'deleteWordPartRight',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Delete,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Delete },
				weight: KeybindingsRegistry.WEIGHT.editorContrib()
			}
		});
	}

	protected _delete(wordSeparators: WordCharacterClassifier, model: ITextModel, selection: Selection, whitespaceHeuristics: boolean, wordNavigationType: WordNavigationType): Range {
		let r = WordPartOperations.deleteWordPartRight(wordSeparators, model, selection, whitespaceHeuristics, wordNavigationType);
		if (r) {
			return r;
		}
		const lineCount = model.getLineCount();
		const maxColumn = model.getLineMaxColumn(lineCount);
		return new Range(lineCount, maxColumn, lineCount, maxColumn);
	}
}

export class WordPartLeftCommand extends MoveWordCommand {
	protected _move(wordSeparators: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType): Position {
		return WordPartOperations.moveWordPartLeft(wordSeparators, model, position, wordNavigationType);
	}
}
export class CursorWordPartLeft extends WordPartLeftCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordPartStartLeft',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.LeftArrow },
				weight: KeybindingsRegistry.WEIGHT.editorContrib()
			}
		});
	}
}
export class CursorWordPartLeftSelect extends WordPartLeftCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordPartStartLeftSelect',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.LeftArrow,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.LeftArrow },
				weight: KeybindingsRegistry.WEIGHT.editorContrib()
			}
		});
	}
}

export class WordPartRightCommand extends MoveWordCommand {
	protected _move(wordSeparators: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType): Position {
		return WordPartOperations.moveWordPartRight(wordSeparators, model, position, wordNavigationType);
	}
}
export class CursorWordPartRight extends WordPartRightCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordPartRight',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.RightArrow },
				weight: KeybindingsRegistry.WEIGHT.editorContrib()
			}
		});
	}
}
export class CursorWordPartRightSelect extends WordPartRightCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordPartRightSelect',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.RightArrow,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.RightArrow },
				weight: KeybindingsRegistry.WEIGHT.editorContrib()
			}
		});
	}
}


registerEditorCommand(new DeleteWordPartLeft());
registerEditorCommand(new DeleteWordPartRight());
registerEditorCommand(new CursorWordPartLeft());
registerEditorCommand(new CursorWordPartLeftSelect());
registerEditorCommand(new CursorWordPartRight());
registerEditorCommand(new CursorWordPartRightSelect());
