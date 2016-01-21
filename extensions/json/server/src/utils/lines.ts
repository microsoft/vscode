/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	Position
} from 'vscode-languageserver';

export interface LinesModel {
	/**
	 * Converts a zero-based offset to a position.
	 *
	 * @param offset A zero-based offset.
	 * @return A valid [position](#Position).
	 */
	positionAt(offset: number): Position;

	/**
	 * Converts the position to a zero-based offset.
	 *
	 * The position will be [adjusted](#TextDocument.validatePosition).
	 *
	 * @param position A position.
	 * @return A valid zero-based offset.
	 */
	offsetAt(position: Position): number;

	/**
	 * The number of lines in this document.
	 *
	 * @readonly
	 */
	lineCount: number;
}

export function create(text:string) : LinesModel {
	const lineStarts: number[] = [];
	var isLineStart = true;
	for (let i = 0; i < text.length; i++) {
		if (isLineStart) {
			lineStarts.push(i);
			isLineStart = false;
		}
		var ch = text.charAt(i);
		isLineStart = (ch === '\r' || ch === '\n');
		if (ch === '\r' && i + 1 < text.length && text.charAt(i+1) === '\n') {
			i++;
		}
	}
	if (isLineStart && text.length > 0) {
		lineStarts.push(text.length);
	}
	return {
		positionAt: (offset:number) => {
			offset = Math.max(Math.min(offset, text.length), 0);
			let low = 0, high = lineStarts.length;
			if (high === 0) {
				return Position.create(0, offset);
			}
			while (low < high) {
				let mid = Math.floor((low + high) / 2);
				if (lineStarts[mid] > offset) {
					high = mid;
				} else {
					low = mid + 1;
				}
			}
			// low is the least x for which the line offset is larger than the offset
			// or array.length if no element fullfills the given function.
			var line = low - 1;
			return Position.create(line, offset - lineStarts[line]);
		},
		offsetAt: (position: Position) => {
			if (position.line >= lineStarts.length) {
				return text.length;
			} else if (position.line < 0) {
				return 0;
			}
			var lineStart = lineStarts[position.line];
			var nextLineStart = (position.line + 1 < lineStarts.length) ? lineStarts[position.line + 1] : text.length;
			return Math.max(Math.min(lineStart + position.character, nextLineStart), lineStart);
		},
		lineCount: lineStarts.length
	}

}
