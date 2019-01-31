/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SelectionRangeProvider, SelectionRange } from 'vs/editor/common/modes';
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CharCode } from 'vs/base/common/charCode';
import { isUpperAsciiLetter, isLowerAsciiLetter } from 'vs/base/common/strings';

export class WordSelectionRangeProvider implements SelectionRangeProvider {

	provideSelectionRanges(model: ITextModel, position: Position): SelectionRange[] {
		let result: SelectionRange[] = [];
		this._addInWordRanges(result, model, position);
		this._addWordRanges(result, model, position);
		this._addWhitespaceLine(result, model, position);
		result.push({ range: model.getFullModelRange(), kind: 'statement.all' });
		return result;
	}

	private _addInWordRanges(bucket: SelectionRange[], model: ITextModel, pos: Position): void {
		const obj = model.getWordAtPosition(pos);
		if (!obj) {
			return;
		}
		let { word, startColumn } = obj;
		let offset = pos.column - startColumn;
		let lastCh: number = 0;
		for (; offset < word.length; offset++) {
			let ch = word.charCodeAt(offset);
			if (isUpperAsciiLetter(ch) && isLowerAsciiLetter(lastCh)) {
				// fooBar
				// ^^^
				// ^^^^^^
				bucket.push({ range: new Range(pos.lineNumber, startColumn, pos.lineNumber, startColumn + offset), kind: 'statement.word.part' });
			} else if (ch === CharCode.Underline && lastCh !== CharCode.Underline) {
				// foo_bar
				// ^^^
				// ^^^^^^^
				bucket.push({ range: new Range(pos.lineNumber, startColumn, pos.lineNumber, startColumn + offset), kind: 'statement.word.part' });
				offset += 1;
			} else if (ch === CharCode.Dash && lastCh !== CharCode.Dash) {
				// foo-bar
				// ^^^
				// ^^^^^^^
				bucket.push({ range: new Range(pos.lineNumber, startColumn, pos.lineNumber, startColumn + offset), kind: 'statement.word.part' });
				offset += 1;
			}
			lastCh = ch;
		}
	}

	private _addWordRanges(bucket: SelectionRange[], model: ITextModel, pos: Position): void {
		const word = model.getWordAtPosition(pos);
		if (word) {
			bucket.push({ range: new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn), kind: 'statement.word' });
		}
	}

	private _addWhitespaceLine(bucket: SelectionRange[], model: ITextModel, pos: Position): void {
		if (model.getLineLength(pos.lineNumber) > 0
			&& model.getLineFirstNonWhitespaceColumn(pos.lineNumber) === 0
			&& model.getLineLastNonWhitespaceColumn(pos.lineNumber) === 0
		) {
			bucket.push({ range: new Range(pos.lineNumber, 1, pos.lineNumber, model.getLineMaxColumn(pos.lineNumber)), kind: 'statement.line' });
		}
	}
}
