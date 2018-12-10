/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SelectionRangeProvider } from 'vs/editor/common/modes';
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export class BracketSelectionRangeProvider implements SelectionRangeProvider {

	provideSelectionRanges(model: ITextModel, position: Position): Promise<Range[]> {
		const bucket: Range[] = [];
		const ranges = new Map<string, Range[]>();
		return new Promise(resolve => BracketSelectionRangeProvider._bracketsRightYield(resolve, 0, model, position, ranges))
			.then(() => new Promise(resolve => BracketSelectionRangeProvider._bracketsLeftYield(resolve, 0, model, position, ranges, bucket)))
			.then(() => bucket);
	}

	private static readonly _maxDuration = 30;
	private static readonly _maxRounds = 2;

	private static _bracketsRightYield(resolve: () => void, round: number, model: ITextModel, pos: Position, ranges: Map<string, Range[]>): void {
		const counts = new Map<string, number>();
		const t1 = Date.now();
		while (true) {
			if (round >= BracketSelectionRangeProvider._maxRounds) {
				resolve();
				break;
			}
			if (!pos) {
				resolve();
				break;
			}
			let bracket = model.findNextBracket(pos);
			if (!bracket) {
				resolve();
				break;
			}
			let d = Date.now() - t1;
			if (d > BracketSelectionRangeProvider._maxDuration) {
				setTimeout(() => BracketSelectionRangeProvider._bracketsRightYield(resolve, round + 1, model, pos, ranges));
				break;
			}
			const key = bracket.close;
			if (bracket.isOpen) {
				// wait for closing
				let val = counts.has(key) ? counts.get(key) : 0;
				counts.set(key, val + 1);
			} else {
				// process closing
				let val = counts.has(key) ? counts.get(key) : 0;
				val -= 1;
				counts.set(key, Math.max(0, val));
				if (val < 0) {
					let arr = ranges.get(key);
					if (!arr) {
						arr = [];
						ranges.set(key, arr);
					}
					arr.push(bracket.range);
				}
			}
			pos = bracket.range.getEndPosition();
		}
	}

	private static _bracketsLeftYield(resolve: () => void, round: number, model: ITextModel, pos: Position, ranges: Map<string, Range[]>, bucket: Range[]): void {
		const counts = new Map<string, number>();
		const t1 = Date.now();
		while (true) {
			if (round >= BracketSelectionRangeProvider._maxRounds && ranges.size === 0) {
				resolve();
				break;
			}
			if (!pos) {
				resolve();
				break;
			}
			let bracket = model.findPrevBracket(pos);
			if (!bracket) {
				resolve();
				break;
			}
			let d = Date.now() - t1;
			if (d > BracketSelectionRangeProvider._maxDuration) {
				setTimeout(() => BracketSelectionRangeProvider._bracketsLeftYield(resolve, round + 1, model, pos, ranges, bucket));
				break;
			}
			const key = bracket.close;
			if (!bracket.isOpen) {
				// wait for opening
				let val = counts.has(key) ? counts.get(key) : 0;
				counts.set(key, val + 1);
			} else {
				// opening
				let val = counts.has(key) ? counts.get(key) : 0;
				val -= 1;
				counts.set(key, Math.max(0, val));
				if (val < 0) {
					let arr = ranges.get(key);
					if (arr) {
						let closing = arr.shift();
						if (arr.length === 0) {
							ranges.delete(key);
						}
						const innerBracket = Range.fromPositions(bracket.range.getEndPosition(), closing!.getStartPosition());
						const outerBracket = Range.fromPositions(bracket.range.getStartPosition(), closing!.getEndPosition());
						bucket.push(innerBracket);
						bucket.push(outerBracket);
						BracketSelectionRangeProvider._addBracketLeading(model, outerBracket, bucket);
					}
				}
			}
			pos = bracket.range.getStartPosition();
		}
	}

	private static _addBracketLeading(model: ITextModel, bracket: Range, bucket: Range[]): void {
		if (bracket.startLineNumber === bracket.endLineNumber) {
			return;
		}
		// xxxxxxxx {
		//
		// }
		const startLine = bracket.startLineNumber;
		const column = model.getLineFirstNonWhitespaceColumn(startLine);
		if (column !== 0 && column !== bracket.startColumn) {
			bucket.push(Range.fromPositions(new Position(startLine, column), bracket.getEndPosition()));
			bucket.push(Range.fromPositions(new Position(startLine, 1), bracket.getEndPosition()));
		}

		// xxxxxxxx
		// {
		//
		// }
		const aboveLine = startLine - 1;
		if (aboveLine > 0) {
			const column = model.getLineFirstNonWhitespaceColumn(aboveLine);
			if (column === bracket.startColumn && column !== model.getLineLastNonWhitespaceColumn(aboveLine)) {
				bucket.push(Range.fromPositions(new Position(aboveLine, column), bracket.getEndPosition()));
				bucket.push(Range.fromPositions(new Position(aboveLine, 1), bracket.getEndPosition()));
			}
		}
	}
}
