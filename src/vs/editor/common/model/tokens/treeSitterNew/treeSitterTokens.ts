/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as TreeSitter from '@vscode/tree-sitter-wasm';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MutableDisposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { Range } from '../../../core/range.js';
import { StandardTokenType } from '../../../encodedTokenAttributes.js';
import { ITreeSitterTokenizationSupport, ILanguageIdCodec, TreeSitterTokenizationRegistry } from '../../../languages.js';
import { IModelContentChangedEvent } from '../../../textModelEvents.js';
import { BackgroundTokenizationState } from '../../../tokenizationTextModelPart.js';
import { LineTokens } from '../../../tokens/lineTokens.js';
import { TextModel } from '../../textModel.js';
import { AbstractTokens } from '../tokens.js';
import { ITreeSitterTokenizationStoreService } from './treeSitterTokenStoreService.js';
import { TokenQuality, TokenStore, TokenUpdate } from '../../tokenStore.js';

export class TreeSitterTokens extends AbstractTokens {
	private _tokenizationSupport: ITreeSitterTokenizationSupport | null = null;

	protected _backgroundTokenizationState: BackgroundTokenizationState = BackgroundTokenizationState.InProgress;
	protected readonly _onDidChangeBackgroundTokenizationState: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeBackgroundTokenizationState: Event<void> = this._onDidChangeBackgroundTokenizationState.event;

	private _lastLanguageId: string | undefined;
	private readonly _tokensChangedListener: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
	private readonly _onDidChangeBackgroundTokenization: MutableDisposable<IDisposable> = this._register(new MutableDisposable());

	constructor(
		languageIdCodec: ILanguageIdCodec,
		textModel: TextModel,
		languageId: () => string,
		@ITreeSitterTokenizationStoreService private readonly _tokenStore: ITreeSitterTokenizationStoreService
	) {
		super(languageIdCodec, textModel, languageId);


		this._initialize();

		const store = this._register(new TokenStore(this._textModel));
		this.store = store;
		this.accurateVersion = this._textModel.getVersionId();
		this.guessVersion = this._textModel.getVersionId();

		store.buildStore(this._createEmptyTokens(), TokenQuality.None);
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
		if (this._tokenizationSupport && content.length > 0) {
			const rawTokens = this._tokenStore.getTokens(this._textModel, lineNumber);
			if (rawTokens && rawTokens.length > 0) {
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
		} else {
			this._tokenStore.handleContentChanged(this._textModel, e);
		}
	}

	public override forceTokenization(lineNumber: number): void {
		if (this._tokenizationSupport && !this.hasAccurateTokensForLine(lineNumber)) {
			this._tokenizationSupport.tokenizeEncoded(lineNumber, this._textModel);
		}
	}

	public override hasAccurateTokensForLine(lineNumber: number): boolean {
		return this._hasTokens(new Range(lineNumber, 1, lineNumber, this._textModel.getLineMaxColumn(lineNumber)));
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
		if (this._tokenizationSupport) {
			const rawLineTokens = this._tokenizationSupport.guessTokensForLinesContent(lineNumber, this._textModel, lines);
			const lineTokens: LineTokens[] = [];
			if (rawLineTokens) {
				for (let i = 0; i < rawLineTokens.length; i++) {
					lineTokens.push(new LineTokens(rawLineTokens[i], lines[i], this._languageIdCodec));
				}
				return lineTokens;
			}
		}
		return null;
	}

	public override get hasTokens(): boolean {
		return this._hasTokens();
	}


	store: TokenStore;
	accurateVersion: number;
	guessVersion: number;



	private _createEmptyTokens() {
		const emptyToken = this._emptyToken();
		const modelEndOffset = this._textModel.getValueLength();

		const emptyTokens: TokenUpdate[] = [this._emptyTokensForOffsetAndLength(0, modelEndOffset, emptyToken)];
		return emptyTokens;
	}

	private _emptyToken() {
		return 0;
		// TODO return findMetadata(this._colorThemeData, [], this._encodedLanguageId, false);
	}

	private _emptyTokensForOffsetAndLength(offset: number, length: number, emptyToken: number): TokenUpdate {
		return { token: emptyToken, length: offset + length, startOffsetInclusive: 0 };
	}

	_handleContentChanged(e: IModelContentChangedEvent): void {
		this.guessVersion = e.versionId;
		for (const change of e.changes) {
			if (change.text.length > change.rangeLength) {
				// If possible, use the token before the change as the starting point for the new token.
				// This is more likely to let the new text be the correct color as typeing is usually at the end of the token.
				const offset = change.rangeOffset > 0 ? change.rangeOffset - 1 : change.rangeOffset;
				const oldToken = this.store.getTokenAt(offset);
				let newToken: TokenUpdate;
				if (oldToken) {
					// Insert. Just grow the token at this position to include the insert.
					newToken = { startOffsetInclusive: oldToken.startOffsetInclusive, length: oldToken.length + change.text.length - change.rangeLength, token: oldToken.token };
					// Also mark tokens that are in the range of the change as needing a refresh.
					this.store.markForRefresh(offset, change.rangeOffset + (change.text.length > change.rangeLength ? change.text.length : change.rangeLength));
				} else {
					// The document got larger and the change is at the end of the document.
					newToken = { startOffsetInclusive: offset, length: change.text.length, token: 0 };
				}
				this.store.update(oldToken?.length ?? 0, [newToken], TokenQuality.EditGuess);
			} else if (change.text.length < change.rangeLength) {
				// Delete. Delete the tokens at the corresponding range.
				const deletedCharCount = change.rangeLength - change.text.length;
				this.store.delete(deletedCharCount, change.rangeOffset);
			}
		}
	}

	rangeHasTokens(range: Range, minimumTokenQuality: TokenQuality): boolean {
		return this.store.rangeHasTokens(this._textModel.getOffsetAt(range.getStartPosition()), this._textModel.getOffsetAt(range.getEndPosition()), minimumTokenQuality);
	}

	_hasTokens(accurateForRange?: Range): boolean {
		if (!accurateForRange || (this.guessVersion === this.accurateVersion)) {
			return true;
		}

		return !this.store.rangeNeedsRefresh(this._textModel.getOffsetAt(accurateForRange.getStartPosition()), this._textModel.getOffsetAt(accurateForRange.getEndPosition()));
	}

	getTokens(line: number): Uint32Array | undefined {
		const tokens = this.store;
		if (!tokens) {
			return undefined;
		}
		const lineStartOffset = this._textModel.getOffsetAt({ lineNumber: line, column: 1 });
		const lineTokens = tokens.getTokensInRange(lineStartOffset, this._textModel.getOffsetAt({ lineNumber: line, column: this._textModel.getLineLength(line) }) + 1);
		const result = new Uint32Array(lineTokens.length * 2);
		for (let i = 0; i < lineTokens.length; i++) {
			result[i * 2] = lineTokens[i].startOffsetInclusive - lineStartOffset + lineTokens[i].length;
			result[i * 2 + 1] = lineTokens[i].token;
		}
		return result;
	}

	updateTokens(version: number, updates: { oldRangeLength?: number; newTokens: TokenUpdate[] }[], tokenQuality: TokenQuality): void {
		this.accurateVersion = version;
		for (const update of updates) {
			const lastToken = update.newTokens.length > 0 ? update.newTokens[update.newTokens.length - 1] : undefined;
			let oldRangeLength: number;
			if (lastToken && (this.guessVersion >= version)) {
				oldRangeLength = lastToken.startOffsetInclusive + lastToken.length - update.newTokens[0].startOffsetInclusive;
			} else if (update.oldRangeLength) {
				oldRangeLength = update.oldRangeLength;
			} else {
				oldRangeLength = 0;
			}
			this.store.update(oldRangeLength, update.newTokens, tokenQuality);
		}
	}

	markForRefresh(range: Range): void {
		this.store.markForRefresh(this._textModel.getOffsetAt(range.getStartPosition()), this._textModel.getOffsetAt(range.getEndPosition()));
	}

	getNeedsRefresh(): { range: Range; startOffset: number; endOffset: number }[] {
		const needsRefreshOffsetRanges = this.store.getNeedsRefresh();
		if (!needsRefreshOffsetRanges) {
			return [];
		}
		return needsRefreshOffsetRanges.map(range => ({
			range: Range.fromPositions(this._textModel.getPositionAt(range.startOffset), this._textModel.getPositionAt(range.endOffset)),
			startOffset: range.startOffset,
			endOffset: range.endOffset
		}));
	}
}

export function rangesEqual(a: TreeSitter.Range, b: TreeSitter.Range) {
	return (a.startPosition.row === b.startPosition.row)
		&& (a.startPosition.column === b.startPosition.column)
		&& (a.endPosition.row === b.endPosition.row)
		&& (a.endPosition.column === b.endPosition.column)
		&& (a.startIndex === b.startIndex)
		&& (a.endIndex === b.endIndex);
}

export function rangesIntersect(a: TreeSitter.Range, b: TreeSitter.Range) {
	return (a.startIndex <= b.startIndex && a.endIndex >= b.startIndex) ||
		(b.startIndex <= a.startIndex && b.endIndex >= a.startIndex);
}
