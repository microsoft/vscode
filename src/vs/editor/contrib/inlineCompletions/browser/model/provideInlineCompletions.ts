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
import { ISingleEditOperation } from '../../../../common/core/editOperation.js';
import { SingleOffsetEdit } from '../../../../common/core/offsetEdit.js';
import { OffsetRange } from '../../../../common/core/offsetRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { SingleTextEdit } from '../../../../common/core/textEdit.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { Command, InlineCompletion, InlineCompletionContext, InlineCompletionProviderGroupId, InlineCompletions, InlineCompletionsProvider, InlineCompletionTriggerKind } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../../common/model.js';
import { fixBracketsInLine } from '../../../../common/model/bracketPairsTextModelPart/fixBrackets.js';
import { TextModelText } from '../../../../common/model/textModelText.js';
import { SnippetParser, Text } from '../../../snippet/browser/snippetParser.js';
import { getReadonlyEmptyArray } from '../utils.js';

export async function provideInlineCompletions(
	registry: LanguageFeatureRegistry<InlineCompletionsProvider>,
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
	const providers = registry.all(model);

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

	type Result = Promise<InlineCompletionList | undefined>;
	const states = new Map<InlineCompletionsProvider, Result>();

	const seen = new Set<InlineCompletionsProvider>();
	function findPreferredProviderCircle(
		provider: InlineCompletionsProvider<any>,
		stack: InlineCompletionsProvider[]
	): InlineCompletionsProvider[] | undefined {
		stack = [...stack, provider];
		if (seen.has(provider)) { return stack; }

		seen.add(provider);
		try {
			const preferred = getPreferredProviders(provider);
			for (const p of preferred) {
				const c = findPreferredProviderCircle(p, stack);
				if (c) { return c; }
			}
		} finally {
			seen.delete(provider);
		}
		return undefined;
	}

	function queryProviderOrPreferredProvider(provider: InlineCompletionsProvider<InlineCompletions>): Result {
		const state = states.get(provider);
		if (state) { return state; }

		const circle = findPreferredProviderCircle(provider, []);
		if (circle) {
			onUnexpectedExternalError(new Error(`Inline completions: cyclic yield-to dependency detected.`
				+ ` Path: ${circle.map(s => s.toString ? s.toString() : ('' + s)).join(' -> ')}`));
		}

		const deferredPromise = new DeferredPromise<InlineCompletionList | undefined>();
		states.set(provider, deferredPromise.p);

		(async () => {
			if (!circle) {
				const preferred = getPreferredProviders(provider);
				for (const p of preferred) {
					const result = await queryProviderOrPreferredProvider(p);
					if (result && result.inlineCompletions.items.length > 0) {
						// Skip provider
						return undefined;
					}
				}
			}

			return query(provider);
		})().then(c => deferredPromise.complete(c), e => deferredPromise.error(e));

		return deferredPromise.p;
	}

	async function query(provider: InlineCompletionsProvider): Promise<InlineCompletionList | undefined> {
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
		const list = new InlineCompletionList(result, provider);

		runWhenCancelled(token, () => list.removeRef());
		return list;
	}

	const inlineCompletionLists = AsyncIterableObject.fromPromisesResolveOrder(providers.map(queryProviderOrPreferredProvider));

	if (token.isCancellationRequested) {
		tokenSource.dispose(true);
		// result has been disposed before we could call addRef! So we have to discard everything.
		return new InlineCompletionProviderResult([], new Set(), []);
	}

	const result = await addRefAndCreateResult(contextWithUuid, inlineCompletionLists, defaultReplaceRange, model, languageConfigurationService);
	tokenSource.dispose(true); // This disposes results that are not referenced.
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

// TODO: check cancellation token!
async function addRefAndCreateResult(
	context: InlineCompletionContext,
	inlineCompletionLists: AsyncIterable<(InlineCompletionList | undefined)>,
	defaultReplaceRange: Range,
	model: ITextModel,
	languageConfigurationService: ILanguageConfigurationService | undefined
): Promise<InlineCompletionProviderResult> {
	// for deduplication
	const itemsByHash = new Map<string, InlineCompletionItem>();

	let shouldStop = false;
	const lists: InlineCompletionList[] = [];
	for await (const completions of inlineCompletionLists) {
		if (!completions) { continue; }
		completions.addRef();
		lists.push(completions);
		for (const item of completions.inlineCompletions.items) {
			if (!context.includeInlineEdits && item.isInlineEdit) {
				continue;
			}
			if (!context.includeInlineCompletions && !item.isInlineEdit) {
				continue;
			}
			const inlineCompletionItem = InlineCompletionItem.from(
				item,
				completions,
				defaultReplaceRange,
				model,
				languageConfigurationService
			);

			itemsByHash.set(inlineCompletionItem.hash(), inlineCompletionItem);

			// Stop after first visible inline completion
			if (!item.isInlineEdit && context.triggerKind === InlineCompletionTriggerKind.Automatic) {
				const minifiedEdit = inlineCompletionItem.toSingleTextEdit().removeCommonPrefix(new TextModelText(model));
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
		public readonly completions: readonly InlineCompletionItem[],
		private readonly hashs: Set<string>,
		private readonly providerResults: readonly InlineCompletionList[],
	) { }

	public has(item: InlineCompletionItem): boolean {
		return this.hashs.has(item.hash());
	}

	dispose(): void {
		for (const result of this.providerResults) {
			result.removeRef();
		}
	}
}

/**
 * A ref counted pointer to the computed `InlineCompletions` and the `InlineCompletionsProvider` that
 * computed them.
 */
export class InlineCompletionList {
	private refCount = 1;
	constructor(
		public readonly inlineCompletions: InlineCompletions,
		public readonly provider: InlineCompletionsProvider,
	) { }

	addRef(): void {
		this.refCount++;
	}

	removeRef(): void {
		this.refCount--;
		if (this.refCount === 0) {
			this.provider.freeInlineCompletions(this.inlineCompletions);
		}
	}
}

export class InlineCompletionItem {
	public static from(
		inlineCompletion: InlineCompletion,
		source: InlineCompletionList,
		defaultReplaceRange: Range,
		textModel: ITextModel,
		languageConfigurationService: ILanguageConfigurationService | undefined,
	) {
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

		return new InlineCompletionItem(
			insertText,
			inlineCompletion.command,
			inlineCompletion.shownCommand,
			inlineCompletion.action,
			range,
			insertText,
			snippetInfo,
			Range.lift(inlineCompletion.showRange) ?? undefined,
			inlineCompletion.additionalTextEdits || getReadonlyEmptyArray(),
			inlineCompletion,
			source,
		);
	}

	static ID = 1;

	private _didCallShow = false;

	constructor(
		readonly filterText: string,
		readonly command: Command | undefined,
		readonly shownCommand: Command | undefined,
		readonly action: Command | undefined,
		readonly range: Range,
		readonly insertText: string,
		readonly snippetInfo: SnippetInfo | undefined,
		readonly cursorShowRange: Range | undefined,

		readonly additionalTextEdits: readonly ISingleEditOperation[],


		/**
		 * A reference to the original inline completion this inline completion has been constructed from.
		 * Used for event data to ensure referential equality.
		*/
		readonly sourceInlineCompletion: InlineCompletion,

		/**
		 * A reference to the original inline completion list this inline completion has been constructed from.
		 * Used for event data to ensure referential equality.
		*/
		readonly source: InlineCompletionList,

		readonly id = `InlineCompletion:${InlineCompletionItem.ID++}`,
	) {
		// TODO: these statements are no-ops
		filterText = filterText.replace(/\r\n|\r/g, '\n');
		insertText = filterText.replace(/\r\n|\r/g, '\n');
	}

	public get didShow(): boolean {
		return this._didCallShow;
	}
	public markAsShown(): void {
		this._didCallShow = true;
	}

	public withRange(updatedRange: Range): InlineCompletionItem {
		return new InlineCompletionItem(
			this.filterText,
			this.command,
			this.shownCommand,
			this.action,
			updatedRange,
			this.insertText,
			this.snippetInfo,
			this.cursorShowRange,
			this.additionalTextEdits,
			this.sourceInlineCompletion,
			this.source,
			this.id,
		);
	}

	public withRangeInsertTextAndFilterText(updatedRange: Range, updatedInsertText: string, updatedFilterText: string): InlineCompletionItem {
		return new InlineCompletionItem(
			updatedFilterText,
			this.command,
			this.shownCommand,
			this.action,
			updatedRange,
			updatedInsertText,
			this.snippetInfo,
			this.cursorShowRange,
			this.additionalTextEdits,
			this.sourceInlineCompletion,
			this.source,
			this.id,
		);
	}

	public hash(): string {
		return JSON.stringify({ insertText: this.insertText, range: this.range.toString() });
	}

	public toSingleTextEdit(): SingleTextEdit {
		return new SingleTextEdit(this.range, this.insertText);
	}
}

export interface SnippetInfo {
	snippet: string;
	/* Could be different than the main range */
	range: Range;
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
