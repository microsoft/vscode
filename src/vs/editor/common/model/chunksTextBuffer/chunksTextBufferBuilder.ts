/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { ITextBufferBuilder, ITextBufferFactory, ITextBuffer, DefaultEndOfLine } from 'vs/editor/common/model';
import { BufferPiece, createLineStarts } from 'vs/editor/common/model/chunksTextBuffer/bufferPiece';
import { ChunksTextBuffer } from 'vs/editor/common/model/chunksTextBuffer/chunksTextBuffer';
import { CharCode } from 'vs/base/common/charCode';

export class TextBufferFactory implements ITextBufferFactory {

	constructor(
		private readonly _pieces: BufferPiece[],
		private readonly _averageChunkSize: number,
		private readonly _BOM: string,
		private readonly _cr: number,
		private readonly _lf: number,
		private readonly _crlf: number,
		private readonly _containsRTL: boolean,
		private readonly _isBasicASCII: boolean,
	) {
	}

	/**
	 * if text source is empty or with precisely one line, returns null. No end of line is detected.
	 * if text source contains more lines ending with '\r\n', returns '\r\n'.
	 * Otherwise returns '\n'. More lines end with '\n'.
	 */
	private _getEOL(defaultEOL: DefaultEndOfLine): '\r\n' | '\n' {
		const totalEOLCount = this._cr + this._lf + this._crlf;
		const totalCRCount = this._cr + this._crlf;
		if (totalEOLCount === 0) {
			// This is an empty file or a file with precisely one line
			return (defaultEOL === DefaultEndOfLine.LF ? '\n' : '\r\n');
		}
		if (totalCRCount > totalEOLCount / 2) {
			// More than half of the file contains \r\n ending lines
			return '\r\n';
		}
		// At least one line more ends in \n
		return '\n';
	}

	public create(defaultEOL: DefaultEndOfLine): ITextBuffer {
		const eol = this._getEOL(defaultEOL);
		let pieces = this._pieces;

		if (
			(eol === '\r\n' && (this._cr > 0 || this._lf > 0))
			|| (eol === '\n' && (this._cr > 0 || this._crlf > 0))
		) {
			// Normalize pieces
			for (let i = 0, len = pieces.length; i < len; i++) {
				pieces[i] = BufferPiece.normalizeEOL(pieces[i], eol);
			}
		}
		return new ChunksTextBuffer(pieces, this._averageChunkSize, this._BOM, eol, this._containsRTL, this._isBasicASCII);
	}

	public getFirstLineText(lengthLimit: number): string {
		const firstPiece = this._pieces[0];
		if (firstPiece.newLineCount() === 0) {
			return firstPiece.substr(0, lengthLimit);
		}

		const firstEOLOffset = firstPiece.lineStartFor(0);
		return firstPiece.substr(0, Math.min(lengthLimit, firstEOLOffset));
	}
}

export class ChunksTextBufferBuilder implements ITextBufferBuilder {

	private _rawPieces: BufferPiece[];
	private _hasPreviousChar: boolean;
	private _previousChar: number;
	private _averageChunkSize: number;
	private _tmpLineStarts: number[];

	private BOM: string;
	private cr: number;
	private lf: number;
	private crlf: number;
	private containsRTL: boolean;
	private isBasicASCII: boolean;

	constructor() {
		this._rawPieces = [];
		this._hasPreviousChar = false;
		this._previousChar = 0;
		this._averageChunkSize = 0;
		this._tmpLineStarts = [];

		this.BOM = '';
		this.cr = 0;
		this.lf = 0;
		this.crlf = 0;
		this.containsRTL = false;
		this.isBasicASCII = true;
	}

	public acceptChunk(chunk: string): void {
		if (chunk.length === 0) {
			return;
		}

		if (this._rawPieces.length === 0) {
			if (strings.startsWithUTF8BOM(chunk)) {
				this.BOM = strings.UTF8_BOM_CHARACTER;
				chunk = chunk.substr(1);
			}
		}

		this._averageChunkSize = (this._averageChunkSize * this._rawPieces.length + chunk.length) / (this._rawPieces.length + 1);

		const lastChar = chunk.charCodeAt(chunk.length - 1);
		if (lastChar === CharCode.CarriageReturn || (lastChar >= 0xd800 && lastChar <= 0xdbff)) {
			// last character is \r or a high surrogate => keep it back
			this._acceptChunk1(chunk.substr(0, chunk.length - 1), false);
			this._hasPreviousChar = true;
			this._previousChar = lastChar;
		} else {
			this._acceptChunk1(chunk, false);
			this._hasPreviousChar = false;
			this._previousChar = lastChar;
		}
	}

	private _acceptChunk1(chunk: string, allowEmptyStrings: boolean): void {
		if (!allowEmptyStrings && chunk.length === 0) {
			// Nothing to do
			return;
		}

		if (this._hasPreviousChar) {
			this._acceptChunk2(chunk + String.fromCharCode(this._previousChar));
		} else {
			this._acceptChunk2(chunk);
		}
	}

	private _acceptChunk2(chunk: string): void {
		const lineStarts = createLineStarts(this._tmpLineStarts, chunk);

		this._rawPieces.push(new BufferPiece(chunk, lineStarts.lineStarts));
		this.cr += lineStarts.cr;
		this.lf += lineStarts.lf;
		this.crlf += lineStarts.crlf;

		if (this.isBasicASCII) {
			this.isBasicASCII = lineStarts.isBasicASCII;
		}
		if (!this.isBasicASCII && !this.containsRTL) {
			// No need to check if is basic ASCII
			this.containsRTL = strings.containsRTL(chunk);
		}
	}

	public finish(): TextBufferFactory {
		this._finish();
		return new TextBufferFactory(this._rawPieces, this._averageChunkSize, this.BOM, this.cr, this.lf, this.crlf, this.containsRTL, this.isBasicASCII);
	}

	private _finish(): void {
		if (this._rawPieces.length === 0) {
			// no chunks => forcefully go through accept chunk
			this._acceptChunk1('', true);
			return;
		}

		if (this._hasPreviousChar) {
			this._hasPreviousChar = false;

			// recreate last chunk
			const lastPiece = this._rawPieces[this._rawPieces.length - 1];
			const tmp = new BufferPiece(String.fromCharCode(this._previousChar));
			const newLastPiece = BufferPiece.join(lastPiece, tmp);
			this._rawPieces[this._rawPieces.length - 1] = newLastPiece;
			if (this._previousChar === CharCode.CarriageReturn) {
				this.cr++;
			}
		}
	}
}
