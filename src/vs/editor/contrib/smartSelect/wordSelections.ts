/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SelectionRangeProvider, StandardTokenType } from 'vs/editor/common/modes';
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export class WordSelectionRangeProvider implements SelectionRangeProvider {

	provideSelectionRanges(model: ITextModel, position: Position): Range[] {
		let result: Range[] = [];
		this._addWordRanges(result, model, position);
		this._addTokenRange(result, model, position);
		this._addLineRanges(result, model, position);
		return result;
	}

	private _addWordRanges(bucket: Range[], model: ITextModel, pos: Position): void {
		const word = model.getWordAtPosition(pos);
		if (word) {
			bucket.push(new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn));
		}
	}

	private _addTokenRange(bucket: Range[], model: ITextModel, pos: Position): void {
		const tokens = model.getLineTokens(pos.lineNumber);
		const index = tokens.findTokenIndexAtOffset(pos.column - 1);
		const type = tokens.getStandardTokenType(index);
		if (type === StandardTokenType.Other) {
			return;
		}

		// grow left
		let left: Position | undefined;
		{
			let leftIndex = index;
			let leftTokens = tokens;
			let leftLine = pos.lineNumber;
			while (!left) {
				let newLeftIndex = leftIndex - 1;
				if (newLeftIndex < 0) {
					if (leftLine > 1) {
						leftLine -= 1;
						leftTokens = model.getLineTokens(leftLine);
						leftIndex = leftTokens.getCount();
					} else {
						left = new Position(1, 1);
					}
				} else {
					if (leftTokens.getStandardTokenType(newLeftIndex) === type) {
						leftIndex = newLeftIndex;
					} else {
						if (newLeftIndex === leftTokens.getCount() - 1) {
							// we got here but there was nothing
							left = new Position(leftLine + 1, 1);

						} else {
							left = new Position(leftLine, leftTokens.getStartOffset(leftIndex) + 1);
						}
					}
				}
			}
		}

		// grow right
		let right: Position | undefined;
		{
			let rightIndex = index;
			let rightTokens = tokens;
			let rightLine = pos.lineNumber;
			while (!right) {
				let newRightIndex = rightIndex + 1;
				if (newRightIndex >= rightTokens.getCount()) {
					if (rightLine < model.getLineCount()) {
						rightLine += 1;
						rightTokens = model.getLineTokens(rightLine);
						rightIndex = -1;
					} else {
						right = new Position(model.getLineCount(), model.getLineMaxColumn(model.getLineCount()));
					}
				} else {
					if (rightTokens.getStandardTokenType(newRightIndex) === type) {
						rightIndex = newRightIndex;
					} else {
						if (newRightIndex === 0) {
							// we got here but there was nothing
							right = new Position(rightLine - 1, model.getLineMaxColumn(rightLine - 1));
						} else {
							right = new Position(rightLine, rightTokens.getEndOffset(rightIndex) + 1);
						}
					}
				}
			}
		}

		if (type === StandardTokenType.String) {
			// just assume that quotation marks are length=1
			bucket.push(Range.fromPositions(left.delta(0, 1), right.delta(0, -1)));
			bucket.push(Range.fromPositions(left, right));
		} else {
			bucket.push(Range.fromPositions(left, right));
		}
	}

	private _addLineRanges(bucket: Range[], model: ITextModel, pos: Position): void {
		bucket.push(new Range(pos.lineNumber, model.getLineFirstNonWhitespaceColumn(pos.lineNumber), pos.lineNumber, model.getLineLastNonWhitespaceColumn(pos.lineNumber)));
		bucket.push(new Range(pos.lineNumber, model.getLineMinColumn(pos.lineNumber), pos.lineNumber, model.getLineMaxColumn(pos.lineNumber)));
	}
}
