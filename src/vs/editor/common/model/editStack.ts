/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { Selection } from 'vs/editor/common/core/selection';
import { EndOfLineSequence, ICursorStateComputer, IIdentifiedSingleEditOperation } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';

interface IEditOperation {
	operations: IIdentifiedSingleEditOperation[];
}

interface IStackElement {
	readonly beforeVersionId: number;
	readonly beforeCursorState: Selection[] | null;
	readonly afterCursorState: Selection[] | null;
	readonly afterVersionId: number;

	undo(model: TextModel): void;
	redo(model: TextModel): void;
}

class EditStackElement implements IStackElement {
	public readonly beforeVersionId: number;
	public readonly beforeCursorState: Selection[];
	public afterCursorState: Selection[] | null;
	public afterVersionId: number;

	public editOperations: IEditOperation[];

	constructor(beforeVersionId: number, beforeCursorState: Selection[]) {
		this.beforeVersionId = beforeVersionId;
		this.beforeCursorState = beforeCursorState;
		this.afterCursorState = null;
		this.afterVersionId = -1;
		this.editOperations = [];
	}

	public undo(model: TextModel): void {
		// Apply all operations in reverse order
		for (let i = this.editOperations.length - 1; i >= 0; i--) {
			this.editOperations[i] = {
				operations: model.applyEdits(this.editOperations[i].operations)
			};
		}
	}

	public redo(model: TextModel): void {
		// Apply all operations
		for (let i = 0; i < this.editOperations.length; i++) {
			this.editOperations[i] = {
				operations: model.applyEdits(this.editOperations[i].operations)
			};
		}
	}
}

function getModelEOL(model: TextModel): EndOfLineSequence {
	const eol = model.getEOL();
	if (eol === '\n') {
		return EndOfLineSequence.LF;
	} else {
		return EndOfLineSequence.CRLF;
	}
}

class EOLStackElement implements IStackElement {
	public readonly beforeVersionId: number;
	public readonly beforeCursorState: Selection[] | null;
	public readonly afterCursorState: Selection[] | null;
	public afterVersionId: number;

	public eol: EndOfLineSequence;

	constructor(beforeVersionId: number, setEOL: EndOfLineSequence) {
		this.beforeVersionId = beforeVersionId;
		this.beforeCursorState = null;
		this.afterCursorState = null;
		this.afterVersionId = -1;
		this.eol = setEOL;
	}

	public undo(model: TextModel): void {
		let redoEOL = getModelEOL(model);
		model.setEOL(this.eol);
		this.eol = redoEOL;
	}

	public redo(model: TextModel): void {
		let undoEOL = getModelEOL(model);
		model.setEOL(this.eol);
		this.eol = undoEOL;
	}
}

export interface IUndoRedoResult {
	selections: Selection[] | null;
	recordedVersionId: number;
}

export class EditStack {

	private model: TextModel;
	private currentOpenStackElement: IStackElement | null;
	private past: IStackElement[];
	private future: IStackElement[];

	constructor(model: TextModel) {
		this.model = model;
		this.currentOpenStackElement = null;
		this.past = [];
		this.future = [];
	}

	public pushStackElement(): void {
		if (this.currentOpenStackElement !== null) {
			this.past.push(this.currentOpenStackElement);
			this.currentOpenStackElement = null;
		}
	}

	public clear(): void {
		this.currentOpenStackElement = null;
		this.past = [];
		this.future = [];
	}

	public pushEOL(eol: EndOfLineSequence): void {
		// No support for parallel universes :(
		this.future = [];

		if (this.currentOpenStackElement) {
			this.pushStackElement();
		}

		const prevEOL = getModelEOL(this.model);
		let stackElement = new EOLStackElement(this.model.getAlternativeVersionId(), prevEOL);

		this.model.setEOL(eol);

		stackElement.afterVersionId = this.model.getVersionId();
		this.currentOpenStackElement = stackElement;
		this.pushStackElement();
	}

	public pushEditOperation(beforeCursorState: Selection[], editOperations: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer | null): Selection[] | null {
		// No support for parallel universes :(
		this.future = [];

		let stackElement: EditStackElement | null = null;

		if (this.currentOpenStackElement) {
			if (this.currentOpenStackElement instanceof EditStackElement) {
				stackElement = this.currentOpenStackElement;
			} else {
				this.pushStackElement();
			}
		}

		if (!this.currentOpenStackElement) {
			stackElement = new EditStackElement(this.model.getAlternativeVersionId(), beforeCursorState);
			this.currentOpenStackElement = stackElement;
		}

		const inverseEditOperation: IEditOperation = {
			operations: this.model.applyEdits(editOperations)
		};

		stackElement!.editOperations.push(inverseEditOperation);
		stackElement!.afterCursorState = EditStack._computeCursorState(cursorStateComputer, inverseEditOperation.operations);
		stackElement!.afterVersionId = this.model.getVersionId();
		return stackElement!.afterCursorState;
	}

	private static _computeCursorState(cursorStateComputer: ICursorStateComputer | null, inverseEditOperations: IIdentifiedSingleEditOperation[]): Selection[] | null {
		try {
			return cursorStateComputer ? cursorStateComputer(inverseEditOperations) : null;
		} catch (e) {
			onUnexpectedError(e);
			return null;
		}
	}

	public undo(): IUndoRedoResult | null {

		this.pushStackElement();

		if (this.past.length > 0) {
			const pastStackElement = this.past.pop()!;

			try {
				pastStackElement.undo(this.model);
			} catch (e) {
				onUnexpectedError(e);
				this.clear();
				return null;
			}

			this.future.push(pastStackElement);

			return {
				selections: pastStackElement.beforeCursorState,
				recordedVersionId: pastStackElement.beforeVersionId
			};
		}

		return null;
	}

	public canUndo(): boolean {
		return (this.past.length > 0);
	}

	public redo(): IUndoRedoResult | null {

		if (this.future.length > 0) {
			const futureStackElement = this.future.pop()!;

			try {
				futureStackElement.redo(this.model);
			} catch (e) {
				onUnexpectedError(e);
				this.clear();
				return null;
			}

			this.past.push(futureStackElement);

			return {
				selections: futureStackElement.afterCursorState,
				recordedVersionId: futureStackElement.afterVersionId
			};
		}

		return null;
	}

	public canRedo(): boolean {
		return (this.future.length > 0);
	}
}
