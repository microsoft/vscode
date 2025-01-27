/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Parser } from '@vscode/tree-sitter-wasm';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { AppResourcePath, FileAccess } from '../../../../base/common/network.js';
import { ILanguageIdCodec, ITreeSitterTokenizationSupport, LazyTokenizationSupport, QueryCapture, TreeSitterTokenizationRegistry } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { EDITOR_EXPERIMENTAL_PREFER_TREESITTER, ITreeSitterParserService, ITreeSitterParseResult, TreeUpdateEvent, RangeChange } from '../../../../editor/common/services/treeSitterParserService.js';
import { IModelTokensChangedEvent } from '../../../../editor/common/textModelEvents.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ColorThemeData, findMetadata } from '../../themes/common/colorThemeData.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ITreeSitterTokenizationStoreService } from '../../../../editor/common/model/treeSitterTokenStoreService.js';
import { LanguageId } from '../../../../editor/common/encodedTokenAttributes.js';
import { TokenUpdate } from '../../../../editor/common/model/tokenStore.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { setTimeout0 } from '../../../../base/common/platform.js';

const ALLOWED_SUPPORT = ['typescript'];
type TreeSitterQueries = string;

export const ITreeSitterTokenizationFeature = createDecorator<ITreeSitterTokenizationFeature>('treeSitterTokenizationFeature');

export interface ITreeSitterTokenizationFeature {
	_serviceBrand: undefined;
}

interface EndOffsetToken {
	endOffset: number;
	metadata: number;
}

export class TreeSitterTokenizationFeature extends Disposable implements ITreeSitterTokenizationFeature {
	public _serviceBrand: undefined;
	private readonly _tokenizersRegistrations: DisposableMap<string, DisposableStore> = this._register(new DisposableMap());

	constructor(
		@ILanguageService private readonly _languageService: ILanguageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService
	) {
		super();

		this._handleGrammarsExtPoint();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(EDITOR_EXPERIMENTAL_PREFER_TREESITTER)) {
				this._handleGrammarsExtPoint();
			}
		}));
	}

	private _getSetting(): string[] {
		return this._configurationService.getValue<string[]>(EDITOR_EXPERIMENTAL_PREFER_TREESITTER) || [];
	}

	private _handleGrammarsExtPoint(): void {
		const setting = this._getSetting();

		// Eventually, this should actually use an extension point to add tree sitter grammars, but for now they are hard coded in core
		for (const languageId of setting) {
			if (ALLOWED_SUPPORT.includes(languageId) && !this._tokenizersRegistrations.has(languageId)) {
				const lazyTokenizationSupport = new LazyTokenizationSupport(() => this._createTokenizationSupport(languageId));
				const disposableStore = new DisposableStore();
				disposableStore.add(lazyTokenizationSupport);
				disposableStore.add(TreeSitterTokenizationRegistry.registerFactory(languageId, lazyTokenizationSupport));
				this._tokenizersRegistrations.set(languageId, disposableStore);
				TreeSitterTokenizationRegistry.getOrCreate(languageId);
			}
		}
		const languagesToUnregister = [...this._tokenizersRegistrations.keys()].filter(languageId => !setting.includes(languageId));
		for (const languageId of languagesToUnregister) {
			this._tokenizersRegistrations.deleteAndDispose(languageId);
		}
	}

	private async _fetchQueries(newLanguage: string): Promise<TreeSitterQueries> {
		const languageLocation: AppResourcePath = `vs/editor/common/languages/highlights/${newLanguage}.scm`;
		const query = await this._fileService.readFile(FileAccess.asFileUri(languageLocation));
		return query.value.toString();
	}

	private async _createTokenizationSupport(languageId: string): Promise<ITreeSitterTokenizationSupport & IDisposable | null> {
		const queries = await this._fetchQueries(languageId);
		return this._instantiationService.createInstance(TreeSitterTokenizationSupport, queries, languageId, this._languageService.languageIdCodec);
	}
}

export class TreeSitterTokenizationSupport extends Disposable implements ITreeSitterTokenizationSupport {
	private _query: Parser.Query | undefined;
	private readonly _onDidChangeTokens: Emitter<{ textModel: ITextModel; changes: IModelTokensChangedEvent }> = new Emitter();
	public readonly onDidChangeTokens: Event<{ textModel: ITextModel; changes: IModelTokensChangedEvent }> = this._onDidChangeTokens.event;
	private _colorThemeData!: ColorThemeData;
	private _languageAddedListener: IDisposable | undefined;

	constructor(
		private readonly _queries: TreeSitterQueries,
		private readonly _languageId: string,
		private readonly _languageIdCodec: ILanguageIdCodec,
		@ITreeSitterParserService private readonly _treeSitterService: ITreeSitterParserService,
		@IThemeService private readonly _themeService: IThemeService,
		@ITreeSitterTokenizationStoreService private readonly _tokenizationStoreService: ITreeSitterTokenizationStoreService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
	) {
		super();
		this._register(Event.runAndSubscribe(this._themeService.onDidColorThemeChange, () => this.reset()));
		this._register(this._treeSitterService.onDidUpdateTree((e) => {
			if (this._tokenizationStoreService.hasTokens(e.textModel)) {
				// Mark the range for refresh immediately
				for (const range of e.ranges) {
					this._tokenizationStoreService.markForRefresh(e.textModel, range.newRange);
				}
			}
			if (e.versionId !== e.textModel.getVersionId()) {
				return;
			}

			// First time we see a tree we need to build a token store.
			if (!this._tokenizationStoreService.hasTokens(e.textModel)) {
				this._firstTreeUpdate(e.textModel, e.versionId);
			} else {
				this._handleTreeUpdate(e);
			}
		}));
	}

	private _createEmptyTokens(textModel: ITextModel) {
		const languageId = this._languageIdCodec.encodeLanguageId(this._languageId);
		const emptyToken = this._emptyToken(languageId);
		const modelEndOffset = textModel.getValueLength();

		const emptyTokens: TokenUpdate[] = [{ token: emptyToken, length: modelEndOffset, startOffsetInclusive: 0 }];
		return emptyTokens;
	}

	private _firstTreeUpdate(textModel: ITextModel, versionId: number) {
		const tokens: TokenUpdate[] = this._createEmptyTokens(textModel);
		this._tokenizationStoreService.setTokens(textModel, tokens);
		this._setViewPortTokens(textModel, versionId);
	}

	private _setViewPortTokens(textModel: ITextModel, versionId: number) {
		const maxLine = textModel.getLineCount();
		const editor = this._codeEditorService.listCodeEditors().find(editor => editor.getModel() === textModel);
		if (!editor) {
			return;
		}

		const viewPort = editor.getVisibleRangesPlusViewportAboveBelow();
		const ranges: { readonly fromLineNumber: number; readonly toLineNumber: number }[] = new Array(viewPort.length);
		const rangeChanges: RangeChange[] = new Array(viewPort.length);

		for (let i = 0; i < viewPort.length; i++) {
			const range = viewPort[i];
			ranges[i] = { fromLineNumber: range.startLineNumber, toLineNumber: range.endLineNumber < maxLine ? range.endLineNumber : maxLine };
			const newRangeStartOffset = textModel.getOffsetAt(range.getStartPosition());
			const newRangeEndOffset = textModel.getOffsetAt(range.getEndPosition());
			rangeChanges[i] = {
				newRange: range,
				newRangeStartOffset,
				newRangeEndOffset,
				oldRangeLength: newRangeEndOffset - newRangeStartOffset
			};
		}
		this._handleTreeUpdate({ ranges: rangeChanges, textModel, versionId });
	}

	/**
	 * Do not await in this method, it will cause a race
	 */
	private _handleTreeUpdate(e: TreeUpdateEvent) {
		let rangeChanges: RangeChange[] = [];
		const chunkSize = 10000;

		for (let i = 0; i < e.ranges.length; i++) {
			const rangeLength = e.ranges[i].newRangeEndOffset - e.ranges[i].newRangeStartOffset;
			if (e.ranges[i].oldRangeLength === rangeLength) {
				if (rangeLength > chunkSize) {
					// Split the range into chunks to avoid long operations
					const fullRangeEndOffset = e.ranges[i].newRangeEndOffset;
					let chunkStart = e.ranges[i].newRangeStartOffset;
					let chunkEnd = chunkStart + chunkSize;
					let chunkStartingPosition = e.ranges[i].newRange.getStartPosition();
					do {
						const chunkEndPosition = e.textModel.getPositionAt(chunkEnd);
						const chunkRange = Range.fromPositions(chunkStartingPosition, chunkEndPosition);

						rangeChanges.push({
							newRange: chunkRange,
							newRangeStartOffset: chunkStart,
							newRangeEndOffset: chunkEnd,
							oldRangeLength: chunkEnd - chunkStart
						});

						chunkStart = chunkEnd;
						if (chunkEnd < fullRangeEndOffset && chunkEnd + chunkSize > fullRangeEndOffset) {
							chunkEnd = fullRangeEndOffset;
						} else {
							chunkEnd = chunkEnd + chunkSize;
						}
						chunkStartingPosition = chunkEndPosition;
					} while (chunkEnd <= fullRangeEndOffset);
				} else {
					rangeChanges.push(e.ranges[i]);
				}
			} else {
				rangeChanges = e.ranges;
				break;
			}
		}

		// Get the captures immediately while the text model is correct
		const captures = rangeChanges.map(range => this._getTreeAndCaptures(range.newRange, e.textModel));
		// Don't block
		this._updateTreeForRanges(e.textModel, rangeChanges, e.versionId, captures).then(() => {
			const tree = this._getTree(e.textModel);
			if (!e.textModel.isDisposed() && (tree?.versionId === e.textModel.getVersionId())) {
				this._refreshNeedsRefresh(e.textModel);
			}

		});
	}

	private async _updateTreeForRanges(textModel: ITextModel, rangeChanges: RangeChange[], versionId: number, captures: { tree: ITreeSitterParseResult | undefined; captures: QueryCapture[] }[]) {
		let tokenUpdate: { oldRangeLength: number; newTokens: TokenUpdate[] } | undefined;

		for (let i = 0; i < rangeChanges.length; i++) {
			if (versionId !== textModel.getVersionId()) {
				// Our captures have become invalid and we need to re-capture
				break;
			}
			const capture = captures[i];
			const range = rangeChanges[i];

			const updates = this.getTokensInRange(textModel, range.newRange, range.newRangeStartOffset, range.newRangeEndOffset, capture);
			if (updates) {
				tokenUpdate = { oldRangeLength: range.oldRangeLength, newTokens: updates };
			} else {
				tokenUpdate = { oldRangeLength: range.oldRangeLength, newTokens: [] };
			}
			this._tokenizationStoreService.updateTokens(textModel, versionId, [tokenUpdate]);
			this._onDidChangeTokens.fire({
				textModel: textModel,
				changes: {
					semanticTokensApplied: false,
					ranges: [{ fromLineNumber: range.newRange.getStartPosition().lineNumber, toLineNumber: range.newRange.getEndPosition().lineNumber }]
				}
			});
			await new Promise<void>(resolve => setTimeout0(resolve));
		}
	}

	private _refreshNeedsRefresh(textModel: ITextModel) {
		const rangesToRefresh = this._tokenizationStoreService.getNeedsRefresh(textModel);
		if (rangesToRefresh.length === 0) {
			return;
		}
		const rangeChanges: RangeChange[] = new Array(rangesToRefresh.length);

		for (let i = 0; i < rangesToRefresh.length; i++) {
			const range = rangesToRefresh[i];
			rangeChanges[i] = {
				newRange: range.range,
				newRangeStartOffset: range.startOffset,
				newRangeEndOffset: range.endOffset,
				oldRangeLength: range.endOffset - range.startOffset
			};
		}
		this._handleTreeUpdate({ ranges: rangeChanges, textModel, versionId: textModel.getVersionId() });
	}

	private _rangeTokensAsUpdates(rangeOffset: number, endOffsetToken: EndOffsetToken[]) {
		const updates: TokenUpdate[] = [];
		let lastEnd = 0;
		for (const token of endOffsetToken) {
			if (token.endOffset <= lastEnd) {
				continue;
			}
			updates.push({ startOffsetInclusive: rangeOffset + lastEnd, length: token.endOffset - lastEnd, token: token.metadata });
			lastEnd = token.endOffset;
		}
		return updates;
	}

	public getTokensInRange(textModel: ITextModel, range: Range, rangeStartOffset: number, rangeEndOffset: number, captures?: { tree: ITreeSitterParseResult | undefined; captures: QueryCapture[] }): TokenUpdate[] | undefined {
		const languageId = this._languageIdCodec.encodeLanguageId(this._languageId);

		const tokens = captures ? this._tokenizeCapturesWithMetadata(captures.tree, captures.captures, languageId, rangeStartOffset, rangeEndOffset) : this._tokenize(languageId, range, rangeStartOffset, rangeEndOffset, textModel);
		if (tokens?.endOffsetsAndMetadata) {
			return this._rangeTokensAsUpdates(rangeStartOffset, tokens.endOffsetsAndMetadata);
		}
		return undefined;
	}

	private _getTree(textModel: ITextModel): ITreeSitterParseResult | undefined {
		return this._treeSitterService.getParseResult(textModel);
	}

	private _ensureQuery() {
		if (!this._query) {
			const language = this._treeSitterService.getOrInitLanguage(this._languageId);
			if (!language) {
				if (!this._languageAddedListener) {
					this._languageAddedListener = this._register(Event.onceIf(this._treeSitterService.onDidAddLanguage, e => e.id === this._languageId)((e) => {
						this._query = e.language.query(this._queries);
					}));
				}
				return;
			}
			this._query = language.query(this._queries);
		}
		return this._query;
	}

	private reset() {
		this._colorThemeData = this._themeService.getColorTheme() as ColorThemeData;
	}

	captureAtPosition(lineNumber: number, column: number, textModel: ITextModel): QueryCapture[] {
		const tree = this._getTree(textModel);
		const captures = this._captureAtRange(new Range(lineNumber, column, lineNumber, column + 1), tree?.tree);
		return captures;
	}

	captureAtPositionTree(lineNumber: number, column: number, tree: Parser.Tree): QueryCapture[] {
		const captures = this._captureAtRange(new Range(lineNumber, column, lineNumber, column + 1), tree);
		return captures;
	}


	private _captureAtRange(range: Range, tree: Parser.Tree | undefined): QueryCapture[] {
		const query = this._ensureQuery();
		if (!tree || !query) {
			return [];
		}
		// Tree sitter row is 0 based, column is 0 based
		return query.captures(tree.rootNode, { startPosition: { row: range.startLineNumber - 1, column: range.startColumn - 1 }, endPosition: { row: range.endLineNumber - 1, column: range.endColumn - 1 } }).map(capture => (
			{
				name: capture.name,
				text: capture.node.text,
				node: {
					startIndex: capture.node.startIndex,
					endIndex: capture.node.endIndex
				}
			}
		));
	}

	/**
	 * Gets the tokens for a given line.
	 * Each token takes 2 elements in the array. The first element is the offset of the end of the token *in the line, not in the document*, and the second element is the metadata.
	 *
	 * @param lineNumber
	 * @returns
	 */
	public tokenizeEncoded(lineNumber: number, textModel: ITextModel): Uint32Array | undefined {
		return this._tokenizeEncoded(lineNumber, textModel)?.result;
	}

	public tokenizeEncodedInstrumented(lineNumber: number, textModel: ITextModel): { result: Uint32Array; captureTime: number; metadataTime: number } | undefined {
		return this._tokenizeEncoded(lineNumber, textModel);
	}

	private _getTreeAndCaptures(range: Range, textModel: ITextModel): { tree: ITreeSitterParseResult | undefined; captures: QueryCapture[] } {
		const tree = this._getTree(textModel);
		const captures = this._captureAtRange(range, tree?.tree);
		return { tree, captures };
	}

	private _tokenize(encodedLanguageId: LanguageId, range: Range, rangeStartOffset: number, rangeEndOffset: number, textModel: ITextModel): { endOffsetsAndMetadata: { endOffset: number; metadata: number }[]; captureTime: number; metadataTime: number } | undefined {
		const { tree, captures } = this._getTreeAndCaptures(range, textModel);
		return this._tokenizeCapturesWithMetadata(tree, captures, encodedLanguageId, rangeStartOffset, rangeEndOffset);
	}

	private _createTokensFromCaptures(tree: ITreeSitterParseResult | undefined, captures: QueryCapture[], rangeStartOffset: number, rangeEndOffset: number): { endOffsets: { endOffset: number; scopes: string[] }[]; captureTime: number } | undefined {
		const stopwatch = StopWatch.create();
		const rangeLength = rangeEndOffset - rangeStartOffset;

		if (captures.length === 0) {
			if (tree) {
				stopwatch.stop();
				const endOffsetsAndMetadata = [{ endOffset: rangeLength, scopes: [] }];
				return { endOffsets: endOffsetsAndMetadata, captureTime: stopwatch.elapsed() };
			}
			return undefined;
		}

		const endOffsetsAndScopes: { endOffset: number; scopes: string[] }[] = Array(captures.length);
		endOffsetsAndScopes.fill({ endOffset: 0, scopes: [] });
		let tokenIndex = 0;

		const increaseSizeOfTokensByOneToken = () => {
			endOffsetsAndScopes.push({ endOffset: 0, scopes: [] });
		};

		for (let captureIndex = 0; captureIndex < captures.length; captureIndex++) {
			const capture = captures[captureIndex];
			const tokenEndIndex = capture.node.endIndex < rangeEndOffset ? ((capture.node.endIndex < rangeStartOffset) ? rangeStartOffset : capture.node.endIndex) : rangeEndOffset;
			const tokenStartIndex = capture.node.startIndex < rangeStartOffset ? rangeStartOffset : ((capture.node.startIndex > tokenEndIndex) ? tokenEndIndex : capture.node.startIndex);

			const lineRelativeOffset = tokenEndIndex - rangeStartOffset;

			// Not every character will get captured, so we need to make sure that our current capture doesn't bleed toward the start of the line and cover characters that it doesn't apply to.
			// We do this by creating a new token in the array if the previous token ends before the current token starts.
			let previousTokenEnd: number;
			const currentTokenLength = tokenEndIndex - tokenStartIndex;
			if (captureIndex > 0) {
				previousTokenEnd = endOffsetsAndScopes[(tokenIndex - 1)].endOffset;
			} else {
				previousTokenEnd = tokenStartIndex - rangeStartOffset - 1;
			}
			const intermediateTokenOffset = lineRelativeOffset - currentTokenLength;
			if ((previousTokenEnd >= 0) && (previousTokenEnd < intermediateTokenOffset)) {
				// Add en empty token to cover the space where there were no captures
				endOffsetsAndScopes[tokenIndex] = { endOffset: intermediateTokenOffset, scopes: [] };
				tokenIndex++;

				increaseSizeOfTokensByOneToken();
			}

			const addCurrentTokenToArray = () => {
				endOffsetsAndScopes[tokenIndex] = { endOffset: lineRelativeOffset, scopes: [capture.name] };
				tokenIndex++;
			};

			if (previousTokenEnd >= lineRelativeOffset) {
				const originalPreviousTokenEndOffset = endOffsetsAndScopes[tokenIndex - 1].endOffset;

				const previousTokenStartOffset = ((tokenIndex >= 2) ? endOffsetsAndScopes[tokenIndex - 2].endOffset : 0);
				const loopOriginalPreviousTokenEndOffset = endOffsetsAndScopes[tokenIndex - 1].endOffset;
				const previousPreviousTokenEndOffset = (tokenIndex >= 2) ? endOffsetsAndScopes[tokenIndex - 2].endOffset : 0;

				// Check that the current token doesn't just replace the last token
				if ((previousTokenStartOffset + currentTokenLength) === loopOriginalPreviousTokenEndOffset) {
					// Current token and previous token span the exact same characters, replace the last scope
					endOffsetsAndScopes[tokenIndex - 1].scopes[endOffsetsAndScopes[tokenIndex - 1].scopes.length - 1] = capture.name;
				} else if (previousPreviousTokenEndOffset <= intermediateTokenOffset) {
					let originalPreviousTokenScopes;
					// The current token is within the previous token. Adjust the end of the previous token
					if (previousPreviousTokenEndOffset !== intermediateTokenOffset) {
						endOffsetsAndScopes[tokenIndex - 1] = { endOffset: intermediateTokenOffset, scopes: endOffsetsAndScopes[tokenIndex - 1].scopes };
						addCurrentTokenToArray();
						originalPreviousTokenScopes = [...endOffsetsAndScopes[tokenIndex - 2].scopes];
					} else {
						originalPreviousTokenScopes = [...endOffsetsAndScopes[tokenIndex - 1].scopes];
						endOffsetsAndScopes[tokenIndex - 1] = { endOffset: lineRelativeOffset, scopes: [capture.name] };
					}

					// Add the rest of the previous token after the current token
					if (originalPreviousTokenEndOffset !== lineRelativeOffset) {
						increaseSizeOfTokensByOneToken();
						endOffsetsAndScopes[tokenIndex] = { endOffset: originalPreviousTokenEndOffset, scopes: originalPreviousTokenScopes };
						tokenIndex++;
					} else {
						endOffsetsAndScopes[tokenIndex - 1].scopes.unshift(...originalPreviousTokenScopes);
					}
				}
			} else {
				// Just add the token to the array
				addCurrentTokenToArray();
			}
		}

		// Account for uncaptured characters at the end of the line
		if ((endOffsetsAndScopes[tokenIndex - 1].endOffset < rangeLength)) {
			if (rangeLength - endOffsetsAndScopes[tokenIndex - 1].endOffset > 0) {
				increaseSizeOfTokensByOneToken();
				endOffsetsAndScopes[tokenIndex] = { endOffset: rangeLength, scopes: endOffsetsAndScopes[tokenIndex].scopes };
				tokenIndex++;
			}
		}
		for (let i = 0; i < endOffsetsAndScopes.length; i++) {
			const token = endOffsetsAndScopes[i];
			if (token.endOffset === 0 && token.scopes.length === 0 && i !== 0) {
				endOffsetsAndScopes.splice(i, endOffsetsAndScopes.length - i);
				break;
			}
		}
		const captureTime = stopwatch.elapsed();
		return { endOffsets: endOffsetsAndScopes as { endOffset: number; scopes: string[] }[], captureTime };

	}

	private _tokenizeCapturesWithMetadata(tree: ITreeSitterParseResult | undefined, captures: QueryCapture[], encodedLanguageId: LanguageId, rangeStartOffset: number, rangeEndOffset: number): { endOffsetsAndMetadata: { endOffset: number; metadata: number }[]; captureTime: number; metadataTime: number } | undefined {
		const stopwatch = StopWatch.create();
		const emptyTokens = this._createTokensFromCaptures(tree, captures, rangeStartOffset, rangeEndOffset);
		if (!emptyTokens) {
			return undefined;
		}
		const endOffsetsAndScopes: { endOffset: number; scopes: string[]; metadata?: number }[] = emptyTokens.endOffsets;
		for (let i = 0; i < endOffsetsAndScopes.length; i++) {
			const token = endOffsetsAndScopes[i];
			token.metadata = findMetadata(this._colorThemeData, token.scopes, encodedLanguageId);
		}

		const metadataTime = stopwatch.elapsed();
		return { endOffsetsAndMetadata: endOffsetsAndScopes as { endOffset: number; scopes: string[]; metadata: number }[], captureTime: emptyTokens.captureTime, metadataTime };
	}

	private _emptyToken(encodedLanguageId: number) {
		return findMetadata(this._colorThemeData, [], encodedLanguageId);
	}

	private _tokenizeEncoded(lineNumber: number, textModel: ITextModel): { result: Uint32Array; captureTime: number; metadataTime: number } | undefined {
		const encodedLanguageId = this._languageIdCodec.encodeLanguageId(this._languageId);
		const lineOffset = textModel.getOffsetAt({ lineNumber: lineNumber, column: 1 });
		const maxLine = textModel.getLineCount();
		const lineEndOffset = (lineNumber + 1 <= maxLine) ? textModel.getOffsetAt({ lineNumber: lineNumber + 1, column: 1 }) : textModel.getValueLength();
		const lineLength = lineEndOffset - lineOffset;

		const result = this._tokenize(encodedLanguageId, new Range(lineNumber, 1, lineNumber, lineLength), lineOffset, lineEndOffset, textModel);
		if (!result) {
			return undefined;
		}

		const tokens: Uint32Array = new Uint32Array((result.endOffsetsAndMetadata.length) * 2);

		for (let i = 0; i < result.endOffsetsAndMetadata.length; i++) {
			const token = result.endOffsetsAndMetadata[i];
			tokens[i * 2] = token.endOffset;
			tokens[i * 2 + 1] = token.metadata;
		}

		return { result: tokens, captureTime: result.captureTime, metadataTime: result.metadataTime };
	}

	override dispose() {
		super.dispose();
		this._query?.delete();
		this._query = undefined;
	}
}

registerSingleton(ITreeSitterTokenizationFeature, TreeSitterTokenizationFeature, InstantiationType.Eager);

