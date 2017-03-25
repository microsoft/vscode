/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { EditorContextKeys, ICommonCodeEditor, IModel } from 'vs/editor/common/editorCommon';
import { Selection } from 'vs/editor/common/core/selection';
import { editorCommand, ServicesAccessor, EditorCommand, ICommandOptions } from 'vs/editor/common/editorCommonExtensions';
import { Position } from 'vs/editor/common/core/position';
import { WordNavigationType, WordOperations, getMapForWordSeparators, WordCharacterClassifier } from 'vs/editor/common/controller/cursorWordOperations';

export interface MoveWordOptions extends ICommandOptions {
	inSelectionMode: boolean;
	wordNavigationType: WordNavigationType;
}

export abstract class WordCommand extends EditorCommand {

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
			return move(sel, outPosition, this._inSelectionMode);
		});

		editor.setSelections(result);
	}

	protected abstract _move(wordSeparators: WordCharacterClassifier, model: IModel, position: Position, wordNavigationType: WordNavigationType): Position;
}

export class WordLeftCommand extends WordCommand {
	protected _move(wordSeparators: WordCharacterClassifier, model: IModel, position: Position, wordNavigationType: WordNavigationType): Position {
		return WordOperations.moveWordLeft(wordSeparators, model, position, wordNavigationType);
	}
}

export class WordRightCommand extends WordCommand {
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
				kbExpr: EditorContextKeys.TextFocus,
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
				kbExpr: EditorContextKeys.TextFocus,
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
				kbExpr: EditorContextKeys.TextFocus,
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
				kbExpr: EditorContextKeys.TextFocus,
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

function move(from: Selection, to: Position, inSelectionMode: boolean): Selection {
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
