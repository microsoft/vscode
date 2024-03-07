/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IText } from 'vs/editor/common/core/textEdit';
import { ITextModel } from 'vs/editor/common/model';

export class TextModelText implements IText {
	constructor(private readonly _textModel: ITextModel) { }

	getValue(range: Range): string {
		return this._textModel.getValueInRange(range);
	}

	get endPositionExclusive(): Position {
		const lastLineNumber = this._textModel.getLineCount();
		const lastLineLen = this._textModel.getLineLength(lastLineNumber);
		return new Position(lastLineNumber, lastLineLen + 1);
	}
}
