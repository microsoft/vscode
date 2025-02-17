/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IdleDeadline, runWhenGlobalIdle } from '../../../base/common/async.js';
import { BugIndicatingError, onUnexpectedError } from '../../../base/common/errors.js';
import { setTimeout0 } from '../../../base/common/platform.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { countEOL } from '../core/eolCounter.js';
import { LineRange } from '../core/lineRange.js';
import { OffsetRange } from '../core/offsetRange.js';
import { Position } from '../core/position.js';
import { StandardTokenType } from '../encodedTokenAttributes.js';
import { EncodedTokenizationResult, IBackgroundTokenizationStore, IBackgroundTokenizer, ILanguageIdCodec, IState, ITokenizationSupport } from '../languages.js';
import { nullTokenizeEncoded } from '../languages/nullTokenize.js';
import { ITextModel } from '../model.js';
import { FixedArray } from './fixedArray.js';
import { IModelContentChange } from '../textModelEvents.js';
import { ContiguousMultilineTokensBuilder } from '../tokens/contiguousMultilineTokensBuilder.js';
import { LineTokens } from '../tokens/lineTokens.js';

const enum Constants {
	CHEAP_TOKENIZATION_LENGTH_LIMIT = 2048
}

export class TokenizerWithStateStore<TState extends IState = IState> {
	private readonly initialState = this.tokenizationSupport.getInitialState() as TState;

	public readonly store: TrackingTokenizationStateStore<TState>;

	constructor(
		lineCount: number,
		public readonly tokenizationSupport: ITokenizationSupport
	) {
		this.store = new TrackingTokenizationStateStore<TState>(lineCount);
	}

	public getStartState(lineNumber: number): TState | null {
		return this.store.getStartState(lineNumber, this.initialState);
	}

	public getFirstInvalidLine(): { lineNumber: number; startState: TState } | null {
		return this.store.getFirstInvalidLine(this.initialState);
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
			const lineToTokenize = this.getFirstInvalidLine();
			if (!lineToTokenize || lineToTokenize.lineNumber > lineNumber) {
				break;
			}

			const text = this._textModel.getLineContent(lineToTokenize.lineNumber);

			const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, text, true, lineToTokenize.startState);
			builder.add(lineToTokenize.lineNumber, r.tokens);
			this.store.setEndState(lineToTokenize.lineNumber, r.endState as TState);
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
	public tokenizeLinesAt(lineNumber: number, lines: string[]): LineTokens[] | null {
		const lineStartState: IState | null = this.getStartState(lineNumber);
		if (!lineStartState) {
			return null;
		}

		const languageId = this._textModel.getLanguageId();
		const result: LineTokens[] = [];

		let state = lineStartState;
		for (const line of lines) {
			const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, line, true, state);
			result.push(new LineTokens(r.tokens, line, this._languageIdCodec));
			state = r.endState;
		}

		return result;
	}

	public hasAccurateTokensForLine(lineNumber: number): boolean {
		const firstInvalidLineNumber = this.store.getFirstInvalidEndStateLineNumberOrMax();
		return (lineNumber < firstInvalidLineNumber);
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
		let { likelyRelevantLines, initialState } = findLikelyRelevantLines(this._textModel, lineNumber, this);

		if (!initialState) {
			initialState = this.tokenizationSupport.getInitialState();
		}

		const languageId = this._textModel.getLanguageId();
		let state = initialState;
		for (const line of likelyRelevantLines) {
			const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, line, false, state);
			state = r.endState;
		}
		return state;
	}
}

export function findLikelyRelevantLines(model: ITextModel, lineNumber: number, store?: TokenizerWithStateStore): { likelyRelevantLines: string[]; initialState?: IState } {
	let nonWhitespaceColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
	const likelyRelevantLines: string[] = [];
	let initialState: IState | null | undefined = null;
	for (let i = lineNumber - 1; nonWhitespaceColumn > 1 && i >= 1; i--) {
		const newNonWhitespaceIndex = model.getLineFirstNonWhitespaceColumn(i);
		// Ignore lines full of whitespace
		if (newNonWhitespaceIndex === 0) {
			continue;
		}
		if (newNonWhitespaceIndex < nonWhitespaceColumn) {
			likelyRelevantLines.push(model.getLineContent(i));
			nonWhitespaceColumn = newNonWhitespaceIndex;
			initialState = store?.getStartState(i);
			if (initialState) {
				break;
			}
		}
	}

	likelyRelevantLines.reverse();
	return { likelyRelevantLines, initialState: initialState ?? undefined };
}

/**
 * **Invariant:**
 * If the text model is retokenized from line 1 to {@link getFirstInvalidEndStateLineNumber}() - 1,
 * then the recomputed end state for line l will be equal to {@link getEndState}(l).
 */
export class TrackingTokenizationStateStore<TState extends IState> {
	private readonly _tokenizationStateStore = new TokenizationStateStore<TState>();
	private readonly _invalidEndStatesLineNumbers = new RangePriorityQueueImpl();

	constructor(private lineCount: number) {
		this._invalidEndStatesLineNumbers.addRange(new OffsetRange(1, lineCount + 1));
	}

	public getEndState(lineNumber: number): TState | null {
		return this._tokenizationStateStore.getEndState(lineNumber);
	}

	/**
	 * @returns if the end state has changed.
	 */
	public setEndState(lineNumber: number, state: TState): boolean {
		if (!state) {
			throw new BugIndicatingError('Cannot set null/undefined state');
		}

		this._invalidEndStatesLineNumbers.delete(lineNumber);
		const r = this._tokenizationStateStore.setEndState(lineNumber, state);
		if (r && lineNumber < this.lineCount) {
			// because the state changed, we cannot trust the next state anymore and have to invalidate it.
			this._invalidEndStatesLineNumbers.addRange(new OffsetRange(lineNumber + 1, lineNumber + 2));
		}

		return r;
	}

	public acceptChange(range: LineRange, newLineCount: number): void {
		this.lineCount += newLineCount - range.length;
		this._tokenizationStateStore.acceptChange(range, newLineCount);
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

	public getFirstInvalidEndStateLineNumber(): number | null { return this._invalidEndStatesLineNumbers.min; }

	public getFirstInvalidEndStateLineNumberOrMax(): number {
		return this.getFirstInvalidEndStateLineNumber() || Number.MAX_SAFE_INTEGER;
	}

	public allStatesValid(): boolean { return this._invalidEndStatesLineNumbers.min === null; }

	public getStartState(lineNumber: number, initialState: TState): TState | null {
		if (lineNumber === 1) { return initialState; }
		return this.getEndState(lineNumber - 1);
	}

	public getFirstInvalidLine(initialState: TState): { lineNumber: number; startState: TState } | null {
		const lineNumber = this.getFirstInvalidEndStateLineNumber();
		if (lineNumber === null) {
			return null;
		}
		const startState = this.getStartState(lineNumber, initialState);
		if (!startState) {
			throw new BugIndicatingError('Start state must be defined');
		}

		return { lineNumber, startState };
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

	public delete(value: number): void {
		const idx = this._ranges.findIndex(r => r.contains(value));
		if (idx !== -1) {
			const range = this._ranges[idx];
			if (range.start === value) {
				if (range.endExclusive === value + 1) {
					this._ranges.splice(idx, 1);
				} else {
					this._ranges[idx] = new OffsetRange(value + 1, range.endExclusive);
				}
			} else {
				if (range.endExclusive === value + 1) {
					this._ranges[idx] = new OffsetRange(range.start, value);
				} else {
					this._ranges.splice(idx, 1, new OffsetRange(range.start, value), new OffsetRange(value + 1, range.endExclusive));
				}
			}
		}
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
		runWhenGlobalIdle((deadline) => {
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
		return !this._tokenizerWithStateStore.store.allStatesValid();
	}

	private _tokenizeOneInvalidLine(builder: ContiguousMultilineTokensBuilder): number {
		const firstInvalidLine = this._tokenizerWithStateStore?.getFirstInvalidLine();
		if (!firstInvalidLine) {
			return this._tokenizerWithStateStore._textModel.getLineCount() + 1;
		}
		this._tokenizerWithStateStore.updateTokensUntilLine(builder, firstInvalidLine.lineNumber);
		return firstInvalidLine.lineNumber;
	}

	public checkFinished(): void {
		if (this._isDisposed) {
			return;
		}
		if (this._tokenizerWithStateStore.store.allStatesValid()) {
			this._backgroundTokenStore.backgroundTokenizationFinished();
		}
	}

	public requestTokens(startLineNumber: number, endLineNumberExclusive: number): void {
		this._tokenizerWithStateStore.store.invalidateEndStateRange(new LineRange(startLineNumber, endLineNumberExclusive));
	}
}
