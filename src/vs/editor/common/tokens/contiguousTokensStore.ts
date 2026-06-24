/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from '../../../base/common/arrays.js';
import { Position } from '../core/position.js';
import { IRange } from '../core/range.js';
import { ContiguousTokensEditing, EMPTY_LINE_TOKENS, toUint32Array } from './contiguousTokensEditing.js';
import { LineTokens } from './lineTokens.js';
import { ILanguageIdCodec } from '../languages.js';
import { LanguageId, FontStyle, ColorId, StandardTokenType, MetadataConsts, TokenMetadata } from '../encodedTokenAttributes.js';
import { ITextModel } from '../model.js';
import { ContiguousMultilineTokens } from './contiguousMultilineTokens.js';

/**
 * Represents contiguous tokens in a text model.
 */
export class ContiguousTokensStore {
	private _lineTokens: (Uint32Array | ArrayBuffer | null)[];
	private _len: number;
	private readonly _languageIdCodec: ILanguageIdCodec;

	constructor(languageIdCodec: ILanguageIdCodec) {
		this._lineTokens = [];
		this._len = 0;
		this._languageIdCodec = languageIdCodec;
	}

	public flush(): void {
		this._lineTokens = [];
		this._len = 0;
	}

	get hasTokens(): boolean {
		return this._lineTokens.length > 0;
	}

	public getTokens(topLevelLanguageId: string, lineIndex: number, lineText: string): LineTokens {
		let rawLineTokens: Uint32Array | ArrayBuffer | null = null;
		if (lineIndex < this._len) {
			rawLineTokens = this._lineTokens[lineIndex];
		}

		if (rawLineTokens !== null && rawLineTokens !== EMPTY_LINE_TOKENS) {
			return new LineTokens(toUint32Array(rawLineTokens), lineText, this._languageIdCodec);
		}

		const lineTokens = new Uint32Array(2);
		lineTokens[0] = lineText.length;
		lineTokens[1] = getDefaultMetadata(this._languageIdCodec.encodeLanguageId(topLevelLanguageId));
		return new LineTokens(lineTokens, lineText, this._languageIdCodec);
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
		const lineTokens: (Uint32Array | ArrayBuffer | null)[] = [];
		for (let i = 0; i < insertCount; i++) {
			lineTokens[i] = null;
		}
		this._lineTokens = arrays.arrayInsert(this._lineTokens, insertIndex, lineTokens);
		this._len += insertCount;
	}

	public setTokens(topLevelLanguageId: string, lineIndex: number, lineTextLength: number, _tokens: Uint32Array | ArrayBuffer | null, checkEquality: boolean): boolean {
		const tokens = ContiguousTokensStore._massageTokens(this._languageIdCodec.encodeLanguageId(topLevelLanguageId), lineTextLength, _tokens);
		this._ensureLine(lineIndex);
		const oldTokens = this._lineTokens[lineIndex];
		this._lineTokens[lineIndex] = tokens;

		if (checkEquality) {
			return !ContiguousTokensStore._equals(oldTokens, tokens);
		}
		return false;
	}

	private static _equals(_a: Uint32Array | ArrayBuffer | null, _b: Uint32Array | ArrayBuffer | null) {
		if (!_a || !_b) {
			return !_a && !_b;
		}

		const a = toUint32Array(_a);
		const b = toUint32Array(_b);

		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0, len = a.length; i < len; i++) {
			if (a[i] !== b[i]) {
				return false;
			}
		}
		return true;
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

			this._lineTokens[firstLineIndex] = ContiguousTokensEditing.delete(this._lineTokens[firstLineIndex], range.startColumn - 1, range.endColumn - 1);
			return;
		}

		this._lineTokens[firstLineIndex] = ContiguousTokensEditing.deleteEnding(this._lineTokens[firstLineIndex], range.startColumn - 1);

		const lastLineIndex = range.endLineNumber - 1;
		let lastLineTokens: Uint32Array | ArrayBuffer | null = null;
		if (lastLineIndex < this._len) {
			lastLineTokens = ContiguousTokensEditing.deleteBeginning(this._lineTokens[lastLineIndex], range.endColumn - 1);
		}

		// Take remaining text on last line and append it to remaining text on first line
		this._lineTokens[firstLineIndex] = ContiguousTokensEditing.append(this._lineTokens[firstLineIndex], lastLineTokens);

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
			this._lineTokens[lineIndex] = ContiguousTokensEditing.insert(this._lineTokens[lineIndex], position.column - 1, firstLineLength);
			return;
		}

		this._lineTokens[lineIndex] = ContiguousTokensEditing.deleteEnding(this._lineTokens[lineIndex], position.column - 1);
		this._lineTokens[lineIndex] = ContiguousTokensEditing.insert(this._lineTokens[lineIndex], position.column - 1, firstLineLength);

		this._insertLines(position.lineNumber, eolCount);
	}

	//#endregion

	public setMultilineTokens(tokens: ContiguousMultilineTokens[], textModel: ITextModel): { changes: { fromLineNumber: number; toLineNumber: number }[] } {
		if (tokens.length === 0) {
			return { changes: [] };
		}

		const ranges: { fromLineNumber: number; toLineNumber: number }[] = [];

		for (let i = 0, len = tokens.length; i < len; i++) {
			const element = tokens[i];
			let minChangedLineNumber = 0;
			let maxChangedLineNumber = 0;
			let hasChange = false;
			for (let lineNumber = element.startLineNumber; lineNumber <= element.endLineNumber; lineNumber++) {
				if (hasChange) {
					this.setTokens(textModel.getLanguageId(), lineNumber - 1, textModel.getLineLength(lineNumber), element.getLineTokens(lineNumber), false);
					maxChangedLineNumber = lineNumber;
				} else {
					const lineHasChange = this.setTokens(textModel.getLanguageId(), lineNumber - 1, textModel.getLineLength(lineNumber), element.getLineTokens(lineNumber), true);
					if (lineHasChange) {
						hasChange = true;
						minChangedLineNumber = lineNumber;
						maxChangedLineNumber = lineNumber;
					}
				}
			}
			if (hasChange) {
				ranges.push({ fromLineNumber: minChangedLineNumber, toLineNumber: maxChangedLineNumber, });
			}
		}

		return { changes: ranges };
	}
}

function getDefaultMetadata(topLevelLanguageId: LanguageId): number {
	return (
		(topLevelLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
		| (StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET)
		| (FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
		| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
		| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
		// If there is no grammar, we just take a guess and try to match brackets.
		| (MetadataConsts.BALANCED_BRACKETS_MASK)
	) >>> 0;
}
