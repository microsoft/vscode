/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { compare } from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList, LanguageId, CompletionItemInsertTextRule, CompletionContext, CompletionTriggerKind } from 'vs/editor/common/modes';
import { IModeService } from 'vs/editor/common/services/modeService';
import { SnippetParser } from 'vs/editor/contrib/snippet/snippetParser';
import { localize } from 'vs/nls';
import { ISnippetsService } from 'vs/workbench/contrib/snippets/browser/snippets.contribution';
import { Snippet, SnippetSource } from 'vs/workbench/contrib/snippets/browser/snippetsFile';
import { isPatternInWord } from 'vs/base/common/filters';

export class SnippetCompletion implements CompletionItem {

	label: string;
	detail: string;
	insertText: string;
	documentation?: MarkdownString;
	range: IRange;
	sortText: string;
	kind: CompletionItemKind;
	insertTextRules: CompletionItemInsertTextRule;

	constructor(
		readonly snippet: Snippet,
		range: IRange
	) {
		this.label = snippet.prefix;
		this.detail = localize('detail.snippet', "{0} ({1})", snippet.description || snippet.name, snippet.source);
		this.insertText = snippet.codeSnippet;
		this.range = range;
		this.sortText = `${snippet.snippetSource === SnippetSource.Extension ? 'z' : 'a'}-${snippet.prefix}`;
		this.kind = CompletionItemKind.Snippet;
		this.insertTextRules = CompletionItemInsertTextRule.InsertAsSnippet;
	}

	resolve(): this {
		this.documentation = new MarkdownString().appendCodeblock('', new SnippetParser().text(this.snippet.codeSnippet));
		return this;
	}

	static compareByLabel(a: SnippetCompletion, b: SnippetCompletion): number {
		return compare(a.label, b.label);
	}
}

export class SnippetCompletionProvider implements CompletionItemProvider {

	private static readonly _maxPrefix = 10000;

	readonly _debugDisplayName = 'snippetCompletions';

	constructor(
		@IModeService private readonly _modeService: IModeService,
		@ISnippetsService private readonly _snippets: ISnippetsService
	) {
		//
	}

	provideCompletionItems(model: ITextModel, position: Position, context: CompletionContext): Promise<CompletionList> | undefined {

		if (position.column >= SnippetCompletionProvider._maxPrefix) {
			return undefined;
		}

		if (context.triggerKind === CompletionTriggerKind.TriggerCharacter && context.triggerCharacter === ' ') {
			// no snippets when suggestions have been triggered by space
			return undefined;
		}

		const languageId = this._getLanguageIdAtPosition(model, position);
		return this._snippets.getSnippets(languageId).then(snippets => {

			let suggestions: SnippetCompletion[];
			let pos = { lineNumber: position.lineNumber, column: 1 };
			let lineOffsets: number[] = [];
			let linePrefixLow = model.getLineContent(position.lineNumber).substr(0, position.column - 1).toLowerCase();
			let endsInWhitespace = linePrefixLow.match(/\s$/);

			while (pos.column < position.column) {
				let word = model.getWordAtPosition(pos);
				if (word) {
					// at a word
					lineOffsets.push(word.startColumn - 1);
					pos.column = word.endColumn + 1;
					if (word.endColumn - 1 < linePrefixLow.length && !/\s/.test(linePrefixLow[word.endColumn - 1])) {
						lineOffsets.push(word.endColumn - 1);
					}
				}
				else if (!/\s/.test(linePrefixLow[pos.column - 1])) {
					// at a none-whitespace character
					lineOffsets.push(pos.column - 1);
					pos.column += 1;
				}
				else {
					// always advance!
					pos.column += 1;
				}
			}

			let availableSnippets = new Set<Snippet>();
			snippets.forEach(availableSnippets.add, availableSnippets);
			suggestions = [];
			for (let start of lineOffsets) {
				availableSnippets.forEach(snippet => {
					if (isPatternInWord(linePrefixLow, start, linePrefixLow.length, snippet.prefixLow, 0, snippet.prefixLow.length)) {
						suggestions.push(new SnippetCompletion(snippet, Range.fromPositions(position.delta(0, -(linePrefixLow.length - start)), position)));
						availableSnippets.delete(snippet);
					}
				});
			}
			if (endsInWhitespace || lineOffsets.length === 0) {
				// add remaing snippets when the current prefix ends in whitespace or when no
				// interesting positions have been found
				availableSnippets.forEach(snippet => {
					suggestions.push(new SnippetCompletion(snippet, Range.fromPositions(position)));
				});
			}


			// dismbiguate suggestions with same labels
			suggestions.sort(SnippetCompletion.compareByLabel);
			for (let i = 0; i < suggestions.length; i++) {
				let item = suggestions[i];
				let to = i + 1;
				for (; to < suggestions.length && item.label === suggestions[to].label; to++) {
					suggestions[to].label = localize('snippetSuggest.longLabel', "{0}, {1}", suggestions[to].label, suggestions[to].snippet.name);
				}
				if (to > i + 1) {
					suggestions[i].label = localize('snippetSuggest.longLabel', "{0}, {1}", suggestions[i].label, suggestions[i].snippet.name);
					i = to;
				}
			}
			return { suggestions };
		});
	}

	resolveCompletionItem?(model: ITextModel, position: Position, item: CompletionItem): CompletionItem {
		return (item instanceof SnippetCompletion) ? item.resolve() : item;
	}

	private _getLanguageIdAtPosition(model: ITextModel, position: Position): LanguageId {
		// validate the `languageId` to ensure this is a user
		// facing language with a name and the chance to have
		// snippets, else fall back to the outer language
		model.tokenizeIfCheap(position.lineNumber);
		let languageId = model.getLanguageIdAtPosition(position.lineNumber, position.column);
		const languageIdentifier = this._modeService.getLanguageIdentifier(languageId);
		if (languageIdentifier && !this._modeService.getLanguageName(languageIdentifier.language)) {
			languageId = model.getLanguageIdentifier().id;
		}
		return languageId;
	}
}
