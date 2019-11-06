/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ColorId, FontStyle, LanguageId, MetadataConsts, StandardTokenType, TokenMetadata } from 'vs/editor/common/modes';
import { writeUInt32BE, readUInt32BE } from 'vs/base/common/buffer';
import { CharCode } from 'vs/base/common/charCode';

export function countEOL(text: string): [number, number] {
	let eolCount = 0;
	let firstLineLength = 0;
	for (let i = 0, len = text.length; i < len; i++) {
		const chr = text.charCodeAt(i);

		if (chr === CharCode.CarriageReturn) {
			if (eolCount === 0) {
				firstLineLength = i;
			}
			eolCount++;
			if (i + 1 < len && text.charCodeAt(i + 1) === CharCode.LineFeed) {
				// \r\n... case
				i++; // skip \n
			} else {
				// \r... case
			}
		} else if (chr === CharCode.LineFeed) {
			if (eolCount === 0) {
				firstLineLength = i;
			}
			eolCount++;
		}
	}
	if (eolCount === 0) {
		firstLineLength = text.length;
	}
	return [eolCount, firstLineLength];
}

function getDefaultMetadata(topLevelLanguageId: LanguageId): number {
	return (
		(topLevelLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
		| (StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET)
		| (FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
		| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
		| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
	) >>> 0;
}

const EMPTY_LINE_TOKENS = (new Uint32Array(0)).buffer;

export class MultilineTokensBuilder {

	public readonly tokens: MultilineTokens[];

	constructor() {
		this.tokens = [];
	}

	public add(lineNumber: number, lineTokens: Uint32Array): void {
		if (this.tokens.length > 0) {
			const last = this.tokens[this.tokens.length - 1];
			const lastLineNumber = last.startLineNumber + last.tokens.length - 1;
			if (lastLineNumber + 1 === lineNumber) {
				// append
				last.tokens.push(lineTokens);
				return;
			}
		}
		this.tokens.push(new MultilineTokens(lineNumber, [lineTokens]));
	}

	public static deserialize(buff: Uint8Array): MultilineTokens[] {
		let offset = 0;
		const count = readUInt32BE(buff, offset); offset += 4;
		let result: MultilineTokens[] = [];
		for (let i = 0; i < count; i++) {
			offset = MultilineTokens.deserialize(buff, offset, result);
		}
		return result;
	}

	public serialize(): Uint8Array {
		const size = this._serializeSize();
		const result = new Uint8Array(size);
		this._serialize(result);
		return result;
	}

	private _serializeSize(): number {
		let result = 0;
		result += 4; // 4 bytes for the count
		for (let i = 0; i < this.tokens.length; i++) {
			result += this.tokens[i].serializeSize();
		}
		return result;
	}

	private _serialize(destination: Uint8Array): void {
		let offset = 0;
		writeUInt32BE(destination, this.tokens.length, offset); offset += 4;
		for (let i = 0; i < this.tokens.length; i++) {
			offset = this.tokens[i].serialize(destination, offset);
		}
	}
}

export interface IEncodedTokens {
	empty(): IEncodedTokens;
	getTokenCount(): number;
	getDeltaLine(tokenIndex: number): number;
	getMaxDeltaLine(): number;
	getStartCharacter(tokenIndex: number): number;
	getEndCharacter(tokenIndex: number): number;
	getMetadata(tokenIndex: number): number;

	acceptDelete(startDeltaLine: number, startCharacter: number, endDeltaLine: number, endCharacter: number): IEncodedTokens;
}

export class SparseEncodedTokens implements IEncodedTokens {
	/**
	 * The encoding of tokens is:
	 *  4*i    deltaLine (from `startLineNumber`)
	 *  4*i+1  startCharacter (from the line start)
	 *  4*i+2  endCharacter (from the line start)
	 *  4*i+3  metadata
	 */
	private tokens: Uint32Array;

	constructor(tokens: Uint32Array) {
		this.tokens = tokens;
	}

	public empty(): IEncodedTokens {
		return new SparseEncodedTokens(new Uint32Array(0));
	}

	public acceptDelete(startDeltaLine: number, startCharacter: number, endDeltaLine: number, endCharacter: number): IEncodedTokens {
		// This is a bit complex, here are the cases I used to think about this:
		//
		// 1. The token starts before the deletion range
		// 1a. The token is completely before the deletion range
		//               -----------
		//                          xxxxxxxxxxx
		// 1b. The token starts before, the deletion range ends after the token
		//               -----------
		//                      xxxxxxxxxxx
		// 1c. The token starts before, the deletion range ends precisely with the token
		//               ---------------
		//                      xxxxxxxx
		// 1d. The token starts before, the deletion range is inside the token
		//               ---------------
		//                    xxxxx
		//
		// 2. The token starts at the same position with the deletion range
		// 2a. The token starts at the same position, and ends inside the deletion range
		//               -------
		//               xxxxxxxxxxx
		// 2b. The token starts at the same position, and ends at the same position as the deletion range
		//               ----------
		//               xxxxxxxxxx
		// 2c. The token starts at the same position, and ends after the deletion range
		//               -------------
		//               xxxxxxx
		//
		// 3. The token starts inside the deletion range
		// 3a. The token is inside the deletion range
		//                -------
		//             xxxxxxxxxxxxx
		// 3b. The token starts inside the deletion range, and ends at the same position as the deletion range
		//                ----------
		//             xxxxxxxxxxxxx
		// 3c. The token starts inside the deletion range, and ends after the deletion range
		//                ------------
		//             xxxxxxxxxxx
		//
		// 4. The token starts after the deletion range
		//                  -----------
		//          xxxxxxxx
		//
		const tokens = this.tokens;
		const tokenCount = this.tokens.length / 4;
		const deletedLineCount = (endDeltaLine - startDeltaLine);
		let newTokenCount = 0;
		let hasDeletedTokens = false;
		for (let i = 0; i < tokenCount; i++) {
			const srcOffset = 4 * i;
			let tokenDeltaLine = tokens[srcOffset];
			let tokenStartCharacter = tokens[srcOffset + 1];
			let tokenEndCharacter = tokens[srcOffset + 2];
			const tokenMetadata = tokens[srcOffset + 3];

			if (tokenDeltaLine < startDeltaLine || (tokenDeltaLine === startDeltaLine && tokenEndCharacter <= startCharacter)) {
				// 1a. The token is completely before the deletion range
				// => nothing to do
				newTokenCount++;
				continue;
			} else if (tokenDeltaLine === startDeltaLine && tokenStartCharacter < startCharacter) {
				// 1b, 1c, 1d
				// => the token survives, but it needs to shrink
				if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
					// 1d. The token starts before, the deletion range is inside the token
					// => the token shrinks by the deletion character count
					tokenEndCharacter -= (endCharacter - startCharacter);
				} else {
					// 1b. The token starts before, the deletion range ends after the token
					// 1c. The token starts before, the deletion range ends precisely with the token
					// => the token shrinks its ending to the deletion start
					tokenEndCharacter = startCharacter;
				}
			} else if (tokenDeltaLine === startDeltaLine && tokenStartCharacter === startCharacter) {
				// 2a, 2b, 2c
				if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
					// 2c. The token starts at the same position, and ends after the deletion range
					// => the token shrinks by the deletion character count
					tokenEndCharacter -= (endCharacter - startCharacter);
				} else {
					// 2a. The token starts at the same position, and ends inside the deletion range
					// 2b. The token starts at the same position, and ends at the same position as the deletion range
					// => the token is deleted
					hasDeletedTokens = true;
					continue;
				}
			} else if (tokenDeltaLine < endDeltaLine || (tokenDeltaLine === endDeltaLine && tokenStartCharacter < endCharacter)) {
				// 3a, 3b, 3c
				if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
					// 3c. The token starts inside the deletion range, and ends after the deletion range
					// => the token moves left and shrinks
					if (tokenDeltaLine === startDeltaLine) {
						// the deletion started on the same line as the token
						// => the token moves left and shrinks
						tokenStartCharacter = startCharacter;
						tokenEndCharacter = tokenStartCharacter + (tokenEndCharacter - endCharacter);
					} else {
						// the deletion started on a line above the token
						// => the token moves to the beginning of the line
						tokenStartCharacter = 0;
						tokenEndCharacter = tokenStartCharacter + (tokenEndCharacter - endCharacter);
					}
				} else {
					// 3a. The token is inside the deletion range
					// 3b. The token starts inside the deletion range, and ends at the same position as the deletion range
					// => the token is deleted
					hasDeletedTokens = true;
					continue;
				}
			} else if (tokenDeltaLine > endDeltaLine) {
				// 4. (partial) The token starts after the deletion range, on a line below...
				if (deletedLineCount === 0 && !hasDeletedTokens) {
					// early stop, there is no need to walk all the tokens and do nothing...
					newTokenCount = tokenCount;
					break;
				}
				tokenDeltaLine -= deletedLineCount;
			} else if (tokenDeltaLine === endDeltaLine && tokenStartCharacter >= endCharacter) {
				// 4. (continued) The token starts after the deletion range, on the last line where a deletion occurs
				tokenDeltaLine -= deletedLineCount;
				tokenStartCharacter -= endCharacter;
				tokenEndCharacter -= endCharacter;
			} else {
				throw new Error(`Impossible case!`);
				console.log(`I NEED TO acceptDelete at token: ${tokenDeltaLine}, ${tokenStartCharacter}, ${tokenEndCharacter}`);
			}

			const destOffset = 4 * newTokenCount;
			tokens[destOffset] = tokenDeltaLine;
			tokens[destOffset + 1] = tokenStartCharacter;
			tokens[destOffset + 2] = tokenEndCharacter;
			tokens[destOffset + 3] = tokenMetadata;
			newTokenCount++;
		}

		return this;

		// if (hasDeletedTokens) {
		// 	console.log(`there are deleted tokens!`);
		// 	throw new Error(`TODO!`);
		// }

		// // console.log

		// console.log(`TODO - acceptDelete, ${startDeltaLine}, ${startCharacter}, ${endDeltaLine}, ${endCharacter}`);
		// throw new Error(`Not implemented`); // TODO@semantic
	}

	public getMaxDeltaLine(): number {
		const tokenCount = this.getTokenCount();
		if (tokenCount === 0) {
			return -1;
		}
		return this.getDeltaLine(tokenCount - 1);
	}

	public getTokenCount(): number {
		return this.tokens.length / 4;
	}

	public getDeltaLine(tokenIndex: number): number {
		return this.tokens[4 * tokenIndex];
	}

	public getStartCharacter(tokenIndex: number): number {
		return this.tokens[4 * tokenIndex + 1];
	}

	public getEndCharacter(tokenIndex: number): number {
		return this.tokens[4 * tokenIndex + 2];
	}

	public getMetadata(tokenIndex: number): number {
		return this.tokens[4 * tokenIndex + 3];
	}
}

export class LineTokens2 {

	private readonly _actual: IEncodedTokens;
	private readonly _startTokenIndex: number;
	private readonly _endTokenIndex: number;

	constructor(actual: IEncodedTokens, startTokenIndex: number, endTokenIndex: number) {
		this._actual = actual;
		this._startTokenIndex = startTokenIndex;
		this._endTokenIndex = endTokenIndex;
	}

	public getCount(): number {
		return this._endTokenIndex - this._startTokenIndex + 1;
	}

	public getStartCharacter(tokenIndex: number): number {
		return this._actual.getStartCharacter(this._startTokenIndex + tokenIndex);
	}

	public getEndCharacter(tokenIndex: number): number {
		return this._actual.getEndCharacter(this._startTokenIndex + tokenIndex);
	}

	public getMetadata(tokenIndex: number): number {
		return this._actual.getMetadata(this._startTokenIndex + tokenIndex);
	}
}

export class MultilineTokens2 {

	public startLineNumber: number;
	public endLineNumber: number;
	public tokens: IEncodedTokens;

	constructor(startLineNumber: number, tokens: IEncodedTokens) {
		this.startLineNumber = startLineNumber;
		this.tokens = tokens;
		this.endLineNumber = this.startLineNumber + this.tokens.getMaxDeltaLine();
	}

	private _setTokens(tokens: IEncodedTokens): void {
		this.tokens = tokens;
		this.endLineNumber = this.startLineNumber + this.tokens.getMaxDeltaLine();
	}

	public getLineTokens(lineNumber: number): LineTokens2 | null {
		if (this.startLineNumber <= lineNumber && lineNumber <= this.endLineNumber) {
			const findResult = MultilineTokens2._findTokensWithLine(this.tokens, lineNumber - this.startLineNumber);
			if (findResult) {
				const [startTokenIndex, endTokenIndex] = findResult;
				return new LineTokens2(this.tokens, startTokenIndex, endTokenIndex);
			}
		}
		return null;
	}

	private static _findTokensWithLine(tokens: IEncodedTokens, deltaLine: number): [number, number] | null {
		let low = 0;
		let high = tokens.getTokenCount() - 1;

		while (low < high) {
			const mid = low + Math.floor((high - low) / 2);
			const midDeltaLine = tokens.getDeltaLine(mid);

			if (midDeltaLine < deltaLine) {
				low = mid + 1;
			} else if (midDeltaLine > deltaLine) {
				high = mid - 1;
			} else {
				let min = mid;
				while (min > low && tokens.getDeltaLine(min - 1) === deltaLine) {
					min--;
				}
				let max = mid;
				while (max < high && tokens.getDeltaLine(max + 1) === deltaLine) {
					max++;
				}
				return [min, max];
			}
		}

		if (tokens.getDeltaLine(low) === deltaLine) {
			return [low, low];
		}

		return null;
	}

	public applyEdit(range: IRange, text: string): void {
		// const [eolCount, firstLineLength] = countEOL(text);
		this._acceptDeleteRange(range);
		// this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), eolCount, firstLineLength);
	}

	public acceptEdit(range: IRange, eolCount: number, firstLineLength: number): void {
		this._acceptDeleteRange(range);
	}

	private _acceptDeleteRange(range: IRange): void {
		if (range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn) {
			// Nothing to delete
			return;
		}

		const firstLineIndex = range.startLineNumber - this.startLineNumber;
		const lastLineIndex = range.endLineNumber - this.startLineNumber;

		if (lastLineIndex < 0) {
			// this deletion occurs entirely before this block, so we only need to adjust line numbers
			const deletedLinesCount = lastLineIndex - firstLineIndex;
			this.startLineNumber -= deletedLinesCount;
			return;
		}

		const tokenMaxDeltaLine = this.tokens.getMaxDeltaLine();

		if (firstLineIndex >= tokenMaxDeltaLine + 1) {
			// this deletion occurs entirely after this block, so there is nothing to do
			return;
		}

		if (firstLineIndex < 0 && lastLineIndex >= tokenMaxDeltaLine + 1) {
			// this deletion completely encompasses this block
			this.startLineNumber = 0;
			this._setTokens(this.tokens.empty());
			return;
		}

		if (firstLineIndex < 0) {
			const deletedBefore = -firstLineIndex;
			this.startLineNumber -= deletedBefore;

			this._setTokens(this.tokens.acceptDelete(0, 0, lastLineIndex, range.endColumn - 1));
		} else {
			this._setTokens(this.tokens.acceptDelete(firstLineIndex, range.startColumn - 1, lastLineIndex, range.endColumn - 1));
		}
	}
}

export class MultilineTokens {

	public startLineNumber: number;
	public tokens: (Uint32Array | ArrayBuffer | null)[];

	constructor(startLineNumber: number, tokens: Uint32Array[]) {
		this.startLineNumber = startLineNumber;
		this.tokens = tokens;
	}

	public static deserialize(buff: Uint8Array, offset: number, result: MultilineTokens[]): number {
		const view32 = new Uint32Array(buff.buffer);
		const startLineNumber = readUInt32BE(buff, offset); offset += 4;
		const count = readUInt32BE(buff, offset); offset += 4;
		let tokens: Uint32Array[] = [];
		for (let i = 0; i < count; i++) {
			const byteCount = readUInt32BE(buff, offset); offset += 4;
			tokens.push(view32.subarray(offset / 4, offset / 4 + byteCount / 4));
			offset += byteCount;
		}
		result.push(new MultilineTokens(startLineNumber, tokens));
		return offset;
	}

	public serializeSize(): number {
		let result = 0;
		result += 4; // 4 bytes for the start line number
		result += 4; // 4 bytes for the line count
		for (let i = 0; i < this.tokens.length; i++) {
			const lineTokens = this.tokens[i];
			if (!(lineTokens instanceof Uint32Array)) {
				throw new Error(`Not supported!`);
			}
			result += 4; // 4 bytes for the byte count
			result += lineTokens.byteLength;
		}
		return result;
	}

	public serialize(destination: Uint8Array, offset: number): number {
		writeUInt32BE(destination, this.startLineNumber, offset); offset += 4;
		writeUInt32BE(destination, this.tokens.length, offset); offset += 4;
		for (let i = 0; i < this.tokens.length; i++) {
			const lineTokens = this.tokens[i];
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

		const firstLineIndex = range.startLineNumber - this.startLineNumber;
		const lastLineIndex = range.endLineNumber - this.startLineNumber;

		if (lastLineIndex < 0) {
			// this deletion occurs entirely before this block, so we only need to adjust line numbers
			const deletedLinesCount = lastLineIndex - firstLineIndex;
			this.startLineNumber -= deletedLinesCount;
			return;
		}

		if (firstLineIndex >= this.tokens.length) {
			// this deletion occurs entirely after this block, so there is nothing to do
			return;
		}

		if (firstLineIndex < 0 && lastLineIndex >= this.tokens.length) {
			// this deletion completely encompasses this block
			this.startLineNumber = 0;
			this.tokens = [];
			return;
		}

		if (firstLineIndex === lastLineIndex) {
			// a delete on a single line
			this.tokens[firstLineIndex] = TokensStore._delete(this.tokens[firstLineIndex], range.startColumn - 1, range.endColumn - 1);
			return;
		}

		if (firstLineIndex >= 0) {
			// The first line survives
			this.tokens[firstLineIndex] = TokensStore._deleteEnding(this.tokens[firstLineIndex], range.startColumn - 1);

			if (lastLineIndex < this.tokens.length) {
				// The last line survives
				const lastLineTokens = TokensStore._deleteBeginning(this.tokens[lastLineIndex], range.endColumn - 1);

				// Take remaining text on last line and append it to remaining text on first line
				this.tokens[firstLineIndex] = TokensStore._append(this.tokens[firstLineIndex], lastLineTokens);

				// Delete middle lines
				this.tokens.splice(firstLineIndex + 1, lastLineIndex - firstLineIndex);
			} else {
				// The last line does not survive

				// Take remaining text on last line and append it to remaining text on first line
				this.tokens[firstLineIndex] = TokensStore._append(this.tokens[firstLineIndex], null);

				// Delete lines
				this.tokens = this.tokens.slice(0, firstLineIndex + 1);
			}
		} else {
			// The first line does not survive

			const deletedBefore = -firstLineIndex;
			this.startLineNumber -= deletedBefore;

			// Remove beginning from last line
			this.tokens[lastLineIndex] = TokensStore._deleteBeginning(this.tokens[lastLineIndex], range.endColumn - 1);

			// Delete lines
			this.tokens = this.tokens.slice(lastLineIndex);
		}
	}

	private _acceptInsertText(position: Position, eolCount: number, firstLineLength: number): void {

		if (eolCount === 0 && firstLineLength === 0) {
			// Nothing to insert
			return;
		}

		const lineIndex = position.lineNumber - this.startLineNumber;

		if (lineIndex < 0) {
			// this insertion occurs before this block, so we only need to adjust line numbers
			this.startLineNumber += eolCount;
			return;
		}

		if (lineIndex >= this.tokens.length) {
			// this insertion occurs after this block, so there is nothing to do
			return;
		}

		if (eolCount === 0) {
			// Inserting text on one line
			this.tokens[lineIndex] = TokensStore._insert(this.tokens[lineIndex], position.column - 1, firstLineLength);
			return;
		}

		this.tokens[lineIndex] = TokensStore._deleteEnding(this.tokens[lineIndex], position.column - 1);
		this.tokens[lineIndex] = TokensStore._insert(this.tokens[lineIndex], position.column - 1, firstLineLength);

		this._insertLines(position.lineNumber, eolCount);
	}

	private _insertLines(insertIndex: number, insertCount: number): void {
		if (insertCount === 0) {
			return;
		}
		let lineTokens: (Uint32Array | ArrayBuffer | null)[] = [];
		for (let i = 0; i < insertCount; i++) {
			lineTokens[i] = null;
		}
		this.tokens = arrays.arrayInsert(this.tokens, insertIndex, lineTokens);
	}
}

function toUint32Array(arr: Uint32Array | ArrayBuffer): Uint32Array {
	if (arr instanceof Uint32Array) {
		return arr;
	} else {
		return new Uint32Array(arr);
	}
}

export class TokensStore2 {

	private _pieces: MultilineTokens2[];

	constructor() {
		this._pieces = [];
	}

	public flush(): void {
		this._pieces = [];
	}

	public set(pieces: MultilineTokens2[]) {
		this._pieces = pieces;
	}

	public addSemanticTokens(lineNumber: number, aTokens: LineTokens): LineTokens {
		const pieces = this._pieces;

		if (pieces.length === 0) {
			return aTokens;
		}

		const pieceIndex = TokensStore2._findFirstPieceWithLine(pieces, lineNumber);
		const bTokens = this._pieces[pieceIndex].getLineTokens(lineNumber);

		if (!bTokens) {
			return aTokens;
		}

		const aLen = aTokens.getCount();
		const bLen = bTokens.getCount();

		let aIndex = 0;
		let result: number[] = [], resultLen = 0;
		for (let bIndex = 0; bIndex < bLen; bIndex++) {
			const bStartCharacter = bTokens.getStartCharacter(bIndex);
			const bEndCharacter = bTokens.getEndCharacter(bIndex);
			const bMetadata = bTokens.getMetadata(bIndex); // TODO@semantic: should use languageId from aTokens :| :| :|

			// push any token from `a` that is before `b`
			while (aIndex < aLen && aTokens.getEndOffset(aIndex) <= bStartCharacter) {
				result[resultLen++] = aTokens.getEndOffset(aIndex);
				result[resultLen++] = aTokens.getMetadata(aIndex);
				aIndex++;
			}

			// push the token from `a` if it intersects the token from `b`
			if (aIndex < aLen && aTokens.getStartOffset(aIndex) < bStartCharacter) {
				result[resultLen++] = bStartCharacter;
				result[resultLen++] = aTokens.getMetadata(aIndex);
			}

			// skip any tokens from `a` that are contained inside `b`
			while (aIndex < aLen && aTokens.getEndOffset(aIndex) <= bEndCharacter) {
				aIndex++;
			}

			// push the token from `b`
			result[resultLen++] = bEndCharacter;
			result[resultLen++] = bMetadata;
		}

		// push the remaining tokens from `a`
		while (aIndex < aLen) {
			result[resultLen++] = aTokens.getEndOffset(aIndex);
			result[resultLen++] = aTokens.getMetadata(aIndex);
			aIndex++;
		}

		return new LineTokens(new Uint32Array(result), aTokens.getLineContent());
	}

	private static _findFirstPieceWithLine(pieces: MultilineTokens2[], lineNumber: number): number {
		let low = 0;
		let high = pieces.length - 1;

		while (low < high) {
			let mid = low + Math.floor((high - low) / 2);

			if (pieces[mid].endLineNumber < lineNumber) {
				low = mid + 1;
			} else if (pieces[mid].startLineNumber > lineNumber) {
				high = mid - 1;
			} else {
				while (mid > low && pieces[mid - 1].startLineNumber <= lineNumber && lineNumber <= pieces[mid - 1].endLineNumber) {
					mid--;
				}
				return mid;
			}
		}

		return low;
	}

	//#region Editing

	public acceptEdit(range: IRange, eolCount: number, firstLineLength: number): void {
		for (const piece of this._pieces) {
			piece.acceptEdit(range, eolCount, firstLineLength);
		}
	}

	//#endregion
}

export class TokensStore {
	private _lineTokens: (Uint32Array | ArrayBuffer | null)[];
	private _len: number;

	constructor() {
		this._lineTokens = [];
		this._len = 0;
	}

	public flush(): void {
		this._lineTokens = [];
		this._len = 0;
	}

	public getTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineText: string): LineTokens {
		let rawLineTokens: Uint32Array | ArrayBuffer | null = null;
		if (lineIndex < this._len) {
			rawLineTokens = this._lineTokens[lineIndex];
		}

		if (rawLineTokens !== null && rawLineTokens !== EMPTY_LINE_TOKENS) {
			return new LineTokens(toUint32Array(rawLineTokens), lineText);
		}

		let lineTokens = new Uint32Array(2);
		lineTokens[0] = lineText.length;
		lineTokens[1] = getDefaultMetadata(topLevelLanguageId);
		return new LineTokens(lineTokens, lineText);
	}

	private static _massageTokens(topLevelLanguageId: LanguageId, lineTextLength: number, _tokens: Uint32Array | ArrayBuffer | null): Uint32Array | ArrayBuffer {

		const tokens = _tokens ? toUint32Array(_tokens) : null;

		if (lineTextLength === 0) {
			let hasDifferentLanguageId = false;
			if (tokens && tokens.length > 1) {
				hasDifferentLanguageId = (TokenMetadata.getLanguageId(tokens[1]) !== topLevelLanguageId);
			}

			if (!hasDifferentLanguageId) {
				return EMPTY_LINE_TOKENS;
			}
		}

		if (!tokens || tokens.length === 0) {
			const tokens = new Uint32Array(2);
			tokens[0] = lineTextLength;
			tokens[1] = getDefaultMetadata(topLevelLanguageId);
			return tokens.buffer;
		}

		// Ensure the last token covers the end of the text
		tokens[tokens.length - 2] = lineTextLength;

		if (tokens.byteOffset === 0 && tokens.byteLength === tokens.buffer.byteLength) {
			// Store directly the ArrayBuffer pointer to save an object
			return tokens.buffer;
		}
		return tokens;
	}

	private _ensureLine(lineIndex: number): void {
		while (lineIndex >= this._len) {
			this._lineTokens[this._len] = null;
			this._len++;
		}
	}

	private _deleteLines(start: number, deleteCount: number): void {
		if (deleteCount === 0) {
			return;
		}
		if (start + deleteCount > this._len) {
			deleteCount = this._len - start;
		}
		this._lineTokens.splice(start, deleteCount);
		this._len -= deleteCount;
	}

	private _insertLines(insertIndex: number, insertCount: number): void {
		if (insertCount === 0) {
			return;
		}
		let lineTokens: (Uint32Array | ArrayBuffer | null)[] = [];
		for (let i = 0; i < insertCount; i++) {
			lineTokens[i] = null;
		}
		this._lineTokens = arrays.arrayInsert(this._lineTokens, insertIndex, lineTokens);
		this._len += insertCount;
	}

	public setTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineTextLength: number, _tokens: Uint32Array | ArrayBuffer | null): void {
		const tokens = TokensStore._massageTokens(topLevelLanguageId, lineTextLength, _tokens);
		this._ensureLine(lineIndex);
		this._lineTokens[lineIndex] = tokens;
	}

	//#region Editing

	public acceptEdit(range: IRange, eolCount: number, firstLineLength: number): void {
		this._acceptDeleteRange(range);
		this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), eolCount, firstLineLength);
	}

	private _acceptDeleteRange(range: IRange): void {

		const firstLineIndex = range.startLineNumber - 1;
		if (firstLineIndex >= this._len) {
			return;
		}

		if (range.startLineNumber === range.endLineNumber) {
			if (range.startColumn === range.endColumn) {
				// Nothing to delete
				return;
			}

			this._lineTokens[firstLineIndex] = TokensStore._delete(this._lineTokens[firstLineIndex], range.startColumn - 1, range.endColumn - 1);
			return;
		}

		this._lineTokens[firstLineIndex] = TokensStore._deleteEnding(this._lineTokens[firstLineIndex], range.startColumn - 1);

		const lastLineIndex = range.endLineNumber - 1;
		let lastLineTokens: Uint32Array | ArrayBuffer | null = null;
		if (lastLineIndex < this._len) {
			lastLineTokens = TokensStore._deleteBeginning(this._lineTokens[lastLineIndex], range.endColumn - 1);
		}

		// Take remaining text on last line and append it to remaining text on first line
		this._lineTokens[firstLineIndex] = TokensStore._append(this._lineTokens[firstLineIndex], lastLineTokens);

		// Delete middle lines
		this._deleteLines(range.startLineNumber, range.endLineNumber - range.startLineNumber);
	}

	private _acceptInsertText(position: Position, eolCount: number, firstLineLength: number): void {

		if (eolCount === 0 && firstLineLength === 0) {
			// Nothing to insert
			return;
		}

		const lineIndex = position.lineNumber - 1;
		if (lineIndex >= this._len) {
			return;
		}

		if (eolCount === 0) {
			// Inserting text on one line
			this._lineTokens[lineIndex] = TokensStore._insert(this._lineTokens[lineIndex], position.column - 1, firstLineLength);
			return;
		}

		this._lineTokens[lineIndex] = TokensStore._deleteEnding(this._lineTokens[lineIndex], position.column - 1);
		this._lineTokens[lineIndex] = TokensStore._insert(this._lineTokens[lineIndex], position.column - 1, firstLineLength);

		this._insertLines(position.lineNumber, eolCount);
	}

	public static _deleteBeginning(lineTokens: Uint32Array | ArrayBuffer | null, toChIndex: number): Uint32Array | ArrayBuffer | null {
		if (lineTokens === null || lineTokens === EMPTY_LINE_TOKENS) {
			return lineTokens;
		}
		return TokensStore._delete(lineTokens, 0, toChIndex);
	}

	public static _deleteEnding(lineTokens: Uint32Array | ArrayBuffer | null, fromChIndex: number): Uint32Array | ArrayBuffer | null {
		if (lineTokens === null || lineTokens === EMPTY_LINE_TOKENS) {
			return lineTokens;
		}

		const tokens = toUint32Array(lineTokens);
		const lineTextLength = tokens[tokens.length - 2];
		return TokensStore._delete(lineTokens, fromChIndex, lineTextLength);
	}

	public static _delete(lineTokens: Uint32Array | ArrayBuffer | null, fromChIndex: number, toChIndex: number): Uint32Array | ArrayBuffer | null {
		if (lineTokens === null || lineTokens === EMPTY_LINE_TOKENS || fromChIndex === toChIndex) {
			return lineTokens;
		}

		const tokens = toUint32Array(lineTokens);
		const tokensCount = (tokens.length >>> 1);

		// special case: deleting everything
		if (fromChIndex === 0 && tokens[tokens.length - 2] === toChIndex) {
			return EMPTY_LINE_TOKENS;
		}

		const fromTokenIndex = LineTokens.findIndexInTokensArray(tokens, fromChIndex);
		const fromTokenStartOffset = (fromTokenIndex > 0 ? tokens[(fromTokenIndex - 1) << 1] : 0);
		const fromTokenEndOffset = tokens[fromTokenIndex << 1];

		if (toChIndex < fromTokenEndOffset) {
			// the delete range is inside a single token
			const delta = (toChIndex - fromChIndex);
			for (let i = fromTokenIndex; i < tokensCount; i++) {
				tokens[i << 1] -= delta;
			}
			return lineTokens;
		}

		let dest: number;
		let lastEnd: number;
		if (fromTokenStartOffset !== fromChIndex) {
			tokens[fromTokenIndex << 1] = fromChIndex;
			dest = ((fromTokenIndex + 1) << 1);
			lastEnd = fromChIndex;
		} else {
			dest = (fromTokenIndex << 1);
			lastEnd = fromTokenStartOffset;
		}

		const delta = (toChIndex - fromChIndex);
		for (let tokenIndex = fromTokenIndex + 1; tokenIndex < tokensCount; tokenIndex++) {
			const tokenEndOffset = tokens[tokenIndex << 1] - delta;
			if (tokenEndOffset > lastEnd) {
				tokens[dest++] = tokenEndOffset;
				tokens[dest++] = tokens[(tokenIndex << 1) + 1];
				lastEnd = tokenEndOffset;
			}
		}

		if (dest === tokens.length) {
			// nothing to trim
			return lineTokens;
		}

		let tmp = new Uint32Array(dest);
		tmp.set(tokens.subarray(0, dest), 0);
		return tmp.buffer;
	}

	public static _append(lineTokens: Uint32Array | ArrayBuffer | null, _otherTokens: Uint32Array | ArrayBuffer | null): Uint32Array | ArrayBuffer | null {
		if (_otherTokens === EMPTY_LINE_TOKENS) {
			return lineTokens;
		}
		if (lineTokens === EMPTY_LINE_TOKENS) {
			return _otherTokens;
		}
		if (lineTokens === null) {
			return lineTokens;
		}
		if (_otherTokens === null) {
			// cannot determine combined line length...
			return null;
		}
		const myTokens = toUint32Array(lineTokens);
		const otherTokens = toUint32Array(_otherTokens);
		const otherTokensCount = (otherTokens.length >>> 1);

		let result = new Uint32Array(myTokens.length + otherTokens.length);
		result.set(myTokens, 0);
		let dest = myTokens.length;
		const delta = myTokens[myTokens.length - 2];
		for (let i = 0; i < otherTokensCount; i++) {
			result[dest++] = otherTokens[(i << 1)] + delta;
			result[dest++] = otherTokens[(i << 1) + 1];
		}
		return result.buffer;
	}

	public static _insert(lineTokens: Uint32Array | ArrayBuffer | null, chIndex: number, textLength: number): Uint32Array | ArrayBuffer | null {
		if (lineTokens === null || lineTokens === EMPTY_LINE_TOKENS) {
			// nothing to do
			return lineTokens;
		}

		const tokens = toUint32Array(lineTokens);
		const tokensCount = (tokens.length >>> 1);

		let fromTokenIndex = LineTokens.findIndexInTokensArray(tokens, chIndex);
		if (fromTokenIndex > 0) {
			const fromTokenStartOffset = tokens[(fromTokenIndex - 1) << 1];
			if (fromTokenStartOffset === chIndex) {
				fromTokenIndex--;
			}
		}
		for (let tokenIndex = fromTokenIndex; tokenIndex < tokensCount; tokenIndex++) {
			tokens[tokenIndex << 1] += textLength;
		}
		return lineTokens;
	}

	//#endregion
}
