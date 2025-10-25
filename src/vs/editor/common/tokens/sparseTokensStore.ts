/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from '../../../base/common/arrays.js';
import { IRange, Range } from '../core/range.js';
import { LineTokens } from './lineTokens.js';
import { SparseMultilineTokens } from './sparseMultilineTokens.js';
import { ILanguageIdCodec } from '../languages.js';
import { MetadataConsts } from '../encodedTokenAttributes.js';
import { ITextModel } from '../model.js';

/**
 * Represents sparse tokens in a text model.
 */
export class SparseTokensStore {

	private _pieces: SparseMultilineTokens[];
	private _isComplete: boolean;
	private readonly _languageIdCodec: ILanguageIdCodec;

	constructor(languageIdCodec: ILanguageIdCodec) {
		this._pieces = [];
		this._isComplete = false;
		this._languageIdCodec = languageIdCodec;
	}

	public flush(): void {
		this._pieces = [];
		this._isComplete = false;
	}

	public isEmpty(): boolean {
		return (this._pieces.length === 0);
	}

	public set(pieces: SparseMultilineTokens[] | null, isComplete: boolean, textModel: ITextModel | undefined = undefined): void {
		this._pieces = pieces || [];
		this._isComplete = isComplete;

		if (textModel) {
			for (const p of this._pieces) {
				p.reportIfInvalid(textModel);
			}
		}
	}

	public setPartial(_range: Range, pieces: SparseMultilineTokens[]): Range {
		// console.log(`setPartial ${_range} ${pieces.map(p => p.toString()).join(', ')}`);

		let range = _range;
		if (pieces.length > 0) {
			const _firstRange = pieces[0].getRange();
			const _lastRange = pieces[pieces.length - 1].getRange();
			if (!_firstRange || !_lastRange) {
				return _range;
			}
			range = _range.plusRange(_firstRange).plusRange(_lastRange);
		}

		let insertPosition: { index: number } | null = null;
		for (let i = 0, len = this._pieces.length; i < len; i++) {
			const piece = this._pieces[i];
			if (piece.endLineNumber < range.startLineNumber) {
				// this piece is before the range
				continue;
			}

			if (piece.startLineNumber > range.endLineNumber) {
				// this piece is after the range, so mark the spot before this piece
				// as a good insertion position and stop looping
				insertPosition = insertPosition || { index: i };
				break;
			}

			// this piece might intersect with the range
			piece.removeTokens(range);

			if (piece.isEmpty()) {
				// remove the piece if it became empty
				this._pieces.splice(i, 1);
				i--;
				len--;
				continue;
			}

			if (piece.endLineNumber < range.startLineNumber) {
				// after removal, this piece is before the range
				continue;
			}

			if (piece.startLineNumber > range.endLineNumber) {
				// after removal, this piece is after the range
				insertPosition = insertPosition || { index: i };
				continue;
			}

			// after removal, this piece contains the range
			const [a, b] = piece.split(range);
			if (a.isEmpty()) {
				// this piece is actually after the range
				insertPosition = insertPosition || { index: i };
				continue;
			}
			if (b.isEmpty()) {
				// this piece is actually before the range
				continue;
			}
			this._pieces.splice(i, 1, a, b);
			i++;
			len++;

			insertPosition = insertPosition || { index: i };
		}

		insertPosition = insertPosition || { index: this._pieces.length };

		if (pieces.length > 0) {
			this._pieces = arrays.arrayInsert(this._pieces, insertPosition.index, pieces);
		}

		// console.log(`I HAVE ${this._pieces.length} pieces`);
		// console.log(`${this._pieces.map(p => p.toString()).join('\n')}`);

		return range;
	}

	public isComplete(): boolean {
		return this._isComplete;
	}

	public addSparseTokens(lineNumber: number, aTokens: LineTokens): LineTokens {
		if (aTokens.getTextLength() === 0) {
			// Don't do anything for empty lines
			return aTokens;
		}

		const pieces = this._pieces;

		if (pieces.length === 0) {
			return aTokens;
		}

		const pieceIndex = SparseTokensStore._findFirstPieceWithLine(pieces, lineNumber);
		const bTokens = pieces[pieceIndex].getLineTokens(lineNumber);

		if (!bTokens) {
			return aTokens;
		}

		const aLen = aTokens.getCount();
		const bLen = bTokens.getCount();

		let aIndex = 0;
		const result: number[] = [];
		let resultLen = 0;
		let lastEndOffset = 0;

		const emitToken = (endOffset: number, metadata: number) => {
			if (endOffset === lastEndOffset) {
				return;
			}
			lastEndOffset = endOffset;
			result[resultLen++] = endOffset;
			result[resultLen++] = metadata;
		};

		for (let bIndex = 0; bIndex < bLen; bIndex++) {
			// bTokens is not validated yet, but aTokens is. We want to make sure that the LineTokens we return
			// are valid, so we clamp the ranges to ensure that.
			const bStartCharacter = Math.min(bTokens.getStartCharacter(bIndex), aTokens.getTextLength());
			const bEndCharacter = Math.min(bTokens.getEndCharacter(bIndex), aTokens.getTextLength());
			const bMetadata = bTokens.getMetadata(bIndex);

			const bMask = (
				((bMetadata & MetadataConsts.SEMANTIC_USE_ITALIC) ? MetadataConsts.ITALIC_MASK : 0)
				| ((bMetadata & MetadataConsts.SEMANTIC_USE_BOLD) ? MetadataConsts.BOLD_MASK : 0)
				| ((bMetadata & MetadataConsts.SEMANTIC_USE_UNDERLINE) ? MetadataConsts.UNDERLINE_MASK : 0)
				| ((bMetadata & MetadataConsts.SEMANTIC_USE_STRIKETHROUGH) ? MetadataConsts.STRIKETHROUGH_MASK : 0)
				| ((bMetadata & MetadataConsts.SEMANTIC_USE_FOREGROUND) ? MetadataConsts.FOREGROUND_MASK : 0)
				| ((bMetadata & MetadataConsts.SEMANTIC_USE_BACKGROUND) ? MetadataConsts.BACKGROUND_MASK : 0)
			) >>> 0;
			const aMask = (~bMask) >>> 0;

			// push any token from `a` that is before `b`
			while (aIndex < aLen && aTokens.getEndOffset(aIndex) <= bStartCharacter) {
				emitToken(aTokens.getEndOffset(aIndex), aTokens.getMetadata(aIndex));
				aIndex++;
			}

			// push the token from `a` if it intersects the token from `b`
			if (aIndex < aLen && aTokens.getStartOffset(aIndex) < bStartCharacter) {
				emitToken(bStartCharacter, aTokens.getMetadata(aIndex));
			}

			// skip any tokens from `a` that are contained inside `b`
			while (aIndex < aLen && aTokens.getEndOffset(aIndex) < bEndCharacter) {
				emitToken(aTokens.getEndOffset(aIndex), (aTokens.getMetadata(aIndex) & aMask) | (bMetadata & bMask));
				aIndex++;
			}

			if (aIndex < aLen) {
				emitToken(bEndCharacter, (aTokens.getMetadata(aIndex) & aMask) | (bMetadata & bMask));
				if (aTokens.getEndOffset(aIndex) === bEndCharacter) {
					// `a` ends exactly at the same spot as `b`!
					aIndex++;
				}
			} else {
				const aMergeIndex = Math.min(Math.max(0, aIndex - 1), aLen - 1);

				// push the token from `b`
				emitToken(bEndCharacter, (aTokens.getMetadata(aMergeIndex) & aMask) | (bMetadata & bMask));
			}
		}

		// push the remaining tokens from `a`
		while (aIndex < aLen) {
			emitToken(aTokens.getEndOffset(aIndex), aTokens.getMetadata(aIndex));
			aIndex++;
		}

		return new LineTokens(new Uint32Array(result), aTokens.getLineContent(), this._languageIdCodec);
	}

	private static _findFirstPieceWithLine(pieces: SparseMultilineTokens[], lineNumber: number): number {
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

	public acceptEdit(range: IRange, eolCount: number, firstLineLength: number, lastLineLength: number, firstCharCode: number): void {
		for (const piece of this._pieces) {
			piece.acceptEdit(range, eolCount, firstLineLength, lastLineLength, firstCharCode);
		}
	}
}
