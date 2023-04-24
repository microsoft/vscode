/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from 'vs/base/common/assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { Command, InlineCompletion, InlineCompletionContext, InlineCompletions, InlineCompletionsProvider } from 'vs/editor/common/languages';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ITextModel } from 'vs/editor/common/model';
import { fixBracketsInLine } from 'vs/editor/common/model/bracketPairsTextModelPart/fixBrackets';
import { SingleTextEdit } from 'vs/editor/contrib/inlineCompletions/browser/singleTextEdit';
import { getReadonlyEmptyArray } from 'vs/editor/contrib/inlineCompletions/browser/utils';
import { SnippetParser, Text } from 'vs/editor/contrib/snippet/browser/snippetParser';

export async function provideInlineCompletions(
	registry: LanguageFeatureRegistry<InlineCompletionsProvider>,
	position: Position,
	model: ITextModel,
	context: InlineCompletionContext,
	token: CancellationToken = CancellationToken.None,
	languageConfigurationService?: ILanguageConfigurationService,
): Promise<InlineCompletionProviderResult> {
	// Important: Don't use position after the await calls, as the model could have been changed in the meantime!
	const defaultReplaceRange = getDefaultRange(position, model);

	const providers = registry.all(model);
	const providerResults = await Promise.all(providers.map(async provider => {
		try {
			const completions = await provider.provideInlineCompletions(model, position, context, token);
			return ({ provider, completions });
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		return ({ provider, completions: undefined });
	}));

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

	const newTokens = model.tokenization.tokenizeLineWithEdit(position, newLine.length - (position.column - 1), text);
	const slicedTokens = newTokens?.sliceAndInflate(position.column - 1, newLine.length, 0);
	if (!slicedTokens) {
		return text;
	}

	const newText = fixBracketsInLine(slicedTokens, languageConfigurationService);

	return newText;
}
