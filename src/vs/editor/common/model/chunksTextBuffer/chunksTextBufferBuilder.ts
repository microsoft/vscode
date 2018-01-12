/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { ITextBufferBuilder, ITextBufferFactory, ITextBuffer, DefaultEndOfLine } from 'vs/editor/common/model';
import { BufferPiece, createLineStarts, createUint32Array } from 'vs/editor/common/model/chunksTextBuffer/bufferPiece';
import { ChunksTextBuffer } from 'vs/editor/common/model/chunksTextBuffer/chunksTextBuffer';
import { CharCode } from 'vs/base/common/charCode';

export class TextBufferFactory implements ITextBufferFactory {

	constructor(
		private readonly _pieces: BufferPiece[],
		private readonly _averageChunkSize: number,
		private readonly _totalCRCount: number,
		private readonly _totalEOLCount: number,
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
		if (this._totalEOLCount === 0) {
			// This is an empty file or a file with precisely one line
			return (defaultEOL === DefaultEndOfLine.LF ? '\n' : '\r\n');
		}
		if (this._totalCRCount > this._totalEOLCount / 2) {
			// More than half of the file contains \r\n ending lines
			return '\r\n';
		}
		// At least one line more ends in \n
		return '\n';
	}

	public create(defaultEOL: DefaultEndOfLine): ITextBuffer {
		if (this._totalCRCount > 0 && this._totalCRCount !== this._totalEOLCount) {
			// TODO
			console.warn(`mixed line endings not handled correctly at this time!`);
		}
		return new ChunksTextBuffer(this._pieces, this._averageChunkSize, this._getEOL(defaultEOL));
	}

	public getFirstLineText(lengthLimit: number): string {
		console.log(`TODO`);
		return '';
	}
}

export class ChunksTextBufferBuilder implements ITextBufferBuilder {

	private _rawPieces: BufferPiece[];
	private _hasPreviousChar: boolean;
	private _previousChar: number;
	private _averageChunkSize: number;

	private totalCRCount: number;
	private totalEOLCount: number;
	private containsRTL: boolean;
	private isBasicASCII: boolean;

	constructor() {
		this._rawPieces = [];
		this._hasPreviousChar = false;
		this._previousChar = 0;
		this._averageChunkSize = 0;

		this.totalCRCount = 0;
		this.totalEOLCount = 0;
		this.containsRTL = false;
		this.isBasicASCII = true;
	}

	// private _updateCRCount(chunk: string): void {
	// 	// Count how many \r are present in chunk to determine the majority EOL sequence
	// 	let chunkCarriageReturnCnt = 0;
	// 	let lastCarriageReturnIndex = -1;
	// 	while ((lastCarriageReturnIndex = chunk.indexOf('\r', lastCarriageReturnIndex + 1)) !== -1) {
	// 		chunkCarriageReturnCnt++;
	// 	}
	// 	this.totalCRCount += chunkCarriageReturnCnt;
	// }

	public acceptChunk(chunk: string): void {
		if (chunk.length === 0) {
			return;
		}

		this._averageChunkSize = (this._averageChunkSize * this._rawPieces.length + chunk.length) / (this._rawPieces.length + 1);

		const lastChar = chunk.charCodeAt(chunk.length - 1);
		if (lastChar === CharCode.CarriageReturn || (lastChar >= 0xd800 && lastChar <= 0xdbff)) {
			// last character is \r or a high surrogate => keep it back
			this._acceptChunk1(chunk.substring(0, chunk.length - 1), false);
			this._hasPreviousChar = true;
			this._previousChar = lastChar;
		} else {
			this._acceptChunk1(chunk, false);
			this._hasPreviousChar = false;
			this._previousChar = lastChar;
		}

		if (!this.containsRTL) {
			this.containsRTL = strings.containsRTL(chunk);
		}
		if (this.isBasicASCII) {
			this.isBasicASCII = strings.isBasicASCII(chunk);
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
		const lineStarts = createLineStarts(chunk);

		this._rawPieces.push(new BufferPiece(chunk, createUint32Array(lineStarts.lineStarts)));
		this.totalCRCount += lineStarts.carriageReturnCnt;
		this.totalEOLCount += lineStarts.lineStarts.length;
	}

	public finish(): TextBufferFactory {
		this._finish();
		console.log(`${this.totalCRCount}, ${this.totalEOLCount}`);
		return new TextBufferFactory(this._rawPieces, this._averageChunkSize, this.totalCRCount, this.totalEOLCount);
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
				this.totalCRCount++;
				this.totalEOLCount++;
			}
		}
	}
}
