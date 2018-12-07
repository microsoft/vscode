/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SelectionRangeProvider } from 'vs/editor/common/modes';
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export class BracketSelectionRangeProvider implements SelectionRangeProvider {

	provideSelectionRanges(model: ITextModel, position: Position): Range[] {
		let result: Range[] = [];
		this._computeBracketRanges(model, position, result);
		return result;
	}

	private _computeBracketRanges(model: ITextModel, position: Position, bucket: Range[]): void {

		let ranges = new Map<string, Range[]>();

		// right/down
		let counts = new Map<string, number>();
		let pos: Position | undefined = position;
		while (true) {
			if (!pos) {
				break;
			}
			let bracket = model.findNextBracket(pos);
			if (!bracket) {
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

		// left/up
		counts.clear();
		pos = position;
		while (true) {
			if (!pos) {
				break;
			}
			let bracket = model.findPrevBracket(pos);
			if (!bracket) {
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
