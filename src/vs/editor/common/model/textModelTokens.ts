/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IState, FontStyle, StandardTokenType, MetadataConsts, ColorId, LanguageId, ITokenizationSupport, LanguageIdentifier } from 'vs/editor/common/modes';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import * as arrays from 'vs/base/common/arrays';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelTokensChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TokenizationResult2 } from 'vs/editor/common/core/token';
import { nullTokenize2 } from 'vs/editor/common/modes/nullMode';
import { ITextBuffer } from 'vs/editor/common/model';

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

class ModelLineTokens {
	_state: IState;
	_lineTokens: ArrayBuffer;
	_invalid: boolean;

	constructor(state: IState) {
		this._state = state;
		this._lineTokens = null;
		this._invalid = true;
	}

	public deleteBeginning(toChIndex: number): void {
		if (this._lineTokens === null || this._lineTokens === EMPTY_LINE_TOKENS) {
			return;
		}
		this.delete(0, toChIndex);
	}

	public deleteEnding(fromChIndex: number): void {
		if (this._lineTokens === null || this._lineTokens === EMPTY_LINE_TOKENS) {
			return;
		}

		const tokens = new Uint32Array(this._lineTokens);
		const lineTextLength = tokens[tokens.length - 2];
		this.delete(fromChIndex, lineTextLength);
	}

	public delete(fromChIndex: number, toChIndex: number): void {
		if (this._lineTokens === null || this._lineTokens === EMPTY_LINE_TOKENS || fromChIndex === toChIndex) {
			return;
		}

		const tokens = new Uint32Array(this._lineTokens);
		const tokensCount = (tokens.length >>> 1);

		// special case: deleting everything
		if (fromChIndex === 0 && tokens[tokens.length - 2] === toChIndex) {
			this._lineTokens = EMPTY_LINE_TOKENS;
			return;
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
			return;
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
			return;
		}

		let tmp = new Uint32Array(dest);
		tmp.set(tokens.subarray(0, dest), 0);
		this._lineTokens = tmp.buffer;
	}

	public append(_otherTokens: ArrayBuffer): void {
		if (_otherTokens === EMPTY_LINE_TOKENS) {
			return;
		}
		if (this._lineTokens === EMPTY_LINE_TOKENS) {
			this._lineTokens = _otherTokens;
			return;
		}
		if (this._lineTokens === null) {
			return;
		}
		if (_otherTokens === null) {
			// cannot determine combined line length...
			this._lineTokens = null;
			return;
		}
		const myTokens = new Uint32Array(this._lineTokens);
		const otherTokens = new Uint32Array(_otherTokens);
		const otherTokensCount = (otherTokens.length >>> 1);

		let result = new Uint32Array(myTokens.length + otherTokens.length);
		result.set(myTokens, 0);
		let dest = myTokens.length;
		const delta = myTokens[myTokens.length - 2];
		for (let i = 0; i < otherTokensCount; i++) {
			result[dest++] = otherTokens[(i << 1)] + delta;
			result[dest++] = otherTokens[(i << 1) + 1];
		}
		this._lineTokens = result.buffer;
	}

	public insert(chIndex: number, textLength: number): void {
		if (!this._lineTokens) {
			// nothing to do
			return;
		}

		const tokens = new Uint32Array(this._lineTokens);
		const tokensCount = (tokens.length >>> 1);

		let fromTokenIndex = LineTokens.findIndexInTokensArray(tokens, chIndex);
		if (fromTokenIndex > 0) {
			const fromTokenStartOffset = (fromTokenIndex > 0 ? tokens[(fromTokenIndex - 1) << 1] : 0);
			if (fromTokenStartOffset === chIndex) {
				fromTokenIndex--;
			}
		}
		for (let tokenIndex = fromTokenIndex; tokenIndex < tokensCount; tokenIndex++) {
			tokens[tokenIndex << 1] += textLength;
		}
	}
}

export class ModelLinesTokens {

	public readonly languageIdentifier: LanguageIdentifier;
	public readonly tokenizationSupport: ITokenizationSupport;
	private _tokens: ModelLineTokens[];
	private _invalidLineStartIndex: number;
	private _lastState: IState;

	constructor(languageIdentifier: LanguageIdentifier, tokenizationSupport: ITokenizationSupport) {
		this.languageIdentifier = languageIdentifier;
		this.tokenizationSupport = tokenizationSupport;
		this._tokens = [];
		if (this.tokenizationSupport) {
			let initialState: IState = null;
			try {
				initialState = this.tokenizationSupport.getInitialState();
			} catch (e) {
				onUnexpectedError(e);
				this.tokenizationSupport = null;
			}

			if (initialState) {
				this._tokens[0] = new ModelLineTokens(initialState);
			}
		}

		this._invalidLineStartIndex = 0;
		this._lastState = null;
	}

	public get inValidLineStartIndex() {
		return this._invalidLineStartIndex;
	}

	public getTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineText: string): LineTokens {
		let rawLineTokens: ArrayBuffer = null;
		if (lineIndex < this._tokens.length && this._tokens[lineIndex]) {
			rawLineTokens = this._tokens[lineIndex]._lineTokens;
		}

		if (rawLineTokens !== null && rawLineTokens !== EMPTY_LINE_TOKENS) {
			return new LineTokens(new Uint32Array(rawLineTokens), lineText);
		}

		let lineTokens = new Uint32Array(2);
		lineTokens[0] = lineText.length;
		lineTokens[1] = getDefaultMetadata(topLevelLanguageId);
		return new LineTokens(lineTokens, lineText);
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		const firstInvalidLineNumber = this._invalidLineStartIndex + 1;
		return (firstInvalidLineNumber >= lineNumber);
	}

	public hasLinesToTokenize(buffer: ITextBuffer): boolean {
		return (this._invalidLineStartIndex < buffer.getLineCount());
	}

	public invalidateLine(lineIndex: number): void {
		this._setIsInvalid(lineIndex, true);
		if (lineIndex < this._invalidLineStartIndex) {
			this._setIsInvalid(this._invalidLineStartIndex, true);
			this._invalidLineStartIndex = lineIndex;
		}
	}

	private _setIsInvalid(lineIndex: number, invalid: boolean): void {
		if (lineIndex < this._tokens.length && this._tokens[lineIndex]) {
			this._tokens[lineIndex]._invalid = invalid;
		}
	}

	_isInvalid(lineIndex: number): boolean {
		if (lineIndex < this._tokens.length && this._tokens[lineIndex]) {
			return this._tokens[lineIndex]._invalid;
		}
		return true;
	}

	_getState(lineIndex: number): IState {
		if (lineIndex < this._tokens.length && this._tokens[lineIndex]) {
			return this._tokens[lineIndex]._state;
		}
		return null;
	}

	_setTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineTextLength: number, tokens: Uint32Array): void {
		let target: ModelLineTokens;
		if (lineIndex < this._tokens.length && this._tokens[lineIndex]) {
			target = this._tokens[lineIndex];
		} else {
			target = new ModelLineTokens(null);
			this._tokens[lineIndex] = target;
		}

		if (lineTextLength === 0) {
			target._lineTokens = EMPTY_LINE_TOKENS;
			return;
		}

		if (!tokens || tokens.length === 0) {
			tokens = new Uint32Array(2);
			tokens[0] = 0;
			tokens[1] = getDefaultMetadata(topLevelLanguageId);
		}

		LineTokens.convertToEndOffset(tokens, lineTextLength);

		target._lineTokens = tokens.buffer;
	}

	private _setState(lineIndex: number, state: IState): void {
		if (lineIndex < this._tokens.length && this._tokens[lineIndex]) {
			this._tokens[lineIndex]._state = state;
		} else {
			const tmp = new ModelLineTokens(state);
			this._tokens[lineIndex] = tmp;
		}
	}

	//#region Editing

	public applyEdits(range: Range, eolCount: number, firstLineLength: number): void {

		const deletingLinesCnt = range.endLineNumber - range.startLineNumber;
		const insertingLinesCnt = eolCount;
		const editingLinesCnt = Math.min(deletingLinesCnt, insertingLinesCnt);

		for (let j = editingLinesCnt; j >= 0; j--) {
			this.invalidateLine(range.startLineNumber + j - 1);
		}

		this._acceptDeleteRange(range);
		this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), eolCount, firstLineLength);
	}

	private _acceptDeleteRange(range: Range): void {

		const firstLineIndex = range.startLineNumber - 1;
		if (firstLineIndex >= this._tokens.length) {
			return;
		}

		if (range.startLineNumber === range.endLineNumber) {
			if (range.startColumn === range.endColumn) {
				// Nothing to delete
				return;
			}

			this._tokens[firstLineIndex].delete(range.startColumn - 1, range.endColumn - 1);
			return;
		}

		const firstLine = this._tokens[firstLineIndex];
		firstLine.deleteEnding(range.startColumn - 1);

		const lastLineIndex = range.endLineNumber - 1;
		let lastLineTokens: ArrayBuffer = null;
		if (lastLineIndex < this._tokens.length) {
			const lastLine = this._tokens[lastLineIndex];
			lastLine.deleteBeginning(range.endColumn - 1);
			lastLineTokens = lastLine._lineTokens;
		}

		// Take remaining text on last line and append it to remaining text on first line
		firstLine.append(lastLineTokens);

		// Delete middle lines
		this._tokens.splice(range.startLineNumber, range.endLineNumber - range.startLineNumber);
	}

	private _acceptInsertText(position: Position, eolCount: number, firstLineLength: number): void {

		if (eolCount === 0 && firstLineLength === 0) {
			// Nothing to insert
			return;
		}

		const lineIndex = position.lineNumber - 1;
		if (lineIndex >= this._tokens.length) {
			return;
		}

		if (eolCount === 0) {
			// Inserting text on one line
			this._tokens[lineIndex].insert(position.column - 1, firstLineLength);
			return;
		}

		const line = this._tokens[lineIndex];
		line.deleteEnding(position.column - 1);
		line.insert(position.column - 1, firstLineLength);

		let insert: ModelLineTokens[] = new Array<ModelLineTokens>(eolCount);
		for (let i = eolCount - 1; i >= 0; i--) {
			insert[i] = new ModelLineTokens(null);
		}
		this._tokens = arrays.arrayInsert(this._tokens, position.lineNumber, insert);
	}

	//#endregion

	//#region Tokenization

	public _tokenizeOneLine(buffer: ITextBuffer, eventBuilder: ModelTokensChangedEventBuilder): number {
		if (!this.hasLinesToTokenize(buffer)) {
			return buffer.getLineCount() + 1;
		}
		const lineNumber = this._invalidLineStartIndex + 1;
		this._updateTokensUntilLine(buffer, eventBuilder, lineNumber);
		return lineNumber;
	}

	public _tokenizeOneLine2(buffer: ITextBuffer, text: string, state: IState, eventBuilder: ModelTokensChangedEventBuilder): TokenizationResult2 {
		if (!this.hasLinesToTokenize(buffer)) {
			return null;
		}

		let r: TokenizationResult2 = null;

		try {
			r = this.tokenizationSupport.tokenize2(text, state, 0);
		} catch (e) {
			onUnexpectedError(e);
		}

		if (!r) {
			r = nullTokenize2(this.languageIdentifier.id, text, state, 0);
		}
		return r;
	}

	public _updateTokensUntilLine(buffer: ITextBuffer, eventBuilder: ModelTokensChangedEventBuilder, lineNumber: number): void {
		if (!this.tokenizationSupport) {
			this._invalidLineStartIndex = buffer.getLineCount();
			return;
		}

		const linesLength = buffer.getLineCount();
		const endLineIndex = lineNumber - 1;

		// Validate all states up to and including endLineIndex
		for (let lineIndex = this._invalidLineStartIndex; lineIndex <= endLineIndex; lineIndex++) {
			const endStateIndex = lineIndex + 1;
			let r: TokenizationResult2 = null;
			const text = buffer.getLineContent(lineIndex + 1);

			try {
				// Tokenize only the first X characters
				let freshState = this._getState(lineIndex).clone();
				r = this.tokenizationSupport.tokenize2(text, freshState, 0);
			} catch (e) {
				onUnexpectedError(e);
			}

			if (!r) {
				r = nullTokenize2(this.languageIdentifier.id, text, this._getState(lineIndex), 0);
			}
			this._setTokens(this.languageIdentifier.id, lineIndex, text.length, r.tokens);
			eventBuilder.registerChangedTokens(lineIndex + 1);
			this._setIsInvalid(lineIndex, false);

			if (endStateIndex < linesLength) {
				if (this._getState(endStateIndex) !== null && r.endState.equals(this._getState(endStateIndex))) {
					// The end state of this line remains the same
					let nextInvalidLineIndex = lineIndex + 1;
					while (nextInvalidLineIndex < linesLength) {
						if (this._isInvalid(nextInvalidLineIndex)) {
							break;
						}
						if (nextInvalidLineIndex + 1 < linesLength) {
							if (this._getState(nextInvalidLineIndex + 1) === null) {
								break;
							}
						} else {
							if (this._lastState === null) {
								break;
							}
						}
						nextInvalidLineIndex++;
					}
					this._invalidLineStartIndex = Math.max(this._invalidLineStartIndex, nextInvalidLineIndex);
					lineIndex = nextInvalidLineIndex - 1; // -1 because the outer loop increments it
				} else {
					this._setState(endStateIndex, r.endState);
				}
			} else {
				this._lastState = r.endState;
			}
		}
		this._invalidLineStartIndex = Math.max(this._invalidLineStartIndex, endLineIndex + 1);
	}

	// #endregion
}

export class ModelTokensChangedEventBuilder {

	private _ranges: { fromLineNumber: number; toLineNumber: number; }[];

	constructor() {
		this._ranges = [];
	}

	public registerChangedTokens(lineNumber: number): void {
		const ranges = this._ranges;
		const rangesLength = ranges.length;
		const previousRange = rangesLength > 0 ? ranges[rangesLength - 1] : null;

		if (previousRange && previousRange.toLineNumber === lineNumber - 1) {
			// extend previous range
			previousRange.toLineNumber++;
		} else {
			// insert new range
			ranges[rangesLength] = {
				fromLineNumber: lineNumber,
				toLineNumber: lineNumber
			};
		}
	}

	public build(): IModelTokensChangedEvent {
		if (this._ranges.length === 0) {
			return null;
		}
		return {
			ranges: this._ranges
		};
	}
}
