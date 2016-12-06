/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { ICursorStateComputer, IEditableTextModel, IIdentifiedSingleEditOperation } from 'vs/editor/common/editorCommon';
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
}

export interface IUndoRedoResult {
	selections: Selection[];
	recordedVersionId: number;
}

export class EditStack {

	private model: IEditableTextModel;
	private currentOpenStackElement: IStackElement;
	private past: IStackElement[];
	private future: IStackElement[];

	constructor(model: IEditableTextModel) {
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

	public pushEditOperation(beforeCursorState: Selection[], editOperations: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer): Selection[] {
		// No support for parallel universes :(
		this.future = [];

		if (!this.currentOpenStackElement) {
			this.currentOpenStackElement = {
				beforeVersionId: this.model.getAlternativeVersionId(),
				beforeCursorState: beforeCursorState,
				editOperations: [],
				afterCursorState: null,
				afterVersionId: -1
			};
		}

		var inverseEditOperation: IEditOperation = {
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
		return this.currentOpenStackElement.afterCursorState;
	}

	public undo(): IUndoRedoResult {

		this.pushStackElement();

		if (this.past.length > 0) {
			var pastStackElement = this.past.pop();

			try {
				// Apply all operations in reverse order
				for (var i = pastStackElement.editOperations.length - 1; i >= 0; i--) {
					pastStackElement.editOperations[i] = {
						operations: this.model.applyEdits(pastStackElement.editOperations[i].operations)
					};
				}
			} catch (e) {
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

	public redo(): IUndoRedoResult {

		if (this.future.length > 0) {
			if (this.currentOpenStackElement) {
				throw new Error('How is this possible?');
			}

			var futureStackElement = this.future.pop();

			try {
				// Apply all operations
				for (var i = 0; i < futureStackElement.editOperations.length; i++) {
					futureStackElement.editOperations[i] = {
						operations: this.model.applyEdits(futureStackElement.editOperations[i].operations)
					};
				}
			} catch (e) {
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
}
