/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../../base/common/strings.js';
import { EditOperation, ISingleEditOperation } from '../../../common/core/editOperation.js';
import { Position } from '../../../common/core/position.js';
import { Selection } from '../../../common/core/selection.js';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from '../../../common/editorCommon.js';
import { ITextModel } from '../../../common/model.js';

export class InsertFinalNewLineCommand implements ICommand {

	private readonly _selection: Selection;
	private _selectionId: string | null;


	constructor(selection: Selection) {
		this._selection = selection;
		this._selectionId = null;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		const op = insertFinalNewLine(model);
		if (op) {
			builder.addEditOperation(op.range, op.text);
		}
		this._selectionId = builder.trackSelection(this._selection);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this._selectionId!);
	}
}

/**
 * Generate edit operations for inserting a final new line if needed.
 * Returns undefined if no edit is needed.
 */
export function insertFinalNewLine(model: ITextModel): ISingleEditOperation | undefined {
	const lineCount = model.getLineCount();
	const lastLine = model.getLineContent(lineCount);
	const lastLineIsEmptyOrWhitespace = strings.lastNonWhitespaceIndex(lastLine) === -1;

	if (!lineCount || lastLineIsEmptyOrWhitespace) {
		return;
	}

	return EditOperation.insert(
		new Position(lineCount, model.getLineMaxColumn(lineCount)),
		model.getEOL()
	);
}
