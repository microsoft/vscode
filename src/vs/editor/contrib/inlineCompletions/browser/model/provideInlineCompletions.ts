/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../../base/common/assert.js';
import { AsyncIterableObject, DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../../base/common/errors.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { SetMap } from '../../../../../base/common/map.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ISingleEditOperation } from '../../../../common/core/editOperation.js';
import { SingleOffsetEdit } from '../../../../common/core/offsetEdit.js';
import { OffsetRange } from '../../../../common/core/offsetRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { SingleTextEdit } from '../../../../common/core/textEdit.js';
import { InlineCompletionEndOfLifeReason, InlineCompletionEndOfLifeReasonKind, InlineCompletion, InlineCompletionContext, InlineCompletionProviderGroupId, InlineCompletions, InlineCompletionsProvider, InlineCompletionTriggerKind, PartialAcceptInfo } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../../common/model.js';
import { fixBracketsInLine } from '../../../../common/model/bracketPairsTextModelPart/fixBrackets.js';
import { TextModelText } from '../../../../common/model/textModelText.js';
import { SnippetParser, Text } from '../../../snippet/browser/snippetParser.js';
import { getReadonlyEmptyArray } from '../utils.js';

export async function provideInlineCompletions(
	providers: InlineCompletionsProvider[],
	positionOrRange: Position | Range,
	model: ITextModel,
	context: InlineCompletionContext,
	baseToken: CancellationToken = CancellationToken.None,
	languageConfigurationService?: ILanguageConfigurationService,
): Promise<InlineCompletionProviderResult> {
	const requestUuid = generateUuid();
	const tokenSource = new CancellationTokenSource(baseToken);
	const token = tokenSource.token;
	const contextWithUuid = { ...context, requestUuid: requestUuid };

	const defaultReplaceRange = positionOrRange instanceof Position ? getDefaultRange(positionOrRange, model) : positionOrRange;

	const multiMap = new SetMap<InlineCompletionProviderGroupId, InlineCompletionsProvider<any>>();
	for (const provider of providers) {
		if (provider.groupId) {
			multiMap.add(provider.groupId, provider);
		}
	}

	function getPreferredProviders(provider: InlineCompletionsProvider<any>): InlineCompletionsProvider<any>[] {
		if (!provider.yieldsToGroupIds) { return []; }
		const result: InlineCompletionsProvider<any>[] = [];
		for (const groupId of provider.yieldsToGroupIds || []) {
			const providers = multiMap.get(groupId);
			for (const p of providers) {
				result.push(p);
			}
		}
		return result;
	}

	type Result = Promise<InlineSuggestionList | undefined>;

	function findPreferredProviderCircle(
		provider: InlineCompletionsProvider<any>,
		stack: InlineCompletionsProvider[],
		seen: Set<InlineCompletionsProvider>,
	): InlineCompletionsProvider[] | undefined {
		stack = [...stack, provider];
		if (seen.has(provider)) { return stack; }

		seen.add(provider);
		try {
			const preferred = getPreferredProviders(provider);
			for (const p of preferred) {
				const c = findPreferredProviderCircle(p, stack, seen);
				if (c) { return c; }
			}
		} finally {
			seen.delete(provider);
		}
		return undefined;
	}

	function queryProviderOrPreferredProvider(provider: InlineCompletionsProvider<InlineCompletions>, states: Map<InlineCompletionsProvider, Result>): Result {
		const state = states.get(provider);
		if (state) { return state; }

		const circle = findPreferredProviderCircle(provider, [], new Set());
		if (circle) {
			onUnexpectedExternalError(new Error(`Inline completions: cyclic yield-to dependency detected.`
				+ ` Path: ${circle.map(s => s.toString ? s.toString() : ('' + s)).join(' -> ')}`));
		}

		const deferredPromise = new DeferredPromise<InlineSuggestionList | undefined>();
		states.set(provider, deferredPromise.p);

		(async () => {
			if (!circle) {
				const preferred = getPreferredProviders(provider);
				for (const p of preferred) {
					const result = await queryProviderOrPreferredProvider(p, states);
					if (result && result.inlineSuggestions.items.length > 0) {
						// Skip provider
						return undefined;
					}
				}
			}

			return query(provider);
		})().then(c => deferredPromise.complete(c), e => deferredPromise.error(e));

		return deferredPromise.p;
	}

	async function query(provider: InlineCompletionsProvider): Promise<InlineSuggestionList | undefined> {
		let result: InlineCompletions | null | undefined;
		try {
			if (positionOrRange instanceof Position) {
				result = await provider.provideInlineCompletions(model, positionOrRange, contextWithUuid, token);
			} else {
				result = await provider.provideInlineEditsForRange?.(model, positionOrRange, contextWithUuid, token);
			}
		} catch (e) {
			onUnexpectedExternalError(e);
			return undefined;
		}

		if (!result) { return undefined; }
		const data: InlineSuggestData[] = [];
		const list = new InlineSuggestionList(result, data, provider);
		for (const item of result.items) {
			data.push(createInlineCompletionItem(item, list, defaultReplaceRange, model, languageConfigurationService, contextWithUuid));
		}

		runWhenCancelled(token, () => list.removeRef());
		return list;
	}

	const states = new Map<InlineCompletionsProvider, Result>();
	const inlineCompletionLists = AsyncIterableObject.fromPromisesResolveOrder(providers.map(p => queryProviderOrPreferredProvider(p, states)));

	if (token.isCancellationRequested) {
		tokenSource.dispose(true);
		// result has been disposed before we could call addRef! So we have to discard everything.
		return new InlineCompletionProviderResult([], new Set(), []);
	}

	const result = await addRefAndCreateResult(contextWithUuid, inlineCompletionLists, model);
	tokenSource.dispose(true); // This disposes results that are not referenced by now.
	return result;
}

/** If the token does not leak, this will not leak either. */
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

async function addRefAndCreateResult(
	context: InlineCompletionContext,
	inlineCompletionLists: AsyncIterable<(InlineSuggestionList | undefined)>,
	model: ITextModel,
): Promise<InlineCompletionProviderResult> {
	// for deduplication
	const itemsByHash = new Map<string, InlineSuggestData>();

	let shouldStop = false;
	const lists: InlineSuggestionList[] = [];
	for await (const completions of inlineCompletionLists) {
		if (!completions) { continue; }
		completions.addRef();
		lists.push(completions);
		for (const item of completions.inlineSuggestionsData) {
			if (!context.includeInlineEdits && (item.isInlineEdit || item.showInlineEditMenu)) {
				continue;
			}
			if (!context.includeInlineCompletions && !(item.isInlineEdit || item.showInlineEditMenu)) {
				continue;
			}

			itemsByHash.set(createHashFromSingleTextEdit(item.getSingleTextEdit()), item);

			// Stop after first visible inline completion
			if (!(item.isInlineEdit || item.showInlineEditMenu) && context.triggerKind === InlineCompletionTriggerKind.Automatic) {
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

	return new InlineCompletionProviderResult(Array.from(itemsByHash.values()), new Set(itemsByHash.keys()), lists);
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

	public has(edit: SingleTextEdit): boolean {
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

function createHashFromSingleTextEdit(edit: SingleTextEdit): string {
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
		return new SingleTextEdit(this.range, this.insertText);
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

	removeRef(): void {
		this.refCount--;
		if (this.refCount === 0) {
			for (const item of this.inlineSuggestionsData) {
				// Fallback if it has not been called before
				item.reportEndOfLife();
			}
			this.provider.freeInlineCompletions(this.inlineSuggestions);
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
	const edit = SingleOffsetEdit.replace(new OffsetRange(position.column - 1, currentLine.length), text);

	const proposedLineTokens = model.tokenization.tokenizeLinesAt(position.lineNumber, [edit.apply(currentLine)]);
	const textTokens = proposedLineTokens?.[0].sliceZeroCopy(edit.getRangeAfterApply());
	if (!textTokens) {
		return text;
	}

	const fixedText = fixBracketsInLine(textTokens, languageConfigurationService);
	return fixedText;
}
