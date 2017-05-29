/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Position } from 'vs/editor/common/core/position';
import * as nls from 'vs/nls';
import { Range } from 'vs/editor/common/core/range';
import { IModel } from 'vs/editor/common/editorCommon';
import { Selection } from 'vs/editor/common/core/selection';

export class ScreenReaderMessageGenerator {

	public static xSelected(x: string): string {
		return nls.localize(
			{
				key: 'x.selected',
				comment: ['A piece of text was added to the selection (this should be a message suitable for a Screen Reader).']
			},
			"{0}\nSelected",
			x
		);
	}

	public static xUnselected(x: string): string {
		return nls.localize(
			{
				key: 'x.unselected',
				comment: ['A piece of text was removed from the selection (this should be a message suitable for a Screen Reader).']
			},
			"{0}\nUnselected",
			x
		);
	}

	public static xCharsSelected(x: number): string {
		return nls.localize(
			{
				key: 'x.chars.selected',
				comment: ['A large number of characters were added to the selection (this should be a message suitable for a Screen Reader).']
			},
			"{0}\nCharacters selected",
			x
		);
	}

	public static xCharsUnselected(x: number): string {
		return nls.localize(
			{
				key: 'x.chars.unselected',
				comment: ['A large number of characters were removed from the selection (this should be a message suitable for a Screen Reader).']
			},
			"{0}\nCharacters unselected",
			x
		);
	}

	public static generateMessage(source: string, model: IModel, oldModelId: number, oldSelection: Selection, newModelId: number, newSelection: Selection): string {
		if (oldModelId === newModelId) {
			return this._cursorChangeMessage(source, model, oldSelection, newSelection);
		}
		return 'TODO';
	}

	private static _cursorChangeMessage(source: string, model: IModel, oldSelection: Selection, newSelection: Selection): string {
		if (oldSelection.equalsRange(newSelection)) {
			return '';
		}

		if (oldSelection.isEmpty()) {

			if (newSelection.isEmpty()) {
				// ...[]... => ...[]...
				return this._cursorMoveMessage(source, model, oldSelection.getPosition(), newSelection.getPosition());
			}

			// ...[]... => ...[x]...:
			return this._cursorSelectedMessage(model, newSelection);
		}

		if (newSelection.isEmpty()) {
			if (oldSelection.containsPosition(newSelection.getPosition())) {
				// ...a[xy]b... => ...a[]xyb... or ...ax[]yb... or ...axy[]b...
				return this._cursorUnselectedMessage(model, oldSelection);
			}

			// moved away from the old selection and collapsed it
			return this._cursorMoveMessage(source, model, oldSelection.getPosition(), newSelection.getPosition()) + '\n' + this._cursorUnselectedMessage(model, oldSelection);
		}

		// ...[x]... => ...[y]...

		if (newSelection.getStartPosition().equals(oldSelection.getStartPosition())) {

			// ...a[x]... => ...a[y]...

			if (newSelection.getEndPosition().isBefore(oldSelection.getEndPosition())) {
				// ...a[xy]... => ...a[x]y...
				return this._cursorUnselectedMessage(model, new Range(newSelection.endLineNumber, newSelection.endColumn, oldSelection.endLineNumber, oldSelection.endColumn));

			}

			// ...a[x]y... => ...a[xy]...
			return this._cursorSelectedMessage(model, new Range(oldSelection.endLineNumber, oldSelection.endColumn, newSelection.endLineNumber, newSelection.endColumn));

		}

		if (newSelection.getEndPosition().equals(oldSelection.getEndPosition())) {

			// ...[x]a... => ...[y]a...

			if (newSelection.getStartPosition().isBefore(oldSelection.getStartPosition())) {
				// ...y[x]a... => ...[yx]a...
				return this._cursorSelectedMessage(model, new Range(newSelection.startLineNumber, newSelection.startColumn, oldSelection.startLineNumber, oldSelection.startColumn));
			}

			// ...[yx]a... => ...y[x]a...
			return this._cursorUnselectedMessage(model, new Range(oldSelection.startLineNumber, oldSelection.startColumn, newSelection.startLineNumber, newSelection.startColumn));

		}

		// weird jump
		return this._cursorSelectedMessage(model, newSelection) + '\n' + this._cursorUnselectedMessage(model, oldSelection);

	}

	private static _cursorMoveMessage(source: string, model: IModel, oldPosition: Position, newPosition: Position): string {

		if (source === 'moveWordCommand') {
			return model.getValueInRange(new Range(oldPosition.lineNumber, oldPosition.column, newPosition.lineNumber, newPosition.column));
		}

		const oldLineNumber = oldPosition.lineNumber;
		const oldColumn = oldPosition.column;
		const newLineNumber = newPosition.lineNumber;
		const newColumn = newPosition.column;

		// check going down via right arrow
		if (newLineNumber === oldLineNumber + 1 && newColumn === 1 && oldColumn === model.getLineMaxColumn(oldLineNumber)) {
			return this._cursorCharMessage(model, newPosition);
		}

		// check going up via up arrow
		if (newLineNumber === oldLineNumber - 1 && newColumn === model.getLineMaxColumn(newLineNumber) && oldColumn === 1) {
			return this._cursorCharMessage(model, newPosition);
		}

		const lineCount = model.getLineCount();
		if (oldLineNumber !== newLineNumber) {
			if (newLineNumber === lineCount) {
				// Last line does not have an EOL
				return model.getLineContent(newLineNumber);
			}
			return model.getLineContent(newLineNumber) + model.getEOL();
		}

		return this._cursorCharMessage(model, newPosition);
	}

	private static _cursorCharMessage(model: IModel, position: Position): string {
		const lineNumber = position.lineNumber;
		const column = position.column;

		const maxLineColumn = model.getLineMaxColumn(lineNumber);
		if (column === maxLineColumn) {
			const lineCount = model.getLineCount();
			if (lineNumber === lineCount) {
				// At the end of the file
				return '';
			}
			return model.getEOL();
		}
		return model.getLineContent(lineNumber).charAt(column - 1);
	}

	private static _cursorSelectedMessage(model: IModel, range: Range): string {
		const valueLength = model.getValueLengthInRange(range);
		if (valueLength > 512) {
			return this.xCharsSelected(valueLength);
		}
		return this.xSelected(model.getValueInRange(range));
	}

	private static _cursorUnselectedMessage(model: IModel, range: Range): string {
		const valueLength = model.getValueLengthInRange(range);
		if (valueLength > 512) {
			return this.xCharsUnselected(valueLength);
		}
		return this.xUnselected(model.getValueInRange(range));
	}

}
