/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { setTimeout0 } from '../../../../../base/common/platform.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ColorThemeData, findMetadata } from '../../../../../workbench/services/themes/common/colorThemeData.js';
import { IWorkbenchThemeService, IWorkbenchColorTheme } from '../../../../../workbench/services/themes/common/workbenchThemeService.js';
import { LanguageId } from '../../../encodedTokenAttributes.js';
import { ILanguageIdCodec, QueryCapture, TreeSitterTokenizationRegistry } from '../../../languages.js';
import { ITextModel } from '../../../model.js';
import { ITextModelTreeSitter } from '../../../services/treeSitterBefore/treeSitterParserService.js';
import { IModelContentChangedEvent, IModelTokensChangedEvent } from '../../../textModelEvents.js';
import { findLikelyRelevantLines } from '../../textModelTokens.js';
import { TokenStore, TokenUpdate, TokenQuality } from './tokenStore.js';
import { TreeSitterModel, RangeChange, RangeWithOffsets } from './treeSitterModel.js';
import type * as TreeSitter from '@vscode/tree-sitter-wasm';
import { autorun, constObservable, IObservable } from '../../../../../base/common/observable.js';
import { LineRange } from '../../../core/ranges/lineRange.js';
import { LineTokens } from '../../../tokens/lineTokens.js';
import { Position } from '../../../core/position.js';
import { Range } from '../../../core/range.js';
import { isDefined } from '../../../../../base/common/types.js';



export class TreeSitterTokenizationModel extends Disposable {
	private readonly _tokenStore: TokenStore;
	private _accurateVersion: number;
	private _guessVersion: number;



	private readonly _tokSupport_onDidChangeTokens: Emitter<{ changes: IModelTokensChangedEvent }> = this._register(new Emitter());
	public readonly tokSupport_onDidChangeTokens: Event<{ changes: IModelTokensChangedEvent }> = this._tokSupport_onDidChangeTokens.event;
	private readonly _tokSupport_onDidCompleteBackgroundTokenization: Emitter<void> = this._register(new Emitter());
	public readonly tokSupport_onDidChangeBackgroundTokenization: Event<void> = this._tokSupport_onDidCompleteBackgroundTokenization.event;
	private _tokSupport_colorThemeData!: ColorThemeData;
	private _tokSupport_languageAddedListener: IDisposable | undefined;
	private _tokSupport_encodedLanguage: LanguageId | undefined;

	private _visibleLineRanges: IObservable<readonly LineRange[]>;

	private get _textModel() {
		return this._treeSitterModel.textModel;
	}

	constructor(
		private readonly _treeSitterModel: TreeSitterModel,
		private readonly _highlightingQueries: TreeSitter.Query,
		private readonly _languageIdCodec: ILanguageIdCodec,

		@IWorkbenchThemeService private readonly _themeService: IWorkbenchThemeService,

		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._visibleLineRanges = constObservable([new LineRange(1, 50)]); // TODO

		this._tokenStore = this._register(new TokenStore(this._textModel));
		this._accurateVersion = this._textModel.getVersionId();
		this._guessVersion = this._textModel.getVersionId();
		this._tokenStore.buildStore(this._createEmptyTokens(), TokenQuality.None);

		this._register(autorun(reader => {
			const visibleLineRanges = this._visibleLineRanges.read(reader);
			this._tokSupport_parseAndTokenizeViewPort(visibleLineRanges);
		}));

		// TODO: handle theme changes!
		// TODO handle the case that the tree is initially set on the tree model!

		this._register(this._treeSitterModel.onDidUpdate((e) => {

			if (this._hasTokens()) {
				// Mark the range for refresh immediately

				for (const range of e.ranges) {
					this._markForRefresh(range.newRange);
				}
			}

			// First time we see a tree we need to build a token store.
			if (!this._hasTokens()) {
				// This will likely not happen as we first handle all models, which are ready before trees.
				this._firstTreeUpdate(e.versionId);
			} else {
				this._tokSupport_handleTreeUpdate(e.ranges, e.versionId);
			}
		}));
	}

	public handleContentChanged(e: IModelContentChangedEvent): void {
		this._guessVersion = e.versionId;
		for (const change of e.changes) {
			if (change.text.length > change.rangeLength) {
				// If possible, use the token before the change as the starting point for the new token.
				// This is more likely to let the new text be the correct color as typeing is usually at the end of the token.
				const offset = change.rangeOffset > 0 ? change.rangeOffset - 1 : change.rangeOffset;
				const oldToken = this._tokenStore.getTokenAt(offset);
				let newToken: TokenUpdate;
				if (oldToken) {
					// Insert. Just grow the token at this position to include the insert.
					newToken = { startOffsetInclusive: oldToken.startOffsetInclusive, length: oldToken.length + change.text.length - change.rangeLength, token: oldToken.token };
					// Also mark tokens that are in the range of the change as needing a refresh.
					this._tokenStore.markForRefresh(offset, change.rangeOffset + (change.text.length > change.rangeLength ? change.text.length : change.rangeLength));
				} else {
					// The document got larger and the change is at the end of the document.
					newToken = { startOffsetInclusive: offset, length: change.text.length, token: 0 };
				}
				this._tokenStore.update(oldToken?.length ?? 0, [newToken], TokenQuality.EditGuess);
			} else if (change.text.length < change.rangeLength) {
				// Delete. Delete the tokens at the corresponding range.
				const deletedCharCount = change.rangeLength - change.text.length;
				this._tokenStore.delete(deletedCharCount, change.rangeOffset);
			}
		}
	}


	public getLineTokens(lineNumber: number) {
		const content = this._textModel.getLineContent(lineNumber);

		const rawTokens = this.getTokens(lineNumber);
		if (rawTokens && rawTokens.length > 0) {
			return new LineTokens(rawTokens, content, this._languageIdCodec);
		}
		return LineTokens.createEmpty(content, this._languageIdCodec);
	}



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



	public hasAccurateTokensForLine(lineNumber: number): boolean {
		return this._hasTokens(new Range(lineNumber, 1, lineNumber, this._textModel.getLineMaxColumn(lineNumber)));
	}

	public tokenizeLinesAt(lineNumber: number, lines: string[]): LineTokens[] | null {
		const rawLineTokens = this._tokSupport_guessTokensForLinesContent(lineNumber, lines);
		const lineTokens: LineTokens[] = [];
		if (!rawLineTokens) {
			return null;
		}
		for (let i = 0; i < rawLineTokens.length; i++) {
			lineTokens.push(new LineTokens(rawLineTokens[i], lines[i], this._languageIdCodec));
		}
		return lineTokens;
	}

	private _rangeHasTokens(range: Range, minimumTokenQuality: TokenQuality): boolean {
		return this._tokenStore.rangeHasTokens(this._textModel.getOffsetAt(range.getStartPosition()), this._textModel.getOffsetAt(range.getEndPosition()), minimumTokenQuality);
	}

	private _hasTokens(accurateForRange?: Range): boolean {
		if (!accurateForRange || (this._guessVersion === this._accurateVersion)) {
			return true;
		}

		return !this._tokenStore.rangeNeedsRefresh(this._textModel.getOffsetAt(accurateForRange.getStartPosition()), this._textModel.getOffsetAt(accurateForRange.getEndPosition()));
	}

	public getTokens(line: number): Uint32Array | undefined {
		const lineStartOffset = this._textModel.getOffsetAt({ lineNumber: line, column: 1 });
		const lineTokens = this._tokenStore.getTokensInRange(lineStartOffset, this._textModel.getOffsetAt({ lineNumber: line, column: this._textModel.getLineLength(line) }) + 1);
		const result = new Uint32Array(lineTokens.length * 2);
		for (let i = 0; i < lineTokens.length; i++) {
			result[i * 2] = lineTokens[i].startOffsetInclusive - lineStartOffset + lineTokens[i].length;
			result[i * 2 + 1] = lineTokens[i].token;
		}
		return result;
	}

	private _updateTokensInStore(version: number, updates: { oldRangeLength?: number; newTokens: TokenUpdate[] }[], tokenQuality: TokenQuality): void {
		this._accurateVersion = version;
		for (const update of updates) {
			const lastToken = update.newTokens.length > 0 ? update.newTokens[update.newTokens.length - 1] : undefined;
			let oldRangeLength: number;
			if (lastToken && (this._guessVersion >= version)) {
				oldRangeLength = lastToken.startOffsetInclusive + lastToken.length - update.newTokens[0].startOffsetInclusive;
			} else if (update.oldRangeLength) {
				oldRangeLength = update.oldRangeLength;
			} else {
				oldRangeLength = 0;
			}
			this._tokenStore.update(oldRangeLength, update.newTokens, tokenQuality);
		}
	}

	private _markForRefresh(range: Range): void {
		this._tokenStore.markForRefresh(this._textModel.getOffsetAt(range.getStartPosition()), this._textModel.getOffsetAt(range.getEndPosition()));
	}

	private _getNeedsRefresh(): { range: Range; startOffset: number; endOffset: number }[] {
		const needsRefreshOffsetRanges = this._tokenStore.getNeedsRefresh();
		if (!needsRefreshOffsetRanges) {
			return [];
		}
		return needsRefreshOffsetRanges.map(range => ({
			range: Range.fromPositions(this._textModel.getPositionAt(range.startOffset), this._textModel.getPositionAt(range.endOffset)),
			startOffset: range.startOffset,
			endOffset: range.endOffset
		}));
	}










	private get _encodedLanguageId(): LanguageId {
		if (!this._tokSupport_encodedLanguage) {
			this._tokSupport_encodedLanguage = this._languageIdCodec.encodeLanguageId(this._treeSitterModel.languageId);
		}
		return this._tokSupport_encodedLanguage;
	}

	private _tokSupport_parseAndTokenizeViewPort(lineRanges: readonly LineRange[]) {
		const viewportRanges = lineRanges.map(r => r.toInclusiveRange()).filter(isDefined);
		for (const range of viewportRanges) {
			const startOffsetOfRangeInDocument = this._textModel.getOffsetAt(range.getStartPosition());
			const endOffsetOfRangeInDocument = this._textModel.getOffsetAt(range.getEndPosition());
			const version = this._textModel.getVersionId();
			if (this._rangeHasTokens(range, TokenQuality.ViewportGuess)) {
				continue;
			}
			const content = this._textModel.getValueInRange(range);
			const tokenUpdates = this._tokSupport_forceParseAndTokenizeContent(range, startOffsetOfRangeInDocument, endOffsetOfRangeInDocument, content, true);
			if (!tokenUpdates || this._rangeHasTokens(range, TokenQuality.ViewportGuess)) {
				continue;
			}
			if (tokenUpdates.length === 0) {
				continue;
			}
			const lastToken = tokenUpdates[tokenUpdates.length - 1];
			const oldRangeLength = lastToken.startOffsetInclusive + lastToken.length - tokenUpdates[0].startOffsetInclusive;
			this._updateTokensInStore(version, [{ newTokens: tokenUpdates, oldRangeLength }], TokenQuality.ViewportGuess);
			this._tokSupport_onDidChangeTokens.fire({ changes: { semanticTokensApplied: false, ranges: [{ fromLineNumber: range.startLineNumber, toLineNumber: range.endLineNumber }] } });
		}
	}

	private _tokSupport_guessTokensForLinesContent(lineNumber: number, lines: string[]): Uint32Array[] | undefined {
		if (lines.length === 0) {
			return undefined;
		}
		const lineContent = lines.join(this._textModel.getEOL());
		const range = new Range(1, 1, lineNumber + lines.length, lines[lines.length - 1].length + 1);
		const startOffset = this._textModel.getOffsetAt({ lineNumber, column: 1 });
		const tokens = this._tokSupport_forceParseAndTokenizeContent(range, startOffset, startOffset + lineContent.length, lineContent, false);
		if (!tokens) {
			return undefined;
		}
		const tokensByLine: Uint32Array[] = new Array(lines.length);
		let tokensIndex: number = 0;
		let tokenStartOffset = 0;
		let lineStartOffset = 0;
		for (let i = 0; i < lines.length; i++) {
			const tokensForLine: EndOffsetToken[] = [];
			let moveToNextLine = false;
			for (let j = tokensIndex; (!moveToNextLine && (j < tokens.length)); j++) {
				const token = tokens[j];
				const lineAdjustedEndOffset = token.endOffset - lineStartOffset;
				const lineAdjustedStartOffset = tokenStartOffset - lineStartOffset;
				if (lineAdjustedEndOffset <= lines[i].length) {
					tokensForLine.push({ endOffset: lineAdjustedEndOffset, metadata: token.metadata });
					tokensIndex++;
				} else if (lineAdjustedStartOffset < lines[i].length) {
					const partialToken: EndOffsetToken = { endOffset: lines[i].length, metadata: token.metadata };
					tokensForLine.push(partialToken);
					moveToNextLine = true;
				} else {
					moveToNextLine = true;
				}
				tokenStartOffset = token.endOffset;
			}

			tokensByLine[i] = this._tokSupport_endOffsetTokensToUint32Array(tokensForLine);
			lineStartOffset += lines[i].length + this._textModel.getEOL().length;
		}

		return tokensByLine;
	}

	private _tokSupport_forceParseAndTokenizeContent(range: Range, startOffsetOfRangeInDocument: number, endOffsetOfRangeInDocument: number, content: string, asUpdate: true): TokenUpdate[] | undefined;
	private _tokSupport_forceParseAndTokenizeContent(range: Range, startOffsetOfRangeInDocument: number, endOffsetOfRangeInDocument: number, content: string, asUpdate: false): EndOffsetToken[] | undefined;
	private _tokSupport_forceParseAndTokenizeContent(range: Range, startOffsetOfRangeInDocument: number, endOffsetOfRangeInDocument: number, content: string, asUpdate: boolean): EndOffsetToken[] | TokenUpdate[] | undefined {
		const likelyRelevantLines = findLikelyRelevantLines(this._textModel, range.startLineNumber).likelyRelevantLines;
		const likelyRelevantPrefix = likelyRelevantLines.join(this._textModel.getEOL());

		const tree = this._treeSitterModel.createParsedTreeSync(`${likelyRelevantPrefix}${content}`);
		if (!tree) {
			return;
		}

		const treeRange = new Range(1, 1, range.endLineNumber - range.startLineNumber + 1 + likelyRelevantLines.length, range.endColumn);
		const captures = this._tokSupport_captureAtRange(treeRange);
		const tokens = this._tokSupport_tokenizeCapturesWithMetadata(captures, likelyRelevantPrefix.length, endOffsetOfRangeInDocument - startOffsetOfRangeInDocument + likelyRelevantPrefix.length);
		tree.delete();

		if (!tokens) {
			return;
		}

		if (asUpdate) {
			return this._tokSupport_rangeTokensAsUpdates(startOffsetOfRangeInDocument, tokens.endOffsetsAndMetadata, likelyRelevantPrefix.length);
		} else {
			return tokens.endOffsetsAndMetadata;
		}
	}


	private _firstTreeUpdate(versionId: number) {
		return this._tokSupport_setViewPortTokens(versionId);
	}

	private _tokSupport_setViewPortTokens(versionId: number) {
		const maxLine = this._textModel.getLineCount();
		let rangeChanges: RangeChange[];
		const editor = this._tokSupport_codeEditors.getEditorForModel(this._textModel);
		if (editor) {
			const viewPort = editor.getVisibleRangesPlusViewportAboveBelow();
			const ranges: { readonly fromLineNumber: number; readonly toLineNumber: number }[] = new Array(viewPort.length);
			rangeChanges = new Array(viewPort.length);

			for (let i = 0; i < viewPort.length; i++) {
				const range = viewPort[i];
				ranges[i] = { fromLineNumber: range.startLineNumber, toLineNumber: range.endLineNumber < maxLine ? range.endLineNumber : maxLine };
				const newRangeStartOffset = this._textModel.getOffsetAt(range.getStartPosition());
				const newRangeEndOffset = this._textModel.getOffsetAt(range.getEndPosition());
				rangeChanges[i] = {
					newRange: range,
					newRangeStartOffset,
					newRangeEndOffset,
				};
			}
		} else {
			const valueLength = this._textModel.getValueLength();
			rangeChanges = [{ newRange: new Range(1, 1, maxLine, this._textModel.getLineMaxColumn(maxLine)), newRangeStartOffset: 0, newRangeEndOffset: valueLength }];
		}
		return this._tokSupport_handleTreeUpdate(rangeChanges, versionId);
	}

	/**
	 * Do not await in this method, it will cause a race
	 */
	private _tokSupport_handleTreeUpdate(ranges: RangeChange[], versionId: number) {
		const tree = this._treeSitterModel.tree.get();
		if (!tree) {
			return;
		}

		const rangeChanges: RangeWithOffsets[] = [];
		const chunkSize = 1000;

		for (let i = 0; i < ranges.length; i++) {
			const rangeLinesLength = ranges[i].newRange.endLineNumber - ranges[i].newRange.startLineNumber;
			if (rangeLinesLength > chunkSize) {
				// Split the range into chunks to avoid long operations
				const fullRangeEndLineNumber = ranges[i].newRange.endLineNumber;
				let chunkLineStart = ranges[i].newRange.startLineNumber;
				let chunkColumnStart = ranges[i].newRange.startColumn;
				let chunkLineEnd = chunkLineStart + chunkSize;
				do {
					const chunkStartingPosition = new Position(chunkLineStart, chunkColumnStart);
					const chunkEndColumn = ((chunkLineEnd === ranges[i].newRange.endLineNumber) ? ranges[i].newRange.endColumn : this._textModel.getLineMaxColumn(chunkLineEnd));
					const chunkEndPosition = new Position(chunkLineEnd, chunkEndColumn);
					const chunkRange = Range.fromPositions(chunkStartingPosition, chunkEndPosition);

					rangeChanges.push({
						range: chunkRange,
						startOffset: this._textModel.getOffsetAt(chunkRange.getStartPosition()),
						endOffset: this._textModel.getOffsetAt(chunkRange.getEndPosition())
					});

					chunkLineStart = chunkLineEnd + 1;
					chunkColumnStart = 1;
					if (chunkLineEnd < fullRangeEndLineNumber && chunkLineEnd + chunkSize > fullRangeEndLineNumber) {
						chunkLineEnd = fullRangeEndLineNumber;
					} else {
						chunkLineEnd = chunkLineEnd + chunkSize;
					}
				} while (chunkLineEnd <= fullRangeEndLineNumber);
			} else {
				// Check that the previous range doesn't overlap
				if ((i === 0) || (rangeChanges[i - 1].endOffset < ranges[i].newRangeStartOffset)) {
					rangeChanges.push({
						range: ranges[i].newRange,
						startOffset: ranges[i].newRangeStartOffset,
						endOffset: ranges[i].newRangeEndOffset
					});
				} else if (rangeChanges[i - 1].endOffset < ranges[i].newRangeEndOffset) {
					// clip the range to the previous range
					const startPosition = this._textModel.getPositionAt(rangeChanges[i - 1].endOffset + 1);
					const range = new Range(startPosition.lineNumber, startPosition.column, ranges[i].newRange.endLineNumber, ranges[i].newRange.endColumn);
					rangeChanges.push({
						range,
						startOffset: rangeChanges[i - 1].endOffset + 1,
						endOffset: ranges[i].newRangeEndOffset
					});
				}
			}

		}

		// Get the captures immediately while the text model is correct
		const captures = rangeChanges.map(range => this._tokSupport_getCaptures(range.range));
		// Don't block
		return this._tokSupport_updateTreeForRanges(rangeChanges, versionId, captures).then(() => {
			if (!this._textModel.isDisposed() && (this._treeSitterModel.versionId === this._textModel.getVersionId())) {
				this._tokSupport_refreshNeedsRefresh(versionId);
			}

		});
	}

	private async _tokSupport_updateTreeForRanges(rangeChanges: RangeWithOffsets[], versionId: number, captures: QueryCapture[][]) {
		let tokenUpdate: { newTokens: TokenUpdate[] } | undefined;

		for (let i = 0; i < rangeChanges.length; i++) {
			if (!this._textModel.isDisposed() && versionId !== this._textModel.getVersionId()) {
				// Our captures have become invalid and we need to re-capture
				break;
			}
			const capture = captures[i];
			const range = rangeChanges[i];

			const updates = this._tokSupport_getTokensInRange(range.range, range.startOffset, range.endOffset, capture);
			if (updates) {
				tokenUpdate = { newTokens: updates };
			} else {
				tokenUpdate = { newTokens: [] };
			}
			this._updateTokensInStore(versionId, [tokenUpdate], TokenQuality.Accurate);
			this._tokSupport_onDidChangeTokens.fire({
				changes: {
					semanticTokensApplied: false,
					ranges: [{ fromLineNumber: range.range.getStartPosition().lineNumber, toLineNumber: range.range.getEndPosition().lineNumber }]
				}
			});
			await new Promise<void>(resolve => setTimeout0(resolve));
		}
		this._tokSupport_onDidCompleteBackgroundTokenization.fire();
	}

	private _tokSupport_refreshNeedsRefresh(versionId: number) {
		const rangesToRefresh = this._getNeedsRefresh();
		if (rangesToRefresh.length === 0) {
			return;
		}
		const rangeChanges: RangeChange[] = new Array(rangesToRefresh.length);

		for (let i = 0; i < rangesToRefresh.length; i++) {
			const range = rangesToRefresh[i];
			rangeChanges[i] = {
				newRange: range.range,
				newRangeStartOffset: range.startOffset,
				newRangeEndOffset: range.endOffset
			};
		}

		this._tokSupport_handleTreeUpdate(rangeChanges, versionId);
	}

	private _tokSupport_rangeTokensAsUpdates(rangeOffset: number, endOffsetToken: EndOffsetToken[], startingOffsetInArray?: number) {
		const updates: TokenUpdate[] = [];
		let lastEnd = 0;
		for (const token of endOffsetToken) {
			if (token.endOffset <= lastEnd || (startingOffsetInArray && (token.endOffset < startingOffsetInArray))) {
				continue;
			}
			let tokenUpdate: TokenUpdate;
			if (startingOffsetInArray && (lastEnd < startingOffsetInArray)) {
				tokenUpdate = { startOffsetInclusive: rangeOffset + startingOffsetInArray, length: token.endOffset - startingOffsetInArray, token: token.metadata };
			} else {
				tokenUpdate = { startOffsetInclusive: rangeOffset + lastEnd, length: token.endOffset - lastEnd, token: token.metadata };
			}
			updates.push(tokenUpdate);
			lastEnd = token.endOffset;
		}
		return updates;
	}

	private _tokSupport_getTokensInRange(range: Range, rangeStartOffset: number, rangeEndOffset: number, captures?: QueryCapture[]): TokenUpdate[] | undefined {
		const tokens = captures ? this._tokSupport_tokenizeCapturesWithMetadata(captures, rangeStartOffset, rangeEndOffset) : this._tokSupport_tokenize(range, rangeStartOffset, rangeEndOffset);
		if (tokens?.endOffsetsAndMetadata) {
			return this._tokSupport_rangeTokensAsUpdates(rangeStartOffset, tokens.endOffsetsAndMetadata);
		}
		return undefined;
	}

	private _tokSupport_ensureQuery() {
		if (!this._tokSupport_query) {
			const language = this._treeSitterService.getOrInitLanguage(this._languageId);
			if (!language) {
				if (!this._tokSupport_languageAddedListener) {
					this._tokSupport_languageAddedListener = this._register(Event.onceIf(this._treeSitterService.onDidAddLanguage, e => e.id === this._languageId)((e) => {
						this._tokSupport_query = new this.Query(e.language, this._highlightingQueries);
					}));
				}
				return;
			}
			this._tokSupport_query = new this.Query(language, this._highlightingQueries);
		}
		return this._tokSupport_query;
	}

	// private _tokSupport_updateTheme(e: IWorkbenchColorTheme | undefined) {
	// 	this._tokSupport_colorThemeData = this._themeService.getColorTheme() as ColorThemeData;
	// 	for (const model of this._tokSupport_codeEditors.textModels) {
	// 		const modelRange = model.getFullModelRange();
	// 		this._markForRefresh(model, modelRange);
	// 		const editor = this._tokSupport_codeEditors.getEditorForModel(model);
	// 		if (editor) {
	// 			this._tokSupport_parseAndTokenizeViewPort(this._visibleLineRanges.get());
	// 		}
	// 	}
	// }

	// Was used for inspect editor tokens command
	tokSupport_captureAtPosition(lineNumber: number, column: number): QueryCapture[] {
		const captures = this._tokSupport_captureAtRangeWithInjections(new Range(lineNumber, column, lineNumber, column + 1));
		return captures;
	}

	// Was used for the colorization tests
	tokSupport_captureAtRangeTree(range: Range): QueryCapture[] {
		const captures = this._tokSupport_captureAtRangeWithInjections(range);
		return captures;
	}

	private _tokSupport_captureAtRange(range: Range): QueryCapture[] {
		const tree = this._treeSitterModel.tree.get();
		if (!tree) {
			return [];
		}
		// Tree sitter row is 0 based, column is 0 based
		return this._highlightingQueries.captures(tree.rootNode, { startPosition: { row: range.startLineNumber - 1, column: range.startColumn - 1 }, endPosition: { row: range.endLineNumber - 1, column: range.endColumn - 1 } }).map(capture => (
			{
				name: capture.name,
				text: capture.node.text,
				node: {
					startIndex: capture.node.startIndex,
					endIndex: capture.node.endIndex,
					startPosition: {
						lineNumber: capture.node.startPosition.row + 1,
						column: capture.node.startPosition.column + 1
					},
					endPosition: {
						lineNumber: capture.node.endPosition.row + 1,
						column: capture.node.endPosition.column + 1
					}
				},
				encodedLanguageId: this._encodedLanguageId
			}
		));
	}

	private _tokSupport_captureAtRangeWithInjections(range: Range): QueryCapture[] {
		if (!textModelTreeSitter?.parseResult) {
			return [];
		}
		const captures: QueryCapture[] = this._tokSupport_captureAtRange(range);
		for (let i = 0; i < captures.length; i++) {
			const capture = captures[i];

			const capStartLine = capture.node.startPosition.lineNumber;
			const capEndLine = capture.node.endPosition.lineNumber;
			const capStartColumn = capture.node.startPosition.column;
			const capEndColumn = capture.node.endPosition.column;

			const startLine = ((capStartLine > range.startLineNumber) && (capStartLine < range.endLineNumber)) ? capStartLine : range.startLineNumber;
			const endLine = ((capEndLine > range.startLineNumber) && (capEndLine < range.endLineNumber)) ? capEndLine : range.endLineNumber;
			const startColumn = (capStartLine === range.startLineNumber) ? (capStartColumn < range.startColumn ? range.startColumn : capStartColumn) : (capStartLine < range.startLineNumber ? range.startColumn : capStartColumn);
			const endColumn = (capEndLine === range.endLineNumber) ? (capEndColumn > range.endColumn ? range.endColumn : capEndColumn) : (capEndLine > range.endLineNumber ? range.endColumn : capEndColumn);
			const injectionRange = new Range(startLine, startColumn, endLine, endColumn);

			const injection = this._tokSupport_getInjectionCaptures(capture, injectionRange);
			if (injection && injection.length > 0) {
				captures.splice(i + 1, 0, ...injection);
				i += injection.length;
			}
		}
		return captures;
	}

	/**
	 * Gets the tokens for a given line.
	 * Each token takes 2 elements in the array. The first element is the offset of the end of the token *in the line, not in the document*, and the second element is the metadata.
	 *
	 * @param lineNumber
	 * @returns
	 */
	public tokSupport_tokenizeEncoded(lineNumber: number) {
		const tokens = this._tokSupport_tokenizeEncoded(lineNumber);
		if (!tokens) {
			return undefined;
		}
		const updates = this._tokSupport_rangeTokensAsUpdates(this._textModel.getOffsetAt({ lineNumber, column: 1 }), tokens.result);
		if (tokens.versionId === this._textModel.getVersionId()) {
			this._updateTokensInStore(tokens.versionId, [{ newTokens: updates, oldRangeLength: this._textModel.getLineLength(lineNumber) }], TokenQuality.Accurate);
		}
	}

	public tokSupport_tokenizeEncodedInstrumented(lineNumber: number): { result: Uint32Array; captureTime: number; metadataTime: number } | undefined {
		const tokens = this._tokSupport_tokenizeEncoded(lineNumber);
		if (!tokens) {
			return undefined;
		}
		return { result: this._tokSupport_endOffsetTokensToUint32Array(tokens.result), captureTime: tokens.captureTime, metadataTime: tokens.metadataTime };
	}

	private _tokSupport_getCaptures(range: Range): QueryCapture[] {
		const captures = this._tokSupport_captureAtRangeWithInjections(range);
		return captures;
	}

	private _tokSupport_tokenize(range: Range, rangeStartOffset: number, rangeEndOffset: number): { endOffsetsAndMetadata: { endOffset: number; metadata: number }[]; versionId: number; captureTime: number; metadataTime: number } | undefined {
		const captures = this._tokSupport_getCaptures(range);
		const result = this._tokSupport_tokenizeCapturesWithMetadata(captures, rangeStartOffset, rangeEndOffset);
		if (!result) {
			return undefined;
		}
		return { ...result, versionId: this._treeSitterModel.versionId };
	}

	private _tokSupport_createTokensFromCaptures(captures: QueryCapture[], rangeStartOffset: number, rangeEndOffset: number): { endOffsets: EndOffsetAndScopes[]; captureTime: number } | undefined {
		const tree = this._treeSitterModel.tree.get();
		const stopwatch = StopWatch.create();
		const rangeLength = rangeEndOffset - rangeStartOffset;
		const encodedLanguageId = this._languageIdCodec.encodeLanguageId(this._treeSitterModel.languageId);
		const baseScope: string = TREESITTER_BASE_SCOPES[this._treeSitterModel.languageId] || 'source';

		if (captures.length === 0) {
			if (tree) {
				stopwatch.stop();
				const endOffsetsAndMetadata = [{ endOffset: rangeLength, scopes: [], encodedLanguageId }];
				return { endOffsets: endOffsetsAndMetadata, captureTime: stopwatch.elapsed() };
			}
			return undefined;
		}

		const endOffsetsAndScopes: EndOffsetAndScopes[] = Array(captures.length);
		endOffsetsAndScopes.fill({ endOffset: 0, scopes: [baseScope], encodedLanguageId });
		let tokenIndex = 0;

		const increaseSizeOfTokensByOneToken = () => {
			endOffsetsAndScopes.push({ endOffset: 0, scopes: [baseScope], encodedLanguageId });
		};

		const brackets = (capture: QueryCapture, startOffset: number): number[] | undefined => {
			return (capture.name.includes('punctuation') && capture.text) ? Array.from(capture.text.matchAll(BRACKETS)).map(match => startOffset + match.index) : undefined;
		};

		const addCurrentTokenToArray = (capture: QueryCapture, startOffset: number, endOffset: number, position?: number) => {
			if (position !== undefined) {
				const oldScopes = endOffsetsAndScopes[position].scopes;
				let oldBracket = endOffsetsAndScopes[position].bracket;
				// Check that the previous token ends at the same point that the current token starts
				const prevEndOffset = position > 0 ? endOffsetsAndScopes[position - 1].endOffset : 0;
				if (prevEndOffset !== startOffset) {
					let preInsertBracket: number[] | undefined = undefined;
					if (oldBracket && oldBracket.length > 0) {
						preInsertBracket = [];
						const postInsertBracket: number[] = [];
						for (let i = 0; i < oldBracket.length; i++) {
							const bracket = oldBracket[i];
							if (bracket < startOffset) {
								preInsertBracket.push(bracket);
							} else if (bracket > endOffset) {
								postInsertBracket.push(bracket);
							}
						}
						if (preInsertBracket.length === 0) {
							preInsertBracket = undefined;
						}
						if (postInsertBracket.length === 0) {
							oldBracket = undefined;
						} else {
							oldBracket = postInsertBracket;
						}
					}
					// We need to add some of the position token to cover the space
					endOffsetsAndScopes.splice(position, 0, { endOffset: startOffset, scopes: [...oldScopes], bracket: preInsertBracket, encodedLanguageId: capture.encodedLanguageId });
					position++;
					increaseSizeOfTokensByOneToken();
					tokenIndex++;
				}

				endOffsetsAndScopes.splice(position, 0, { endOffset: endOffset, scopes: [...oldScopes, capture.name], bracket: brackets(capture, startOffset), encodedLanguageId: capture.encodedLanguageId });
				endOffsetsAndScopes[tokenIndex].bracket = oldBracket;
			} else {
				endOffsetsAndScopes[tokenIndex] = { endOffset: endOffset, scopes: [baseScope, capture.name], bracket: brackets(capture, startOffset), encodedLanguageId: capture.encodedLanguageId };
			}
			tokenIndex++;
		};

		for (let captureIndex = 0; captureIndex < captures.length; captureIndex++) {
			const capture = captures[captureIndex];
			const tokenEndIndex = capture.node.endIndex < rangeEndOffset ? ((capture.node.endIndex < rangeStartOffset) ? rangeStartOffset : capture.node.endIndex) : rangeEndOffset;
			const tokenStartIndex = capture.node.startIndex < rangeStartOffset ? rangeStartOffset : capture.node.startIndex;

			const endOffset = tokenEndIndex - rangeStartOffset;

			// Not every character will get captured, so we need to make sure that our current capture doesn't bleed toward the start of the line and cover characters that it doesn't apply to.
			// We do this by creating a new token in the array if the previous token ends before the current token starts.
			let previousEndOffset: number;
			const currentTokenLength = tokenEndIndex - tokenStartIndex;
			if (captureIndex > 0) {
				previousEndOffset = endOffsetsAndScopes[(tokenIndex - 1)].endOffset;
			} else {
				previousEndOffset = tokenStartIndex - rangeStartOffset - 1;
			}
			const startOffset = endOffset - currentTokenLength;
			if ((previousEndOffset >= 0) && (previousEndOffset < startOffset)) {
				// Add en empty token to cover the space where there were no captures
				endOffsetsAndScopes[tokenIndex] = { endOffset: startOffset, scopes: [baseScope], encodedLanguageId: this._encodedLanguageId };
				tokenIndex++;

				increaseSizeOfTokensByOneToken();
			}

			if (currentTokenLength < 0) {
				// This happens when we have a token "gap" right at the end of the capture range. The last capture isn't used because it's start index isn't included in the range.
				continue;
			}

			if (previousEndOffset >= endOffset) {
				// walk back through the tokens until we find the one that contains the current token
				let withinTokenIndex = tokenIndex - 1;
				let previousTokenEndOffset = endOffsetsAndScopes[withinTokenIndex].endOffset;

				let previousTokenStartOffset = ((withinTokenIndex >= 2) ? endOffsetsAndScopes[withinTokenIndex - 1].endOffset : 0);
				do {

					// Check that the current token doesn't just replace the last token
					if ((previousTokenStartOffset + currentTokenLength) === previousTokenEndOffset) {
						if (previousTokenStartOffset === startOffset) {
							// Current token and previous token span the exact same characters, add the scopes to the previous token
							endOffsetsAndScopes[withinTokenIndex].scopes.push(capture.name);
							const oldBracket = endOffsetsAndScopes[withinTokenIndex].bracket;
							endOffsetsAndScopes[withinTokenIndex].bracket = ((oldBracket && (oldBracket.length > 0)) ? oldBracket : brackets(capture, startOffset));
						}
					} else if (previousTokenStartOffset <= startOffset) {
						addCurrentTokenToArray(capture, startOffset, endOffset, withinTokenIndex);
						break;
					}
					withinTokenIndex--;
					previousTokenStartOffset = ((withinTokenIndex >= 1) ? endOffsetsAndScopes[withinTokenIndex - 1].endOffset : 0);
					previousTokenEndOffset = ((withinTokenIndex >= 0) ? endOffsetsAndScopes[withinTokenIndex].endOffset : 0);
				} while (previousTokenEndOffset > startOffset);
			} else {
				// Just add the token to the array
				addCurrentTokenToArray(capture, startOffset, endOffset);
			}
		}

		// Account for uncaptured characters at the end of the line
		if ((endOffsetsAndScopes[tokenIndex - 1].endOffset < rangeLength)) {
			if (rangeLength - endOffsetsAndScopes[tokenIndex - 1].endOffset > 0) {
				increaseSizeOfTokensByOneToken();
				endOffsetsAndScopes[tokenIndex] = { endOffset: rangeLength, scopes: endOffsetsAndScopes[tokenIndex].scopes, encodedLanguageId: this._encodedLanguageId };
				tokenIndex++;
			}
		}
		for (let i = 0; i < endOffsetsAndScopes.length; i++) {
			const token = endOffsetsAndScopes[i];
			if (token.endOffset === 0 && i !== 0) {
				endOffsetsAndScopes.splice(i, endOffsetsAndScopes.length - i);
				break;
			}
		}
		const captureTime = stopwatch.elapsed();
		return { endOffsets: endOffsetsAndScopes as { endOffset: number; scopes: string[]; encodedLanguageId: LanguageId }[], captureTime };
	}

	private _tokSupport_getInjectionCaptures(parentCapture: QueryCapture, range: Range) {
		const injection = textModelTreeSitter.getInjection(parentCapture.node.startIndex, this._treeSitterModel.languageId);
		if (!injection?.tree || injection.versionId !== textModelTreeSitter.parseResult?.versionId) {
			return undefined;
		}

		const feature = TreeSitterTokenizationRegistry.get(injection.languageId);
		if (!feature) {
			return undefined;
		}
		return feature.tokSupport_captureAtRangeTree(range, injection.tree, textModelTreeSitter);
	}

	private _tokSupport_tokenizeCapturesWithMetadata(captures: QueryCapture[], rangeStartOffset: number, rangeEndOffset: number): { endOffsetsAndMetadata: EndOffsetToken[]; captureTime: number; metadataTime: number } | undefined {
		const stopwatch = StopWatch.create();
		const emptyTokens = this._tokSupport_createTokensFromCaptures(captures, rangeStartOffset, rangeEndOffset);
		if (!emptyTokens) {
			return undefined;
		}
		const endOffsetsAndScopes: EndOffsetWithMeta[] = emptyTokens.endOffsets;
		for (let i = 0; i < endOffsetsAndScopes.length; i++) {
			const token = endOffsetsAndScopes[i];
			token.metadata = findMetadata(this._tokSupport_colorThemeData, token.scopes, token.encodedLanguageId, !!token.bracket && (token.bracket.length > 0));
		}

		const metadataTime = stopwatch.elapsed();
		return { endOffsetsAndMetadata: endOffsetsAndScopes as { endOffset: number; scopes: string[]; metadata: number }[], captureTime: emptyTokens.captureTime, metadataTime };
	}

	private _tokSupport_tokenizeEncoded(lineNumber: number): { result: EndOffsetToken[]; captureTime: number; metadataTime: number; versionId: number } | undefined {
		const lineOffset = this._textModel.getOffsetAt({ lineNumber: lineNumber, column: 1 });
		const maxLine = this._textModel.getLineCount();
		const lineEndOffset = (lineNumber + 1 <= maxLine) ? this._textModel.getOffsetAt({ lineNumber: lineNumber + 1, column: 1 }) : this._textModel.getValueLength();
		const lineLength = lineEndOffset - lineOffset;

		const result = this._tokSupport_tokenize(new Range(lineNumber, 1, lineNumber, lineLength + 1), lineOffset, lineEndOffset);
		if (!result) {
			return undefined;
		}
		return { result: result.endOffsetsAndMetadata, captureTime: result.captureTime, metadataTime: result.metadataTime, versionId: result.versionId };
	}

	private _tokSupport_endOffsetTokensToUint32Array(endOffsetsAndMetadata: EndOffsetToken[]): Uint32Array {

		const uint32Array = new Uint32Array(endOffsetsAndMetadata.length * 2);
		for (let i = 0; i < endOffsetsAndMetadata.length; i++) {
			uint32Array[i * 2] = endOffsetsAndMetadata[i].endOffset;
			uint32Array[i * 2 + 1] = endOffsetsAndMetadata[i].metadata;
		}
		return uint32Array;
	}

	override dispose() {
		super.dispose();
		this._highlightingQueries?.delete();
		this._highlightingQueries = undefined;
	}
}










type TreeSitterQueries = string;

interface EndOffsetToken {
	endOffset: number;
	metadata: number;
}

interface EndOffsetAndScopes {
	endOffset: number;
	scopes: string[];
	bracket?: number[];
	encodedLanguageId: LanguageId;
}

interface EndOffsetWithMeta extends EndOffsetAndScopes {
	metadata?: number;
}
export const TREESITTER_BASE_SCOPES: Record<string, string> = {
	'css': 'source.css',
	'typescript': 'source.ts',
	'ini': 'source.ini',
	'regex': 'source.regex',
};

const BRACKETS = /[\{\}\[\]\<\>\(\)]/g;
