/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { SingleCursorState, CursorState } from 'vs/editor/common/controller/cursorCommon';
import { CursorChangeReason } from "vs/editor/common/controller/cursorEvents";
import { CursorMoveCommands } from "vs/editor/common/controller/cursorMoveCommands";
import { EditorCommand, ICommandOptions } from "vs/editor/common/config/config";
import { ServicesAccessor } from "vs/platform/instantiation/common/instantiation";
import { registerEditorCommand } from "vs/editor/common/editorCommonExtensions";
import { ICursors, RevealTarget } from "vs/editor/common/controller/cursor";

export abstract class CoreCommand extends EditorCommand {
	public runEditorCommand(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void {
		this.runCoreCommand(editor.getCursors(), args);
	}

	public abstract runCoreCommand(cursors: ICursors, args: any): void;


	protected ensureInEditableRange(cursors: ICursors, states: CursorState[]): CursorState[] {
		const model = cursors.context.model;
		if (!model.hasEditableRange()) {
			return states;
		}

		const modelEditableRange = model.getEditableRange();
		const viewEditableRange = cursors.context.convertModelRangeToViewRange(modelEditableRange);

		let result: CursorState[] = [];
		for (let i = 0, len = states.length; i < len; i++) {
			const state = states[i];

			if (state.modelState) {
				const newModelState = CoreCommand._ensureInEditableRange(state.modelState, modelEditableRange);
				result[i] = newModelState ? CursorState.fromModelState(newModelState) : state;
			} else {
				const newViewState = CoreCommand._ensureInEditableRange(state.viewState, viewEditableRange);
				result[i] = newViewState ? CursorState.fromViewState(newViewState) : state;
			}
		}
		return result;
	}

	private static _ensureInEditableRange(state: SingleCursorState, editableRange: Range): SingleCursorState {
		const position = state.position;

		if (position.lineNumber < editableRange.startLineNumber || (position.lineNumber === editableRange.startLineNumber && position.column < editableRange.startColumn)) {
			return new SingleCursorState(
				state.selectionStart, state.selectionStartLeftoverVisibleColumns,
				new Position(editableRange.startLineNumber, editableRange.startColumn), 0
			);
		}

		if (position.lineNumber > editableRange.endLineNumber || (position.lineNumber === editableRange.endLineNumber && position.column > editableRange.endColumn)) {
			return new SingleCursorState(
				state.selectionStart, state.selectionStartLeftoverVisibleColumns,
				new Position(editableRange.endLineNumber, editableRange.endColumn), 0
			);
		}

		return null;
	}
}

export class BaseMoveToCommand extends CoreCommand {

	private readonly _inSelectionMode: boolean;

	constructor(opts: ICommandOptions & { inSelectionMode: boolean; }) {
		super(opts);
		this._inSelectionMode = opts.inSelectionMode;
	}

	public runCoreCommand(cursors: ICursors, args: any): void {
		cursors.context.model.pushStackElement();
		cursors.setStates(
			args.source,
			CursorChangeReason.Explicit,
			[
				CursorMoveCommands.moveTo(cursors.context, cursors.getPrimaryCursor(), this._inSelectionMode, args.position, args.viewPosition)
			]
		);
		cursors.reveal(true, RevealTarget.Primary);
	}
}

export const CoreCommands = {

	MoveTo: registerEditorCommand(new BaseMoveToCommand({
		id: 'moveTo',
		inSelectionMode: false,
		precondition: null
	})),

	MoveToSelect: registerEditorCommand(new BaseMoveToCommand({
		id: 'moveToSelect',
		inSelectionMode: true,
		precondition: null
	})),

};
