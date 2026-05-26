/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MutableDisposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { countEOL } from '../../core/misc/eolCounter.js';
import { Position } from '../../core/position.js';
import { LineRange } from '../../core/ranges/lineRange.js';
import { StandardTokenType } from '../../encodedTokenAttributes.js';
import { IBackgroundTokenizer, IState, ILanguageIdCodec, TokenizationRegistry, ITokenizationSupport, IBackgroundTokenizationStore } from '../../languages.js';
import { IAttachedView } from '../../model.js';
import { FontTokensUpdate, IModelContentChangedEvent } from '../../textModelEvents.js';
import { BackgroundTokenizationState } from '../../tokenizationTextModelPart.js';
import { ContiguousMultilineTokens } from '../../tokens/contiguousMultilineTokens.js';
import { ContiguousMultilineTokensBuilder } from '../../tokens/contiguousMultilineTokensBuilder.js';
import { ContiguousTokensStore } from '../../tokens/contiguousTokensStore.js';
import { LineTokens } from '../../tokens/lineTokens.js';
import { TextModel } from '../textModel.js';
import { TokenizerWithStateStoreAndTextModel, DefaultBackgroundTokenizer, TrackingTokenizationStateStore } from '../textModelTokens.js';
import { AbstractSyntaxTokenBackend, AttachedViewHandler, AttachedViews } from './abstractSyntaxTokenBackend.js';

/** For TextMate */
export class TokenizerSyntaxTokenBackend extends AbstractSyntaxTokenBackend {
	private _tokenizer: TokenizerWithStateStoreAndTextModel | null = null;
	protected _backgroundTokenizationState: BackgroundTokenizationState = BackgroundTokenizationState.InProgress;
	protected readonly _onDidChangeBackgroundTokenizationState: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeBackgroundTokenizationState: Event<void> = this._onDidChangeBackgroundTokenizationState.event;

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
		private readonly getLanguageId: () => string,
		attachedViews: AttachedViews,
	) {
		super(languageIdCodec, textModel);

		this._register(TokenizationRegistry.onDidChange((e) => {
			const languageId = this.getLanguageId();
			if (e.changedLanguages.indexOf(languageId) === -1) {
				return;
			}
			this.todo_resetTokenization();
		}));

		this.todo_resetTokenization();

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

	public todo_resetTokenization(fireTokenChangeEvent: boolean = true): void {
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
				setFontInfo: (changes: FontTokensUpdate) => {
					this.setFontInfo(changes);
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
					setFontInfo: (changes: FontTokensUpdate) => {
						this.setFontInfo(changes);
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
			this.todo_resetTokenization(false);
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

	private setFontInfo(changes: FontTokensUpdate): void {
		this._onDidChangeFontTokens.fire({ changes });
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


	public tokenizeLinesAt(lineNumber: number, lines: string[]): LineTokens[] | null {
		if (!this._tokenizer) {
			return null;
		}
		this.forceTokenization(lineNumber);
		return this._tokenizer.tokenizeLinesAt(lineNumber, lines);
	}

	public get hasTokens(): boolean {
		return this._tokens.hasTokens;
	}
}
