/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from '../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { IWordAtPosition, getWordAtText } from '../../../../../../../editor/common/core/wordHelper.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';

export function escapeForCharClass(text: string): string {
	return text.replace(/[-\\^\]]/g, '\\$&');
}

export interface IChatCompletionRangeResult {
	insert: Range;
	replace: Range;
	varWord: IWordAtPosition | null;
}

export function computeCompletionRanges(model: ITextModel, position: Position, reg: RegExp, onlyOnWordStart = false): IChatCompletionRangeResult | undefined {
	const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
	if (!varWord && model.getWordUntilPosition(position).word) {
		// inside a "normal" word
		return;
	}

	if (!varWord && position.column > 1) {
		const textBefore = model.getValueInRange(new Range(position.lineNumber, position.column - 1, position.lineNumber, position.column));
		if (textBefore !== ' ') {
			return;
		}
	}

	if (varWord && onlyOnWordStart) {
		const wordBefore = model.getWordUntilPosition({ lineNumber: position.lineNumber, column: varWord.startColumn });
		if (wordBefore.word) {
			// inside a word
			return;
		}
	}

	let insert: Range;
	let replace: Range;
	if (!varWord) {
		insert = replace = Range.fromPositions(position);
	} else {
		insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
		replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
	}

	return { insert, replace, varWord };
}

export function isEmptyUpToCompletionWord(model: ITextModel, rangeResult: IChatCompletionRangeResult): boolean {
	const startToCompletionWordStart = new Range(1, 1, rangeResult.replace.startLineNumber, rangeResult.replace.startColumn);
	return !!model.getValueInRange(startToCompletionWordStart).match(/^\s*$/);
}
