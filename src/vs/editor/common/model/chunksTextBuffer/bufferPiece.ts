/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CharCode } from 'vs/base/common/charCode';

export class LeafOffsetLenEdit {
	constructor(
		public readonly start: number,
		public readonly length: number,
		public readonly text: string
	) { }
}

export class BufferPiece {
	private readonly _str: string;
	public get text(): string { return this._str; }

	private readonly _lineStarts: Uint32Array;

	constructor(str: string, lineStarts: Uint32Array = null) {
		this._str = str;
		if (lineStarts === null) {
			this._lineStarts = createUint32Array(createLineStarts(str).lineStarts);
		} else {
			this._lineStarts = lineStarts;
		}
	}

	public length(): number {
		return this._str.length;
	}

	public newLineCount(): number {
		return this._lineStarts.length;
	}

	public lineStartFor(relativeLineIndex: number): number {
		return this._lineStarts[relativeLineIndex];
	}

	public charCodeAt(index: number): number {
		return this._str.charCodeAt(index);
	}

	public substr(from: number, length: number): string {
		return this._str.substr(from, length);
	}

	public findLineStartBeforeOffset(offset: number): number {
		if (this._lineStarts.length === 0 || offset < this._lineStarts[0]) {
			return -1;
		}

		// TODO: implement binary search
		for (let i = this._lineStarts.length - 1; i >= 0; i--) {
			let lineStart = this._lineStarts[i];

			if (lineStart <= offset) {
				return i;
			}
		}

		return -1;
	}

	public findLineFirstNonWhitespaceIndexInLeaf(searchStartOffset: number): number {
		for (let i = searchStartOffset, len = this._str.length; i < len; i++) {
			const chCode = this._str.charCodeAt(i);
			if (chCode === CharCode.CarriageReturn || chCode === CharCode.LineFeed) {
				// Reached EOL
				return -1;
			}
			if (chCode !== CharCode.Space && chCode !== CharCode.Tab) {
				return i;
			}
		}
		return -1;
	}

	public static normalizeEOL(target: BufferPiece, eol: '\r\n' | '\n'): BufferPiece {
		return new BufferPiece(target._str.replace(/\r\n|\r|\n/g, eol));
	}

	public static deleteLastChar(target: BufferPiece): BufferPiece {
		const targetCharsLength = target.length();
		const targetLineStartsLength = target.newLineCount();
		const targetLineStarts = target._lineStarts;

		let newLineStartsLength;
		if (targetLineStartsLength > 0 && targetLineStarts[targetLineStartsLength - 1] === targetCharsLength) {
			newLineStartsLength = targetLineStartsLength - 1;
		} else {
			newLineStartsLength = targetLineStartsLength;
		}

		let newLineStarts = new Uint32Array(newLineStartsLength);
		newLineStarts.set(targetLineStarts); // TODO: does this work correctly?

		return new BufferPiece(
			target._str.substr(0, targetCharsLength - 1),
			newLineStarts
		);
	}

	public static insertFirstChar(target: BufferPiece, character: number): BufferPiece {
		const targetLineStartsLength = target.newLineCount();
		const targetLineStarts = target._lineStarts;
		const insertLineStart = ((character === CharCode.CarriageReturn && (targetLineStartsLength === 0 || targetLineStarts[0] !== 1 || target.charCodeAt(0) !== CharCode.LineFeed)) || (character === CharCode.LineFeed));

		const newLineStartsLength = (insertLineStart ? targetLineStartsLength + 1 : targetLineStartsLength);
		let newLineStarts = new Uint32Array(newLineStartsLength);

		if (insertLineStart) {
			newLineStarts[0] = 1;
			for (let i = 0; i < targetLineStartsLength; i++) {
				newLineStarts[i + 1] = targetLineStarts[i] + 1;
			}
		} else {
			for (let i = 0; i < targetLineStartsLength; i++) {
				newLineStarts[i] = targetLineStarts[i] + 1;
			}
		}

		return new BufferPiece(
			String.fromCharCode(character) + target._str,
			newLineStarts
		);
	}

	public static join(first: BufferPiece, second: BufferPiece): BufferPiece {
		const firstCharsLength = first._str.length;

		const firstLineStartsLength = first._lineStarts.length;
		const secondLineStartsLength = second._lineStarts.length;

		const firstLineStarts = first._lineStarts;
		const secondLineStarts = second._lineStarts;

		const newLineStartsLength = firstLineStartsLength + secondLineStartsLength;
		let newLineStarts = new Uint32Array(newLineStartsLength);
		newLineStarts.set(firstLineStarts, 0);
		for (let i = 0; i < secondLineStartsLength; i++) {
			newLineStarts[i + firstLineStartsLength] = secondLineStarts[i] + firstCharsLength;
		}

		return new BufferPiece(first._str + second._str, newLineStarts);
	}

	public static replaceOffsetLen(target: BufferPiece, edits: LeafOffsetLenEdit[], idealLeafLength: number, maxLeafLength: number, result: BufferPiece[]): void {
		const editsSize = edits.length;
		const originalCharsLength = target.length();
		if (editsSize === 1 && edits[0].text.length === 0 && edits[0].start === 0 && edits[0].length === originalCharsLength) {
			// special case => deleting everything
			return;
		}

		let pieces: string[] = new Array<string>(2 * editsSize + 1);
		let originalFromIndex = 0;
		let piecesTextLength = 0;
		for (let i = 0; i < editsSize; i++) {
			const edit = edits[i];

			const originalText = target._str.substr(originalFromIndex, edit.start - originalFromIndex);
			pieces[2 * i] = originalText;
			piecesTextLength += originalText.length;

			originalFromIndex = edit.start + edit.length;
			pieces[2 * i + 1] = edit.text;
			piecesTextLength += edit.text.length;
		}

		// maintain the chars that survive to the right of the last edit
		let text = target._str.substr(originalFromIndex, originalCharsLength - originalFromIndex);
		pieces[2 * editsSize] = text;
		piecesTextLength += text.length;

		let targetDataLength = piecesTextLength > maxLeafLength ? idealLeafLength : piecesTextLength;
		let targetDataOffset = 0;

		let data: string = '';

		for (let pieceIndex = 0, pieceCount = pieces.length; pieceIndex < pieceCount; pieceIndex++) {
			const pieceText = pieces[pieceIndex];
			const pieceLength = pieceText.length;
			if (pieceLength === 0) {
				continue;
			}

			let pieceOffset = 0;
			while (pieceOffset < pieceLength) {
				if (targetDataOffset >= targetDataLength) {
					result.push(new BufferPiece(data));
					targetDataLength = piecesTextLength > maxLeafLength ? idealLeafLength : piecesTextLength;
					targetDataOffset = 0;
					data = '';
				}

				let writingCnt = min(pieceLength - pieceOffset, targetDataLength - targetDataOffset);
				data += pieceText.substr(pieceOffset, writingCnt);
				pieceOffset += writingCnt;
				targetDataOffset += writingCnt;
				piecesTextLength -= writingCnt;

				// check that the buffer piece does not end in a \r or high surrogate
				if (targetDataOffset === targetDataLength && piecesTextLength > 0) {
					const lastChar = data.charCodeAt(targetDataLength - 1);
					if (lastChar === CharCode.CarriageReturn || (0xD800 <= lastChar && lastChar <= 0xDBFF)) {
						// move lastChar over to next buffer piece
						targetDataLength -= 1;
						pieceOffset -= 1;
						targetDataOffset -= 1;
						piecesTextLength += 1;
						data = data.substr(0, data.length - 1);
					}
				}
			}
		}

		result.push(new BufferPiece(data));
	}
}

function min(a: number, b: number): number {
	return (a < b ? a : b);
}

export function createUint32Array(arr: number[]): Uint32Array {
	let r = new Uint32Array(arr.length);
	r.set(arr, 0);
	return r;
}

export class LineStarts {
	constructor(
		public readonly lineStarts: number[],
		public readonly cr: number,
		public readonly lf: number,
		public readonly crlf: number
	) { }
}

export function createLineStarts(str: string): LineStarts {
	let r: number[] = [], rLength = 0;
	let cr = 0, lf = 0, crlf = 0;
	for (let i = 0, len = str.length; i < len; i++) {
		const chr = str.charCodeAt(i);

		if (chr === CharCode.CarriageReturn) {
			if (i + 1 < len && str.charCodeAt(i + 1) === CharCode.LineFeed) {
				// \r\n... case
				crlf++;
				r[rLength++] = i + 2;
				i++; // skip \n
			} else {
				cr++;
				// \r... case
				r[rLength++] = i + 1;
			}
		} else if (chr === CharCode.LineFeed) {
			lf++;
			r[rLength++] = i + 1;
		}
	}
	return new LineStarts(r, cr, lf, crlf);
}
