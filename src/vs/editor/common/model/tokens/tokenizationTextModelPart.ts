/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../../base/common/charCode.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { countEOL } from '../../core/misc/eolCounter.js';
import { IPosition, Position } from '../../core/position.js';
import { Range } from '../../core/range.js';
import { IWordAtPosition, getWordAtText } from '../../core/wordHelper.js';
import { StandardTokenType } from '../../encodedTokenAttributes.js';
import { ILanguageService } from '../../languages/language.js';
import { ILanguageConfigurationService, LanguageConfigurationServiceChangeEvent, ResolvedLanguageConfiguration } from '../../languages/languageConfigurationRegistry.js';
import { BracketPairsTextModelPart } from '../bracketPairsTextModelPart/bracketPairsImpl.js';
import { TextModel } from '../textModel.js';
import { TextModelPart } from '../textModelPart.js';
import { AbstractSyntaxTokenBackend, AttachedViews } from './abstractSyntaxTokenBackend.js';
import { TreeSitterSyntaxTokenBackend } from './treeSitter/treeSitterSyntaxTokenBackend.js';
import { IModelContentChangedEvent, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent, IModelTokensChangedEvent } from '../../textModelEvents.js';
import { ITokenizationTextModelPart } from '../../tokenizationTextModelPart.js';
import { LineTokens } from '../../tokens/lineTokens.js';
import { SparseMultilineTokens } from '../../tokens/sparseMultilineTokens.js';
import { SparseTokensStore } from '../../tokens/sparseTokensStore.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { TokenizerSyntaxTokenBackend } from './tokenizerSyntaxTokenBackend.js';
import { ITreeSitterLibraryService } from '../../services/treeSitter/treeSitterLibraryService.js';
import { derived, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';

export class TokenizationTextModelPart extends TextModelPart implements ITokenizationTextModelPart {
	private readonly _semanticTokens: SparseTokensStore;

	private readonly _onDidChangeLanguage: Emitter<IModelLanguageChangedEvent>;
	public readonly onDidChangeLanguage: Event<IModelLanguageChangedEvent>;

	private readonly _onDidChangeLanguageConfiguration: Emitter<IModelLanguageConfigurationChangedEvent>;
	public readonly onDidChangeLanguageConfiguration: Event<IModelLanguageConfigurationChangedEvent>;

	private readonly _onDidChangeTokens: Emitter<IModelTokensChangedEvent>;
	public readonly onDidChangeTokens: Event<IModelTokensChangedEvent>;

	public readonly tokens: IObservable<AbstractSyntaxTokenBackend>;
	private readonly _useTreeSitter: IObservable<boolean>;
	private readonly _languageIdObs: ISettableObservable<string>;

	constructor(
		private readonly _textModel: TextModel,
		private readonly _bracketPairsTextModelPart: BracketPairsTextModelPart,
		private _languageId: string,
		private readonly _attachedViews: AttachedViews,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITreeSitterLibraryService private readonly _treeSitterLibraryService: ITreeSitterLibraryService,
	) {
		super();

		this._languageIdObs = observableValue(this, this._languageId);

		this._useTreeSitter = derived(this, reader => {
			const languageId = this._languageIdObs.read(reader);
			return this._treeSitterLibraryService.supportsLanguage(languageId, reader);
		});

		this.tokens = derived(this, reader => {
			let tokens: AbstractSyntaxTokenBackend;
			if (this._useTreeSitter.read(reader)) {
				tokens = reader.store.add(this._instantiationService.createInstance(
					TreeSitterSyntaxTokenBackend,
					this._languageIdObs,
					this._languageService.languageIdCodec,
					this._textModel,
					this._attachedViews.visibleLineRanges
				));
			} else {
				tokens = reader.store.add(new TokenizerSyntaxTokenBackend(this._languageService.languageIdCodec, this._textModel, () => this._languageId, this._attachedViews));
			}

			reader.store.add(tokens.onDidChangeTokens(e => {
				this._emitModelTokensChangedEvent(e);
			}));

			reader.store.add(tokens.onDidChangeBackgroundTokenizationState(e => {
				this._bracketPairsTextModelPart.handleDidChangeBackgroundTokenizationState();
			}));
			return tokens;
		});

		let hadTokens = false;
		this.tokens.recomputeInitiallyAndOnChange(this._store, value => {
			if (hadTokens) {
				// We need to reset the tokenization, as the new token provider otherwise won't have a chance to provide tokens until some action happens in the editor.
				// TODO@hediet: Look into why this is needed.
				value.todo_resetTokenization();
			}
			hadTokens = true;
		});

		this._semanticTokens = new SparseTokensStore(this._languageService.languageIdCodec);
		this._onDidChangeLanguage = this._register(new Emitter<IModelLanguageChangedEvent>());
		this.onDidChangeLanguage = this._onDidChangeLanguage.event;
		this._onDidChangeLanguageConfiguration = this._register(new Emitter<IModelLanguageConfigurationChangedEvent>());
		this.onDidChangeLanguageConfiguration = this._onDidChangeLanguageConfiguration.event;
		this._onDidChangeTokens = this._register(new Emitter<IModelTokensChangedEvent>());
		this.onDidChangeTokens = this._onDidChangeTokens.event;
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

		this.tokens.get().handleDidChangeContent(e);
	}

	public handleDidChangeAttached(): void {
		this.tokens.get().handleDidChangeAttached();
	}

	/**
	 * Includes grammar and semantic tokens.
	 */
	public getLineTokens(lineNumber: number): LineTokens {
		this.validateLineNumber(lineNumber);
		const syntacticTokens = this.tokens.get().getLineTokens(lineNumber);
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
		return this.tokens.get().hasTokens;
	}

	public resetTokenization() {
		this.tokens.get().todo_resetTokenization();
	}

	public get backgroundTokenizationState() {
		return this.tokens.get().backgroundTokenizationState;
	}

	public forceTokenization(lineNumber: number): void {
		this.validateLineNumber(lineNumber);
		this.tokens.get().forceTokenization(lineNumber);
	}

	public hasAccurateTokensForLine(lineNumber: number): boolean {
		this.validateLineNumber(lineNumber);
		return this.tokens.get().hasAccurateTokensForLine(lineNumber);
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		this.validateLineNumber(lineNumber);
		return this.tokens.get().isCheapToTokenize(lineNumber);
	}

	public tokenizeIfCheap(lineNumber: number): void {
		this.validateLineNumber(lineNumber);
		this.tokens.get().tokenizeIfCheap(lineNumber);
	}

	public getTokenTypeIfInsertingCharacter(lineNumber: number, column: number, character: string): StandardTokenType {
		return this.tokens.get().getTokenTypeIfInsertingCharacter(lineNumber, column, character);
	}

	public tokenizeLinesAt(lineNumber: number, lines: string[]): LineTokens[] | null {
		return this.tokens.get().tokenizeLinesAt(lineNumber, lines);
	}

	// #endregion

	// #region Semantic Tokens

	public setSemanticTokens(tokens: SparseMultilineTokens[] | null, isComplete: boolean): void {
		this._semanticTokens.set(tokens, isComplete, this._textModel);

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
		this._languageIdObs.set(languageId, undefined);
		this._bracketPairsTextModelPart.handleDidChangeLanguage(e);

		this._onDidChangeLanguage.fire(e);
		this._onDidChangeLanguageConfiguration.fire({});
	}

	// #endregion
}
