/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { onUnexpectedError } from 'vs/base/common/errors';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { EncodedTokenizationResult, ILanguageIdCodec, IState, ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/languages';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { nullTokenizeEncoded } from 'vs/editor/common/languages/nullTokenize';
import { TextModel } from 'vs/editor/common/model/textModel';
import { Disposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { countEOL } from 'vs/editor/common/core/eolCounter';
import { ContiguousMultilineTokensBuilder } from 'vs/editor/common/tokens/contiguousMultilineTokensBuilder';
import { runWhenIdle, IdleDeadline } from 'vs/base/common/async';
import { setTimeout0 } from 'vs/base/common/platform';
import { IModelContentChangedEvent, IModelLanguageChangedEvent } from 'vs/editor/common/textModelEvents';
import { TokenizationTextModelPart } from 'vs/editor/common/model/tokenizationTextModelPart';

const enum Constants {
	CHEAP_TOKENIZATION_LENGTH_LIMIT = 2048
}

/**
 * An array that avoids being sparse by always
 * filling up unused indices with a default value.
 */
class ContiguousGrowingArray<T> {

	private _store: T[] = [];

	constructor(
		private readonly _default: T
	) { }

	public get(index: number): T {
		if (index < this._store.length) {
			return this._store[index];
		}
		return this._default;
	}

	public set(index: number, value: T): void {
		while (index >= this._store.length) {
			this._store[this._store.length] = this._default;
		}
		this._store[index] = value;
	}

	public delete(deleteIndex: number, deleteCount: number): void {
		if (deleteCount === 0 || deleteIndex >= this._store.length) {
			return;
		}
		this._store.splice(deleteIndex, deleteCount);
	}

	public insert(insertIndex: number, insertCount: number): void {
		if (insertCount === 0 || insertIndex >= this._store.length) {
			return;
		}
		const arr: T[] = [];
		for (let i = 0; i < insertCount; i++) {
			arr[i] = this._default;
		}
		this._store = arrays.arrayInsert(this._store, insertIndex, arr);
	}
}

/**
 * Stores the states at the start of each line and keeps track of which lines
 * must be retokenized. Also uses state equality to quickly validate lines
 * that don't need to be retokenized.
 *
 * For example, when typing on a line, the line gets marked as needing to be tokenized.
 * Once the line is tokenized, the end state is checked for equality against the begin
 * state of the next line. If the states are equal, tokenization doesn't need to run
 * again over the rest of the file. If the states are not equal, the next line gets marked
 * as needing to be tokenized.
 */
export class TokenizationStateStore {

	/**
	 * `lineBeginState[i]` contains the begin state used to tokenize line number `i + 1`.
	 */
	private readonly _lineBeginState = new ContiguousGrowingArray<IState | null>(null);
	/**
	 * `lineNeedsTokenization[i]` describes if line number `i + 1` needs to be tokenized.
	 */
	private readonly _lineNeedsTokenization = new ContiguousGrowingArray<boolean>(true);
	/**
	 * `invalidLineStartIndex` indicates that line number `invalidLineStartIndex + 1`
	 *  is the first one that needs to be retokenized.
	 */
	private _firstLineNeedsTokenization: number;

	public get invalidLineStartIndex() {
		return this._firstLineNeedsTokenization;
	}

	constructor(
		public readonly tokenizationSupport: ITokenizationSupport,
		public readonly initialState: IState
	) {
		this._firstLineNeedsTokenization = 0;
		this._lineBeginState.set(0, this.initialState);
	}

	public markMustBeTokenized(lineIndex: number): void {
		this._lineNeedsTokenization.set(lineIndex, true);
		this._firstLineNeedsTokenization = Math.min(this._firstLineNeedsTokenization, lineIndex);
	}

	public getBeginState(lineIndex: number): IState | null {
		return this._lineBeginState.get(lineIndex);
	}

	public setEndState(linesLength: number, lineIndex: number, endState: IState): void {
		this._lineNeedsTokenization.set(lineIndex, false);
		this._firstLineNeedsTokenization = lineIndex + 1;

		// Check if this was the last line
		if (lineIndex === linesLength - 1) {
			return;
		}

		// Check if the end state has changed
		const previousEndState = this._lineBeginState.get(lineIndex + 1);
		if (previousEndState === null || !endState.equals(previousEndState)) {
			this._lineBeginState.set(lineIndex + 1, endState);
			this.markMustBeTokenized(lineIndex + 1);
			return;
		}

		// Perhaps we can skip tokenizing some lines...
		let i = lineIndex + 1;
		while (i < linesLength) {
			if (this._lineNeedsTokenization.get(i)) {
				break;
			}
			i++;
		}
		this._firstLineNeedsTokenization = i;
	}

	//#region Editing

	public applyEdits(range: IRange, eolCount: number): void {
		this.markMustBeTokenized(range.startLineNumber - 1);

		this._lineBeginState.delete(range.startLineNumber, range.endLineNumber - range.startLineNumber);
		this._lineNeedsTokenization.delete(range.startLineNumber, range.endLineNumber - range.startLineNumber);

		this._lineBeginState.insert(range.startLineNumber, eolCount);
		this._lineNeedsTokenization.insert(range.startLineNumber, eolCount);
	}

	//#endregion
}

export class TextModelTokenization extends Disposable {

	private _tokenizationStateStore: TokenizationStateStore | null;
	private _isDisposed: boolean;

	constructor(
		private readonly _textModel: TextModel,
		private readonly _tokenizationPart: TokenizationTextModelPart,
		private readonly _languageIdCodec: ILanguageIdCodec
	) {
		super();
		this._isDisposed = false;
		this._tokenizationStateStore = null;

		this._register(TokenizationRegistry.onDidChange((e) => {
			const languageId = this._textModel.getLanguageId();
			if (e.changedLanguages.indexOf(languageId) === -1) {
				return;
			}

			this._resetTokenizationState();
			this._tokenizationPart.clearTokens();
		}));

		this._resetTokenizationState();
	}

	public override dispose(): void {
		this._isDisposed = true;
		super.dispose();
	}

	//#region TextModel events

	public handleDidChangeContent(e: IModelContentChangedEvent): void {
		if (e.isFlush) {
			this._resetTokenizationState();
			return;
		}
		if (this._tokenizationStateStore) {
			for (let i = 0, len = e.changes.length; i < len; i++) {
				const change = e.changes[i];
				const [eolCount] = countEOL(change.text);
				this._tokenizationStateStore.applyEdits(change.range, eolCount);
			}
		}

		this._beginBackgroundTokenization();
	}

	public handleDidChangeAttached(): void {
		this._beginBackgroundTokenization();
	}

	public handleDidChangeLanguage(e: IModelLanguageChangedEvent): void {
		this._resetTokenizationState();
		this._tokenizationPart.clearTokens();
	}

	//#endregion

	private _resetTokenizationState(): void {
		const [tokenizationSupport, initialState] = initializeTokenization(this._textModel, this._tokenizationPart);
		if (tokenizationSupport && initialState) {
			this._tokenizationStateStore = new TokenizationStateStore(tokenizationSupport, initialState);
		} else {
			this._tokenizationStateStore = null;
		}
		this._beginBackgroundTokenization();
	}

	private _isScheduled = false;
	private _beginBackgroundTokenization(): void {
		if (this._isScheduled || !this._textModel.isAttachedToEditor() || !this._hasLinesToTokenize()) {
			return;
		}

		this._isScheduled = true;
		runWhenIdle((deadline) => {
			this._isScheduled = false;

			this._backgroundTokenizeWithDeadline(deadline);
		});
	}

	/**
	 * Tokenize until the deadline occurs, but try to yield every 1-2ms.
	 */
	private _backgroundTokenizeWithDeadline(deadline: IdleDeadline): void {
		// Read the time remaining from the `deadline` immediately because it is unclear
		// if the `deadline` object will be valid after execution leaves this function.
		const endTime = Date.now() + deadline.timeRemaining();

		const execute = () => {
			if (this._isDisposed || !this._textModel.isAttachedToEditor() || !this._hasLinesToTokenize()) {
				// disposed in the meantime or detached or finished
				return;
			}

			this._backgroundTokenizeForAtLeast1ms();

			if (Date.now() < endTime) {
				// There is still time before reaching the deadline, so yield to the browser and then
				// continue execution
				setTimeout0(execute);
			} else {
				// The deadline has been reached, so schedule a new idle callback if necessary
				this._beginBackgroundTokenization();
			}
		};
		execute();
	}

	/**
	 * Tokenize for at least 1ms.
	 */
	private _backgroundTokenizeForAtLeast1ms(): void {
		const lineCount = this._textModel.getLineCount();
		const builder = new ContiguousMultilineTokensBuilder();
		const sw = StopWatch.create(false);

		do {
			if (sw.elapsed() > 1) {
				// the comparison is intentionally > 1 and not >= 1 to ensure that
				// a full millisecond has elapsed, given how microseconds are rounded
				// to milliseconds
				break;
			}

			const tokenizedLineNumber = this._tokenizeOneInvalidLine(builder);

			if (tokenizedLineNumber >= lineCount) {
				break;
			}
		} while (this._hasLinesToTokenize());

		this._tokenizationPart.setTokens(builder.finalize(), this._isTokenizationComplete());
	}

	public tokenizeViewport(startLineNumber: number, endLineNumber: number): void {
		const builder = new ContiguousMultilineTokensBuilder();
		this._tokenizeViewport(builder, startLineNumber, endLineNumber);
		this._tokenizationPart.setTokens(builder.finalize(), this._isTokenizationComplete());
	}

	public reset(): void {
		this._resetTokenizationState();
		this._tokenizationPart.clearTokens();
	}

	public forceTokenization(lineNumber: number): void {
		const builder = new ContiguousMultilineTokensBuilder();
		this._updateTokensUntilLine(builder, lineNumber);
		this._tokenizationPart.setTokens(builder.finalize(), this._isTokenizationComplete());
	}

	public getTokenTypeIfInsertingCharacter(position: Position, character: string): StandardTokenType {
		if (!this._tokenizationStateStore) {
			return StandardTokenType.Other;
		}

		this.forceTokenization(position.lineNumber);
		const lineStartState = this._tokenizationStateStore.getBeginState(position.lineNumber - 1);
		if (!lineStartState) {
			return StandardTokenType.Other;
		}

		const languageId = this._textModel.getLanguageId();
		const lineContent = this._textModel.getLineContent(position.lineNumber);

		// Create the text as if `character` was inserted
		const text = (
			lineContent.substring(0, position.column - 1)
			+ character
			+ lineContent.substring(position.column - 1)
		);

		const r = safeTokenize(this._languageIdCodec, languageId, this._tokenizationStateStore.tokenizationSupport, text, true, lineStartState);
		const lineTokens = new LineTokens(r.tokens, text, this._languageIdCodec);
		if (lineTokens.getCount() === 0) {
			return StandardTokenType.Other;
		}

		const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
		return lineTokens.getStandardTokenType(tokenIndex);
	}

	public tokenizeLineWithEdit(position: Position, length: number, newText: string): LineTokens | null {
		const lineNumber = position.lineNumber;
		const column = position.column;

		if (!this._tokenizationStateStore) {
			return null;
		}

		this.forceTokenization(lineNumber);
		const lineStartState = this._tokenizationStateStore.getBeginState(lineNumber - 1);
		if (!lineStartState) {
			return null;
		}

		const curLineContent = this._textModel.getLineContent(lineNumber);
		const newLineContent = curLineContent.substring(0, column - 1)
			+ newText + curLineContent.substring(column - 1 + length);

		const languageId = this._textModel.getLanguageIdAtPosition(lineNumber, 0);
		const result = safeTokenize(
			this._languageIdCodec,
			languageId,
			this._tokenizationStateStore.tokenizationSupport,
			newLineContent,
			true,
			lineStartState
		);

		const lineTokens = new LineTokens(result.tokens, newLineContent, this._languageIdCodec);
		return lineTokens;
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		if (!this._tokenizationStateStore) {
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
		if (!this._tokenizationStateStore) {
			return false;
		}
		return (this._tokenizationStateStore.invalidLineStartIndex < this._textModel.getLineCount());
	}

	private _isTokenizationComplete(): boolean {
		if (!this._tokenizationStateStore) {
			return false;
		}
		return (this._tokenizationStateStore.invalidLineStartIndex >= this._textModel.getLineCount());
	}

	private _tokenizeOneInvalidLine(builder: ContiguousMultilineTokensBuilder): number {
		if (!this._tokenizationStateStore || !this._hasLinesToTokenize()) {
			return this._textModel.getLineCount() + 1;
		}
		const lineNumber = this._tokenizationStateStore.invalidLineStartIndex + 1;
		this._updateTokensUntilLine(builder, lineNumber);
		return lineNumber;
	}

	private _updateTokensUntilLine(builder: ContiguousMultilineTokensBuilder, lineNumber: number): void {
		if (!this._tokenizationStateStore) {
			return;
		}
		const languageId = this._textModel.getLanguageId();
		const linesLength = this._textModel.getLineCount();
		const endLineIndex = lineNumber - 1;

		// Validate all states up to and including endLineIndex
		for (let lineIndex = this._tokenizationStateStore.invalidLineStartIndex; lineIndex <= endLineIndex; lineIndex++) {
			const text = this._textModel.getLineContent(lineIndex + 1);
			const lineStartState = this._tokenizationStateStore.getBeginState(lineIndex);

			const r = safeTokenize(this._languageIdCodec, languageId, this._tokenizationStateStore.tokenizationSupport, text, true, lineStartState!);
			builder.add(lineIndex + 1, r.tokens);
			this._tokenizationStateStore.setEndState(linesLength, lineIndex, r.endState);
			lineIndex = this._tokenizationStateStore.invalidLineStartIndex - 1; // -1 because the outer loop increments it
		}
	}

	private _tokenizeViewport(builder: ContiguousMultilineTokensBuilder, startLineNumber: number, endLineNumber: number): void {
		if (!this._tokenizationStateStore) {
			// nothing to do
			return;
		}

		if (endLineNumber <= this._tokenizationStateStore.invalidLineStartIndex) {
			// nothing to do
			return;
		}

		if (startLineNumber <= this._tokenizationStateStore.invalidLineStartIndex) {
			// tokenization has reached the viewport start...
			this._updateTokensUntilLine(builder, endLineNumber);
			return;
		}

		let nonWhitespaceColumn = this._textModel.getLineFirstNonWhitespaceColumn(startLineNumber);
		const fakeLines: string[] = [];
		let initialState: IState | null = null;
		for (let i = startLineNumber - 1; nonWhitespaceColumn > 1 && i >= 1; i--) {
			const newNonWhitespaceIndex = this._textModel.getLineFirstNonWhitespaceColumn(i);

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
			initialState = this._tokenizationStateStore.initialState;
		}

		const languageId = this._textModel.getLanguageId();
		let state = initialState;
		for (let i = fakeLines.length - 1; i >= 0; i--) {
			const r = safeTokenize(this._languageIdCodec, languageId, this._tokenizationStateStore.tokenizationSupport, fakeLines[i], false, state);
			state = r.endState;
		}

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			const text = this._textModel.getLineContent(lineNumber);
			const r = safeTokenize(this._languageIdCodec, languageId, this._tokenizationStateStore.tokenizationSupport, text, true, state);
			builder.add(lineNumber, r.tokens);
			this._tokenizationStateStore.markMustBeTokenized(lineNumber - 1);
			state = r.endState;
		}
	}
}

function initializeTokenization(textModel: TextModel, tokenizationPart: TokenizationTextModelPart): [ITokenizationSupport, IState] | [null, null] {
	if (textModel.isTooLargeForTokenization()) {
		return [null, null];
	}
	const tokenizationSupport = TokenizationRegistry.get(tokenizationPart.getLanguageId());
	if (!tokenizationSupport) {
		return [null, null];
	}
	let initialState: IState;
	try {
		initialState = tokenizationSupport.getInitialState();
	} catch (e) {
		onUnexpectedError(e);
		return [null, null];
	}
	return [tokenizationSupport, initialState];
}

function safeTokenize(languageIdCodec: ILanguageIdCodec, languageId: string, tokenizationSupport: ITokenizationSupport | null, text: string, hasEOL: boolean, state: IState): EncodedTokenizationResult {
	let r: EncodedTokenizationResult | null = null;

	if (tokenizationSupport) {
		try {
			r = tokenizationSupport.tokenizeEncoded(text, hasEOL, state.clone());
		} catch (e) {
			onUnexpectedError(e);
		}
	}

	if (!r) {
		r = nullTokenizeEncoded(languageIdCodec.encodeLanguageId(languageId), state);
	}

	LineTokens.convertToEndOffset(r.tokens, text.length);
	return r;
}
