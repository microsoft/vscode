/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../util/vs/base/common/charCode';
import { Position } from '../../../util/vs/editor/common/core/position';

export class OffsetLineColumnConverter {
	private readonly _lineStartOffsets: number[];

	/** 1-based number of lines in the source text. */
	public get lines() {
		return this._lineStartOffsets.length;
	}

	constructor(text: string) {
		this._lineStartOffsets = [0];
		let index = 0;
		while (index < text.length) {
			const ch = text.charCodeAt(index);
			index++; // go to next index
			if (ch === CharCode.CarriageReturn || ch === CharCode.LineFeed) {
				if (ch === CharCode.CarriageReturn && index < text.length && text.charCodeAt(index) === CharCode.LineFeed) {
					index++;
				}
				this._lineStartOffsets.push(index);
			}
		}
	}

	public lineOffset(lineNumber: number): number {
		return this._lineStartOffsets[lineNumber - 1];
	}

	public offsetToPosition(offset: number): Position {
		let lineNumber = 1;
		for (; lineNumber < this._lineStartOffsets.length; lineNumber++) {
			if (this._lineStartOffsets[lineNumber] > offset) {
				break;
			}
		}
		const column = offset - this._lineStartOffsets[lineNumber - 1];
		return new Position(lineNumber, column + 1);
	}

	public startOffsetOfLineContaining(offset: number): number {
		let lineNumber = 1;
		for (; lineNumber < this._lineStartOffsets.length; lineNumber++) {
			if (this._lineStartOffsets[lineNumber] > offset) {
				break;
			}
		}
		return this._lineStartOffsets[lineNumber - 1];
	}

	public positionToOffset(position: Position): number {
		if (position.lineNumber >= this._lineStartOffsets.length) {
			return this._lineStartOffsets[this._lineStartOffsets.length - 1] + position.column - 1;
		}
		return this._lineStartOffsets[position.lineNumber - 1] + position.column - 1;
	}
}
