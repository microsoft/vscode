/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../../base/common/assert.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { SetMap } from '../../../../../base/common/map.js';
import { onUnexpectedExternalError } from '../../../../../base/common/errors.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ISingleEditOperation } from '../../../../common/core/editOperation.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { Command, InlineCompletion, InlineCompletionContext, InlineCompletionProviderGroupId, InlineCompletions, InlineCompletionsProvider } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../../common/model.js';
import { fixBracketsInLine } from '../../../../common/model/bracketPairsTextModelPart/fixBrackets.js';
import { SingleTextEdit } from '../../../../common/core/textEdit.js';
import { getReadonlyEmptyArray } from '../utils.js';
import { SnippetParser, Text } from '../../../snippet/browser/snippetParser.js';
import { LineEditWithAdditionalLines } from '../../../../common/tokenizationTextModelPart.js';
import { OffsetRange } from '../../../../common/core/offsetRange.js';

export async function provideInlineCompletions(
	registry: LanguageFeatureRegistry<InlineCompletionsProvider>,
	positionOrRange: Position | Range,
	model: ITextModel,
	context: InlineCompletionContext,
	token: CancellationToken = CancellationToken.None,
	languageConfigurationService?: ILanguageConfigurationService,
): Promise<InlineCompletionProviderResult> {
	// Important: Don't use position after the await calls, as the model could have been changed in the meantime!
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

	type Result = Promise<InlineCompletions<InlineCompletion> | null | undefined>;
	const states = new Map<InlineCompletionsProvider<InlineCompletions<InlineCompletion>>, Result>();

	const seen = new Set<InlineCompletionsProvider<InlineCompletions<InlineCompletion>>>();
	function findPreferredProviderCircle(provider: InlineCompletionsProvider<any>, stack: InlineCompletionsProvider[]): InlineCompletionsProvider[] | undefined {
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

	function processProvider(provider: InlineCompletionsProvider<any>): Result {
		const state = states.get(provider);
		if (state) {
			return state;
		}

		const circle = findPreferredProviderCircle(provider, []);
		if (circle) {
			onUnexpectedExternalError(new Error(`Inline completions: cyclic yield-to dependency detected. Path: ${circle.map(s => s.toString ? s.toString() : ('' + s)).join(' -> ')}`));
		}

		const deferredPromise = new DeferredPromise<InlineCompletions<InlineCompletion> | null | undefined>();
		states.set(provider, deferredPromise.p);

		(async () => {
			if (!circle) {
				const preferred = getPreferredProviders(provider);
				for (const p of preferred) {
					const result = await processProvider(p);
					if (result && result.items.length > 0) {
						// Skip provider
						return undefined;
					}
				}
			}

			try {
				if (positionOrRange instanceof Position) {
					const completions = await provider.provideInlineCompletions(model, positionOrRange, context, token);
					return completions;
				} else {
					const completions = await provider.provideInlineEditsForRange?.(model, positionOrRange, context, token);
					return completions;
				}
			} catch (e) {
				onUnexpectedExternalError(e);
				return undefined;
			}
		})().then(c => deferredPromise.complete(c), e => deferredPromise.error(e));

		return deferredPromise.p;
	}

	const providerResults = await Promise.all(providers.map(async provider => ({ provider, completions: await processProvider(provider) })));

	const itemsByHash = new Map<string, InlineCompletionItem>();
	const lists: InlineCompletionList[] = [];
	for (const result of providerResults) {
		const completions = result.completions;
		if (!completions) {
			continue;
		}
		const list = new InlineCompletionList(completions, result.provider);
		lists.push(list);

		for (const item of completions.items) {
			const inlineCompletionItem = InlineCompletionItem.from(
				item,
				list,
				defaultReplaceRange,
				model,
				languageConfigurationService
			);
			itemsByHash.set(inlineCompletionItem.hash(), inlineCompletionItem);
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
			range,
			insertText,
			snippetInfo,
			inlineCompletion.additionalTextEdits || getReadonlyEmptyArray(),
			inlineCompletion,
			source,
		);
	}

	constructor(
		readonly filterText: string,
		readonly command: Command | undefined,
		readonly range: Range,
		readonly insertText: string,
		readonly snippetInfo: SnippetInfo | undefined,

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
	) {
		filterText = filterText.replace(/\r\n|\r/g, '\n');
		insertText = filterText.replace(/\r\n|\r/g, '\n');
	}

	public withRange(updatedRange: Range): InlineCompletionItem {
		return new InlineCompletionItem(
			this.filterText,
			this.command,
			updatedRange,
			this.insertText,
			this.snippetInfo,
			this.additionalTextEdits,
			this.sourceInlineCompletion,
			this.source,
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
	const lineStart = model.getLineContent(position.lineNumber).substring(0, position.column - 1);
	const newLine = lineStart + text;

	const edit = LineEditWithAdditionalLines.replace(OffsetRange.ofStartAndLength(position.column - 1, newLine.length - (position.column - 1)), text);
	const newTokens = model.tokenization.tokenizeLineWithEdit(position.lineNumber, edit);
	const slicedTokens = newTokens?.mainLineTokens?.sliceAndInflate(position.column - 1, newLine.length, 0);
	if (!slicedTokens) {
		return text;
	}

	const newText = fixBracketsInLine(slicedTokens, languageConfigurationService);

	return newText;
}
