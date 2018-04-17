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

export class DeleteWordPartLeft extends DeleteWordCommand {
	constructor() {
		super({
			whitespaceHeuristics: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'deleteWordPartLeft',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.Alt | KeyCode.Backspace,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace }
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
				primary: KeyMod.Alt | KeyCode.Delete,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.Delete }
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

export class CursorWordPartLeft extends MoveWordCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordPartStartLeft',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.Alt | KeyCode.LeftArrow,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.LeftArrow }
			}
		});
	}

	protected _move(wordSeparators: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType): Position {
		return WordPartOperations.moveWordPartLeft(wordSeparators, model, position, wordNavigationType);
	}
}

export class CursorWordPartRight extends MoveWordCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordPartRight',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.Alt | KeyCode.RightArrow,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.RightArrow }
			}
		});
	}

	protected _move(wordSeparators: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType): Position {
		return WordPartOperations.moveWordPartRight(wordSeparators, model, position, wordNavigationType);
	}
}


registerEditorCommand(new DeleteWordPartLeft());
registerEditorCommand(new DeleteWordPartRight());
registerEditorCommand(new CursorWordPartLeft());
registerEditorCommand(new CursorWordPartRight());
