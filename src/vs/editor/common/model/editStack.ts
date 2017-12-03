/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { ICursorStateComputer, IEditableTextModel, IIdentifiedSingleEditOperation, IHistory } from 'vs/editor/common/editorCommon';
import { HistoryEvent } from 'vs/editor/common/model/textModelEvents';
import { Selection } from 'vs/editor/common/core/selection';

interface IEditOperation {
	operations: IIdentifiedSingleEditOperation[];
}

interface IStackElement {
	beforeVersionId: number;
	beforeCursorState: Selection[];

	editOperations: IEditOperation[];

	afterCursorState: Selection[];
	afterVersionId: number;
	timestamp: number;
	index: number;

	past: IStackElement | undefined;

	futures: IStackElement[];
	future: IStackElement;
}

export interface IUndoRedoResult {
	selections: Selection[];
	recordedVersionId: number;
}

export class EditStack {

	private model: IEditableTextModel;
	private notifyHistory: (e: HistoryEvent) => void;
	private currentOpenStackElement: IStackElement;
	private now: IStackElement;
	private root: IStackElement;
	private index = 0;
	private indexLookup: IStackElement[] = [];

	constructor(model: IEditableTextModel, notifyHistory: (e: HistoryEvent) => void) {
		this.model = model;
		this.notifyHistory = notifyHistory;
		this.clear();
	}

	public pushStackElement(): void {
		this.currentOpenStackElement = null;
	}

	public clear(): void {
		this.openStackElement([]);
		this.now = this.root = this.currentOpenStackElement;
		this.pushStackElement();
		this.notifyHistory(HistoryEvent.Change);
	}

	private openStackElement(beforeCursorState: Selection[]) {
		this.currentOpenStackElement = {
			beforeVersionId: this.model.getAlternativeVersionId(),
			beforeCursorState: beforeCursorState,
			editOperations: [],
			afterCursorState: null,
			afterVersionId: -1,
			timestamp: Date.now(),
			past: this.now,
			futures: [],
			future: undefined,
			index: this.index
		};
		this.indexLookup[this.index++] = this.currentOpenStackElement;
	}

	public getHistory(): IHistory {
		return {
			now: this.now,
			root: this.root
		};
	}

	public pushEditOperation(beforeCursorState: Selection[], editOperations: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer): Selection[] {

		if (!this.currentOpenStackElement) {
			this.openStackElement(beforeCursorState);
			// connect the newly opened element with the history.
			this.now.futures.push(this.currentOpenStackElement);
			this.now.future = this.currentOpenStackElement;
			this.now = this.currentOpenStackElement;
		}

		const inverseEditOperation: IEditOperation = {
			operations: this.model.applyEdits(editOperations)
		};

		this.currentOpenStackElement.editOperations.push(inverseEditOperation);
		try {
			this.currentOpenStackElement.afterCursorState = cursorStateComputer ? cursorStateComputer(inverseEditOperation.operations) : null;
		} catch (e) {
			onUnexpectedError(e);
			this.currentOpenStackElement.afterCursorState = null;
		}

		this.currentOpenStackElement.afterVersionId = this.model.getVersionId();
		this.notifyHistory(HistoryEvent.Change);
		return this.currentOpenStackElement.afterCursorState;
	}

	private applyUndoOperations(editOperations) {
		// Apply all operations in reverse order
		for (let i = editOperations.length - 1; i >= 0; i--) {
			editOperations[i] = {
				operations: this.model.applyEdits(editOperations[i].operations)
			};
		}
	}

	private applyRedoOperations(editOperations) {
		// Apply all operations
		for (let i = 0; i < editOperations.length; i++) {
			editOperations[i] = {
				operations: this.model.applyEdits(editOperations[i].operations)
			};
		}
	}

	public undo(): IUndoRedoResult {

		this.pushStackElement();

		if (this.now !== this.root) {
			const pastStackElement = this.now;
			this.now = this.now.past;

			try {
				this.applyUndoOperations(pastStackElement.editOperations);
			} catch (e) {
				this.clear();
				return null;
			}

			this.notifyHistory(HistoryEvent.Move);
			return {
				selections: pastStackElement.beforeCursorState,
				recordedVersionId: pastStackElement.beforeVersionId
			};
		}

		return null;
	}

	public redo(): IUndoRedoResult {
		const futureStackElement = this.now.future;

		if (futureStackElement) {
			if (this.currentOpenStackElement) {
				throw new Error('How is this possible?');
			}

			this.now = futureStackElement;

			try {
				this.applyRedoOperations(futureStackElement.editOperations);
			} catch (e) {
				this.clear();
				return null;
			}

			this.notifyHistory(HistoryEvent.Move);
			return {
				selections: futureStackElement.afterCursorState,
				recordedVersionId: futureStackElement.afterVersionId
			};
		}

		return null;
	}

	public moveTo(index: number): IUndoRedoResult {
		let toEl = this.indexLookup[index];
		let ret = null;
		if (toEl !== undefined) {
			this.pushStackElement();

			// find common ancestor and store the path
			const redoPath = [];
			const undoPath = [];
			let fromEl = this.now;

			while (fromEl !== toEl) {
				if (fromEl.index < toEl.index) {
					// toEl is further away from the common ancestor, so take a step for toEl
					redoPath.push(toEl);
					toEl = toEl.past;
				} else if (fromEl.index > toEl.index) {
					// fromEl is further away from the common ancestor, so take a step for fromEl
					undoPath.push(fromEl);
					fromEl = fromEl.past;
				}
			}

			// undo all the way to the common ancestor
			for (let pastStackElement of undoPath) {
				this.now = this.now.past;

				try {
					this.applyUndoOperations(pastStackElement.editOperations);
				} catch (e) {
					this.clear();
					return null;
				}

				ret = {
					selections: pastStackElement.beforeCursorState,
					recordedVersionId: pastStackElement.beforeVersionId
				};
			}

			// redo from common ancestor to the node
			for (let j = redoPath.length - 1; j >= 0; j--) {
				let futureStackElement = redoPath[j];

				this.now = futureStackElement;
				if (this.now.past) {
					this.now.past.future = futureStackElement;
				}

				try {
					this.applyRedoOperations(futureStackElement.editOperations);
				} catch (e) {
					this.clear();
					return null;
				}

				ret = {
					selections: futureStackElement.afterCursorState,
					recordedVersionId: futureStackElement.afterVersionId
				};

			}
		}

		if (ret !== null) {
			this.notifyHistory(HistoryEvent.Move);
		}

		return ret;
	}
}
