/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IdleDeadline, runWhenIdle } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { setTimeout0 } from 'vs/base/common/platform';
import { StopWatch } from 'vs/base/common/stopwatch';
import { countEOL } from 'vs/editor/common/core/eolCounter';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Position } from 'vs/editor/common/core/position';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { EncodedTokenizationResult, IBackgroundTokenizationStore, IBackgroundTokenizer, ILanguageIdCodec, IState, ITokenizationSupport } from 'vs/editor/common/languages';
import { nullTokenizeEncoded } from 'vs/editor/common/languages/nullTokenize';
import { ITextModel } from 'vs/editor/common/model';
import { FixedArray } from 'vs/editor/common/model/fixedArray';
import { IModelContentChange } from 'vs/editor/common/textModelEvents';
import { ContiguousMultilineTokensBuilder } from 'vs/editor/common/tokens/contiguousMultilineTokensBuilder';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';

const enum Constants {
	CHEAP_TOKENIZATION_LENGTH_LIMIT = 2048
}

export class TokenizerWithStateStore<TState extends IState = IState> {
	private readonly initialState = this.tokenizationSupport.getInitialState();

	public readonly store: TrackingTokenizationStateStore<TState>;

	constructor(
		lineCount: number,
		public readonly tokenizationSupport: ITokenizationSupport
	) {
		this.store = new TrackingTokenizationStateStore<TState>(lineCount);
	}

	public getStartState(lineNumber: number): TState | null {
		if (lineNumber === 1) {
			return this.initialState as TState;
		}
		return this.store.getEndState(lineNumber - 1);
	}
}

export class TokenizerWithStateStoreAndTextModel<TState extends IState = IState> extends TokenizerWithStateStore<TState> {
	constructor(
		lineCount: number,
		tokenizationSupport: ITokenizationSupport,
		public readonly _textModel: ITextModel,
		public readonly _languageIdCodec: ILanguageIdCodec
	) {
		super(lineCount, tokenizationSupport);
	}

	public updateTokensUntilLine(builder: ContiguousMultilineTokensBuilder, lineNumber: number): void {
		const languageId = this._textModel.getLanguageId();

		while (true) {
			const nextLineNumber = this.store.getFirstInvalidEndStateLineNumber();
			if (!nextLineNumber || nextLineNumber > lineNumber) {
				break;
			}

			const text = this._textModel.getLineContent(nextLineNumber);
			const lineStartState = this.getStartState(nextLineNumber);

			const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, text, true, lineStartState!);
			builder.add(nextLineNumber, r.tokens);
			this!.store.setEndState(nextLineNumber, r.endState as TState);
		}
	}

	/** assumes state is up to date */
	public getTokenTypeIfInsertingCharacter(position: Position, character: string): StandardTokenType {
		// TODO@hediet: use tokenizeLineWithEdit
		const lineStartState = this.getStartState(position.lineNumber);
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

		const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, text, true, lineStartState);
		const lineTokens = new LineTokens(r.tokens, text, this._languageIdCodec);
		if (lineTokens.getCount() === 0) {
			return StandardTokenType.Other;
		}

		const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
		return lineTokens.getStandardTokenType(tokenIndex);
	}

	/** assumes state is up to date */
	public tokenizeLineWithEdit(position: Position, length: number, newText: string): LineTokens | null {
		const lineNumber = position.lineNumber;
		const column = position.column;

		const lineStartState = this.getStartState(lineNumber);
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
			this.tokenizationSupport,
			newLineContent,
			true,
			lineStartState
		);

		const lineTokens = new LineTokens(result.tokens, newLineContent, this._languageIdCodec);
		return lineTokens;
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		const firstInvalidLineNumber = this.store.getFirstInvalidEndStateLineNumberOrMax();
		if (lineNumber < firstInvalidLineNumber) {
			return true;
		}
		if (lineNumber === firstInvalidLineNumber
			&& this._textModel.getLineLength(lineNumber) < Constants.CHEAP_TOKENIZATION_LENGTH_LIMIT) {
			return true;
		}

		return false;
	}

	/**
	 * The result is not cached.
	 */
	public tokenizeHeuristically(builder: ContiguousMultilineTokensBuilder, startLineNumber: number, endLineNumber: number): { heuristicTokens: boolean } {
		if (endLineNumber <= this.store.getFirstInvalidEndStateLineNumberOrMax()) {
			// nothing to do
			return { heuristicTokens: false };
		}

		if (startLineNumber <= this.store.getFirstInvalidEndStateLineNumberOrMax()) {
			// tokenization has reached the viewport start...
			this.updateTokensUntilLine(builder, endLineNumber);
			return { heuristicTokens: false };
		}

		let state = this.guessStartState(startLineNumber);
		const languageId = this._textModel.getLanguageId();

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			const text = this._textModel.getLineContent(lineNumber);
			const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, text, true, state);
			builder.add(lineNumber, r.tokens);
			state = r.endState;
		}

		return { heuristicTokens: true };
	}

	private guessStartState(lineNumber: number): IState {
		let nonWhitespaceColumn = this._textModel.getLineFirstNonWhitespaceColumn(lineNumber);
		const likelyRelevantLines: string[] = [];
		let initialState: IState | null = null;
		for (let i = lineNumber - 1; nonWhitespaceColumn > 1 && i >= 1; i--) {
			const newNonWhitespaceIndex = this._textModel.getLineFirstNonWhitespaceColumn(i);
			// Ignore lines full of whitespace
			if (newNonWhitespaceIndex === 0) {
				continue;
			}
			if (newNonWhitespaceIndex < nonWhitespaceColumn) {
				likelyRelevantLines.push(this._textModel.getLineContent(i));
				nonWhitespaceColumn = newNonWhitespaceIndex;
				initialState = this.getStartState(i);
				if (initialState) {
					break;
				}
			}
		}

		if (!initialState) {
			initialState = this.tokenizationSupport.getInitialState();
		}
		likelyRelevantLines.reverse();

		const languageId = this._textModel.getLanguageId();
		let state = initialState;
		for (const line of likelyRelevantLines) {
			const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, line, false, state);
			state = r.endState;
		}
		return state;
	}
}

export class TrackingTokenizationStateStore<TState extends IState> {
	private readonly tokenizationStateStore = new TokenizationStateStore<TState>();
	private readonly _invalidEndStatesLineNumbers = new RangePriorityQueueImpl();

	constructor(private lineCount: number) {
		this._invalidEndStatesLineNumbers.addRange(new OffsetRange(1, lineCount + 1));
	}

	public getEndState(lineNumber: number): TState | null {
		return this.tokenizationStateStore.getEndState(lineNumber);
	}

	public setEndState(lineNumber: number, state: TState): boolean {
		while (true) {
			const min = this._invalidEndStatesLineNumbers.min;
			if (min !== null && min <= lineNumber) {
				this._invalidEndStatesLineNumbers.removeMin();
			} else {
				break;
			}
		}

		const r = this.tokenizationStateStore.setEndState(lineNumber, state);
		if (r && lineNumber < this.lineCount) {
			// because the state changed, we cannot trust the next state anymore and have to invalidate it.
			this._invalidEndStatesLineNumbers.addRange(new OffsetRange(lineNumber + 1, lineNumber + 2));
		}

		return r;
	}

	public acceptChange(range: LineRange, newLineCount: number): void {
		this.lineCount += newLineCount - range.length;
		this.tokenizationStateStore.acceptChange(range, newLineCount);
		this._invalidEndStatesLineNumbers.addRangeAndResize(new OffsetRange(range.startLineNumber, range.endLineNumberExclusive), newLineCount);
	}

	public acceptChanges(changes: IModelContentChange[]) {
		for (const c of changes) {
			const [eolCount] = countEOL(c.text);
			this.acceptChange(new LineRange(c.range.startLineNumber, c.range.endLineNumber + 1), eolCount + 1);
		}
	}

	public invalidateEndStateRange(range: LineRange): void {
		this._invalidEndStatesLineNumbers.addRange(new OffsetRange(range.startLineNumber, range.endLineNumberExclusive));
	}

	public getFirstInvalidEndStateLineNumber(): number | null {
		return this._invalidEndStatesLineNumbers.min;
	}

	public getFirstInvalidEndStateLineNumberOrMax(): number {
		return this._invalidEndStatesLineNumbers.min || Number.MAX_SAFE_INTEGER;
	}

	public isTokenizationComplete(): boolean {
		return this._invalidEndStatesLineNumbers.min === null;
	}
}

export class TokenizationStateStore<TState extends IState> {
	private readonly _lineEndStates = new FixedArray<TState | null>(null);

	public getEndState(lineNumber: number): TState | null {
		return this._lineEndStates.get(lineNumber);
	}

	public setEndState(lineNumber: number, state: TState): boolean {
		const oldState = this._lineEndStates.get(lineNumber);
		if (oldState && oldState.equals(state)) {
			return false;
		}

		this._lineEndStates.set(lineNumber, state);
		return true;
	}

	public acceptChange(range: LineRange, newLineCount: number): void {
		let length = range.length;
		if (newLineCount > 0 && length > 0) {
			// Keep the last state, even though it is unrelated.
			// But if the new state happens to agree with this last state, then we know we can stop tokenizing.
			length--;
			newLineCount--;
		}

		this._lineEndStates.replace(range.startLineNumber, length, newLineCount);
	}

	public acceptChanges(changes: IModelContentChange[]) {
		for (const c of changes) {
			const [eolCount] = countEOL(c.text);
			this.acceptChange(new LineRange(c.range.startLineNumber, c.range.endLineNumber + 1), eolCount + 1);
		}
	}
}

interface RangePriorityQueue {
	get min(): number | null;
	removeMin(): number | null;

	addRange(range: OffsetRange): void;

	addRangeAndResize(range: OffsetRange, newLength: number): void;
}

export class RangePriorityQueueImpl implements RangePriorityQueue {
	private readonly _ranges: OffsetRange[] = [];

	public getRanges(): OffsetRange[] {
		return this._ranges;
	}

	public get min(): number | null {
		if (this._ranges.length === 0) {
			return null;
		}
		return this._ranges[0].start;
	}

	public removeMin(): number | null {
		if (this._ranges.length === 0) {
			return null;
		}
		const range = this._ranges[0];
		if (range.start + 1 === range.endExclusive) {
			this._ranges.shift();
		} else {
			this._ranges[0] = new OffsetRange(range.start + 1, range.endExclusive);
		}
		return range.start;
	}

	public addRange(range: OffsetRange): void {
		OffsetRange.addRange(range, this._ranges);
	}

	public addRangeAndResize(range: OffsetRange, newLength: number): void {
		let idxFirstMightBeIntersecting = 0;
		while (!(idxFirstMightBeIntersecting >= this._ranges.length || range.start <= this._ranges[idxFirstMightBeIntersecting].endExclusive)) {
			idxFirstMightBeIntersecting++;
		}
		let idxFirstIsAfter = idxFirstMightBeIntersecting;
		while (!(idxFirstIsAfter >= this._ranges.length || range.endExclusive < this._ranges[idxFirstIsAfter].start)) {
			idxFirstIsAfter++;
		}
		const delta = newLength - range.length;

		for (let i = idxFirstIsAfter; i < this._ranges.length; i++) {
			this._ranges[i] = this._ranges[i].delta(delta);
		}

		if (idxFirstMightBeIntersecting === idxFirstIsAfter) {
			const newRange = new OffsetRange(range.start, range.start + newLength);
			if (!newRange.isEmpty) {
				this._ranges.splice(idxFirstMightBeIntersecting, 0, newRange);
			}
		} else {
			const start = Math.min(range.start, this._ranges[idxFirstMightBeIntersecting].start);
			const endEx = Math.max(range.endExclusive, this._ranges[idxFirstIsAfter - 1].endExclusive);

			const newRange = new OffsetRange(start, endEx + delta);
			if (!newRange.isEmpty) {
				this._ranges.splice(idxFirstMightBeIntersecting, idxFirstIsAfter - idxFirstMightBeIntersecting, newRange);
			} else {
				this._ranges.splice(idxFirstMightBeIntersecting, idxFirstIsAfter - idxFirstMightBeIntersecting);
			}
		}
	}

	toString() {
		return this._ranges.map(r => r.toString()).join(' + ');
	}
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

export class DefaultBackgroundTokenizer implements IBackgroundTokenizer {
	private _isDisposed = false;

	constructor(
		private readonly _tokenizerWithStateStore: TokenizerWithStateStoreAndTextModel,
		private readonly _backgroundTokenStore: IBackgroundTokenizationStore,
	) {
	}

	public dispose(): void {
		this._isDisposed = true;
	}

	public handleChanges(): void {
		this._beginBackgroundTokenization();
	}

	private _isScheduled = false;
	private _beginBackgroundTokenization(): void {
		if (this._isScheduled || !this._tokenizerWithStateStore._textModel.isAttachedToEditor() || !this._hasLinesToTokenize()) {
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
			if (this._isDisposed || !this._tokenizerWithStateStore._textModel.isAttachedToEditor() || !this._hasLinesToTokenize()) {
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
		const lineCount = this._tokenizerWithStateStore._textModel.getLineCount();
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

		this._backgroundTokenStore.setTokens(builder.finalize());
		this.checkFinished();
	}

	private _hasLinesToTokenize(): boolean {
		if (!this._tokenizerWithStateStore) {
			return false;
		}
		return !this._tokenizerWithStateStore.store.isTokenizationComplete();
	}

	private _tokenizeOneInvalidLine(builder: ContiguousMultilineTokensBuilder): number {
		if (!this._tokenizerWithStateStore || !this._hasLinesToTokenize()) {
			return this._tokenizerWithStateStore._textModel.getLineCount() + 1;
		}
		const lineNumber = this._tokenizerWithStateStore.store.getFirstInvalidEndStateLineNumber()!;
		this._tokenizerWithStateStore.updateTokensUntilLine(builder, lineNumber);
		return lineNumber;
	}

	public checkFinished(): void {
		if (this._isDisposed) {
			return;
		}
		if (this._tokenizerWithStateStore.store.isTokenizationComplete()) {
			this._backgroundTokenStore.backgroundTokenizationFinished();
		}
	}

	public requestTokens(startLineNumber: number, endLineNumberExclusive: number): void {
		this._tokenizerWithStateStore.store.invalidateEndStateRange(new LineRange(startLineNumber, endLineNumberExclusive));
	}
}
