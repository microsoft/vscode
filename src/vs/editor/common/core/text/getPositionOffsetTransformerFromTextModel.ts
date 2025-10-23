/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../model.js';
import { Position } from '../position.js';
import { PositionOffsetTransformerBase } from './positionToOffset.js';

export function getPositionOffsetTransformerFromTextModel(textModel: ITextModel): PositionOffsetTransformerBase {
	return new PositionOffsetTransformerWithTextModel(textModel);
}

class PositionOffsetTransformerWithTextModel extends PositionOffsetTransformerBase {
	constructor(private readonly _textModel: ITextModel) {
		super();
	}

	override getOffset(position: Position): number {
		return this._textModel.getOffsetAt(position);
	}

	override getPosition(offset: number): Position {
		return this._textModel.getPositionAt(offset);
	}
}
