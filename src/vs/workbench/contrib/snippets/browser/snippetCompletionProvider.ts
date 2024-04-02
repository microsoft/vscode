/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { compare, compareSubstring } from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList, CompletionItemInsertTextRule, CompletionContext, CompletionTriggerKind, CompletionItemLabel, Command } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { SnippetParser } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { localize } from 'vs/nls';
import { ISnippetsService } from 'vs/workbench/contrib/snippets/browser/snippets';
import { Snippet, SnippetSource } from 'vs/workbench/contrib/snippets/browser/snippetsFile';
import { isPatternInWord } from 'vs/base/common/filters';
import { StopWatch } from 'vs/base/common/stopwatch';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IWordAtPosition } from 'vs/editor/common/core/wordHelper';


const markSnippetAsUsed = '_snippet.markAsUsed';

CommandsRegistry.registerCommand(markSnippetAsUsed, (accessor, ...args) => {
	const snippetsService = accessor.get(ISnippetsService);
	const [first] = args;
	if (first instanceof Snippet) {
		snippetsService.updateUsageTimestamp(first);
	}
});

export class SnippetCompletion implements CompletionItem {

	label: CompletionItemLabel;
	detail: string;
	insertText: string;
	documentation?: MarkdownString;
	range: IRange | { insert: IRange; replace: IRange };
	sortText: string;
	kind: CompletionItemKind;
	insertTextRules: CompletionItemInsertTextRule;
	extensionId?: ExtensionIdentifier;
	command?: Command;

	constructor(
		readonly snippet: Snippet,
		range: IRange | { insert: IRange; replace: IRange },
	) {
		this.label = { label: snippet.prefix, description: snippet.name };
		this.detail = localize('detail.snippet', "{0} ({1})", snippet.description || snippet.name, snippet.source);
		this.insertText = snippet.codeSnippet;
		this.extensionId = snippet.extensionId;
		this.range = range;
		this.sortText = `${snippet.snippetSource === SnippetSource.Extension ? 'z' : 'a'}-${snippet.prefix}`;
		this.kind = CompletionItemKind.Snippet;
		this.insertTextRules = CompletionItemInsertTextRule.InsertAsSnippet;
		this.command = { id: markSnippetAsUsed, title: '', arguments: [snippet] };
	}

	resolve(): this {
		this.documentation = new MarkdownString().appendCodeblock('', SnippetParser.asInsertText(this.snippet.codeSnippet));
		return this;
	}

	static compareByLabel(a: SnippetCompletion, b: SnippetCompletion): number {
		return compare(a.label.label, b.label.label);
	}
}

interface ISnippetPosition {
	startColumn: number;
	prefixLow: string;
	isWord: boolean;
}

export class SnippetCompletionProvider implements CompletionItemProvider {

	readonly _debugDisplayName = 'snippetCompletions';

	constructor(
		@ILanguageService private readonly _languageService: ILanguageService,
		@ISnippetsService private readonly _snippets: ISnippetsService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService
	) {
		//
	}

	async provideCompletionItems(model: ITextModel, position: Position, context: CompletionContext): Promise<CompletionList> {

		const sw = new StopWatch();

		// compute all snippet anchors: word starts and every non word character
		const line = position.lineNumber;
		const word = model.getWordAtPosition(position) ?? { startColumn: position.column, endColumn: position.column, word: '' };

		const lineContentLow = model.getLineContent(position.lineNumber).toLowerCase();
		const lineContentWithWordLow = lineContentLow.substring(0, word.startColumn + word.word.length - 1);
		const anchors = this._computeSnippetPositions(model, line, word, lineContentWithWordLow);

		// loop over possible snippets and match them against the anchors
		const columnOffset = position.column - 1;
		const triggerCharacterLow = context.triggerCharacter?.toLowerCase() ?? '';
		const languageId = this._getLanguageIdAtPosition(model, position);
		const languageConfig = this._languageConfigurationService.getLanguageConfiguration(languageId);
		const snippets = new Set(await this._snippets.getSnippets(languageId));
		const suggestions: SnippetCompletion[] = [];

		for (const snippet of snippets) {

			if (context.triggerKind === CompletionTriggerKind.TriggerCharacter && !snippet.prefixLow.startsWith(triggerCharacterLow)) {
				// strict -> when having trigger characters they must prefix-match
				continue;
			}

			let candidate: ISnippetPosition | undefined;
			for (const anchor of anchors) {

				if (anchor.prefixLow.match(/^\s/) && !snippet.prefixLow.match(/^\s/)) {
					// only allow whitespace anchor when snippet prefix starts with whitespace too
					continue;
				}

				if (isPatternInWord(anchor.prefixLow, 0, anchor.prefixLow.length, snippet.prefixLow, 0, snippet.prefixLow.length)) {
					candidate = anchor;
					break;
				}
			}

			if (!candidate) {
				continue;
			}

			const pos = candidate.startColumn - 1;

			const prefixRestLen = snippet.prefixLow.length - (columnOffset - pos);
			const endsWithPrefixRest = compareSubstring(lineContentLow, snippet.prefixLow, columnOffset, columnOffset + prefixRestLen, columnOffset - pos);
			const startPosition = position.with(undefined, pos + 1);

			let endColumn = endsWithPrefixRest === 0 ? position.column + prefixRestLen : position.column;

			// First check if there is anything to the right of the cursor
			if (columnOffset < lineContentLow.length) {
				const autoClosingPairs = languageConfig.getAutoClosingPairs();
				const standardAutoClosingPairConditionals = autoClosingPairs.autoClosingPairsCloseSingleChar.get(lineContentLow[columnOffset]);
				// If the character to the right of the cursor is a closing character of an autoclosing pair
				if (standardAutoClosingPairConditionals?.some(p =>
					// and the start position is the opening character of an autoclosing pair
					p.open === lineContentLow[startPosition.column - 1] &&
					// and the snippet prefix contains the opening and closing pair at its edges
					snippet.prefix.startsWith(p.open) &&
					snippet.prefix[snippet.prefix.length - 1] === p.close)
				) {
					// Eat the character that was likely inserted because of auto-closing pairs
					endColumn++;
				}
			}

			const replace = Range.fromPositions({ lineNumber: line, column: candidate.startColumn }, { lineNumber: line, column: endColumn });
			const insert = replace.setEndPosition(line, position.column);

			suggestions.push(new SnippetCompletion(snippet, { replace, insert }));
			snippets.delete(snippet);
		}

		// add remaing snippets when the current prefix ends in whitespace or when line is empty
		// and when not having a trigger character
		if (!triggerCharacterLow && (/\s/.test(lineContentLow[position.column - 2]) /*end in whitespace */ || !lineContentLow /*empty line*/)) {
			for (const snippet of snippets) {
				const insert = Range.fromPositions(position);
				const replace = lineContentLow.indexOf(snippet.prefixLow, columnOffset) === columnOffset ? insert.setEndPosition(position.lineNumber, position.column + snippet.prefixLow.length) : insert;
				suggestions.push(new SnippetCompletion(snippet, { replace, insert }));
			}
		}

		// dismbiguate suggestions with same labels
		this._disambiguateSnippets(suggestions);

		return {
			suggestions,
			duration: sw.elapsed()
		};
	}

	private _disambiguateSnippets(suggestions: SnippetCompletion[]) {
		suggestions.sort(SnippetCompletion.compareByLabel);
		for (let i = 0; i < suggestions.length; i++) {
			const item = suggestions[i];
			let to = i + 1;
			for (; to < suggestions.length && item.label === suggestions[to].label; to++) {
				suggestions[to].label.label = localize('snippetSuggest.longLabel', "{0}, {1}", suggestions[to].label.label, suggestions[to].snippet.name);
			}
			if (to > i + 1) {
				suggestions[i].label.label = localize('snippetSuggest.longLabel', "{0}, {1}", suggestions[i].label.label, suggestions[i].snippet.name);
				i = to;
			}
		}
	}

	resolveCompletionItem(item: CompletionItem): CompletionItem {
		return (item instanceof SnippetCompletion) ? item.resolve() : item;
	}

	private _computeSnippetPositions(model: ITextModel, line: number, word: IWordAtPosition, lineContentWithWordLow: string): ISnippetPosition[] {
		const result: ISnippetPosition[] = [];

		for (let column = 1; column < word.startColumn; column++) {
			const wordInfo = model.getWordAtPosition(new Position(line, column));
			result.push({
				startColumn: column,
				prefixLow: lineContentWithWordLow.substring(column - 1),
				isWord: Boolean(wordInfo)
			});
			if (wordInfo) {
				column = wordInfo.endColumn;

				// the character right after a word is an anchor, always
				result.push({
					startColumn: wordInfo.endColumn,
					prefixLow: lineContentWithWordLow.substring(wordInfo.endColumn - 1),
					isWord: false
				});
			}
		}

		if (word.word.length > 0 || result.length === 0) {
			result.push({
				startColumn: word.startColumn,
				prefixLow: lineContentWithWordLow.substring(word.startColumn - 1),
				isWord: true
			});
		}

		return result;
	}

	private _getLanguageIdAtPosition(model: ITextModel, position: Position): string {
		// validate the `languageId` to ensure this is a user
		// facing language with a name and the chance to have
		// snippets, else fall back to the outer language
		model.tokenization.tokenizeIfCheap(position.lineNumber);
		let languageId = model.getLanguageIdAtPosition(position.lineNumber, position.column);
		if (!this._languageService.getLanguageName(languageId)) {
			languageId = model.getLanguageId();
		}
		return languageId;
	}
}
