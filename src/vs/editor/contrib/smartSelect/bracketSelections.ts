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
		return new Promise(resolve => BracketSelectionRangeProvider._bracketsRightYield(resolve, model, position, ranges))
			.then(() => new Promise(resolve => BracketSelectionRangeProvider._bracketsLeftYield(resolve, model, position, ranges, bucket)))
			.then(() => bucket);
	}

	private static readonly _maxDuration = 90;

	private static _bracketsRightYield(resolve: () => void, model: ITextModel, pos: Position, ranges: Map<string, Range[]>): void {
		const counts = new Map<string, number>();
		const t1 = Date.now();
		while (true) {
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
				setTimeout(() => BracketSelectionRangeProvider._bracketsRightYield(resolve, model, pos, ranges));
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

	private static _bracketsLeftYield(resolve: () => void, model: ITextModel, pos: Position, ranges: Map<string, Range[]>, bucket: Range[]): void {
		const counts = new Map<string, number>();
		const t1 = Date.now();
		while (true) {
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
				setTimeout(() => BracketSelectionRangeProvider._bracketsLeftYield(resolve, model, pos, ranges, bucket));
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
					if (arr && arr.length > 0) {
						let closing = arr.shift();
						bucket.push(Range.fromPositions(bracket.range.getEndPosition(), closing!.getStartPosition()));
						bucket.push(Range.fromPositions(bracket.range.getStartPosition(), closing!.getEndPosition()));
					}
				}
			}
			pos = bracket.range.getStartPosition();
		}
	}
}
