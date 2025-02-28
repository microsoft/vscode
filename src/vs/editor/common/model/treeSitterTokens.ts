/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageIdCodec, ITreeSitterTokenizationSupport, TreeSitterTokenizationRegistry } from '../languages.js';
import { LineTokens } from '../tokens/lineTokens.js';
import { StandardTokenType } from '../encodedTokenAttributes.js';
import { TextModel } from './textModel.js';
import { IModelContentChangedEvent } from '../textModelEvents.js';
import { AbstractTokens } from './tokens.js';
import { IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { ITreeSitterTokenizationStoreService } from './treeSitterTokenStoreService.js';
import { Range } from '../core/range.js';
import { BackgroundTokenizationState } from '../tokenizationTextModelPart.js';
import { Emitter, Event } from '../../../base/common/event.js';

export class TreeSitterTokens extends AbstractTokens {
	private _tokenizationSupport: ITreeSitterTokenizationSupport | null = null;

	protected _backgroundTokenizationState: BackgroundTokenizationState = BackgroundTokenizationState.InProgress;
	protected readonly _onDidChangeBackgroundTokenizationState: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeBackgroundTokenizationState: Event<void> = this._onDidChangeBackgroundTokenizationState.event;

	private _lastLanguageId: string | undefined;
	private readonly _tokensChangedListener: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
	private readonly _onDidChangeBackgroundTokenization: MutableDisposable<IDisposable> = this._register(new MutableDisposable());

	constructor(languageIdCodec: ILanguageIdCodec,
		textModel: TextModel,
		languageId: () => string,
		@ITreeSitterTokenizationStoreService private readonly _tokenStore: ITreeSitterTokenizationStoreService) {
		super(languageIdCodec, textModel, languageId);

		this._initialize();
	}

	private _initialize() {
		const newLanguage = this.getLanguageId();
		if (!this._tokenizationSupport || this._lastLanguageId !== newLanguage) {
			this._lastLanguageId = newLanguage;
			this._tokenizationSupport = TreeSitterTokenizationRegistry.get(newLanguage);
			this._tokensChangedListener.value = this._tokenizationSupport?.onDidChangeTokens((e) => {
				if (e.textModel === this._textModel) {
					this._onDidChangeTokens.fire(e.changes);
				}
			});
			this._onDidChangeBackgroundTokenization.value = this._tokenizationSupport?.onDidChangeBackgroundTokenization(e => {
				if (e.textModel === this._textModel) {
					this._backgroundTokenizationState = BackgroundTokenizationState.Completed;
					this._onDidChangeBackgroundTokenizationState.fire();
				}
			});
		}
	}

	public getLineTokens(lineNumber: number): LineTokens {
		const content = this._textModel.getLineContent(lineNumber);
		if (this._tokenizationSupport) {
			const rawTokens = this._tokenStore.getTokens(this._textModel, lineNumber);
			if (rawTokens) {
				return new LineTokens(rawTokens, content, this._languageIdCodec);
			}
		}
		return LineTokens.createEmpty(content, this._languageIdCodec);
	}

	public resetTokenization(fireTokenChangeEvent: boolean = true): void {
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
		this._initialize();
	}

	public override handleDidChangeAttached(): void {
		// TODO @alexr00 implement for background tokenization
	}

	public override handleDidChangeContent(e: IModelContentChangedEvent): void {
		if (e.isFlush) {
			// Don't fire the event, as the view might not have got the text change event yet
			this.resetTokenization(false);
		}
	}

	public override forceTokenization(lineNumber: number): void {
		if (this._tokenizationSupport) {
			this._tokenizationSupport.tokenizeEncoded(lineNumber, this._textModel);
		}
	}

	public override hasAccurateTokensForLine(lineNumber: number): boolean {
		return this._tokenStore.hasTokens(this._textModel, new Range(lineNumber, 1, lineNumber, this._textModel.getLineMaxColumn(lineNumber)));
	}

	public override isCheapToTokenize(lineNumber: number): boolean {
		// TODO @alexr00 determine what makes it cheap to tokenize?
		return true;
	}

	public override getTokenTypeIfInsertingCharacter(lineNumber: number, column: number, character: string): StandardTokenType {
		// TODO @alexr00 implement once we have custom parsing and don't just feed in the whole text model value
		return StandardTokenType.Other;
	}
	public override tokenizeLinesAt(lineNumber: number, lines: string[]): LineTokens[] | null {
		// TODO @alexr00 understand what this is for and implement
		return null;
	}
	public override get hasTokens(): boolean {
		return this._tokenStore.hasTokens(this._textModel);
	}
}
