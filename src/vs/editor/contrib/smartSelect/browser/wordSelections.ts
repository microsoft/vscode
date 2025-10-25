/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../../base/common/charCode.js';
import { isLowerAsciiLetter, isUpperAsciiLetter } from '../../../../base/common/strings.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { ITextModel } from '../../../common/model.js';
import { SelectionRange, SelectionRangeProvider } from '../../../common/languages.js';

export class WordSelectionRangeProvider implements SelectionRangeProvider {

	constructor(private readonly selectSubwords = true) { }

	provideSelectionRanges(model: ITextModel, positions: Position[]): SelectionRange[][] {
		const result: SelectionRange[][] = [];
		for (const position of positions) {
			const bucket: SelectionRange[] = [];
			result.push(bucket);
			if (this.selectSubwords) {
				this._addInWordRanges(bucket, model, position);
			}
			this._addWordRanges(bucket, model, position);
			this._addWhitespaceLine(bucket, model, position);
			bucket.push({ range: model.getFullModelRange() });
		}
		return result;
	}

	private _addInWordRanges(bucket: SelectionRange[], model: ITextModel, pos: Position): void {
		const obj = model.getWordAtPosition(pos);
		if (!obj) {
			return;
		}

		const { word, startColumn } = obj;
		const offset = pos.column - startColumn;
		let start = offset;
		let end = offset;
		let lastCh: number = 0;

		// LEFT anchor (start)
		for (; start >= 0; start--) {
			const ch = word.charCodeAt(start);
			if ((start !== offset) && (ch === CharCode.Underline || ch === CharCode.Dash)) {
				// foo-bar OR foo_bar
				break;
			} else if (isLowerAsciiLetter(ch) && isUpperAsciiLetter(lastCh)) {
				// fooBar
				break;
			}
			lastCh = ch;
		}
		start += 1;

		// RIGHT anchor (end)
		for (; end < word.length; end++) {
			const ch = word.charCodeAt(end);
			if (isUpperAsciiLetter(ch) && isLowerAsciiLetter(lastCh)) {
				// fooBar
				break;
			} else if (ch === CharCode.Underline || ch === CharCode.Dash) {
				// foo-bar OR foo_bar
				break;
			}
			lastCh = ch;
		}

		if (start < end) {
			bucket.push({ range: new Range(pos.lineNumber, startColumn + start, pos.lineNumber, startColumn + end) });
		}
	}

	private _addWordRanges(bucket: SelectionRange[], model: ITextModel, pos: Position): void {
		const word = model.getWordAtPosition(pos);
		if (word) {
			bucket.push({ range: new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn) });
		}
	}

	private _addWhitespaceLine(bucket: SelectionRange[], model: ITextModel, pos: Position): void {
		if (model.getLineLength(pos.lineNumber) > 0
			&& model.getLineFirstNonWhitespaceColumn(pos.lineNumber) === 0
			&& model.getLineLastNonWhitespaceColumn(pos.lineNumber) === 0
		) {
			bucket.push({ range: new Range(pos.lineNumber, 1, pos.lineNumber, model.getLineMaxColumn(pos.lineNumber)) });
		}
	}
}
