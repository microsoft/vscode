/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { onUnexpectedError } from 'vs/base/common/errors';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { TokenizationResult2 } from 'vs/editor/common/core/token';
import { ITextBuffer } from 'vs/editor/common/model';
import { IModelTokensChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { ColorId, FontStyle, IState, ITokenizationSupport, LanguageId, LanguageIdentifier, MetadataConsts, StandardTokenType, TokenMetadata } from 'vs/editor/common/modes';
import { nullTokenize2 } from 'vs/editor/common/modes/nullMode';

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

const enum Constants {
	CHEAP_TOKENIZATION_LENGTH_LIMIT = 2048
}

class ModelLineTokens {

	public static deleteBeginning(lineTokens: ArrayBuffer | null, toChIndex: number): ArrayBuffer | null {
		if (lineTokens === null || lineTokens === EMPTY_LINE_TOKENS) {
			return lineTokens;
		}
		return this.delete(lineTokens, 0, toChIndex);
	}

	public static deleteEnding(lineTokens: ArrayBuffer | null, fromChIndex: number): ArrayBuffer | null {
		if (lineTokens === null || lineTokens === EMPTY_LINE_TOKENS) {
			return lineTokens;
		}

		const tokens = new Uint32Array(lineTokens);
		const lineTextLength = tokens[tokens.length - 2];
		return this.delete(lineTokens, fromChIndex, lineTextLength);
	}

	public static delete(lineTokens: ArrayBuffer | null, fromChIndex: number, toChIndex: number): ArrayBuffer | null {
		if (lineTokens === null || lineTokens === EMPTY_LINE_TOKENS || fromChIndex === toChIndex) {
			return lineTokens;
		}

		const tokens = new Uint32Array(lineTokens);
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

	public static append(lineTokens: ArrayBuffer | null, _otherTokens: ArrayBuffer | null): ArrayBuffer | null {
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
		const myTokens = new Uint32Array(lineTokens);
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
		return result.buffer;
	}

	public static insert(lineTokens: ArrayBuffer | null, chIndex: number, textLength: number): ArrayBuffer | null {
		if (lineTokens === null || lineTokens === EMPTY_LINE_TOKENS) {
			// nothing to do
			return lineTokens;
		}

		const tokens = new Uint32Array(lineTokens);
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
}

export interface ITokensStore {
	readonly invalidLineStartIndex: number;

	setGoodTokens(topLevelLanguageId: LanguageId, linesLength: number, lineIndex: number, lineTextLength: number, r: TokenizationResult2): void;
	setFakeTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineTextLength: number, r: TokenizationResult2): void;

	getTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineText: string): LineTokens;
	getBeginState(lineIndex: number): IState | null;

	applyEdits(range: Range, eolCount: number, firstLineLength: number): void;
}

export class TokensStore implements ITokensStore {
	private _lineTokens: (ArrayBuffer | null)[];
	private _beginState: (IState | null)[];
	private _valid: boolean[];
	private _len: number;
	private _invalidLineStartIndex: number;

	constructor(initialState: IState | null) {
		this._reset(initialState);
	}

	private _reset(initialState: IState | null): void {
		this._lineTokens = [];
		this._beginState = [];
		this._valid = [];
		this._len = 0;
		this._invalidLineStartIndex = 0;

		if (initialState) {
			this._setBeginState(0, initialState);
		}
	}

	public get invalidLineStartIndex() {
		return this._invalidLineStartIndex;
	}

	public getTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineText: string): LineTokens {
		let rawLineTokens: ArrayBuffer | null = null;
		if (lineIndex < this._len) {
			rawLineTokens = this._lineTokens[lineIndex];
		}

		if (rawLineTokens !== null && rawLineTokens !== EMPTY_LINE_TOKENS) {
			return new LineTokens(new Uint32Array(rawLineTokens), lineText);
		}

		let lineTokens = new Uint32Array(2);
		lineTokens[0] = lineText.length;
		lineTokens[1] = getDefaultMetadata(topLevelLanguageId);
		return new LineTokens(lineTokens, lineText);
	}

	private _invalidateLine(lineIndex: number): void {
		if (lineIndex < this._len) {
			this._valid[lineIndex] = false;
		}

		if (lineIndex < this._invalidLineStartIndex) {
			this._invalidLineStartIndex = lineIndex;
		}
	}

	private _isValid(lineIndex: number): boolean {
		if (lineIndex < this._len) {
			return this._valid[lineIndex];
		}
		return false;
	}

	public getBeginState(lineIndex: number): IState | null {
		if (lineIndex < this._len) {
			return this._beginState[lineIndex];
		}
		return null;
	}

	private static _massageTokens(topLevelLanguageId: LanguageId, lineTextLength: number, tokens: Uint32Array): ArrayBuffer {
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
			tokens = new Uint32Array(2);
			tokens[0] = 0;
			tokens[1] = getDefaultMetadata(topLevelLanguageId);
		}

		LineTokens.convertToEndOffset(tokens, lineTextLength);

		return tokens.buffer;
	}

	private _ensureLine(lineIndex: number): void {
		while (lineIndex >= this._len) {
			this._lineTokens[this._len] = null;
			this._beginState[this._len] = null;
			this._valid[this._len] = false;
			this._len++;
		}
	}

	private _deleteLines(start: number, deleteCount: number): void {
		if (deleteCount === 0) {
			return;
		}
		this._lineTokens.splice(start, deleteCount);
		this._beginState.splice(start, deleteCount);
		this._valid.splice(start, deleteCount);
		this._len -= deleteCount;
	}

	private _insertLines(insertIndex: number, insertCount: number): void {
		if (insertCount === 0) {
			return;
		}
		let lineTokens: (ArrayBuffer | null)[] = [];
		let beginState: (IState | null)[] = [];
		let valid: boolean[] = [];
		for (let i = 0; i < insertCount; i++) {
			lineTokens[i] = null;
			beginState[i] = null;
			valid[i] = false;
		}
		this._lineTokens = arrays.arrayInsert(this._lineTokens, insertIndex, lineTokens);
		this._beginState = arrays.arrayInsert(this._beginState, insertIndex, beginState);
		this._valid = arrays.arrayInsert(this._valid, insertIndex, valid);
		this._len += insertCount;
	}

	private _setTokens(lineIndex: number, tokens: ArrayBuffer | null, valid: boolean): void {
		this._ensureLine(lineIndex);
		this._lineTokens[lineIndex] = tokens;
		this._valid[lineIndex] = valid;
	}

	private _setBeginState(lineIndex: number, beginState: IState | null): void {
		this._ensureLine(lineIndex);
		this._beginState[lineIndex] = beginState;
	}

	public setGoodTokens(topLevelLanguageId: LanguageId, linesLength: number, lineIndex: number, lineTextLength: number, r: TokenizationResult2): void {
		const tokens = TokensStore._massageTokens(topLevelLanguageId, lineTextLength, r.tokens);
		this._setTokens(lineIndex, tokens, true);
		this._invalidLineStartIndex = lineIndex + 1;

		// Check if this was the last line
		if (lineIndex === linesLength - 1) {
			return;
		}

		// Check if the end state has changed
		const previousEndState = this.getBeginState(lineIndex + 1);
		if (previousEndState === null || !r.endState.equals(previousEndState)) {
			this._setBeginState(lineIndex + 1, r.endState);
			this._invalidateLine(lineIndex + 1);
			return;
		}

		// Perhaps we can skip tokenizing some lines...
		let i = lineIndex + 1;
		while (i < linesLength) {
			if (!this._isValid(i)) {
				break;
			}
			i++;
		}
		this._invalidLineStartIndex = i;
	}

	setFakeTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineTextLength: number, r: TokenizationResult2): void {
		const tokens = TokensStore._massageTokens(topLevelLanguageId, lineTextLength, r.tokens);
		this._setTokens(lineIndex, tokens, false);
	}

	//#region Editing

	public applyEdits(range: Range, eolCount: number, firstLineLength: number): void {
		try {
			const deletingLinesCnt = range.endLineNumber - range.startLineNumber;
			const insertingLinesCnt = eolCount;
			const editingLinesCnt = Math.min(deletingLinesCnt, insertingLinesCnt);

			for (let j = editingLinesCnt; j >= 0; j--) {
				this._invalidateLine(range.startLineNumber + j - 1);
			}

			this._acceptDeleteRange(range);
			this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), eolCount, firstLineLength);
		} catch (err) {
			// emergency recovery => reset tokens
			this._reset(this.getBeginState(0));
		}
	}

	private _acceptDeleteRange(range: Range): void {

		const firstLineIndex = range.startLineNumber - 1;
		if (firstLineIndex >= this._len) {
			return;
		}

		if (range.startLineNumber === range.endLineNumber) {
			if (range.startColumn === range.endColumn) {
				// Nothing to delete
				return;
			}

			this._lineTokens[firstLineIndex] = ModelLineTokens.delete(this._lineTokens[firstLineIndex], range.startColumn - 1, range.endColumn - 1);
			return;
		}

		this._lineTokens[firstLineIndex] = ModelLineTokens.deleteEnding(this._lineTokens[firstLineIndex], range.startColumn - 1);

		const lastLineIndex = range.endLineNumber - 1;
		let lastLineTokens: ArrayBuffer | null = null;
		if (lastLineIndex < this._len) {
			lastLineTokens = ModelLineTokens.deleteBeginning(this._lineTokens[lastLineIndex], range.endColumn - 1);
		}

		// Take remaining text on last line and append it to remaining text on first line
		this._lineTokens[firstLineIndex] = ModelLineTokens.append(this._lineTokens[firstLineIndex], lastLineTokens);

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
			this._lineTokens[lineIndex] = ModelLineTokens.insert(this._lineTokens[lineIndex], position.column - 1, firstLineLength);
			return;
		}

		this._lineTokens[lineIndex] = ModelLineTokens.deleteEnding(this._lineTokens[lineIndex], position.column - 1);
		this._lineTokens[lineIndex] = ModelLineTokens.insert(this._lineTokens[lineIndex], position.column - 1, firstLineLength);

		this._insertLines(position.lineNumber, eolCount);
	}

	//#endregion
}

export interface IModelLinesTokens {
	readonly tokenizationSupport: ITokenizationSupport | null;

	isCheapToTokenize(store: ITokensStore, buffer: ITextBuffer, lineNumber: number): boolean;
	hasLinesToTokenize(store: ITokensStore, buffer: ITextBuffer): boolean;

	tokenizeOneInvalidLine(store: ITokensStore, buffer: ITextBuffer, eventBuilder: ModelTokensChangedEventBuilder): number;
	updateTokensUntilLine(store: ITokensStore, buffer: ITextBuffer, eventBuilder: ModelTokensChangedEventBuilder, lineNumber: number): void;
	tokenizeViewport(store: ITokensStore, buffer: ITextBuffer, eventBuilder: ModelTokensChangedEventBuilder, startLineNumber: number, endLineNumber: number): void;
}

export class ModelLinesTokens implements IModelLinesTokens {

	private readonly _languageIdentifier: LanguageIdentifier;
	public readonly tokenizationSupport: ITokenizationSupport | null;

	constructor(languageIdentifier: LanguageIdentifier, tokenizationSupport: ITokenizationSupport | null) {
		this._languageIdentifier = languageIdentifier;
		this.tokenizationSupport = tokenizationSupport;
	}

	public isCheapToTokenize(store: ITokensStore, buffer: ITextBuffer, lineNumber: number): boolean {
		if (!this.tokenizationSupport) {
			return true;
		}

		const firstInvalidLineNumber = store.invalidLineStartIndex + 1;
		if (lineNumber > firstInvalidLineNumber) {
			return false;
		}

		if (lineNumber < firstInvalidLineNumber) {
			return true;
		}

		if (buffer.getLineLength(lineNumber) < Constants.CHEAP_TOKENIZATION_LENGTH_LIMIT) {
			return true;
		}

		return false;
	}

	public hasLinesToTokenize(store: ITokensStore, buffer: ITextBuffer): boolean {
		if (!this.tokenizationSupport) {
			return false;
		}

		return (store.invalidLineStartIndex < buffer.getLineCount());
	}

	//#region Tokenization

	public tokenizeOneInvalidLine(store: ITokensStore, buffer: ITextBuffer, eventBuilder: ModelTokensChangedEventBuilder): number {
		if (!this.hasLinesToTokenize(store, buffer)) {
			return buffer.getLineCount() + 1;
		}
		const lineNumber = store.invalidLineStartIndex + 1;
		this.updateTokensUntilLine(store, buffer, eventBuilder, lineNumber);
		return lineNumber;
	}

	public updateTokensUntilLine(store: ITokensStore, buffer: ITextBuffer, eventBuilder: ModelTokensChangedEventBuilder, lineNumber: number): void {
		if (!this.tokenizationSupport) {
			return;
		}

		const linesLength = buffer.getLineCount();
		const endLineIndex = lineNumber - 1;

		// Validate all states up to and including endLineIndex
		for (let lineIndex = store.invalidLineStartIndex; lineIndex <= endLineIndex; lineIndex++) {
			const text = buffer.getLineContent(lineIndex + 1);
			const lineStartState = store.getBeginState(lineIndex);

			const r = safeTokenize(this._languageIdentifier, this.tokenizationSupport, text, lineStartState!);
			store.setGoodTokens(this._languageIdentifier.id, linesLength, lineIndex, text.length, r);
			eventBuilder.registerChangedTokens(lineIndex + 1);
			lineIndex = store.invalidLineStartIndex - 1; // -1 because the outer loop increments it
		}
	}

	public tokenizeViewport(store: ITokensStore, buffer: ITextBuffer, eventBuilder: ModelTokensChangedEventBuilder, startLineNumber: number, endLineNumber: number): void {
		if (!this.tokenizationSupport) {
			// nothing to do
			return;
		}

		if (endLineNumber <= store.invalidLineStartIndex) {
			// nothing to do
			return;
		}

		if (startLineNumber <= store.invalidLineStartIndex) {
			// tokenization has reached the viewport start...
			this.updateTokensUntilLine(store, buffer, eventBuilder, endLineNumber);
			return;
		}

		let nonWhitespaceColumn = buffer.getLineFirstNonWhitespaceColumn(startLineNumber);
		let fakeLines: string[] = [];
		let initialState: IState | null = null;
		for (let i = startLineNumber - 1; nonWhitespaceColumn > 0 && i >= 1; i--) {
			let newNonWhitespaceIndex = buffer.getLineFirstNonWhitespaceColumn(i);

			if (newNonWhitespaceIndex === 0) {
				continue;
			}

			if (newNonWhitespaceIndex < nonWhitespaceColumn) {
				initialState = store.getBeginState(i - 1);
				if (initialState) {
					break;
				}
				fakeLines.push(buffer.getLineContent(i));
				nonWhitespaceColumn = newNonWhitespaceIndex;
			}
		}

		if (!initialState) {
			initialState = this.tokenizationSupport.getInitialState();
		}

		let state = initialState;
		for (let i = fakeLines.length - 1; i >= 0; i--) {
			let r = safeTokenize(this._languageIdentifier, this.tokenizationSupport, fakeLines[i], state);
			state = r.endState;
		}

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			let text = buffer.getLineContent(lineNumber);
			let r = safeTokenize(this._languageIdentifier, this.tokenizationSupport, text, state);
			store.setFakeTokens(this._languageIdentifier.id, lineNumber - 1, text.length, r);
			state = r.endState;
			eventBuilder.registerChangedTokens(lineNumber);
		}
	}

	// #endregion
}

function safeTokenize(languageIdentifier: LanguageIdentifier, tokenizationSupport: ITokenizationSupport | null, text: string, state: IState): TokenizationResult2 {
	let r: TokenizationResult2 | null = null;

	if (tokenizationSupport) {
		try {
			r = tokenizationSupport.tokenize2(text, state.clone(), 0);
		} catch (e) {
			onUnexpectedError(e);
		}
	}

	if (!r) {
		r = nullTokenize2(languageIdentifier.id, text, state, 0);
	}
	return r;
}

export class ModelTokensChangedEventBuilder {

	private readonly _ranges: { fromLineNumber: number; toLineNumber: number; }[];

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

	public build(): IModelTokensChangedEvent | null {
		if (this._ranges.length === 0) {
			return null;
		}
		return {
			tokenizationSupportChanged: false,
			ranges: this._ranges
		};
	}
}
