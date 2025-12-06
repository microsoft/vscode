/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from '../../../base/common/arrays.js';
import { readUInt32BE, writeUInt32BE } from '../../../base/common/buffer.js';
import { Position } from '../core/position.js';
import { IRange } from '../core/range.js';
import { countEOL } from '../core/misc/eolCounter.js';
import { ContiguousTokensEditing } from './contiguousTokensEditing.js';
import { LineRange } from '../core/ranges/lineRange.js';

/**
 * Represents contiguous tokens over a contiguous range of lines.
 */
export class ContiguousMultilineTokens {
	public static deserialize(buff: Uint8Array, offset: number, result: ContiguousMultilineTokens[]): number {
		const view32 = new Uint32Array(buff.buffer);
		const startLineNumber = readUInt32BE(buff, offset); offset += 4;
		const count = readUInt32BE(buff, offset); offset += 4;
		const tokens: Uint32Array[] = [];
		for (let i = 0; i < count; i++) {
			const byteCount = readUInt32BE(buff, offset); offset += 4;
			tokens.push(view32.subarray(offset / 4, offset / 4 + byteCount / 4));
			offset += byteCount;
		}
		result.push(new ContiguousMultilineTokens(startLineNumber, tokens));
		return offset;
	}

	/**
	 * The start line number for this block of tokens.
	 */
	private _startLineNumber: number;

	/**
	 * The tokens are stored in a binary format. There is an element for each line,
	 * so `tokens[index]` contains all tokens on line `startLineNumber + index`.
	 *
	 * On a specific line, each token occupies two array indices. For token i:
	 *  - at offset 2*i => endOffset
	 *  - at offset 2*i + 1 => metadata
	 *
	 */
	private _tokens: (Uint32Array | ArrayBuffer | null)[];

	/**
	 * (Inclusive) start line number for these tokens.
	 */
	public get startLineNumber(): number {
		return this._startLineNumber;
	}

	/**
	 * (Inclusive) end line number for these tokens.
	 */
	public get endLineNumber(): number {
		return this._startLineNumber + this._tokens.length - 1;
	}

	constructor(startLineNumber: number, tokens: Uint32Array[]) {
		this._startLineNumber = startLineNumber;
		this._tokens = tokens;
	}

	getLineRange(): LineRange {
		return new LineRange(this._startLineNumber, this._startLineNumber + this._tokens.length);
	}

	/**
	 * @see {@link _tokens}
	 */
	public getLineTokens(lineNumber: number): Uint32Array | ArrayBuffer | null {
		return this._tokens[lineNumber - this._startLineNumber];
	}

	public appendLineTokens(lineTokens: Uint32Array): void {
		this._tokens.push(lineTokens);
	}

	public serializeSize(): number {
		let result = 0;
		result += 4; // 4 bytes for the start line number
		result += 4; // 4 bytes for the line count
		for (let i = 0; i < this._tokens.length; i++) {
			const lineTokens = this._tokens[i];
			if (!(lineTokens instanceof Uint32Array)) {
				throw new Error(`Not supported!`);
			}
			result += 4; // 4 bytes for the byte count
			result += lineTokens.byteLength;
		}
		return result;
	}

	public serialize(destination: Uint8Array, offset: number): number {
		writeUInt32BE(destination, this._startLineNumber, offset); offset += 4;
		writeUInt32BE(destination, this._tokens.length, offset); offset += 4;
		for (let i = 0; i < this._tokens.length; i++) {
			const lineTokens = this._tokens[i];
			if (!(lineTokens instanceof Uint32Array)) {
				throw new Error(`Not supported!`);
			}
			writeUInt32BE(destination, lineTokens.byteLength, offset); offset += 4;
			destination.set(new Uint8Array(lineTokens.buffer), offset); offset += lineTokens.byteLength;
		}
		return offset;
	}

	public applyEdit(range: IRange, text: string): void {
		const [eolCount, firstLineLength] = countEOL(text);
		this._acceptDeleteRange(range);
		this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), eolCount, firstLineLength);
	}

	private _acceptDeleteRange(range: IRange): void {
		if (range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn) {
			// Nothing to delete
			return;
		}

		const firstLineIndex = range.startLineNumber - this._startLineNumber;
		const lastLineIndex = range.endLineNumber - this._startLineNumber;

		if (lastLineIndex < 0) {
			// this deletion occurs entirely before this block, so we only need to adjust line numbers
			const deletedLinesCount = lastLineIndex - firstLineIndex;
			this._startLineNumber -= deletedLinesCount;
			return;
		}

		if (firstLineIndex >= this._tokens.length) {
			// this deletion occurs entirely after this block, so there is nothing to do
			return;
		}

		if (firstLineIndex < 0 && lastLineIndex >= this._tokens.length) {
			// this deletion completely encompasses this block
			this._startLineNumber = 0;
			this._tokens = [];
			return;
		}

		if (firstLineIndex === lastLineIndex) {
			// a delete on a single line
			this._tokens[firstLineIndex] = ContiguousTokensEditing.delete(this._tokens[firstLineIndex], range.startColumn - 1, range.endColumn - 1);
			return;
		}

		if (firstLineIndex >= 0) {
			// The first line survives
			this._tokens[firstLineIndex] = ContiguousTokensEditing.deleteEnding(this._tokens[firstLineIndex], range.startColumn - 1);

			if (lastLineIndex < this._tokens.length) {
				// The last line survives
				const lastLineTokens = ContiguousTokensEditing.deleteBeginning(this._tokens[lastLineIndex], range.endColumn - 1);

				// Take remaining text on last line and append it to remaining text on first line
				this._tokens[firstLineIndex] = ContiguousTokensEditing.append(this._tokens[firstLineIndex], lastLineTokens);

				// Delete middle lines
				this._tokens.splice(firstLineIndex + 1, lastLineIndex - firstLineIndex);
			} else {
				// The last line does not survive

				// Take remaining text on last line and append it to remaining text on first line
				this._tokens[firstLineIndex] = ContiguousTokensEditing.append(this._tokens[firstLineIndex], null);

				// Delete lines
				this._tokens = this._tokens.slice(0, firstLineIndex + 1);
			}
		} else {
			// The first line does not survive

			const deletedBefore = -firstLineIndex;
			this._startLineNumber -= deletedBefore;

			// Remove beginning from last line
			this._tokens[lastLineIndex] = ContiguousTokensEditing.deleteBeginning(this._tokens[lastLineIndex], range.endColumn - 1);

			// Delete lines
			this._tokens = this._tokens.slice(lastLineIndex);
		}
	}

	private _acceptInsertText(position: Position, eolCount: number, firstLineLength: number): void {

		if (eolCount === 0 && firstLineLength === 0) {
			// Nothing to insert
			return;
		}

		const lineIndex = position.lineNumber - this._startLineNumber;

		if (lineIndex < 0) {
			// this insertion occurs before this block, so we only need to adjust line numbers
			this._startLineNumber += eolCount;
			return;
		}

		if (lineIndex >= this._tokens.length) {
			// this insertion occurs after this block, so there is nothing to do
			return;
		}

		if (eolCount === 0) {
			// Inserting text on one line
			this._tokens[lineIndex] = ContiguousTokensEditing.insert(this._tokens[lineIndex], position.column - 1, firstLineLength);
			return;
		}

		this._tokens[lineIndex] = ContiguousTokensEditing.deleteEnding(this._tokens[lineIndex], position.column - 1);
		this._tokens[lineIndex] = ContiguousTokensEditing.insert(this._tokens[lineIndex], position.column - 1, firstLineLength);

		this._insertLines(position.lineNumber, eolCount);
	}

	private _insertLines(insertIndex: number, insertCount: number): void {
		if (insertCount === 0) {
			return;
		}
		const lineTokens: (Uint32Array | ArrayBuffer | null)[] = [];
		for (let i = 0; i < insertCount; i++) {
			lineTokens[i] = null;
		}
		this._tokens = arrays.arrayInsert(this._tokens, insertIndex, lineTokens);
	}
}
