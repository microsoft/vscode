/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../../base/common/assert.js';
import { AsyncIterableObject } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../../base/common/errors.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ISingleEditOperation } from '../../../../common/core/editOperation.js';
import { StringReplacement } from '../../../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { InlineCompletionEndOfLifeReason, InlineCompletionEndOfLifeReasonKind, InlineCompletion, InlineCompletionContext, InlineCompletions, InlineCompletionsProvider, InlineCompletionTriggerKind, PartialAcceptInfo, InlineCompletionsDisposeReason } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../../common/model.js';
import { fixBracketsInLine } from '../../../../common/model/bracketPairsTextModelPart/fixBrackets.js';
import { TextModelText } from '../../../../common/model/textModelText.js';
import { SnippetParser, Text } from '../../../snippet/browser/snippetParser.js';
import { getReadonlyEmptyArray } from '../utils.js';
import { groupByMap } from '../../../../../base/common/collections.js';
import { DirectedGraph } from './graph.js';
import { CachedFunction } from '../../../../../base/common/cache.js';

export type InlineCompletionContextWithoutUuid = Omit<InlineCompletionContext, 'requestUuid'>;

export async function provideInlineCompletions(
	providers: InlineCompletionsProvider[],
	positionOrRange: Position | Range,
	model: ITextModel,
	context: InlineCompletionContextWithoutUuid,
	baseToken: CancellationToken = CancellationToken.None,
	languageConfigurationService?: ILanguageConfigurationService,
): Promise<InlineCompletionProviderResult> {
	if (baseToken.isCancellationRequested) {
		return new InlineCompletionProviderResult([], new Set(), []);
	}

	const requestUuid = generateUuid();

	const lostRaceTokenSource = new CancellationTokenSource();
	const lostRaceToken = lostRaceTokenSource.token;

	const combinedTokenSource = new CancellationTokenSource(baseToken);
	runWhenCancelled(lostRaceToken, () => combinedTokenSource.dispose(true));
	const combinedToken = combinedTokenSource.token;

	const contextWithUuid: InlineCompletionContext = { ...context, requestUuid: requestUuid };

	const defaultReplaceRange = positionOrRange instanceof Position ? getDefaultRange(positionOrRange, model) : positionOrRange;

	const providersByGroupId = groupByMap(providers, p => p.groupId);
	const yieldsToGraph = DirectedGraph.from(providers, p => {
		return p.yieldsToGroupIds?.flatMap(groupId => providersByGroupId.get(groupId) ?? []) ?? [];
	});
	const { foundCycles } = yieldsToGraph.removeCycles();
	if (foundCycles.length > 0) {
		onUnexpectedExternalError(new Error(`Inline completions: cyclic yield-to dependency detected.`
			+ ` Path: ${foundCycles.map(s => s.toString ? s.toString() : ('' + s)).join(' -> ')}`));
	}

	const queryProvider = new CachedFunction(async (provider: InlineCompletionsProvider<InlineCompletions>): Promise<InlineSuggestionList | undefined> => {
		if (combinedToken.isCancellationRequested) {
			return undefined;
		}

		const yieldsTo = yieldsToGraph.getOutgoing(provider);
		for (const p of yieldsTo) {
			// We know there is no cycle, so no recursion here
			const result = await queryProvider.get(p);
			if (result && result.inlineSuggestions.items.length > 0) {
				// Skip provider
				return undefined;
			}
		}

		let result: InlineCompletions | null | undefined;
		try {
			if (positionOrRange instanceof Position) {
				result = await provider.provideInlineCompletions(model, positionOrRange, contextWithUuid, combinedToken);
			} else {
				result = await provider.provideInlineEditsForRange?.(model, positionOrRange, contextWithUuid, combinedToken);
			}
		} catch (e) {
			onUnexpectedExternalError(e);
			return undefined;
		}
		if (!result) {
			return undefined;
		}
		const data: InlineSuggestData[] = [];
		const list = new InlineSuggestionList(result, data, provider);
		runWhenCancelled(combinedToken, () => {
			return list.removeRef(lostRaceToken.isCancellationRequested ? 'lostRace' : 'tokenCancellation');
		});

		for (const item of result.items) {
			data.push(createInlineCompletionItem(item, list, defaultReplaceRange, model, languageConfigurationService, contextWithUuid));
		}

		return list;
	});

	const inlineCompletionLists = AsyncIterableObject.fromPromisesResolveOrder(providers.map(p => queryProvider.get(p)));
	const itemsByHash = new Map<string, InlineSuggestData>(); // for deduplication
	let shouldStop = false;
	const lists: InlineSuggestionList[] = [];
	for await (const completions of inlineCompletionLists) {
		if (!completions) {
			continue;
		}
		completions.addRef();
		lists.push(completions);
		for (const item of completions.inlineSuggestionsData) {
			if (!contextWithUuid.includeInlineEdits && (item.isInlineEdit || item.showInlineEditMenu)) {
				continue;
			}
			if (!contextWithUuid.includeInlineCompletions && !(item.isInlineEdit || item.showInlineEditMenu)) {
				continue;
			}

			itemsByHash.set(createHashFromSingleTextEdit(item.getSingleTextEdit()), item);

			// Stop after first visible inline completion
			if (!(item.isInlineEdit || item.showInlineEditMenu) && contextWithUuid.triggerKind === InlineCompletionTriggerKind.Automatic) {
				const minifiedEdit = item.getSingleTextEdit().removeCommonPrefix(new TextModelText(model));
				if (!minifiedEdit.isEmpty) {
					shouldStop = true;
				}
			}
		}

		if (shouldStop) {
			break;
		}
	}

	const result = new InlineCompletionProviderResult(Array.from(itemsByHash.values()), new Set(itemsByHash.keys()), lists);

	lostRaceTokenSource.dispose(true); // This disposes results that are not referenced by now.
	combinedTokenSource.dispose(true);
	return result;
}

/** If the token is eventually cancelled, this will not leak either. */
function runWhenCancelled(token: CancellationToken, callback: () => void): IDisposable {
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

export class InlineCompletionProviderResult implements IDisposable {

	constructor(
		/**
		 * Free of duplicates.
		 */
		public readonly completions: readonly InlineSuggestData[],
		private readonly hashs: Set<string>,
		private readonly providerResults: readonly InlineSuggestionList[],
	) { }

	public has(edit: TextReplacement): boolean {
		return this.hashs.has(createHashFromSingleTextEdit(edit));
	}

	// TODO: This is not complete as it does not take the textmodel into account
	isEmpty(): boolean {
		return this.completions.length === 0
			|| this.completions.every(c => c.range.isEmpty() && c.insertText.length === 0);
	}

	dispose(): void {
		for (const result of this.providerResults) {
			result.removeRef();
		}
	}
}

function createHashFromSingleTextEdit(edit: TextReplacement): string {
	return JSON.stringify([edit.text, edit.range.getStartPosition().toString()]);
}

function createInlineCompletionItem(
	inlineCompletion: InlineCompletion,
	source: InlineSuggestionList,
	defaultReplaceRange: Range,
	textModel: ITextModel,
	languageConfigurationService: ILanguageConfigurationService | undefined,
	context: InlineCompletionContext,
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

	const displayLocation = inlineCompletion.displayLocation ? {
		range: Range.lift(inlineCompletion.displayLocation.range),
		label: inlineCompletion.displayLocation.label
	} : undefined;

	return new InlineSuggestData(
		range,
		insertText,
		snippetInfo,
		displayLocation,
		inlineCompletion.additionalTextEdits || getReadonlyEmptyArray(),
		inlineCompletion,
		source,
		context,
		inlineCompletion.isInlineEdit ?? false,
	);
}

export class InlineSuggestData {
	private _didShow = false;
	private _didReportEndOfLife = false;
	private _lastSetEndOfLifeReason: InlineCompletionEndOfLifeReason | undefined = undefined;

	constructor(
		public readonly range: Range,
		public readonly insertText: string,
		public readonly snippetInfo: SnippetInfo | undefined,
		public readonly displayLocation: IDisplayLocation | undefined,
		public readonly additionalTextEdits: readonly ISingleEditOperation[],

		public readonly sourceInlineCompletion: InlineCompletion,
		public readonly source: InlineSuggestionList,
		public readonly context: InlineCompletionContext,
		public readonly isInlineEdit: boolean,
	) { }

	public get showInlineEditMenu() { return this.sourceInlineCompletion.showInlineEditMenu ?? false; }

	public getSingleTextEdit() {
		return new TextReplacement(this.range, this.insertText);
	}

	public async reportInlineEditShown(commandService: ICommandService, updatedInsertText: string): Promise<void> {
		if (this._didShow) {
			return;
		}
		this._didShow = true;

		this.source.provider.handleItemDidShow?.(this.source.inlineSuggestions, this.sourceInlineCompletion, updatedInsertText);

		if (this.sourceInlineCompletion.shownCommand) {
			await commandService.executeCommand(this.sourceInlineCompletion.shownCommand.id, ...(this.sourceInlineCompletion.shownCommand.arguments || []));
		}
	}

	public reportPartialAccept(acceptedCharacters: number, info: PartialAcceptInfo) {
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

		if (!reason) {
			reason = this._lastSetEndOfLifeReason ?? { kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: undefined };
		}

		if (reason.kind === InlineCompletionEndOfLifeReasonKind.Rejected && this.source.provider.handleRejection) {
			this.source.provider.handleRejection(this.source.inlineSuggestions, this.sourceInlineCompletion);
		}

		if (this.source.provider.handleEndOfLifetime) {
			this.source.provider.handleEndOfLifetime(this.source.inlineSuggestions, this.sourceInlineCompletion, reason);
		}
	}

	/**
	 * Sets the end of life reason, but does not send the event to the provider yet.
	*/
	public setEndOfLifeReason(reason: InlineCompletionEndOfLifeReason): void {
		this._lastSetEndOfLifeReason = reason;
	}
}

export interface SnippetInfo {
	snippet: string;
	/* Could be different than the main range */
	range: Range;
}

export interface IDisplayLocation {
	range: Range;
	label: string;
}

/**
 * A ref counted pointer to the computed `InlineCompletions` and the `InlineCompletionsProvider` that
 * computed them.
 */
export class InlineSuggestionList {
	private refCount = 1;
	constructor(
		public readonly inlineSuggestions: InlineCompletions,
		public readonly inlineSuggestionsData: readonly InlineSuggestData[],
		public readonly provider: InlineCompletionsProvider,
	) { }

	addRef(): void {
		this.refCount++;
	}

	removeRef(reason: InlineCompletionsDisposeReason = 'other'): void {
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
