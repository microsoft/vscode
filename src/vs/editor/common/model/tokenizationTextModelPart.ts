/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../base/common/charCode.js';
import { BugIndicatingError, onUnexpectedError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableMap, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { countEOL } from '../core/eolCounter.js';
import { LineRange } from '../core/lineRange.js';
import { IPosition, Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { IWordAtPosition, getWordAtText } from '../core/wordHelper.js';
import { StandardTokenType } from '../encodedTokenAttributes.js';
import { IBackgroundTokenizationStore, IBackgroundTokenizer, ILanguageIdCodec, IState, ITokenizationSupport, TokenizationRegistry, TreeSitterTokenizationRegistry } from '../languages.js';
import { ILanguageService } from '../languages/language.js';
import { ILanguageConfigurationService, LanguageConfigurationServiceChangeEvent, ResolvedLanguageConfiguration } from '../languages/languageConfigurationRegistry.js';
import { IAttachedView } from '../model.js';
import { BracketPairsTextModelPart } from './bracketPairsTextModelPart/bracketPairsImpl.js';
import { TextModel } from './textModel.js';
import { TextModelPart } from './textModelPart.js';
import { DefaultBackgroundTokenizer, TokenizerWithStateStoreAndTextModel, TrackingTokenizationStateStore } from './textModelTokens.js';
import { AbstractTokens, AttachedViewHandler, AttachedViews } from './tokens.js';
import { TreeSitterTokens } from './treeSitterTokens.js';
import { ITreeSitterParserService } from '../services/treeSitterParserService.js';
import { IModelContentChangedEvent, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent, IModelTokensChangedEvent } from '../textModelEvents.js';
import { BackgroundTokenizationState, ITokenizationTextModelPart, ITokenizeLineWithEditResult, LineEditWithAdditionalLines } from '../tokenizationTextModelPart.js';
import { ContiguousMultilineTokens } from '../tokens/contiguousMultilineTokens.js';
import { ContiguousMultilineTokensBuilder } from '../tokens/contiguousMultilineTokensBuilder.js';
import { ContiguousTokensStore } from '../tokens/contiguousTokensStore.js';
import { LineTokens } from '../tokens/lineTokens.js';
import { SparseMultilineTokens } from '../tokens/sparseMultilineTokens.js';
import { SparseTokensStore } from '../tokens/sparseTokensStore.js';

export class TokenizationTextModelPart extends TextModelPart implements ITokenizationTextModelPart {
	private readonly _semanticTokens: SparseTokensStore = new SparseTokensStore(this._languageService.languageIdCodec);

	private readonly _onDidChangeLanguage: Emitter<IModelLanguageChangedEvent> = this._register(new Emitter<IModelLanguageChangedEvent>());
	public readonly onDidChangeLanguage: Event<IModelLanguageChangedEvent> = this._onDidChangeLanguage.event;

	private readonly _onDidChangeLanguageConfiguration: Emitter<IModelLanguageConfigurationChangedEvent> = this._register(new Emitter<IModelLanguageConfigurationChangedEvent>());
	public readonly onDidChangeLanguageConfiguration: Event<IModelLanguageConfigurationChangedEvent> = this._onDidChangeLanguageConfiguration.event;

	private readonly _onDidChangeTokens: Emitter<IModelTokensChangedEvent> = this._register(new Emitter<IModelTokensChangedEvent>());
	public readonly onDidChangeTokens: Event<IModelTokensChangedEvent> = this._onDidChangeTokens.event;

	private _tokens!: AbstractTokens;
	private readonly _tokensDisposables: DisposableStore = this._register(new DisposableStore());

	constructor(
		private readonly _textModel: TextModel,
		private readonly _bracketPairsTextModelPart: BracketPairsTextModelPart,
		private _languageId: string,
		private readonly _attachedViews: AttachedViews,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@ITreeSitterParserService private readonly _treeSitterService: ITreeSitterParserService,
	) {
		super();

		// We just look at registry changes to determine whether to use tree sitter.
		// This means that removing a language from the setting will not cause a switch to textmate and will require a reload.
		// Adding a language to the setting will not need a reload, however.
		this._register(Event.filter(TreeSitterTokenizationRegistry.onDidChange, (e) => e.changedLanguages.includes(this._languageId))(() => {
			this.createPreferredTokenProvider();
		}));
		this.createPreferredTokenProvider();
	}

	private createGrammarTokens() {
		return this._register(new GrammarTokens(this._languageService.languageIdCodec, this._textModel, () => this._languageId, this._attachedViews));
	}

	private createTreeSitterTokens(): AbstractTokens {
		return this._register(new TreeSitterTokens(this._treeSitterService, this._languageService.languageIdCodec, this._textModel, () => this._languageId));
	}

	private createTokens(useTreeSitter: boolean): void {
		const needsReset = this._tokens !== undefined;
		this._tokens?.dispose();
		this._tokens = useTreeSitter ? this.createTreeSitterTokens() : this.createGrammarTokens();
		this._tokensDisposables.clear();
		this._tokensDisposables.add(this._tokens.onDidChangeTokens(e => {
			this._emitModelTokensChangedEvent(e);
		}));

		this._tokensDisposables.add(this._tokens.onDidChangeBackgroundTokenizationState(e => {
			this._bracketPairsTextModelPart.handleDidChangeBackgroundTokenizationState();
		}));
		if (needsReset) {
			// We need to reset the tokenization, as the new token provider otherwise won't have a chance to provide tokens until some action happens in the editor.
			this._tokens.resetTokenization();
		}
	}

	private createPreferredTokenProvider() {
		if (TreeSitterTokenizationRegistry.get(this._languageId)) {
			if (!(this._tokens instanceof TreeSitterTokens)) {
				this.createTokens(true);
			}
		} else {
			if (!(this._tokens instanceof GrammarTokens)) {
				this.createTokens(false);
			}
		}
	}

	_hasListeners(): boolean {
		return (this._onDidChangeLanguage.hasListeners()
			|| this._onDidChangeLanguageConfiguration.hasListeners()
			|| this._onDidChangeTokens.hasListeners());
	}

	public handleLanguageConfigurationServiceChange(e: LanguageConfigurationServiceChangeEvent): void {
		if (e.affects(this._languageId)) {
			this._onDidChangeLanguageConfiguration.fire({});
		}
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

		this._tokens.handleDidChangeContent(e);
	}

	public handleDidChangeAttached(): void {
		this._tokens.handleDidChangeAttached();
	}

	/**
	 * Includes grammar and semantic tokens.
	 */
	public getLineTokens(lineNumber: number): LineTokens {
		this.validateLineNumber(lineNumber);
		const syntacticTokens = this._tokens.getLineTokens(lineNumber);
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
		return this._tokens.hasTokens;
	}

	public resetTokenization() {
		this._tokens.resetTokenization();
	}

	public get backgroundTokenizationState() {
		return this._tokens.backgroundTokenizationState;
	}

	public forceTokenization(lineNumber: number): void {
		this.validateLineNumber(lineNumber);
		this._tokens.forceTokenization(lineNumber);
	}

	public hasAccurateTokensForLine(lineNumber: number): boolean {
		this.validateLineNumber(lineNumber);
		return this._tokens.hasAccurateTokensForLine(lineNumber);
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		this.validateLineNumber(lineNumber);
		return this._tokens.isCheapToTokenize(lineNumber);
	}

	public tokenizeIfCheap(lineNumber: number): void {
		this.validateLineNumber(lineNumber);
		this._tokens.tokenizeIfCheap(lineNumber);
	}

	public getTokenTypeIfInsertingCharacter(lineNumber: number, column: number, character: string): StandardTokenType {
		return this._tokens.getTokenTypeIfInsertingCharacter(lineNumber, column, character);
	}

	public tokenizeLineWithEdit(lineNumber: number, edit: LineEditWithAdditionalLines): ITokenizeLineWithEditResult {
		return this._tokens.tokenizeLineWithEdit(lineNumber, edit);
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
		this._tokens.resetTokenization();
		this.createPreferredTokenProvider();
		this._onDidChangeLanguage.fire(e);
		this._onDidChangeLanguageConfiguration.fire({});
	}

	// #endregion
}

class GrammarTokens extends AbstractTokens {
	private _tokenizer: TokenizerWithStateStoreAndTextModel | null = null;
	private _defaultBackgroundTokenizer: DefaultBackgroundTokenizer | null = null;
	private readonly _backgroundTokenizer = this._register(new MutableDisposable<IBackgroundTokenizer>());

	private readonly _tokens = new ContiguousTokensStore(this._languageIdCodec);
	private _debugBackgroundTokens: ContiguousTokensStore | undefined;
	private _debugBackgroundStates: TrackingTokenizationStateStore<IState> | undefined;

	private readonly _debugBackgroundTokenizer = this._register(new MutableDisposable<IBackgroundTokenizer>());

	private readonly _attachedViewStates = this._register(new DisposableMap<IAttachedView, AttachedViewHandler>());

	constructor(
		languageIdCodec: ILanguageIdCodec,
		textModel: TextModel,
		getLanguageId: () => string,
		attachedViews: AttachedViews,
	) {
		super(languageIdCodec, textModel, getLanguageId);

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
					if (!this._tokenizer) { return; }
					const firstInvalidEndStateLineNumber = this._tokenizer.store.getFirstInvalidEndStateLineNumber();
					// Don't accept states for definitely valid states, the renderer is ahead of the worker!
					if (firstInvalidEndStateLineNumber !== null && lineNumber >= firstInvalidEndStateLineNumber) {
						this._tokenizer?.store.setEndState(lineNumber, state);
					}
				},
			};

			if (tokenizationSupport && tokenizationSupport.createBackgroundTokenizer && !tokenizationSupport.backgroundTokenizerShouldOnlyVerifyTokens) {
				this._backgroundTokenizer.value = tokenizationSupport.createBackgroundTokenizer(this._textModel, b);
			}
			if (!this._backgroundTokenizer.value && !this._textModel.isTooLargeForTokenization()) {
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

	public hasAccurateTokensForLine(lineNumber: number): boolean {
		if (!this._tokenizer) {
			return true;
		}
		return this._tokenizer.hasAccurateTokensForLine(lineNumber);
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		if (!this._tokenizer) {
			return true;
		}
		return this._tokenizer.isCheapToTokenize(lineNumber);
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

	public tokenizeLineWithEdit(lineNumber: number, edit: LineEditWithAdditionalLines): ITokenizeLineWithEditResult {
		if (!this._tokenizer) {
			return { mainLineTokens: null, additionalLines: null };
		}
		this.forceTokenization(lineNumber);
		return this._tokenizer.tokenizeLineWithEdit(lineNumber, edit);
	}

	public get hasTokens(): boolean {
		return this._tokens.hasTokens;
	}
}
