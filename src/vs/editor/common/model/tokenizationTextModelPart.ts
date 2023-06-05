/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { CharCode } from 'vs/base/common/charCode';
import { BugIndicatingError, onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableMap, MutableDisposable } from 'vs/base/common/lifecycle';
import { countEOL } from 'vs/editor/common/core/eolCounter';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IWordAtPosition, getWordAtText } from 'vs/editor/common/core/wordHelper';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { IBackgroundTokenizationStore, IBackgroundTokenizer, ILanguageIdCodec, IState, ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ILanguageConfigurationService, ResolvedLanguageConfiguration } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { IAttachedView } from 'vs/editor/common/model';
import { BracketPairsTextModelPart } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsImpl';
import { AttachedViews, IAttachedViewState, TextModel } from 'vs/editor/common/model/textModel';
import { TextModelPart } from 'vs/editor/common/model/textModelPart';
import { DefaultBackgroundTokenizer, TokenizerWithStateStoreAndTextModel, TrackingTokenizationStateStore } from 'vs/editor/common/model/textModelTokens';
import { IModelContentChangedEvent, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent, IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { BackgroundTokenizationState, ITokenizationTextModelPart } from 'vs/editor/common/tokenizationTextModelPart';
import { ContiguousMultilineTokens } from 'vs/editor/common/tokens/contiguousMultilineTokens';
import { ContiguousMultilineTokensBuilder } from 'vs/editor/common/tokens/contiguousMultilineTokensBuilder';
import { ContiguousTokensStore } from 'vs/editor/common/tokens/contiguousTokensStore';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { SparseMultilineTokens } from 'vs/editor/common/tokens/sparseMultilineTokens';
import { SparseTokensStore } from 'vs/editor/common/tokens/sparseTokensStore';

export class TokenizationTextModelPart extends TextModelPart implements ITokenizationTextModelPart {
	private readonly _semanticTokens: SparseTokensStore = new SparseTokensStore(this._languageService.languageIdCodec);

	private readonly _onDidChangeLanguage: Emitter<IModelLanguageChangedEvent> = this._register(new Emitter<IModelLanguageChangedEvent>());
	public readonly onDidChangeLanguage: Event<IModelLanguageChangedEvent> = this._onDidChangeLanguage.event;

	private readonly _onDidChangeLanguageConfiguration: Emitter<IModelLanguageConfigurationChangedEvent> = this._register(new Emitter<IModelLanguageConfigurationChangedEvent>());
	public readonly onDidChangeLanguageConfiguration: Event<IModelLanguageConfigurationChangedEvent> = this._onDidChangeLanguageConfiguration.event;

	private readonly _onDidChangeTokens: Emitter<IModelTokensChangedEvent> = this._register(new Emitter<IModelTokensChangedEvent>());
	public readonly onDidChangeTokens: Event<IModelTokensChangedEvent> = this._onDidChangeTokens.event;

	private readonly grammarTokens = this._register(new GrammarTokens(this._languageService.languageIdCodec, this._textModel, () => this._languageId, this._attachedViews));

	constructor(
		private readonly _languageService: ILanguageService,
		private readonly _languageConfigurationService: ILanguageConfigurationService,
		private readonly _textModel: TextModel,
		private readonly _bracketPairsTextModelPart: BracketPairsTextModelPart,
		private _languageId: string,
		private readonly _attachedViews: AttachedViews,
	) {
		super();

		this._register(this._languageConfigurationService.onDidChange(e => {
			if (e.affects(this._languageId)) {
				this._onDidChangeLanguageConfiguration.fire({});
			}
		}));

		this._register(this.grammarTokens.onDidChangeTokens(e => {
			this._emitModelTokensChangedEvent(e);
		}));

		this._register(this.grammarTokens.onDidChangeBackgroundTokenizationState(e => {
			this._bracketPairsTextModelPart.handleDidChangeBackgroundTokenizationState();
		}));
	}

	_hasListeners(): boolean {
		return (this._onDidChangeLanguage.hasListeners()
			|| this._onDidChangeLanguageConfiguration.hasListeners()
			|| this._onDidChangeTokens.hasListeners());
	}

	public handleDidChangeContent(e: IModelContentChangedEvent): void {
		if (e.isFlush) {
			this._semanticTokens.flush();
		} else if (!e.isEolChange) { // We don't have to do anything on an EOL change
			for (const c of e.changes) {
				const [eolCount, firstLineLength, lastLineLength] = countEOL(c.text);

				this._semanticTokens.acceptEdit(
					c.range,
					eolCount,
					firstLineLength,
					lastLineLength,
					c.text.length > 0 ? c.text.charCodeAt(0) : CharCode.Null
				);
			}
		}

		this.grammarTokens.handleDidChangeContent(e);
	}

	public handleDidChangeAttached(): void {
		this.grammarTokens.handleDidChangeAttached();
	}

	/**
	 * Includes grammar and semantic tokens.
	 */
	public getLineTokens(lineNumber: number): LineTokens {
		this.validateLineNumber(lineNumber);
		const syntacticTokens = this.grammarTokens.getLineTokens(lineNumber);
		return this._semanticTokens.addSparseTokens(lineNumber, syntacticTokens);
	}

	private _emitModelTokensChangedEvent(e: IModelTokensChangedEvent): void {
		if (!this._textModel._isDisposing()) {
			this._bracketPairsTextModelPart.handleDidChangeTokens(e);
			this._onDidChangeTokens.fire(e);
		}
	}

	// #region Grammar Tokens

	private validateLineNumber(lineNumber: number): void {
		if (lineNumber < 1 || lineNumber > this._textModel.getLineCount()) {
			throw new BugIndicatingError('Illegal value for lineNumber');
		}
	}

	public get hasTokens(): boolean {
		return this.grammarTokens.hasTokens;
	}

	public resetTokenization() {
		this.grammarTokens.resetTokenization();
	}

	public get backgroundTokenizationState() {
		return this.grammarTokens.backgroundTokenizationState;
	}

	public forceTokenization(lineNumber: number): void {
		this.validateLineNumber(lineNumber);
		this.grammarTokens.forceTokenization(lineNumber);
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		this.validateLineNumber(lineNumber);
		return this.grammarTokens.isCheapToTokenize(lineNumber);
	}

	public tokenizeIfCheap(lineNumber: number): void {
		this.validateLineNumber(lineNumber);
		this.grammarTokens.tokenizeIfCheap(lineNumber);
	}

	public getTokenTypeIfInsertingCharacter(lineNumber: number, column: number, character: string): StandardTokenType {
		return this.grammarTokens.getTokenTypeIfInsertingCharacter(lineNumber, column, character);
	}

	public tokenizeLineWithEdit(position: IPosition, length: number, newText: string): LineTokens | null {
		return this.grammarTokens.tokenizeLineWithEdit(position, length, newText);
	}

	// #endregion

	// #region Semantic Tokens

	public setSemanticTokens(tokens: SparseMultilineTokens[] | null, isComplete: boolean): void {
		this._semanticTokens.set(tokens, isComplete);

		this._emitModelTokensChangedEvent({
			semanticTokensApplied: tokens !== null,
			ranges: [{ fromLineNumber: 1, toLineNumber: this._textModel.getLineCount() }],
		});
	}

	public hasCompleteSemanticTokens(): boolean {
		return this._semanticTokens.isComplete();
	}

	public hasSomeSemanticTokens(): boolean {
		return !this._semanticTokens.isEmpty();
	}

	public setPartialSemanticTokens(range: Range, tokens: SparseMultilineTokens[]): void {
		if (this.hasCompleteSemanticTokens()) {
			return;
		}
		const changedRange = this._textModel.validateRange(
			this._semanticTokens.setPartial(range, tokens)
		);

		this._emitModelTokensChangedEvent({
			semanticTokensApplied: true,
			ranges: [
				{
					fromLineNumber: changedRange.startLineNumber,
					toLineNumber: changedRange.endLineNumber,
				},
			],
		});
	}

	// #endregion

	// #region Utility Methods

	public getWordAtPosition(_position: IPosition): IWordAtPosition | null {
		this.assertNotDisposed();

		const position = this._textModel.validatePosition(_position);
		const lineContent = this._textModel.getLineContent(position.lineNumber);
		const lineTokens = this.getLineTokens(position.lineNumber);
		const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);

		// (1). First try checking right biased word
		const [rbStartOffset, rbEndOffset] = TokenizationTextModelPart._findLanguageBoundaries(lineTokens, tokenIndex);
		const rightBiasedWord = getWordAtText(
			position.column,
			this.getLanguageConfiguration(lineTokens.getLanguageId(tokenIndex)).getWordDefinition(),
			lineContent.substring(rbStartOffset, rbEndOffset),
			rbStartOffset
		);
		// Make sure the result touches the original passed in position
		if (
			rightBiasedWord &&
			rightBiasedWord.startColumn <= _position.column &&
			_position.column <= rightBiasedWord.endColumn
		) {
			return rightBiasedWord;
		}

		// (2). Else, if we were at a language boundary, check the left biased word
		if (tokenIndex > 0 && rbStartOffset === position.column - 1) {
			// edge case, where `position` sits between two tokens belonging to two different languages
			const [lbStartOffset, lbEndOffset] = TokenizationTextModelPart._findLanguageBoundaries(
				lineTokens,
				tokenIndex - 1
			);
			const leftBiasedWord = getWordAtText(
				position.column,
				this.getLanguageConfiguration(lineTokens.getLanguageId(tokenIndex - 1)).getWordDefinition(),
				lineContent.substring(lbStartOffset, lbEndOffset),
				lbStartOffset
			);
			// Make sure the result touches the original passed in position
			if (
				leftBiasedWord &&
				leftBiasedWord.startColumn <= _position.column &&
				_position.column <= leftBiasedWord.endColumn
			) {
				return leftBiasedWord;
			}
		}

		return null;
	}

	private getLanguageConfiguration(languageId: string): ResolvedLanguageConfiguration {
		return this._languageConfigurationService.getLanguageConfiguration(languageId);
	}

	private static _findLanguageBoundaries(lineTokens: LineTokens, tokenIndex: number): [number, number] {
		const languageId = lineTokens.getLanguageId(tokenIndex);

		// go left until a different language is hit
		let startOffset = 0;
		for (let i = tokenIndex; i >= 0 && lineTokens.getLanguageId(i) === languageId; i--) {
			startOffset = lineTokens.getStartOffset(i);
		}

		// go right until a different language is hit
		let endOffset = lineTokens.getLineContent().length;
		for (
			let i = tokenIndex, tokenCount = lineTokens.getCount();
			i < tokenCount && lineTokens.getLanguageId(i) === languageId;
			i++
		) {
			endOffset = lineTokens.getEndOffset(i);
		}

		return [startOffset, endOffset];
	}

	public getWordUntilPosition(position: IPosition): IWordAtPosition {
		const wordAtPosition = this.getWordAtPosition(position);
		if (!wordAtPosition) {
			return { word: '', startColumn: position.column, endColumn: position.column, };
		}
		return {
			word: wordAtPosition.word.substr(0, position.column - wordAtPosition.startColumn),
			startColumn: wordAtPosition.startColumn,
			endColumn: position.column,
		};
	}

	// #endregion

	// #region Language Id handling

	public getLanguageId(): string {
		return this._languageId;
	}

	public getLanguageIdAtPosition(lineNumber: number, column: number): string {
		const position = this._textModel.validatePosition(new Position(lineNumber, column));
		const lineTokens = this.getLineTokens(position.lineNumber);
		return lineTokens.getLanguageId(lineTokens.findTokenIndexAtOffset(position.column - 1));
	}

	public setLanguageId(languageId: string, source: string = 'api'): void {
		if (this._languageId === languageId) {
			// There's nothing to do
			return;
		}

		const e: IModelLanguageChangedEvent = {
			oldLanguage: this._languageId,
			newLanguage: languageId,
			source
		};

		this._languageId = languageId;

		this._bracketPairsTextModelPart.handleDidChangeLanguage(e);
		this.grammarTokens.resetTokenization();
		this._onDidChangeLanguage.fire(e);
		this._onDidChangeLanguageConfiguration.fire({});
	}

	// #endregion
}

class GrammarTokens extends Disposable {
	private _tokenizer: TokenizerWithStateStoreAndTextModel | null = null;
	private _defaultBackgroundTokenizer: DefaultBackgroundTokenizer | null = null;
	private readonly _backgroundTokenizer = this._register(new MutableDisposable<IBackgroundTokenizer>());

	private readonly _tokens = new ContiguousTokensStore(this._languageIdCodec);
	private _debugBackgroundTokens: ContiguousTokensStore | undefined;
	private _debugBackgroundStates: TrackingTokenizationStateStore<IState> | undefined;

	private readonly _debugBackgroundTokenizer = this._register(new MutableDisposable<IBackgroundTokenizer>());

	private _backgroundTokenizationState = BackgroundTokenizationState.InProgress;
	public get backgroundTokenizationState(): BackgroundTokenizationState {
		return this._backgroundTokenizationState;
	}

	private readonly _onDidChangeBackgroundTokenizationState = this._register(new Emitter<void>());
	/** @internal, should not be exposed by the text model! */
	public readonly onDidChangeBackgroundTokenizationState: Event<void> = this._onDidChangeBackgroundTokenizationState.event;

	private readonly _onDidChangeTokens = this._register(new Emitter<IModelTokensChangedEvent>());
	/** @internal, should not be exposed by the text model! */
	public readonly onDidChangeTokens: Event<IModelTokensChangedEvent> = this._onDidChangeTokens.event;

	private readonly _attachedViewStates = this._register(new DisposableMap<IAttachedView, AttachedViewHandler>());

	constructor(
		private readonly _languageIdCodec: ILanguageIdCodec,
		private readonly _textModel: TextModel,
		private getLanguageId: () => string,
		attachedViews: AttachedViews,
	) {
		super();

		this._register(TokenizationRegistry.onDidChange((e) => {
			const languageId = this.getLanguageId();
			if (e.changedLanguages.indexOf(languageId) === -1) {
				return;
			}
			this.resetTokenization();
		}));

		this.resetTokenization();

		this._register(attachedViews.onDidChangeVisibleRanges(({ view, state }) => {
			if (state) {
				let existing = this._attachedViewStates.get(view);
				if (!existing) {
					existing = new AttachedViewHandler(() => this.refreshRanges(existing!.lineRanges));
					this._attachedViewStates.set(view, existing);
				}
				existing.handleStateChange(state);
			} else {
				this._attachedViewStates.deleteAndDispose(view);
			}
		}));
	}

	public resetTokenization(fireTokenChangeEvent: boolean = true): void {
		this._tokens.flush();
		this._debugBackgroundTokens?.flush();
		if (this._debugBackgroundStates) {
			this._debugBackgroundStates = new TrackingTokenizationStateStore(this._textModel.getLineCount());
		}
		if (fireTokenChangeEvent) {
			this._onDidChangeTokens.fire({
				semanticTokensApplied: false,
				ranges: [
					{
						fromLineNumber: 1,
						toLineNumber: this._textModel.getLineCount(),
					},
				],
			});
		}

		const initializeTokenization = (): [ITokenizationSupport, IState] | [null, null] => {
			if (this._textModel.isTooLargeForTokenization()) {
				return [null, null];
			}
			const tokenizationSupport = TokenizationRegistry.get(this.getLanguageId());
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
		};

		const [tokenizationSupport, initialState] = initializeTokenization();
		if (tokenizationSupport && initialState) {
			this._tokenizer = new TokenizerWithStateStoreAndTextModel(this._textModel.getLineCount(), tokenizationSupport, this._textModel, this._languageIdCodec);
		} else {
			this._tokenizer = null;
		}

		this._backgroundTokenizer.clear();

		this._defaultBackgroundTokenizer = null;
		if (this._tokenizer) {
			const b: IBackgroundTokenizationStore = {
				setTokens: (tokens) => {
					this.setTokens(tokens);
				},
				backgroundTokenizationFinished: () => {
					if (this._backgroundTokenizationState === BackgroundTokenizationState.Completed) {
						// We already did a full tokenization and don't go back to progressing.
						return;
					}
					const newState = BackgroundTokenizationState.Completed;
					this._backgroundTokenizationState = newState;
					this._onDidChangeBackgroundTokenizationState.fire();
				},
				setEndState: (lineNumber, state) => {
					if (!state) {
						throw new BugIndicatingError();
					}
					const firstInvalidEndStateLineNumber = this._tokenizer?.store.getFirstInvalidEndStateLineNumber() ?? undefined;
					if (firstInvalidEndStateLineNumber !== undefined && lineNumber >= firstInvalidEndStateLineNumber) {
						// Don't accept states for definitely valid states
						this._tokenizer?.store.setEndState(lineNumber, state);
					}
				},
			};

			if (tokenizationSupport && tokenizationSupport.createBackgroundTokenizer && !tokenizationSupport.backgroundTokenizerShouldOnlyVerifyTokens) {
				this._backgroundTokenizer.value = tokenizationSupport.createBackgroundTokenizer(this._textModel, b);
			}
			if (!this._backgroundTokenizer.value) {
				this._backgroundTokenizer.value = this._defaultBackgroundTokenizer =
					new DefaultBackgroundTokenizer(this._tokenizer, b);
				this._defaultBackgroundTokenizer.handleChanges();
			}

			if (tokenizationSupport?.backgroundTokenizerShouldOnlyVerifyTokens && tokenizationSupport.createBackgroundTokenizer) {
				this._debugBackgroundTokens = new ContiguousTokensStore(this._languageIdCodec);
				this._debugBackgroundStates = new TrackingTokenizationStateStore(this._textModel.getLineCount());
				this._debugBackgroundTokenizer.clear();
				this._debugBackgroundTokenizer.value = tokenizationSupport.createBackgroundTokenizer(this._textModel, {
					setTokens: (tokens) => {
						this._debugBackgroundTokens?.setMultilineTokens(tokens, this._textModel);
					},
					backgroundTokenizationFinished() {
						// NO OP
					},
					setEndState: (lineNumber, state) => {
						this._debugBackgroundStates?.setEndState(lineNumber, state);
					},
				});
			} else {
				this._debugBackgroundTokens = undefined;
				this._debugBackgroundStates = undefined;
				this._debugBackgroundTokenizer.value = undefined;
			}
		}

		this.refreshAllVisibleLineTokens();
	}

	public handleDidChangeAttached() {
		this._defaultBackgroundTokenizer?.handleChanges();
	}

	public handleDidChangeContent(e: IModelContentChangedEvent): void {
		if (e.isFlush) {
			// Don't fire the event, as the view might not have got the text change event yet
			this.resetTokenization(false);
		} else if (!e.isEolChange) { // We don't have to do anything on an EOL change
			for (const c of e.changes) {
				const [eolCount, firstLineLength] = countEOL(c.text);

				this._tokens.acceptEdit(c.range, eolCount, firstLineLength);
				this._debugBackgroundTokens?.acceptEdit(c.range, eolCount, firstLineLength);
			}
			this._debugBackgroundStates?.acceptChanges(e.changes);

			if (this._tokenizer) {
				this._tokenizer.store.acceptChanges(e.changes);
			}
			this._defaultBackgroundTokenizer?.handleChanges();
		}
	}

	private setTokens(tokens: ContiguousMultilineTokens[]): { changes: { fromLineNumber: number; toLineNumber: number }[] } {
		const { changes } = this._tokens.setMultilineTokens(tokens, this._textModel);

		if (changes.length > 0) {
			this._onDidChangeTokens.fire({ semanticTokensApplied: false, ranges: changes, });
		}

		return { changes: changes };
	}

	private refreshAllVisibleLineTokens(): void {
		const ranges = LineRange.joinMany([...this._attachedViewStates].map(([_, s]) => s.lineRanges));
		this.refreshRanges(ranges);
	}

	private refreshRanges(ranges: readonly LineRange[]): void {
		for (const range of ranges) {
			this.refreshRange(range.startLineNumber, range.endLineNumberExclusive - 1);
		}
	}

	private refreshRange(startLineNumber: number, endLineNumber: number): void {
		if (!this._tokenizer) {
			return;
		}

		startLineNumber = Math.max(1, Math.min(this._textModel.getLineCount(), startLineNumber));
		endLineNumber = Math.min(this._textModel.getLineCount(), endLineNumber);

		const builder = new ContiguousMultilineTokensBuilder();
		const { heuristicTokens } = this._tokenizer.tokenizeHeuristically(builder, startLineNumber, endLineNumber);
		const changedTokens = this.setTokens(builder.finalize());

		if (heuristicTokens) {
			// We overrode tokens with heuristically computed ones.
			// Because old states might get reused (thus stopping invalidation),
			// we have to explicitly request the tokens for the changed ranges again.
			for (const c of changedTokens.changes) {
				this._backgroundTokenizer.value?.requestTokens(c.fromLineNumber, c.toLineNumber + 1);
			}
		}

		this._defaultBackgroundTokenizer?.checkFinished();
	}

	public forceTokenization(lineNumber: number): void {
		const builder = new ContiguousMultilineTokensBuilder();
		this._tokenizer?.updateTokensUntilLine(builder, lineNumber);
		this.setTokens(builder.finalize());
		this._defaultBackgroundTokenizer?.checkFinished();
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		if (!this._tokenizer) {
			return true;
		}
		return this._tokenizer.isCheapToTokenize(lineNumber);
	}

	public tokenizeIfCheap(lineNumber: number): void {
		if (this.isCheapToTokenize(lineNumber)) {
			this.forceTokenization(lineNumber);
		}
	}

	public getLineTokens(lineNumber: number): LineTokens {
		const lineText = this._textModel.getLineContent(lineNumber);
		const result = this._tokens.getTokens(
			this._textModel.getLanguageId(),
			lineNumber - 1,
			lineText
		);
		if (this._debugBackgroundTokens && this._debugBackgroundStates && this._tokenizer) {
			if (this._debugBackgroundStates.getFirstInvalidEndStateLineNumberOrMax() > lineNumber && this._tokenizer.store.getFirstInvalidEndStateLineNumberOrMax() > lineNumber) {
				const backgroundResult = this._debugBackgroundTokens.getTokens(
					this._textModel.getLanguageId(),
					lineNumber - 1,
					lineText
				);
				if (!result.equals(backgroundResult) && this._debugBackgroundTokenizer.value?.reportMismatchingTokens) {
					this._debugBackgroundTokenizer.value.reportMismatchingTokens(lineNumber);
				}
			}
		}
		return result;
	}

	public getTokenTypeIfInsertingCharacter(lineNumber: number, column: number, character: string): StandardTokenType {
		if (!this._tokenizer) {
			return StandardTokenType.Other;
		}

		const position = this._textModel.validatePosition(new Position(lineNumber, column));
		this.forceTokenization(position.lineNumber);
		return this._tokenizer.getTokenTypeIfInsertingCharacter(position, character);
	}

	public tokenizeLineWithEdit(position: IPosition, length: number, newText: string): LineTokens | null {
		if (!this._tokenizer) {
			return null;
		}

		const validatedPosition = this._textModel.validatePosition(position);
		this.forceTokenization(validatedPosition.lineNumber);
		return this._tokenizer.tokenizeLineWithEdit(validatedPosition, length, newText);
	}

	public get hasTokens(): boolean {
		return this._tokens.hasTokens;
	}
}

class AttachedViewHandler extends Disposable {
	private readonly runner = this._register(new RunOnceScheduler(() => this.update(), 50));

	private _computedLineRanges: readonly LineRange[] = [];
	private _lineRanges: readonly LineRange[] = [];
	public get lineRanges(): readonly LineRange[] { return this._lineRanges; }

	constructor(private readonly _refreshTokens: () => void) {
		super();
	}

	private update(): void {
		if (equals(this._computedLineRanges, this._lineRanges)) {
			return;
		}
		this._computedLineRanges = this._lineRanges;
		this._refreshTokens();
	}

	public handleStateChange(state: IAttachedViewState): void {
		this._lineRanges = state.visibleLineRanges;
		if (state.stabilized) {
			this.runner.cancel();
			this.update();
		} else {
			this.runner.schedule();
		}
	}
}
