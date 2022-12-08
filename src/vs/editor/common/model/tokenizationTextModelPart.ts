/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { CharCode } from 'vs/base/common/charCode';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { getWordAtText, IWordAtPosition } from 'vs/editor/common/core/wordHelper';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ILanguageConfigurationService, ResolvedLanguageConfiguration } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { TextModel } from 'vs/editor/common/model/textModel';
import { TextModelPart } from 'vs/editor/common/model/textModelPart';
import { TextModelTokenization } from 'vs/editor/common/model/textModelTokens';
import { IModelContentChangedEvent, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent, IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { ContiguousMultilineTokens } from 'vs/editor/common/tokens/contiguousMultilineTokens';
import { ContiguousTokensStore } from 'vs/editor/common/tokens/contiguousTokensStore';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { SparseMultilineTokens } from 'vs/editor/common/tokens/sparseMultilineTokens';
import { SparseTokensStore } from 'vs/editor/common/tokens/sparseTokensStore';
import { BracketPairsTextModelPart } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsImpl';
import { BackgroundTokenizationState, ITokenizationTextModelPart } from 'vs/editor/common/tokenizationTextModelPart';

export class TokenizationTextModelPart extends TextModelPart implements ITokenizationTextModelPart {
	private readonly _onDidChangeLanguage: Emitter<IModelLanguageChangedEvent> = this._register(new Emitter<IModelLanguageChangedEvent>());
	public readonly onDidChangeLanguage: Event<IModelLanguageChangedEvent> = this._onDidChangeLanguage.event;

	private readonly _onDidChangeLanguageConfiguration: Emitter<IModelLanguageConfigurationChangedEvent> = this._register(new Emitter<IModelLanguageConfigurationChangedEvent>());
	public readonly onDidChangeLanguageConfiguration: Event<IModelLanguageConfigurationChangedEvent> = this._onDidChangeLanguageConfiguration.event;

	private readonly _onDidChangeTokens: Emitter<IModelTokensChangedEvent> = this._register(new Emitter<IModelTokensChangedEvent>());
	public readonly onDidChangeTokens: Event<IModelTokensChangedEvent> = this._onDidChangeTokens.event;

	private readonly _languageRegistryListener: IDisposable;
	private readonly _tokens: ContiguousTokensStore;
	private readonly _semanticTokens: SparseTokensStore;
	private readonly _tokenization: TextModelTokenization;

	constructor(
		private readonly _languageService: ILanguageService,
		private readonly _languageConfigurationService: ILanguageConfigurationService,
		private readonly _textModel: TextModel,
		private readonly bracketPairsTextModelPart: BracketPairsTextModelPart,
		private _languageId: string,
	) {
		super();

		this._tokens = new ContiguousTokensStore(
			this._languageService.languageIdCodec
		);
		this._semanticTokens = new SparseTokensStore(
			this._languageService.languageIdCodec
		);
		this._tokenization = new TextModelTokenization(
			_textModel,
			this,
			this._languageService.languageIdCodec
		);

		this._languageRegistryListener = this._languageConfigurationService.onDidChange(
			e => {
				if (e.affects(this._languageId)) {
					this._onDidChangeLanguageConfiguration.fire({});
				}
			}
		);
	}

	_hasListeners(): boolean {
		return (
			this._onDidChangeLanguage.hasListeners()
			|| this._onDidChangeLanguageConfiguration.hasListeners()
			|| this._onDidChangeTokens.hasListeners()
			|| this._onBackgroundTokenizationStateChanged.hasListeners()
		);
	}

	public acceptEdit(
		range: IRange,
		text: string,
		eolCount: number,
		firstLineLength: number,
		lastLineLength: number
	): void {
		this._tokens.acceptEdit(range, eolCount, firstLineLength);
		this._semanticTokens.acceptEdit(
			range,
			eolCount,
			firstLineLength,
			lastLineLength,
			text.length > 0 ? text.charCodeAt(0) : CharCode.Null
		);
	}

	public handleDidChangeAttached(): void {
		this._tokenization.handleDidChangeAttached();
	}

	public flush(): void {
		this._tokens.flush();
		this._semanticTokens.flush();
	}

	public handleDidChangeContent(change: IModelContentChangedEvent): void {
		this._tokenization.handleDidChangeContent(change);
	}

	public override dispose(): void {
		this._languageRegistryListener.dispose();
		this._tokenization.dispose();
		super.dispose();
	}

	private _backgroundTokenizationState = BackgroundTokenizationState.Uninitialized;
	public get backgroundTokenizationState(): BackgroundTokenizationState {
		return this._backgroundTokenizationState;
	}
	private handleTokenizationProgress(completed: boolean) {
		if (this._backgroundTokenizationState === BackgroundTokenizationState.Completed) {
			// We already did a full tokenization and don't go back to progressing.
			return;
		}
		const newState = completed ? BackgroundTokenizationState.Completed : BackgroundTokenizationState.InProgress;
		if (this._backgroundTokenizationState !== newState) {
			this._backgroundTokenizationState = newState;
			this.bracketPairsTextModelPart.handleDidChangeBackgroundTokenizationState();
			this._onBackgroundTokenizationStateChanged.fire();
		}
	}

	private readonly _onBackgroundTokenizationStateChanged = this._register(new Emitter<void>());
	public readonly onBackgroundTokenizationStateChanged: Event<void> = this._onBackgroundTokenizationStateChanged.event;

	public setLineTokens(
		lineNumber: number,
		tokens: Uint32Array | ArrayBuffer | null
	): void {
		if (lineNumber < 1 || lineNumber > this._textModel.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}

		this._tokens.setTokens(
			this._languageId,
			lineNumber - 1,
			this._textModel.getLineLength(lineNumber),
			tokens,
			false
		);
	}

	public setTokens(
		tokens: ContiguousMultilineTokens[],
		backgroundTokenizationCompleted: boolean = false
	): void {
		if (tokens.length !== 0) {
			const ranges: { fromLineNumber: number; toLineNumber: number }[] = [];

			for (let i = 0, len = tokens.length; i < len; i++) {
				const element = tokens[i];
				let minChangedLineNumber = 0;
				let maxChangedLineNumber = 0;
				let hasChange = false;
				for (
					let lineNumber = element.startLineNumber;
					lineNumber <= element.endLineNumber;
					lineNumber++
				) {
					if (hasChange) {
						this._tokens.setTokens(
							this._languageId,
							lineNumber - 1,
							this._textModel.getLineLength(lineNumber),
							element.getLineTokens(lineNumber),
							false
						);
						maxChangedLineNumber = lineNumber;
					} else {
						const lineHasChange = this._tokens.setTokens(
							this._languageId,
							lineNumber - 1,
							this._textModel.getLineLength(lineNumber),
							element.getLineTokens(lineNumber),
							true
						);
						if (lineHasChange) {
							hasChange = true;
							minChangedLineNumber = lineNumber;
							maxChangedLineNumber = lineNumber;
						}
					}
				}
				if (hasChange) {
					ranges.push({
						fromLineNumber: minChangedLineNumber,
						toLineNumber: maxChangedLineNumber,
					});
				}
			}

			if (ranges.length > 0) {
				this._emitModelTokensChangedEvent({
					tokenizationSupportChanged: false,
					semanticTokensApplied: false,
					ranges: ranges,
				});
			}
		}
		this.handleTokenizationProgress(backgroundTokenizationCompleted);
	}

	public setSemanticTokens(
		tokens: SparseMultilineTokens[] | null,
		isComplete: boolean
	): void {
		this._semanticTokens.set(tokens, isComplete);

		this._emitModelTokensChangedEvent({
			tokenizationSupportChanged: false,
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

	public setPartialSemanticTokens(
		range: Range,
		tokens: SparseMultilineTokens[]
	): void {
		if (this.hasCompleteSemanticTokens()) {
			return;
		}
		const changedRange = this._textModel.validateRange(
			this._semanticTokens.setPartial(range, tokens)
		);

		this._emitModelTokensChangedEvent({
			tokenizationSupportChanged: false,
			semanticTokensApplied: true,
			ranges: [
				{
					fromLineNumber: changedRange.startLineNumber,
					toLineNumber: changedRange.endLineNumber,
				},
			],
		});
	}

	public tokenizeViewport(
		startLineNumber: number,
		endLineNumber: number
	): void {
		startLineNumber = Math.max(1, startLineNumber);
		endLineNumber = Math.min(this._textModel.getLineCount(), endLineNumber);
		this._tokenization.tokenizeViewport(startLineNumber, endLineNumber);
	}

	public clearTokens(): void {
		this._tokens.flush();
		this._emitModelTokensChangedEvent({
			tokenizationSupportChanged: true,
			semanticTokensApplied: false,
			ranges: [
				{
					fromLineNumber: 1,
					toLineNumber: this._textModel.getLineCount(),
				},
			],
		});
	}

	public clearSemanticTokens(): void {
		this._semanticTokens.flush();

		this._emitModelTokensChangedEvent({
			tokenizationSupportChanged: false,
			semanticTokensApplied: false,
			ranges: [{ fromLineNumber: 1, toLineNumber: this._textModel.getLineCount() }],
		});
	}

	private _emitModelTokensChangedEvent(e: IModelTokensChangedEvent): void {
		if (!this._textModel._isDisposing()) {
			this.bracketPairsTextModelPart.handleDidChangeTokens(e);
			this._onDidChangeTokens.fire(e);
		}
	}

	public resetTokenization(): void {
		this._tokenization.reset();
	}

	public forceTokenization(lineNumber: number): void {
		if (lineNumber < 1 || lineNumber > this._textModel.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}

		this._tokenization.forceTokenization(lineNumber);
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		return this._tokenization.isCheapToTokenize(lineNumber);
	}

	public tokenizeIfCheap(lineNumber: number): void {
		if (this.isCheapToTokenize(lineNumber)) {
			this.forceTokenization(lineNumber);
		}
	}

	public getLineTokens(lineNumber: number): LineTokens {
		if (lineNumber < 1 || lineNumber > this._textModel.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}

		return this._getLineTokens(lineNumber);
	}

	private _getLineTokens(lineNumber: number): LineTokens {
		const lineText = this._textModel.getLineContent(lineNumber);
		const syntacticTokens = this._tokens.getTokens(
			this._languageId,
			lineNumber - 1,
			lineText
		);
		return this._semanticTokens.addSparseTokens(lineNumber, syntacticTokens);
	}

	public getTokenTypeIfInsertingCharacter(
		lineNumber: number,
		column: number,
		character: string
	): StandardTokenType {
		const position = this._textModel.validatePosition(new Position(lineNumber, column));
		return this._tokenization.getTokenTypeIfInsertingCharacter(
			position,
			character
		);
	}

	public tokenizeLineWithEdit(
		position: IPosition,
		length: number,
		newText: string
	): LineTokens | null {
		const validatedPosition = this._textModel.validatePosition(position);
		return this._tokenization.tokenizeLineWithEdit(
			validatedPosition,
			length,
			newText
		);
	}

	private getLanguageConfiguration(
		languageId: string
	): ResolvedLanguageConfiguration {
		return this._languageConfigurationService.getLanguageConfiguration(
			languageId
		);
	}

	// Having tokens allows implementing additional helper methods

	public getWordAtPosition(_position: IPosition): IWordAtPosition | null {
		this.assertNotDisposed();
		const position = this._textModel.validatePosition(_position);
		const lineContent = this._textModel.getLineContent(position.lineNumber);
		const lineTokens = this._getLineTokens(position.lineNumber);
		const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);

		// (1). First try checking right biased word
		const [rbStartOffset, rbEndOffset] = TokenizationTextModelPart._findLanguageBoundaries(
			lineTokens,
			tokenIndex
		);
		const rightBiasedWord = getWordAtText(
			position.column,
			this.getLanguageConfiguration(
				lineTokens.getLanguageId(tokenIndex)
			).getWordDefinition(),
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
				this.getLanguageConfiguration(
					lineTokens.getLanguageId(tokenIndex - 1)
				).getWordDefinition(),
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

	private static _findLanguageBoundaries(
		lineTokens: LineTokens,
		tokenIndex: number
	): [number, number] {
		const languageId = lineTokens.getLanguageId(tokenIndex);

		// go left until a different language is hit
		let startOffset = 0;
		for (
			let i = tokenIndex;
			i >= 0 && lineTokens.getLanguageId(i) === languageId;
			i--
		) {
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
			return {
				word: '',
				startColumn: position.column,
				endColumn: position.column,
			};
		}
		return {
			word: wordAtPosition.word.substr(
				0,
				position.column - wordAtPosition.startColumn
			),
			startColumn: wordAtPosition.startColumn,
			endColumn: position.column,
		};
	}

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

		this.bracketPairsTextModelPart.handleDidChangeLanguage(e);
		this._tokenization.handleDidChangeLanguage(e);
		this._onDidChangeLanguage.fire(e);
		this._onDidChangeLanguageConfiguration.fire({});
	}
}
