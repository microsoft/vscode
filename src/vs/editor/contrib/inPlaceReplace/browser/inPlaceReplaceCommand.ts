/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from '../../../common/editorCommon.js';
import { ITextModel } from '../../../common/model.js';

export class InPlaceReplaceCommand implements ICommand {

	private readonly _editRange: Range;
	private readonly _originalSelection: Selection;
	private readonly _text: string;

	constructor(editRange: Range, originalSelection: Selection, text: string) {
		this._editRange = editRange;
		this._originalSelection = originalSelection;
		this._text = text;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._editRange, this._text);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		const inverseEditOperations = helper.getInverseEditOperations();
		const srcRange = inverseEditOperations[0].range;

		if (!this._originalSelection.isEmpty()) {
			// Preserve selection and extends to typed text
			return new Selection(
				srcRange.endLineNumber,
				srcRange.endColumn - this._text.length,
				srcRange.endLineNumber,
				srcRange.endColumn
			);
		}

		return new Selection(
			srcRange.endLineNumber,
			Math.min(this._originalSelection.positionColumn, srcRange.endColumn),
			srcRange.endLineNumber,
			Math.min(this._originalSelection.positionColumn, srcRange.endColumn)
		);
	}
}
