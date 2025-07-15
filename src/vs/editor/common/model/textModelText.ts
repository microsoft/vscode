/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../core/range.js';
import { AbstractText } from '../core/text/abstractText.js';
import { TextLength } from '../core/text/textLength.js';
import { ITextModel } from '../model.js';

export class TextModelText extends AbstractText {
	constructor(private readonly _textModel: ITextModel) {
		super();
	}

	override getValueOfRange(range: Range): string {
		return this._textModel.getValueInRange(range);
	}

	override getLineLength(lineNumber: number): number {
		return this._textModel.getLineLength(lineNumber);
	}

	get length(): TextLength {
		const lastLineNumber = this._textModel.getLineCount();
		const lastLineLen = this._textModel.getLineLength(lastLineNumber);
		return new TextLength(lastLineNumber - 1, lastLineLen);
	}
}
