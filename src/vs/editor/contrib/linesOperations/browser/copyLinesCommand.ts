/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../common/core/range.js';
import { Selection, SelectionDirection } from '../../../common/core/selection.js';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from '../../../common/editorCommon.js';
import { ITextModel } from '../../../common/model.js';

export class CopyLinesCommand implements ICommand {

	private readonly _selection: Selection;
	private readonly _isCopyingDown: boolean;
	private readonly _noop: boolean;

	private _selectionDirection: SelectionDirection;
	private _selectionId: string | null;
	private _startLineNumberDelta: number;
	private _endLineNumberDelta: number;

	constructor(selection: Selection, isCopyingDown: boolean, noop?: boolean) {
		this._selection = selection;
		this._isCopyingDown = isCopyingDown;
		this._noop = noop || false;
		this._selectionDirection = SelectionDirection.LTR;
		this._selectionId = null;
		this._startLineNumberDelta = 0;
		this._endLineNumberDelta = 0;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		let s = this._selection;

		this._startLineNumberDelta = 0;
		this._endLineNumberDelta = 0;
		if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
			this._endLineNumberDelta = 1;
			s = s.setEndPosition(s.endLineNumber - 1, model.getLineMaxColumn(s.endLineNumber - 1));
		}

		const sourceLines: string[] = [];
		for (let i = s.startLineNumber; i <= s.endLineNumber; i++) {
			sourceLines.push(model.getLineContent(i));
		}
		const sourceText = sourceLines.join('\n');

		if (sourceText === '') {
			// Duplicating empty line
			if (this._isCopyingDown) {
				this._startLineNumberDelta++;
				this._endLineNumberDelta++;
			}
		}

		if (this._noop) {
			// Use a unique no-op edit range anchored at this cursor's column so
			// multiple no-op commands produced for cursors on the same line do
			// not collide in the cursor-conflict resolution (which would drop
			// all but one of those cursors). See issue #309282. Each no-op
			// replaces a single character on the source line with the same
			// character — a true round-trip — but the range itself differs per
			// cursor so the operations don't overlap.
			const noopLine = s.endLineNumber;
			const noopLineMaxColumn = model.getLineMaxColumn(noopLine);
			let noopRange: Range;
			if (noopLineMaxColumn > 1) {
				// Clamp the cursor's column into the valid intra-line range so
				// the round-trip range is always one character wide.
				const cursorColumn = Math.min(Math.max(this._selection.endColumn, 1), noopLineMaxColumn);
				const startColumn = cursorColumn < noopLineMaxColumn ? cursorColumn : noopLineMaxColumn - 1;
				noopRange = new Range(noopLine, startColumn, noopLine, startColumn + 1);
			} else {
				// Empty source line — there is no character to round-trip on
				// the line itself, so anchor the no-op across the trailing
				// newline. Cursors on a fully empty line cannot be visually
				// distinguished, so any residual collision is benign.
				noopRange = new Range(noopLine, noopLineMaxColumn, noopLine === model.getLineCount() ? noopLine : noopLine + 1, 1);
			}
			builder.addEditOperation(noopRange, model.getValueInRange(noopRange));
		} else {
			if (!this._isCopyingDown) {
				builder.addEditOperation(new Range(s.endLineNumber, model.getLineMaxColumn(s.endLineNumber), s.endLineNumber, model.getLineMaxColumn(s.endLineNumber)), '\n' + sourceText);
			} else {
				builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), sourceText + '\n');
			}
		}

		this._selectionId = builder.trackSelection(s);
		this._selectionDirection = this._selection.getDirection();
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		let result = helper.getTrackedSelection(this._selectionId!);

		if (this._startLineNumberDelta !== 0 || this._endLineNumberDelta !== 0) {
			let startLineNumber = result.startLineNumber;
			let startColumn = result.startColumn;
			let endLineNumber = result.endLineNumber;
			let endColumn = result.endColumn;

			if (this._startLineNumberDelta !== 0) {
				startLineNumber = startLineNumber + this._startLineNumberDelta;
				startColumn = 1;
			}

			if (this._endLineNumberDelta !== 0) {
				endLineNumber = endLineNumber + this._endLineNumberDelta;
				endColumn = 1;
			}

			result = Selection.createWithDirection(startLineNumber, startColumn, endLineNumber, endColumn, this._selectionDirection);
		}

		return result;
	}
}
