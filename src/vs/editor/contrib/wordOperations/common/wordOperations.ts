/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICommonCodeEditor, IModel, ScrollType } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { Selection } from 'vs/editor/common/core/selection';
import { editorCommand, ServicesAccessor, EditorCommand, ICommandOptions } from 'vs/editor/common/editorCommonExtensions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { WordNavigationType, WordOperations } from 'vs/editor/common/controller/cursorWordOperations';
import { ReplaceCommand } from 'vs/editor/common/commands/replaceCommand';
import { getMapForWordSeparators, WordCharacterClassifier } from 'vs/editor/common/controller/wordCharacterClassifier';
import { CursorState } from 'vs/editor/common/controller/cursorCommon';
import { CursorChangeReason } from 'vs/editor/common/controller/cursorEvents';

export interface MoveWordOptions extends ICommandOptions {
	inSelectionMode: boolean;
	wordNavigationType: WordNavigationType;
}

export abstract class MoveWordCommand extends EditorCommand {

	private readonly _inSelectionMode: boolean;
	private readonly _wordNavigationType: WordNavigationType;

	constructor(opts: MoveWordOptions) {
		super(opts);
		this._inSelectionMode = opts.inSelectionMode;
		this._wordNavigationType = opts.wordNavigationType;
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICommonCodeEditor, args: any): void {
		const config = editor.getConfiguration();
		const wordSeparators = getMapForWordSeparators(config.wordSeparators);
		const model = editor.getModel();
		const selections = editor.getSelections();

		const result = selections.map((sel) => {
			const inPosition = new Position(sel.positionLineNumber, sel.positionColumn);
			const outPosition = this._move(wordSeparators, model, inPosition, this._wordNavigationType);
			return this._moveTo(sel, outPosition, this._inSelectionMode);
		});

		editor._getCursors().setStates('moveWordCommand', CursorChangeReason.NotSet, result.map(r => CursorState.fromModelSelection(r)));
		if (result.length === 1) {
			const pos = new Position(result[0].positionLineNumber, result[0].positionColumn);
			editor.revealPosition(pos, ScrollType.Smooth);
		}
	}

	private _moveTo(from: Selection, to: Position, inSelectionMode: boolean): Selection {
		if (inSelectionMode) {
			// move just position
			return new Selection(
				from.selectionStartLineNumber,
				from.selectionStartColumn,
				to.lineNumber,
				to.column
			);
		} else {
			// move everything
			return new Selection(
				to.lineNumber,
				to.column,
				to.lineNumber,
				to.column
			);
		}
	}

	protected abstract _move(wordSeparators: WordCharacterClassifier, model: IModel, position: Position, wordNavigationType: WordNavigationType): Position;
}

export class WordLeftCommand extends MoveWordCommand {
	protected _move(wordSeparators: WordCharacterClassifier, model: IModel, position: Position, wordNavigationType: WordNavigationType): Position {
		return WordOperations.moveWordLeft(wordSeparators, model, position, wordNavigationType);
	}
}

export class WordRightCommand extends MoveWordCommand {
	protected _move(wordSeparators: WordCharacterClassifier, model: IModel, position: Position, wordNavigationType: WordNavigationType): Position {
		return WordOperations.moveWordRight(wordSeparators, model, position, wordNavigationType);
	}
}

@editorCommand
export class CursorWordStartLeft extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordStartLeft',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
				mac: { primary: KeyMod.Alt | KeyCode.LeftArrow }
			}
		});
	}
}

@editorCommand
export class CursorWordEndLeft extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordEndLeft',
			precondition: null
		});
	}
}

@editorCommand
export class CursorWordLeft extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordLeft',
			precondition: null
		});
	}
}

@editorCommand
export class CursorWordStartLeftSelect extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordStartLeftSelect',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow,
				mac: { primary: KeyMod.Alt | KeyMod.Shift | KeyCode.LeftArrow }
			}
		});
	}
}

@editorCommand
export class CursorWordEndLeftSelect extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordEndLeftSelect',
			precondition: null
		});
	}
}

@editorCommand
export class CursorWordLeftSelect extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordLeftSelect',
			precondition: null
		});
	}
}

@editorCommand
export class CursorWordStartRight extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordStartRight',
			precondition: null
		});
	}
}

@editorCommand
export class CursorWordEndRight extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordEndRight',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
				mac: { primary: KeyMod.Alt | KeyCode.RightArrow }
			}
		});
	}
}

@editorCommand
export class CursorWordRight extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordRight',
			precondition: null
		});
	}
}

@editorCommand
export class CursorWordStartRightSelect extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordStartRightSelect',
			precondition: null
		});
	}
}

@editorCommand
export class CursorWordEndRightSelect extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordEndRightSelect',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow,
				mac: { primary: KeyMod.Alt | KeyMod.Shift | KeyCode.RightArrow }
			}
		});
	}
}

@editorCommand
export class CursorWordRightSelect extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordRightSelect',
			precondition: null
		});
	}
}

export interface DeleteWordOptions extends ICommandOptions {
	whitespaceHeuristics: boolean;
	wordNavigationType: WordNavigationType;
}

export abstract class DeleteWordCommand extends EditorCommand {
	private readonly _whitespaceHeuristics: boolean;
	private readonly _wordNavigationType: WordNavigationType;

	constructor(opts: DeleteWordOptions) {
		super(opts);
		this._whitespaceHeuristics = opts.whitespaceHeuristics;
		this._wordNavigationType = opts.wordNavigationType;
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICommonCodeEditor, args: any): void {
		const config = editor.getConfiguration();
		const wordSeparators = getMapForWordSeparators(config.wordSeparators);
		const model = editor.getModel();
		const selections = editor.getSelections();

		const commands = selections.map((sel) => {
			const deleteRange = this._delete(wordSeparators, model, sel, this._whitespaceHeuristics, this._wordNavigationType);
			return new ReplaceCommand(deleteRange, '');
		});

		editor.pushUndoStop();
		editor.executeCommands(this.id, commands);
		editor.pushUndoStop();
	}

	protected abstract _delete(wordSeparators: WordCharacterClassifier, model: IModel, selection: Selection, whitespaceHeuristics: boolean, wordNavigationType: WordNavigationType): Range;
}

export class DeleteWordLeftCommand extends DeleteWordCommand {
	protected _delete(wordSeparators: WordCharacterClassifier, model: IModel, selection: Selection, whitespaceHeuristics: boolean, wordNavigationType: WordNavigationType): Range {
		let r = WordOperations.deleteWordLeft(wordSeparators, model, selection, whitespaceHeuristics, wordNavigationType);
		if (r) {
			return r;
		}
		return new Range(1, 1, 1, 1);
	}
}

export class DeleteWordRightCommand extends DeleteWordCommand {
	protected _delete(wordSeparators: WordCharacterClassifier, model: IModel, selection: Selection, whitespaceHeuristics: boolean, wordNavigationType: WordNavigationType): Range {
		let r = WordOperations.deleteWordRight(wordSeparators, model, selection, whitespaceHeuristics, wordNavigationType);
		if (r) {
			return r;
		}
		const lineCount = model.getLineCount();
		const maxColumn = model.getLineMaxColumn(lineCount);
		return new Range(lineCount, maxColumn, lineCount, maxColumn);
	}
}

@editorCommand
export class DeleteWordStartLeft extends DeleteWordLeftCommand {
	constructor() {
		super({
			whitespaceHeuristics: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'deleteWordStartLeft',
			precondition: EditorContextKeys.writable
		});
	}
}

@editorCommand
export class DeleteWordEndLeft extends DeleteWordLeftCommand {
	constructor() {
		super({
			whitespaceHeuristics: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'deleteWordEndLeft',
			precondition: EditorContextKeys.writable
		});
	}
}

@editorCommand
export class DeleteWordLeft extends DeleteWordLeftCommand {
	constructor() {
		super({
			whitespaceHeuristics: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'deleteWordLeft',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Backspace,
				mac: { primary: KeyMod.Alt | KeyCode.Backspace }
			}
		});
	}
}

@editorCommand
export class DeleteWordStartRight extends DeleteWordRightCommand {
	constructor() {
		super({
			whitespaceHeuristics: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'deleteWordStartRight',
			precondition: EditorContextKeys.writable
		});
	}
}

@editorCommand
export class DeleteWordEndRight extends DeleteWordRightCommand {
	constructor() {
		super({
			whitespaceHeuristics: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'deleteWordEndRight',
			precondition: EditorContextKeys.writable
		});
	}
}

@editorCommand
export class DeleteWordRight extends DeleteWordRightCommand {
	constructor() {
		super({
			whitespaceHeuristics: true,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'deleteWordRight',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Delete,
				mac: { primary: KeyMod.Alt | KeyCode.Delete }
			}
		});
	}
}
