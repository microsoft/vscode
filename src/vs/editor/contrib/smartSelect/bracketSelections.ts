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
		let last: Range | undefined;
		let pos = position;
		let i = 0;
		for (; i < 1750; i++) {
			let bracket = model.findNextBracket(pos);
			if (!bracket) {
				// no more brackets
				break;
			} else if (bracket.isOpen) {
				// skip past the closing bracket
				let matching = model.matchBracket(bracket.range.getEndPosition());
				if (!matching) {
					break;
				}
				pos = model.getPositionAt(model.getOffsetAt(matching[1].getEndPosition()) + 1);

			} else {
				// find matching, opening bracket
				let range = model.findMatchingBracketUp(bracket.close, bracket.range.getStartPosition());
				if (!range) {
					break;
				}
				if (!last || range.getStartPosition().isBefore(last.getStartPosition())) {
					const inner = Range.fromPositions(range.getStartPosition(), bracket.range.getEndPosition());
					const outer = Range.fromPositions(range.getEndPosition(), bracket.range.getStartPosition());
					result.push(inner, outer);
					last = outer;
				}
				pos = model.getPositionAt(model.getOffsetAt(bracket.range.getEndPosition()) + 1);
			}
		}
		return result;
	}
}
