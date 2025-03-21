/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { registerEditorCommand } from '../../../browser/editorExtensions.js';
import { DeleteWordContext, WordNavigationType, WordPartOperations } from '../../../common/cursor/cursorWordOperations.js';
import { WordCharacterClassifier } from '../../../common/core/wordCharacterClassifier.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ITextModel } from '../../../common/model.js';
import { DeleteWordCommand, MoveWordCommand } from '../../wordOperations/browser/wordOperations.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

export class DeleteWordPartLeft extends DeleteWordCommand {
	constructor() {
		super({
			whitespaceHeuristics: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'deleteWordPartLeft',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: 0,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Backspace },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	protected _delete(ctx: DeleteWordContext, wordNavigationType: WordNavigationType): Range {
		const r = WordPartOperations.deleteWordPartLeft(ctx);
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
				primary: 0,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Delete },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	protected _delete(ctx: DeleteWordContext, wordNavigationType: WordNavigationType): Range {
		const r = WordPartOperations.deleteWordPartRight(ctx);
		if (r) {
			return r;
		}
		const lineCount = ctx.model.getLineCount();
		const maxColumn = ctx.model.getLineMaxColumn(lineCount);
		return new Range(lineCount, maxColumn, lineCount, maxColumn);
	}
}

export class WordPartLeftCommand extends MoveWordCommand {
	protected _move(wordSeparators: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType, hasMulticursor: boolean): Position {
		return WordPartOperations.moveWordPartLeft(wordSeparators, model, position, hasMulticursor);
	}
}
export class CursorWordPartLeft extends WordPartLeftCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordPartLeft',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: 0,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.LeftArrow },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}
// Register previous id for compatibility purposes
CommandsRegistry.registerCommandAlias('cursorWordPartStartLeft', 'cursorWordPartLeft');

export class CursorWordPartLeftSelect extends WordPartLeftCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordPartLeftSelect',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: 0,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.LeftArrow },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}
// Register previous id for compatibility purposes
CommandsRegistry.registerCommandAlias('cursorWordPartStartLeftSelect', 'cursorWordPartLeftSelect');

export class WordPartRightCommand extends MoveWordCommand {
	protected _move(wordSeparators: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType, hasMulticursor: boolean): Position {
		return WordPartOperations.moveWordPartRight(wordSeparators, model, position);
	}
}
export class CursorWordPartRight extends WordPartRightCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordPartRight',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: 0,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.RightArrow },
				weight: KeybindingWeight.EditorContrib
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
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: 0,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.RightArrow },
				weight: KeybindingWeight.EditorContrib
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
