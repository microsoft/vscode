/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Selection } from 'vs/editor/common/core/selection';
import { EndOfLineSequence, ICursorStateComputer, IIdentifiedSingleEditOperation, IValidEditOperation, ITextModel, IValidEditOperations } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IUndoRedoService, IUndoRedoElement, IUndoRedoContext } from 'vs/platform/undoRedo/common/undoRedo';
import { URI } from 'vs/base/common/uri';

class EditStackElement implements IUndoRedoElement {

	public readonly label: string;
	private _isOpen: boolean;
	private readonly _model: TextModel;
	private readonly _beforeVersionId: number;
	private readonly _beforeCursorState: Selection[];
	private _afterVersionId: number;
	private _afterCursorState: Selection[] | null;
	private _edits: IValidEditOperations[];

	public get resources(): readonly URI[] {
		return [this._model.uri];
	}

	constructor(model: TextModel, beforeVersionId: number, beforeCursorState: Selection[], afterVersionId: number, afterCursorState: Selection[] | null, operations: IValidEditOperation[]) {
		this.label = nls.localize('edit', "Typing");
		this._isOpen = true;
		this._model = model;
		this._beforeVersionId = beforeVersionId;
		this._beforeCursorState = beforeCursorState;
		this._afterVersionId = afterVersionId;
		this._afterCursorState = afterCursorState;
		this._edits = [{ operations: operations }];
	}

	public isOpen(): boolean {
		return this._isOpen;
	}

	public append(operations: IValidEditOperation[], afterVersionId: number, afterCursorState: Selection[] | null): void {
		this._edits.push({ operations: operations });
		this._afterVersionId = afterVersionId;
		this._afterCursorState = afterCursorState;
	}

	public close(): void {
		this._isOpen = false;
	}

	undo(ctx: IUndoRedoContext): void {
		this._isOpen = false;
		this._edits.reverse();
		this._edits = this._model._applyEdits(this._edits, true, false, this._beforeVersionId, this._beforeCursorState);
	}

	redo(ctx: IUndoRedoContext): void {
		this._isOpen = false;
		this._edits.reverse();
		this._edits = this._model._applyEdits(this._edits, false, true, this._afterVersionId, this._afterCursorState);
	}

	invalidate(resource: URI): void {
		// nothing to do
	}
}

function getModelEOL(model: ITextModel): EndOfLineSequence {
	const eol = model.getEOL();
	if (eol === '\n') {
		return EndOfLineSequence.LF;
	} else {
		return EndOfLineSequence.CRLF;
	}
}

class EOLStackElement implements IUndoRedoElement {

	public readonly label: string;
	private readonly _model: TextModel;
	private readonly _beforeVersionId: number;
	private readonly _afterVersionId: number;
	private _eol: EndOfLineSequence;

	public get resources(): readonly URI[] {
		return [this._model.uri];
	}

	constructor(model: TextModel, beforeVersionId: number, afterVersionId: number, eol: EndOfLineSequence) {
		this.label = nls.localize('eol', "Change End Of Line Sequence");
		this._model = model;
		this._beforeVersionId = beforeVersionId;
		this._afterVersionId = afterVersionId;
		this._eol = eol;
	}

	undo(ctx: IUndoRedoContext): void {
		const redoEOL = getModelEOL(this._model);
		this._model._setEOL(this._eol, true, false, this._beforeVersionId, null);
		this._eol = redoEOL;
	}

	redo(ctx: IUndoRedoContext): void {
		const undoEOL = getModelEOL(this._model);
		this._model._setEOL(this._eol, false, true, this._afterVersionId, null);
		this._eol = undoEOL;
	}

	invalidate(resource: URI): void {
		// nothing to do
	}
}

export interface IUndoRedoResult {
	selections: Selection[] | null;
	recordedVersionId: number;
}

export class EditStack {

	private readonly _model: TextModel;
	private readonly _undoRedoService: IUndoRedoService;

	constructor(model: TextModel, undoRedoService: IUndoRedoService) {
		this._model = model;
		this._undoRedoService = undoRedoService;
	}

	public pushStackElement(): void {
		const lastElement = this._undoRedoService.getLastElement(this._model.uri);
		if (lastElement && lastElement instanceof EditStackElement) {
			lastElement.close();
		}
	}

	public clear(): void {
		this._undoRedoService.removeElements(this._model.uri);
	}

	public pushEOL(eol: EndOfLineSequence): void {
		const beforeVersionId = this._model.getAlternativeVersionId();
		const inverseEOL = getModelEOL(this._model);
		this._model.setEOL(eol);
		const afterVersionId = this._model.getAlternativeVersionId();

		const lastElement = this._undoRedoService.getLastElement(this._model.uri);
		if (lastElement && lastElement instanceof EditStackElement) {
			lastElement.close();
		}
		this._undoRedoService.pushElement(new EOLStackElement(this._model, inverseEOL, beforeVersionId, afterVersionId));
	}

	public pushEditOperation(beforeCursorState: Selection[], editOperations: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer | null): Selection[] | null {
		const beforeVersionId = this._model.getAlternativeVersionId();
		const inverseEditOperations = this._model.applyEdits(editOperations);
		const afterVersionId = this._model.getAlternativeVersionId();
		const afterCursorState = EditStack._computeCursorState(cursorStateComputer, inverseEditOperations);

		const lastElement = this._undoRedoService.getLastElement(this._model.uri);
		if (lastElement && lastElement instanceof EditStackElement && lastElement.isOpen()) {
			lastElement.append(inverseEditOperations, afterVersionId, afterCursorState);
		} else {
			this._undoRedoService.pushElement(new EditStackElement(this._model, beforeVersionId, beforeCursorState, afterVersionId, afterCursorState, inverseEditOperations));
		}

		return afterCursorState;
	}

	private static _computeCursorState(cursorStateComputer: ICursorStateComputer | null, inverseEditOperations: IValidEditOperation[]): Selection[] | null {
		try {
			return cursorStateComputer ? cursorStateComputer(inverseEditOperations) : null;
		} catch (e) {
			onUnexpectedError(e);
			return null;
		}
	}
}
