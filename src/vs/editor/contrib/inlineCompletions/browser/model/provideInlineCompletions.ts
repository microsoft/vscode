/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../../base/common/assert.js';
import { AsyncIterableProducer } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../../base/common/errors.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { prefixedUuid } from '../../../../../base/common/uuid.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ISingleEditOperation } from '../../../../common/core/editOperation.js';
import { StringReplacement } from '../../../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { InlineCompletionEndOfLifeReason, InlineCompletionEndOfLifeReasonKind, InlineCompletion, InlineCompletionContext, InlineCompletions, InlineCompletionsProvider, PartialAcceptInfo, InlineCompletionsDisposeReason, LifetimeSummary, ProviderId, InlineCompletionHint } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../../common/model.js';
import { fixBracketsInLine } from '../../../../common/model/bracketPairsTextModelPart/fixBrackets.js';
import { SnippetParser, Text } from '../../../snippet/browser/snippetParser.js';
import { getReadonlyEmptyArray } from '../utils.js';
import { groupByMap } from '../../../../../base/common/collections.js';
import { DirectedGraph } from './graph.js';
import { CachedFunction } from '../../../../../base/common/cache.js';
import { InlineCompletionViewData, InlineCompletionViewKind } from '../view/inlineEdits/inlineEditsViewInterface.js';
import { isDefined } from '../../../../../base/common/types.js';
import { inlineCompletionIsVisible } from './inlineSuggestionItem.js';
import { EditDeltaInfo } from '../../../../common/textModelEditSource.js';
import { URI } from '../../../../../base/common/uri.js';

export type InlineCompletionContextWithoutUuid = Omit<InlineCompletionContext, 'requestUuid'>;

export function provideInlineCompletions(
	providers: InlineCompletionsProvider[],
	position: Position,
	model: ITextModel,
	context: InlineCompletionContextWithoutUuid,
	requestInfo: InlineSuggestRequestInfo,
	languageConfigurationService?: ILanguageConfigurationService,
): IInlineCompletionProviderResult {
	const requestUuid = prefixedUuid('icr');

	const cancellationTokenSource = new CancellationTokenSource();
	let cancelReason: InlineCompletionsDisposeReason | undefined = undefined;

	const contextWithUuid: InlineCompletionContext = { ...context, requestUuid: requestUuid };

	const defaultReplaceRange = getDefaultRange(position, model);

	const providersByGroupId = groupByMap(providers, p => p.groupId);
	const yieldsToGraph = DirectedGraph.from(providers, p => {
		return p.yieldsToGroupIds?.flatMap(groupId => providersByGroupId.get(groupId) ?? []) ?? [];
	});
	const { foundCycles } = yieldsToGraph.removeCycles();
	if (foundCycles.length > 0) {
		onUnexpectedExternalError(new Error(`Inline completions: cyclic yield-to dependency detected.`
			+ ` Path: ${foundCycles.map(s => s.toString ? s.toString() : ('' + s)).join(' -> ')}`));
	}

	let runningCount = 0;

	const queryProvider = new CachedFunction(async (provider: InlineCompletionsProvider<InlineCompletions>): Promise<InlineSuggestionList | undefined> => {
		try {
			runningCount++;
			if (cancellationTokenSource.token.isCancellationRequested) {
				return undefined;
			}

			const yieldsTo = yieldsToGraph.getOutgoing(provider);
			for (const p of yieldsTo) {
				// We know there is no cycle, so no recursion here
				const result = await queryProvider.get(p);
				if (result) {
					for (const item of result.inlineSuggestions.items) {
						if (item.isInlineEdit || typeof item.insertText !== 'string' && item.insertText !== undefined) {
							return undefined;
						}
						if (item.insertText !== undefined) {
							const t = new TextReplacement(Range.lift(item.range) ?? defaultReplaceRange, item.insertText);
							if (inlineCompletionIsVisible(t, undefined, model, position)) {
								return undefined;
							}
						}

						// else: inline completion is not visible, so lets not block
					}
				}
			}

			let result: InlineCompletions | null | undefined;
			const providerStartTime = Date.now();
			try {
				result = await provider.provideInlineCompletions(model, position, contextWithUuid, cancellationTokenSource.token);
			} catch (e) {
				onUnexpectedExternalError(e);
				return undefined;
			}
			const providerEndTime = Date.now();

			if (!result) {
				return undefined;
			}

			const data: InlineSuggestData[] = [];
			const list = new InlineSuggestionList(result, data, provider);
			list.addRef();
			runWhenCancelled(cancellationTokenSource.token, () => {
				return list.removeRef(cancelReason);
			});
			if (cancellationTokenSource.token.isCancellationRequested) {
				return undefined; // The list is disposed now, so we cannot return the items!
			}

			for (const item of result.items) {
				data.push(toInlineSuggestData(item, list, defaultReplaceRange, model, languageConfigurationService, contextWithUuid, requestInfo, { startTime: providerStartTime, endTime: providerEndTime }));
			}

			return list;
		} finally {
			runningCount--;
		}
	});

	const inlineCompletionLists = AsyncIterableProducer.fromPromisesResolveOrder(providers.map(p => queryProvider.get(p))).filter(isDefined);

	return {
		contextWithUuid,
		get didAllProvidersReturn() { return runningCount === 0; },
		lists: inlineCompletionLists,
		cancelAndDispose: reason => {
			if (cancelReason !== undefined) {
				return;
			}
			cancelReason = reason;
			cancellationTokenSource.dispose(true);
		}
	};
}

/** If the token is eventually cancelled, this will not leak either. */
export function runWhenCancelled(token: CancellationToken, callback: () => void): IDisposable {
	if (token.isCancellationRequested) {
		callback();
		return Disposable.None;
	} else {
		const listener = token.onCancellationRequested(() => {
			listener.dispose();
			callback();
		});
		return { dispose: () => listener.dispose() };
	}
}

export interface IInlineCompletionProviderResult {
	get didAllProvidersReturn(): boolean;

	contextWithUuid: InlineCompletionContext;

	cancelAndDispose(reason: InlineCompletionsDisposeReason): void;

	lists: AsyncIterableProducer<InlineSuggestionList>;
}

function toInlineSuggestData(
	inlineCompletion: InlineCompletion,
	source: InlineSuggestionList,
	defaultReplaceRange: Range,
	textModel: ITextModel,
	languageConfigurationService: ILanguageConfigurationService | undefined,
	context: InlineCompletionContext,
	requestInfo: InlineSuggestRequestInfo,
	providerRequestInfo: InlineSuggestProviderRequestInfo,
): InlineSuggestData {
	let insertText: string;
	let snippetInfo: SnippetInfo | undefined;
	let range = inlineCompletion.range ? Range.lift(inlineCompletion.range) : defaultReplaceRange;

	if (typeof inlineCompletion.insertText === 'string') {
		insertText = inlineCompletion.insertText;

		if (languageConfigurationService && inlineCompletion.completeBracketPairs) {
			insertText = closeBrackets(
				insertText,
				range.getStartPosition(),
				textModel,
				languageConfigurationService
			);

			// Modify range depending on if brackets are added or removed
			const diff = insertText.length - inlineCompletion.insertText.length;
			if (diff !== 0) {
				range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + diff);
			}
		}

		snippetInfo = undefined;
	} else if (inlineCompletion.insertText === undefined) {
		insertText = ''; // TODO use undefined
		snippetInfo = undefined;
		range = new Range(1, 1, 1, 1);
	} else if ('snippet' in inlineCompletion.insertText) {
		const preBracketCompletionLength = inlineCompletion.insertText.snippet.length;

		if (languageConfigurationService && inlineCompletion.completeBracketPairs) {
			inlineCompletion.insertText.snippet = closeBrackets(
				inlineCompletion.insertText.snippet,
				range.getStartPosition(),
				textModel,
				languageConfigurationService
			);

			// Modify range depending on if brackets are added or removed
			const diff = inlineCompletion.insertText.snippet.length - preBracketCompletionLength;
			if (diff !== 0) {
				range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + diff);
			}
		}

		const snippet = new SnippetParser().parse(inlineCompletion.insertText.snippet);

		if (snippet.children.length === 1 && snippet.children[0] instanceof Text) {
			insertText = snippet.children[0].value;
			snippetInfo = undefined;
		} else {
			insertText = snippet.toString();
			snippetInfo = {
				snippet: inlineCompletion.insertText.snippet,
				range: range
			};
		}
	} else {
		assertNever(inlineCompletion.insertText);
	}

	return new InlineSuggestData(
		range,
		insertText,
		snippetInfo,
		URI.revive(inlineCompletion.uri),
		inlineCompletion.hint,
		inlineCompletion.additionalTextEdits || getReadonlyEmptyArray(),
		inlineCompletion,
		source,
		context,
		inlineCompletion.isInlineEdit ?? false,
		requestInfo,
		providerRequestInfo,
		inlineCompletion.correlationId,
	);
}

export type InlineSuggestRequestInfo = {
	startTime: number;
	editorType: InlineCompletionEditorType;
	languageId: string;
	reason: string;
	typingInterval: number;
	typingIntervalCharacterCount: number;
	availableProviders: ProviderId[];
};

export type InlineSuggestProviderRequestInfo = {
	startTime: number;
	endTime: number;
};

export type PartialAcceptance = {
	characters: number;
	count: number;
	ratio: number;
};

export type InlineSuggestViewData = {
	editorType: InlineCompletionEditorType;
	renderData?: InlineCompletionViewData;
	viewKind?: InlineCompletionViewKind;
};

export class InlineSuggestData {
	private _didShow = false;
	private _timeUntilShown: number | undefined = undefined;
	private _showStartTime: number | undefined = undefined;
	private _shownDuration: number = 0;
	private _showUncollapsedStartTime: number | undefined = undefined;
	private _showUncollapsedDuration: number = 0;
	private _notShownReason: string | undefined = undefined;

	private _viewData: InlineSuggestViewData;
	private _didReportEndOfLife = false;
	private _lastSetEndOfLifeReason: InlineCompletionEndOfLifeReason | undefined = undefined;
	private _isPreceeded = false;
	private _partiallyAcceptedCount = 0;
	private _partiallyAcceptedSinceOriginal: PartialAcceptance = { characters: 0, ratio: 0, count: 0 };

	constructor(
		public readonly range: Range,
		public readonly insertText: string,
		public readonly snippetInfo: SnippetInfo | undefined,
		public readonly uri: URI | undefined,
		public readonly hint: InlineCompletionHint | undefined,
		public readonly additionalTextEdits: readonly ISingleEditOperation[],

		public readonly sourceInlineCompletion: InlineCompletion,
		public readonly source: InlineSuggestionList,
		public readonly context: InlineCompletionContext,
		public readonly isInlineEdit: boolean,

		private readonly _requestInfo: InlineSuggestRequestInfo,
		private readonly _providerRequestInfo: InlineSuggestProviderRequestInfo,
		private readonly _correlationId: string | undefined,
	) {
		this._viewData = { editorType: _requestInfo.editorType };
	}

	public get showInlineEditMenu() { return this.sourceInlineCompletion.showInlineEditMenu ?? false; }

	public get partialAccepts(): PartialAcceptance { return this._partiallyAcceptedSinceOriginal; }

	public getSingleTextEdit() {
		return new TextReplacement(this.range, this.insertText);
	}

	public async reportInlineEditShown(commandService: ICommandService, updatedInsertText: string, viewKind: InlineCompletionViewKind, viewData: InlineCompletionViewData): Promise<void> {
		this.updateShownDuration(viewKind);

		if (this._didShow) {
			return;
		}
		this._didShow = true;
		this._viewData.viewKind = viewKind;
		this._viewData.renderData = viewData;
		this._timeUntilShown = Date.now() - this._requestInfo.startTime;

		const editDeltaInfo = new EditDeltaInfo(viewData.lineCountModified, viewData.lineCountOriginal, viewData.characterCountModified, viewData.characterCountOriginal);
		this.source.provider.handleItemDidShow?.(this.source.inlineSuggestions, this.sourceInlineCompletion, updatedInsertText, editDeltaInfo);

		if (this.sourceInlineCompletion.shownCommand) {
			await commandService.executeCommand(this.sourceInlineCompletion.shownCommand.id, ...(this.sourceInlineCompletion.shownCommand.arguments || []));
		}
	}

	public reportPartialAccept(acceptedCharacters: number, info: PartialAcceptInfo, partialAcceptance: PartialAcceptance) {
		this._partiallyAcceptedCount++;
		this._partiallyAcceptedSinceOriginal.characters += partialAcceptance.characters;
		this._partiallyAcceptedSinceOriginal.ratio = Math.min(this._partiallyAcceptedSinceOriginal.ratio + (1 - this._partiallyAcceptedSinceOriginal.ratio) * partialAcceptance.ratio, 1);
		this._partiallyAcceptedSinceOriginal.count += partialAcceptance.count;

		this.source.provider.handlePartialAccept?.(
			this.source.inlineSuggestions,
			this.sourceInlineCompletion,
			acceptedCharacters,
			info
		);
	}

	/**
	 * Sends the end of life event to the provider.
	 * If no reason is provided, the last set reason is used.
	 * If no reason was set, the default reason is used.
	*/
	public reportEndOfLife(reason?: InlineCompletionEndOfLifeReason): void {
		if (this._didReportEndOfLife) {
			return;
		}
		this._didReportEndOfLife = true;
		this.reportInlineEditHidden();

		if (!reason) {
			reason = this._lastSetEndOfLifeReason ?? { kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: undefined };
		}

		if (reason.kind === InlineCompletionEndOfLifeReasonKind.Rejected && this.source.provider.handleRejection) {
			this.source.provider.handleRejection(this.source.inlineSuggestions, this.sourceInlineCompletion);
		}

		if (this.source.provider.handleEndOfLifetime) {
			const summary: LifetimeSummary = {
				requestUuid: this.context.requestUuid,
				correlationId: this._correlationId,
				selectedSuggestionInfo: !!this.context.selectedSuggestionInfo,
				partiallyAccepted: this._partiallyAcceptedCount,
				partiallyAcceptedCountSinceOriginal: this._partiallyAcceptedSinceOriginal.count,
				partiallyAcceptedRatioSinceOriginal: this._partiallyAcceptedSinceOriginal.ratio,
				partiallyAcceptedCharactersSinceOriginal: this._partiallyAcceptedSinceOriginal.characters,
				shown: this._didShow,
				shownDuration: this._shownDuration,
				shownDurationUncollapsed: this._showUncollapsedDuration,
				preceeded: this._isPreceeded,
				timeUntilShown: this._timeUntilShown,
				timeUntilProviderRequest: this._providerRequestInfo.startTime - this._requestInfo.startTime,
				timeUntilProviderResponse: this._providerRequestInfo.endTime - this._requestInfo.startTime,
				editorType: this._viewData.editorType,
				languageId: this._requestInfo.languageId,
				requestReason: this._requestInfo.reason,
				viewKind: this._viewData.viewKind,
				notShownReason: this._notShownReason,
				typingInterval: this._requestInfo.typingInterval,
				typingIntervalCharacterCount: this._requestInfo.typingIntervalCharacterCount,
				availableProviders: this._requestInfo.availableProviders.map(p => p.toString()).join(','),
				...this._viewData.renderData,
			};
			this.source.provider.handleEndOfLifetime(this.source.inlineSuggestions, this.sourceInlineCompletion, reason, summary);
		}
	}

	public setIsPreceeded(partialAccepts: PartialAcceptance): void {
		this._isPreceeded = true;

		if (this._partiallyAcceptedSinceOriginal.characters !== 0 || this._partiallyAcceptedSinceOriginal.ratio !== 0 || this._partiallyAcceptedSinceOriginal.count !== 0) {
			console.warn('Expected partiallyAcceptedCountSinceOriginal to be { characters: 0, rate: 0, partialAcceptances: 0 } before setIsPreceeded.');
		}
		this._partiallyAcceptedSinceOriginal = partialAccepts;
	}

	public setNotShownReason(reason: string): void {
		this._notShownReason ??= reason;
	}

	/**
	 * Sets the end of life reason, but does not send the event to the provider yet.
	*/
	public setEndOfLifeReason(reason: InlineCompletionEndOfLifeReason): void {
		this.reportInlineEditHidden();
		this._lastSetEndOfLifeReason = reason;
	}

	private updateShownDuration(viewKind: InlineCompletionViewKind) {
		const timeNow = Date.now();
		if (!this._showStartTime) {
			this._showStartTime = timeNow;
		}

		const isCollapsed = viewKind === InlineCompletionViewKind.Collapsed;
		if (!isCollapsed && this._showUncollapsedStartTime === undefined) {
			this._showUncollapsedStartTime = timeNow;
		}

		if (isCollapsed && this._showUncollapsedStartTime !== undefined) {
			this._showUncollapsedDuration += timeNow - this._showUncollapsedStartTime;
		}
	}

	private reportInlineEditHidden() {
		if (this._showStartTime === undefined) {
			return;
		}
		const timeNow = Date.now();
		this._shownDuration += timeNow - this._showStartTime;
		this._showStartTime = undefined;

		if (this._showUncollapsedStartTime === undefined) {
			return;
		}
		this._showUncollapsedDuration += timeNow - this._showUncollapsedStartTime;
		this._showUncollapsedStartTime = undefined;
	}
}

export interface SnippetInfo {
	snippet: string;
	/* Could be different than the main range */
	range: Range;
}

export enum InlineCompletionEditorType {
	TextEditor = 'textEditor',
	DiffEditor = 'diffEditor',
	Notebook = 'notebook',
}

/**
 * A ref counted pointer to the computed `InlineCompletions` and the `InlineCompletionsProvider` that
 * computed them.
 */
export class InlineSuggestionList {
	private refCount = 0;
	constructor(
		public readonly inlineSuggestions: InlineCompletions,
		public readonly inlineSuggestionsData: readonly InlineSuggestData[],
		public readonly provider: InlineCompletionsProvider,
	) { }

	addRef(): void {
		this.refCount++;
	}

	removeRef(reason: InlineCompletionsDisposeReason = { kind: 'other' }): void {
		this.refCount--;
		if (this.refCount === 0) {
			for (const item of this.inlineSuggestionsData) {
				// Fallback if it has not been called before
				item.reportEndOfLife();
			}
			this.provider.disposeInlineCompletions(this.inlineSuggestions, reason);
		}
	}
}

function getDefaultRange(position: Position, model: ITextModel): Range {
	const word = model.getWordAtPosition(position);
	const maxColumn = model.getLineMaxColumn(position.lineNumber);
	// By default, always replace up until the end of the current line.
	// This default might be subject to change!
	return word
		? new Range(position.lineNumber, word.startColumn, position.lineNumber, maxColumn)
		: Range.fromPositions(position, position.with(undefined, maxColumn));
}

function closeBrackets(text: string, position: Position, model: ITextModel, languageConfigurationService: ILanguageConfigurationService): string {
	const currentLine = model.getLineContent(position.lineNumber);
	const edit = StringReplacement.replace(new OffsetRange(position.column - 1, currentLine.length), text);

	const proposedLineTokens = model.tokenization.tokenizeLinesAt(position.lineNumber, [edit.replace(currentLine)]);
	const textTokens = proposedLineTokens?.[0].sliceZeroCopy(edit.getRangeAfterReplace());
	if (!textTokens) {
		return text;
	}

	const fixedText = fixBracketsInLine(textTokens, languageConfigurationService);
	return fixedText;
}
