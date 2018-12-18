/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SelectionRangeProvider, SelectionRange } from 'vs/editor/common/modes';
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export class WordSelectionRangeProvider implements SelectionRangeProvider {

	provideSelectionRanges(model: ITextModel, position: Position): SelectionRange[] {
		let result: SelectionRange[] = [];
		this._addWordRanges(result, model, position);
		this._addLineRanges(result, model, position);
		return result;
	}

	private _addWordRanges(bucket: SelectionRange[], model: ITextModel, pos: Position): void {
		const word = model.getWordAtPosition(pos);
		if (word) {
			bucket.push({ range: new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn), kind: 'statement.word' });
		}
	}

	private _addLineRanges(bucket: SelectionRange[], model: ITextModel, pos: Position): void {
		bucket.push({ range: new Range(pos.lineNumber, model.getLineFirstNonWhitespaceColumn(pos.lineNumber), pos.lineNumber, model.getLineLastNonWhitespaceColumn(pos.lineNumber)), kind: 'statement.line' });
		bucket.push({ range: new Range(pos.lineNumber, model.getLineMinColumn(pos.lineNumber), pos.lineNumber, model.getLineMaxColumn(pos.lineNumber)), kind: 'statement.line.full' });
	}
}
