/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SelectionRangeProvider } from 'vs/editor/common/modes';
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export class WordSelectionRangeProvider implements SelectionRangeProvider {

	provideSelectionRanges(model: ITextModel, position: Position): Range[] {
		let result: Range[] = [];
		this._addWordRanges(result, model, position);
		this._addLineRanges(result, model, position);
		return result;
	}

	private _addWordRanges(bucket: Range[], model: ITextModel, pos: Position): void {
		const word = model.getWordAtPosition(pos);
		if (word) {
			bucket.push(new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn));
		}
	}

	private _addLineRanges(bucket: Range[], model: ITextModel, pos: Position): void {
		bucket.push(new Range(pos.lineNumber, model.getLineFirstNonWhitespaceColumn(pos.lineNumber), pos.lineNumber, model.getLineLastNonWhitespaceColumn(pos.lineNumber)));
		bucket.push(new Range(pos.lineNumber, model.getLineMinColumn(pos.lineNumber), pos.lineNumber, model.getLineMaxColumn(pos.lineNumber)));
	}
}
