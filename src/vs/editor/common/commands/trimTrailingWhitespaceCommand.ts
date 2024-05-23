/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from 'vs/editor/common/editorCommon';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ITextModel } from 'vs/editor/common/model';

export class TrimTrailingWhitespaceCommand implements ICommand {

	private readonly _selection: Selection;
	private _selectionId: string | null;
	private readonly _cursors: Position[];
	private readonly _trimInRegexesAndStrings: boolean;

	constructor(selection: Selection, cursors: Position[], trimInRegexesAndStrings: boolean) {
		this._selection = selection;
		this._cursors = cursors;
		this._selectionId = null;
		this._trimInRegexesAndStrings = trimInRegexesAndStrings;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		const ops = trimTrailingWhitespace(model, this._cursors, this._trimInRegexesAndStrings);
		for (let i = 0, len = ops.length; i < len; i++) {
			const op = ops[i];

			builder.addEditOperation(op.range, op.text);
		}

		this._selectionId = builder.trackSelection(this._selection);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this._selectionId!);
	}
}

/**
 * Generate commands for trimming trailing whitespace on a model and ignore lines on which cursors are sitting.
 */
export function trimTrailingWhitespace(model: ITextModel, cursors: Position[], trimInRegexesAndStrings: boolean): ISingleEditOperation[] {
	// Sort cursors ascending
	cursors.sort((a, b) => {
		if (a.lineNumber === b.lineNumber) {
			return a.column - b.column;
		}
		return a.lineNumber - b.lineNumber;
	});

	// Reduce multiple cursors on the same line and only keep the last one on the line
	for (let i = cursors.length - 2; i >= 0; i--) {
		if (cursors[i].lineNumber === cursors[i + 1].lineNumber) {
			// Remove cursor at `i`
			cursors.splice(i, 1);
		}
	}

	const r: ISingleEditOperation[] = [];
	let rLen = 0;
	let cursorIndex = 0;
	const cursorLen = cursors.length;

	for (let lineNumber = 1, lineCount = model.getLineCount(); lineNumber <= lineCount; lineNumber++) {
		const lineContent = model.getLineContent(lineNumber);
		const maxLineColumn = lineContent.length + 1;
		let minEditColumn = 0;

		if (cursorIndex < cursorLen && cursors[cursorIndex].lineNumber === lineNumber) {
			minEditColumn = cursors[cursorIndex].column;
			cursorIndex++;
			if (minEditColumn === maxLineColumn) {
				// The cursor is at the end of the line => no edits for sure on this line
				continue;
			}
		}

		if (lineContent.length === 0) {
			continue;
		}

		const lastNonWhitespaceIndex = strings.lastNonWhitespaceIndex(lineContent);

		let fromColumn = 0;
		if (lastNonWhitespaceIndex === -1) {
			// Entire line is whitespace
			fromColumn = 1;
		} else if (lastNonWhitespaceIndex !== lineContent.length - 1) {
			// There is trailing whitespace
			fromColumn = lastNonWhitespaceIndex + 2;
		} else {
			// There is no trailing whitespace
			continue;
		}

		if (!trimInRegexesAndStrings) {
			if (!model.tokenization.hasAccurateTokensForLine(lineNumber)) {
				// We don't want to force line tokenization, as that can be expensive, but we also don't want to trim
				// trailing whitespace in lines that are not tokenized yet, as that can be wrong and trim whitespace from
				// lines that the user requested we don't. So we bail out if the tokens are not accurate for this line.
				continue;
			}

			const lineTokens = model.tokenization.getLineTokens(lineNumber);
			const fromColumnType = lineTokens.getStandardTokenType(lineTokens.findTokenIndexAtOffset(fromColumn));

			if (fromColumnType === StandardTokenType.String || fromColumnType === StandardTokenType.RegEx) {
				continue;
			}
		}

		fromColumn = Math.max(minEditColumn, fromColumn);
		r[rLen++] = EditOperation.delete(new Range(
			lineNumber, fromColumn,
			lineNumber, maxLineColumn
		));
	}

	return r;
}
