/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Selection } from 'vs/editor/common/core/selection';
import { EndOfLineSequence, ICursorStateComputer, IIdentifiedSingleEditOperation, IValidEditOperation, ITextModel, IValidEditOperations } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IUndoRedoService, IResourceUndoRedoElement, UndoRedoElementType, IWorkspaceUndoRedoElement } from 'vs/platform/undoRedo/common/undoRedo';
import { URI } from 'vs/base/common/uri';
import { getComparisonKey as uriGetComparisonKey } from 'vs/base/common/resources';

export class EditStackElement implements IResourceUndoRedoElement {

	public readonly type = UndoRedoElementType.Resource;
	public readonly label: string;
	private _isOpen: boolean;
	public readonly model: ITextModel;
	private readonly _beforeVersionId: number;
	private readonly _beforeEOL: EndOfLineSequence;
	private readonly _beforeCursorState: Selection[] | null;
	private _afterVersionId: number;
	private _afterEOL: EndOfLineSequence;
	private _afterCursorState: Selection[] | null;
	private _edits: IValidEditOperations[];

	public get resource(): URI {
		return this.model.uri;
	}

	constructor(model: ITextModel, beforeCursorState: Selection[] | null) {
		this.label = nls.localize('edit', "Typing");
		this._isOpen = true;
		this.model = model;
		this._beforeVersionId = this.model.getAlternativeVersionId();
		this._beforeEOL = getModelEOL(this.model);
		this._beforeCursorState = beforeCursorState;
		this._afterVersionId = this._beforeVersionId;
		this._afterEOL = this._beforeEOL;
		this._afterCursorState = this._beforeCursorState;
		this._edits = [];
	}

	public canAppend(model: ITextModel): boolean {
		return (this._isOpen && this.model === model);
	}

	public append(model: ITextModel, operations: IValidEditOperation[], afterEOL: EndOfLineSequence, afterVersionId: number, afterCursorState: Selection[] | null): void {
		if (operations.length > 0) {
			this._edits.push({ operations: operations });
		}
		this._afterEOL = afterEOL;
		this._afterVersionId = afterVersionId;
		this._afterCursorState = afterCursorState;
	}

	public close(): void {
		this._isOpen = false;
	}

	public undo(): void {
		this._isOpen = false;
		this._edits.reverse();
		this._edits = this.model._applyUndoRedoEdits(this._edits, this._beforeEOL, true, false, this._beforeVersionId, this._beforeCursorState);
	}

	public redo(): void {
		this._edits.reverse();
		this._edits = this.model._applyUndoRedoEdits(this._edits, this._afterEOL, false, true, this._afterVersionId, this._afterCursorState);
	}
}

export class MultiModelEditStackElement implements IWorkspaceUndoRedoElement {

	public readonly type = UndoRedoElementType.Workspace;
	public readonly label: string;
	private _isOpen: boolean;

	private readonly _editStackElementsArr: EditStackElement[];
	private readonly _editStackElementsMap: Map<string, EditStackElement>;

	public get resources(): readonly URI[] {
		return this._editStackElementsArr.map(editStackElement => editStackElement.model.uri);
	}

	constructor(
		label: string,
		editStackElements: EditStackElement[]
	) {
		this.label = label;
		this._isOpen = true;
		this._editStackElementsArr = editStackElements.slice(0);
		this._editStackElementsMap = new Map<string, EditStackElement>();
		for (const editStackElement of this._editStackElementsArr) {
			const key = uriGetComparisonKey(editStackElement.model.uri);
			this._editStackElementsMap.set(key, editStackElement);
		}
	}

	public canAppend(model: ITextModel): boolean {
		if (!this._isOpen) {
			return false;
		}
		const key = uriGetComparisonKey(model.uri);
		if (this._editStackElementsMap.has(key)) {
			const editStackElement = this._editStackElementsMap.get(key)!;
			return editStackElement.canAppend(model);
		}
		return false;
	}

	public append(model: ITextModel, operations: IValidEditOperation[], afterEOL: EndOfLineSequence, afterVersionId: number, afterCursorState: Selection[] | null): void {
		const key = uriGetComparisonKey(model.uri);
		const editStackElement = this._editStackElementsMap.get(key)!;
		editStackElement.append(model, operations, afterEOL, afterVersionId, afterCursorState);
	}

	public close(): void {
		this._isOpen = false;
	}

	public undo(): void {
		this._isOpen = false;

		for (const editStackElement of this._editStackElementsArr) {
			editStackElement.undo();
		}
	}

	public redo(): void {
		for (const editStackElement of this._editStackElementsArr) {
			editStackElement.redo();
		}
	}

	public split(): IResourceUndoRedoElement[] {
		return this._editStackElementsArr;
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

function isKnownStackElement(element: IResourceUndoRedoElement | IWorkspaceUndoRedoElement | null): element is EditStackElement | MultiModelEditStackElement {
	if (!element) {
		return false;
	}
	return ((element instanceof EditStackElement) || (element instanceof MultiModelEditStackElement));
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
		if (isKnownStackElement(lastElement)) {
			lastElement.close();
		}
	}

	public clear(): void {
		this._undoRedoService.removeElements(this._model.uri);
	}

	private _getOrCreateEditStackElement(beforeCursorState: Selection[] | null): EditStackElement | MultiModelEditStackElement {
		const lastElement = this._undoRedoService.getLastElement(this._model.uri);
		if (isKnownStackElement(lastElement) && lastElement.canAppend(this._model)) {
			return lastElement;
		}
		const newElement = new EditStackElement(this._model, beforeCursorState);
		this._undoRedoService.pushElement(newElement);
		return newElement;
	}

	public pushEOL(eol: EndOfLineSequence): void {
		const editStackElement = this._getOrCreateEditStackElement(null);
		this._model.setEOL(eol);
		editStackElement.append(this._model, [], getModelEOL(this._model), this._model.getAlternativeVersionId(), null);
	}

	public pushEditOperation(beforeCursorState: Selection[] | null, editOperations: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer | null): Selection[] | null {
		const editStackElement = this._getOrCreateEditStackElement(beforeCursorState);
		const inverseEditOperations = this._model.applyEdits(editOperations);
		const afterCursorState = EditStack._computeCursorState(cursorStateComputer, inverseEditOperations);
		editStackElement.append(this._model, inverseEditOperations, getModelEOL(this._model), this._model.getAlternativeVersionId(), afterCursorState);
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
