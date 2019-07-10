/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { onUnexpectedError } from 'vs/base/common/errors';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { TokenizationResult2 } from 'vs/editor/common/core/token';
import { IModelTokensChangedEvent, RawContentChangedType } from 'vs/editor/common/model/textModelEvents';
import { IState, ITokenizationSupport, LanguageIdentifier, TokenizationRegistry } from 'vs/editor/common/modes';
import { nullTokenize2 } from 'vs/editor/common/modes/nullMode';
import { TextModel } from 'vs/editor/common/model/textModel';
import { Disposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
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

const enum Constants {
	CHEAP_TOKENIZATION_LENGTH_LIMIT = 2048
}

export class TokenizationStateStore {
	private _beginState: (IState | null)[];
	private _valid: boolean[];
	private _len: number;
	private _invalidLineStartIndex: number;

	constructor() {
		this._reset(null);
	}

	private _reset(initialState: IState | null): void {
		this._beginState = [];
		this._valid = [];
		this._len = 0;
		this._invalidLineStartIndex = 0;

		if (initialState) {
			this._setBeginState(0, initialState);
		}
	}

	public flush(initialState: IState | null): void {
		this._reset(initialState);
	}

	public get invalidLineStartIndex() {
		return this._invalidLineStartIndex;
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

	private _ensureLine(lineIndex: number): void {
		while (lineIndex >= this._len) {
			this._beginState[this._len] = null;
			this._valid[this._len] = false;
			this._len++;
		}
	}

	private _deleteLines(start: number, deleteCount: number): void {
		if (deleteCount === 0) {
			return;
		}
		this._beginState.splice(start, deleteCount);
		this._valid.splice(start, deleteCount);
		this._len -= deleteCount;
	}

	private _insertLines(insertIndex: number, insertCount: number): void {
		if (insertCount === 0) {
			return;
		}
		let beginState: (IState | null)[] = [];
		let valid: boolean[] = [];
		for (let i = 0; i < insertCount; i++) {
			beginState[i] = null;
			valid[i] = false;
		}
		this._beginState = arrays.arrayInsert(this._beginState, insertIndex, beginState);
		this._valid = arrays.arrayInsert(this._valid, insertIndex, valid);
		this._len += insertCount;
	}

	private _setValid(lineIndex: number, valid: boolean): void {
		this._ensureLine(lineIndex);
		this._valid[lineIndex] = valid;
	}

	private _setBeginState(lineIndex: number, beginState: IState | null): void {
		this._ensureLine(lineIndex);
		this._beginState[lineIndex] = beginState;
	}

	public setGoodTokens(linesLength: number, lineIndex: number, endState: IState): void {
		this._setValid(lineIndex, true);
		this._invalidLineStartIndex = lineIndex + 1;

		// Check if this was the last line
		if (lineIndex === linesLength - 1) {
			return;
		}

		// Check if the end state has changed
		const previousEndState = this.getBeginState(lineIndex + 1);
		if (previousEndState === null || !endState.equals(previousEndState)) {
			this._setBeginState(lineIndex + 1, endState);
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

	public setFakeTokens(lineIndex: number): void {
		this._setValid(lineIndex, false);
	}

	//#region Editing

	public applyEdits(range: IRange, eolCount: number): void {
		const deletingLinesCnt = range.endLineNumber - range.startLineNumber;
		const insertingLinesCnt = eolCount;
		const editingLinesCnt = Math.min(deletingLinesCnt, insertingLinesCnt);

		for (let j = editingLinesCnt; j >= 0; j--) {
			this._invalidateLine(range.startLineNumber + j - 1);
		}

		this._acceptDeleteRange(range);
		this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), eolCount);
	}

	private _acceptDeleteRange(range: IRange): void {

		const firstLineIndex = range.startLineNumber - 1;
		if (firstLineIndex >= this._len) {
			return;
		}

		this._deleteLines(range.startLineNumber, range.endLineNumber - range.startLineNumber);
	}

	private _acceptInsertText(position: Position, eolCount: number): void {

		const lineIndex = position.lineNumber - 1;
		if (lineIndex >= this._len) {
			return;
		}

		this._insertLines(position.lineNumber, eolCount);
	}

	//#endregion
}

export class TextModelTokenization extends Disposable {

	private readonly _textModel: TextModel;
	private readonly _tokenizationStateStore: TokenizationStateStore;
	private _revalidateTokensTimeout: any;
	private _tokenizationSupport: ITokenizationSupport | null;

	constructor(textModel: TextModel) {
		super();
		this._textModel = textModel;
		this._tokenizationStateStore = new TokenizationStateStore();
		this._revalidateTokensTimeout = -1;
		this._tokenizationSupport = null;

		this._register(TokenizationRegistry.onDidChange((e) => {
			const languageIdentifier = this._textModel.getLanguageIdentifier();
			if (e.changedLanguages.indexOf(languageIdentifier.language) === -1) {
				return;
			}

			this._resetTokenizationState();
			this._textModel.clearTokens();
			this._textModel.emitModelTokensChangedEvent({
				tokenizationSupportChanged: true,
				ranges: [{
					fromLineNumber: 1,
					toLineNumber: this._textModel.getLineCount()
				}]
			});
		}));

		this._register(this._textModel.onDidChangeRawContentFast((e) => {
			if (e.containsEvent(RawContentChangedType.Flush)) {
				this._resetTokenizationState();
				this._textModel.clearTokens();
				return;
			}
		}));

		this._register(this._textModel.onDidChangeContentFast((e) => {
			for (let i = 0, len = e.changes.length; i < len; i++) {
				const change = e.changes[i];
				const [eolCount] = countEOL(change.text);
				this._tokenizationStateStore.applyEdits(change.range, eolCount);
			}

			this._beginBackgroundTokenization();
		}));

		this._register(this._textModel.onDidChangeAttached(() => {
			this._beginBackgroundTokenization();
		}));

		this._register(this._textModel.onDidChangeLanguage(() => {
			this._resetTokenizationState();
			this._textModel.clearTokens();

			this._textModel.emitModelTokensChangedEvent({
				tokenizationSupportChanged: true,
				ranges: [{
					fromLineNumber: 1,
					toLineNumber: this._textModel.getLineCount()
				}]
			});
		}));

		this._resetTokenizationState();
	}

	public dispose(): void {
		this._clearTimers();
		super.dispose();
	}

	private _clearTimers(): void {
		if (this._revalidateTokensTimeout !== -1) {
			clearTimeout(this._revalidateTokensTimeout);
			this._revalidateTokensTimeout = -1;
		}
	}

	private _resetTokenizationState(): void {
		this._clearTimers();
		const [tokenizationSupport, initialState] = initializeTokenization(this._textModel);
		this._tokenizationSupport = tokenizationSupport;
		this._tokenizationStateStore.flush(initialState);
		this._beginBackgroundTokenization();
	}

	private _beginBackgroundTokenization(): void {
		if (this._textModel.isAttachedToEditor() && this._hasLinesToTokenize() && this._revalidateTokensTimeout === -1) {
			this._revalidateTokensTimeout = setTimeout(() => {
				this._revalidateTokensTimeout = -1;
				this._revalidateTokensNow();
			}, 0);
		}
	}

	private _revalidateTokensNow(toLineNumber: number = this._textModel.getLineCount()): void {
		const MAX_ALLOWED_TIME = 20;
		const eventBuilder = new ModelTokensChangedEventBuilder();
		const sw = StopWatch.create(false);

		while (this._hasLinesToTokenize()) {
			if (sw.elapsed() > MAX_ALLOWED_TIME) {
				// Stop if MAX_ALLOWED_TIME is reached
				break;
			}

			const tokenizedLineNumber = this._tokenizeOneInvalidLine(eventBuilder);

			if (tokenizedLineNumber >= toLineNumber) {
				break;
			}
		}

		this._beginBackgroundTokenization();

		const e = eventBuilder.build();
		if (e) {
			this._textModel.emitModelTokensChangedEvent(e);
		}
	}

	public tokenizeViewport(startLineNumber: number, endLineNumber: number): void {
		startLineNumber = Math.max(1, startLineNumber);
		endLineNumber = Math.min(this._textModel.getLineCount(), endLineNumber);

		const eventBuilder = new ModelTokensChangedEventBuilder();
		this._tokenizeViewport(eventBuilder, startLineNumber, endLineNumber);

		const e = eventBuilder.build();
		if (e) {
			this._textModel.emitModelTokensChangedEvent(e);
		}
	}

	public reset(): void {
		this._resetTokenizationState();
		this._textModel.clearTokens();
		this._textModel.emitModelTokensChangedEvent({
			tokenizationSupportChanged: false,
			ranges: [{
				fromLineNumber: 1,
				toLineNumber: this._textModel.getLineCount()
			}]
		});
	}

	public forceTokenization(lineNumber: number): void {
		const eventBuilder = new ModelTokensChangedEventBuilder();

		this._updateTokensUntilLine(eventBuilder, lineNumber);

		const e = eventBuilder.build();
		if (e) {
			this._textModel.emitModelTokensChangedEvent(e);
		}
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		if (!this._tokenizationSupport) {
			return true;
		}

		const firstInvalidLineNumber = this._tokenizationStateStore.invalidLineStartIndex + 1;
		if (lineNumber > firstInvalidLineNumber) {
			return false;
		}

		if (lineNumber < firstInvalidLineNumber) {
			return true;
		}

		if (this._textModel.getLineLength(lineNumber) < Constants.CHEAP_TOKENIZATION_LENGTH_LIMIT) {
			return true;
		}

		return false;
	}

	private _hasLinesToTokenize(): boolean {
		if (!this._tokenizationSupport) {
			return false;
		}
		return (this._tokenizationStateStore.invalidLineStartIndex < this._textModel.getLineCount());
	}

	private _tokenizeOneInvalidLine(eventBuilder: ModelTokensChangedEventBuilder): number {
		if (!this._hasLinesToTokenize()) {
			return this._textModel.getLineCount() + 1;
		}
		const lineNumber = this._tokenizationStateStore.invalidLineStartIndex + 1;
		this._updateTokensUntilLine(eventBuilder, lineNumber);
		return lineNumber;
	}

	private _updateTokensUntilLine(eventBuilder: ModelTokensChangedEventBuilder, lineNumber: number): void {
		if (!this._tokenizationSupport) {
			return;
		}
		const languageIdentifier = this._textModel.getLanguageIdentifier();
		const linesLength = this._textModel.getLineCount();
		const endLineIndex = lineNumber - 1;

		// Validate all states up to and including endLineIndex
		for (let lineIndex = this._tokenizationStateStore.invalidLineStartIndex; lineIndex <= endLineIndex; lineIndex++) {
			const text = this._textModel.getLineContent(lineIndex + 1);
			const lineStartState = this._tokenizationStateStore.getBeginState(lineIndex);

			const r = safeTokenize(languageIdentifier, this._tokenizationSupport, text, lineStartState!);
			this._textModel.setLineTokens(lineIndex + 1, r.tokens);
			this._tokenizationStateStore.setGoodTokens(linesLength, lineIndex, r.endState);
			eventBuilder.registerChangedTokens(lineIndex + 1);
			lineIndex = this._tokenizationStateStore.invalidLineStartIndex - 1; // -1 because the outer loop increments it
		}
	}

	private _tokenizeViewport(eventBuilder: ModelTokensChangedEventBuilder, startLineNumber: number, endLineNumber: number): void {
		if (!this._tokenizationSupport) {
			// nothing to do
			return;
		}

		if (endLineNumber <= this._tokenizationStateStore.invalidLineStartIndex) {
			// nothing to do
			return;
		}

		if (startLineNumber <= this._tokenizationStateStore.invalidLineStartIndex) {
			// tokenization has reached the viewport start...
			this._updateTokensUntilLine(eventBuilder, endLineNumber);
			return;
		}

		let nonWhitespaceColumn = this._textModel.getLineFirstNonWhitespaceColumn(startLineNumber);
		let fakeLines: string[] = [];
		let initialState: IState | null = null;
		for (let i = startLineNumber - 1; nonWhitespaceColumn > 0 && i >= 1; i--) {
			let newNonWhitespaceIndex = this._textModel.getLineFirstNonWhitespaceColumn(i);

			if (newNonWhitespaceIndex === 0) {
				continue;
			}

			if (newNonWhitespaceIndex < nonWhitespaceColumn) {
				initialState = this._tokenizationStateStore.getBeginState(i - 1);
				if (initialState) {
					break;
				}
				fakeLines.push(this._textModel.getLineContent(i));
				nonWhitespaceColumn = newNonWhitespaceIndex;
			}
		}

		if (!initialState) {
			initialState = this._tokenizationSupport.getInitialState();
		}

		const languageIdentifier = this._textModel.getLanguageIdentifier();
		let state = initialState;
		for (let i = fakeLines.length - 1; i >= 0; i--) {
			let r = safeTokenize(languageIdentifier, this._tokenizationSupport, fakeLines[i], state);
			state = r.endState;
		}

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			let text = this._textModel.getLineContent(lineNumber);
			let r = safeTokenize(languageIdentifier, this._tokenizationSupport, text, state);
			this._textModel.setLineTokens(lineNumber, r.tokens);
			this._tokenizationStateStore.setFakeTokens(lineNumber - 1);
			state = r.endState;
			eventBuilder.registerChangedTokens(lineNumber);
		}
	}
}

function initializeTokenization(textModel: TextModel): [ITokenizationSupport | null, IState | null] {
	const languageIdentifier = textModel.getLanguageIdentifier();
	let tokenizationSupport = (
		textModel.isTooLargeForTokenization()
			? null
			: TokenizationRegistry.get(languageIdentifier.language)
	);
	let initialState: IState | null = null;
	if (tokenizationSupport) {
		try {
			initialState = tokenizationSupport.getInitialState();
		} catch (e) {
			onUnexpectedError(e);
			tokenizationSupport = null;
		}
	}
	return [tokenizationSupport, initialState];
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

	LineTokens.convertToEndOffset(r.tokens, text.length);
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
