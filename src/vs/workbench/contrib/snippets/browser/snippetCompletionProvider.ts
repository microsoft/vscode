/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { compare, compareSubstring, isHighSurrogate } from '../../../../base/common/strings.js';
import { findLastIdxMonotonous } from '../../../../base/common/arraysFind.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { WeakCachedFunction } from '../../../../base/common/cache.js';
import { Position } from '../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList, CompletionItemInsertTextRule, CompletionContext, CompletionTriggerKind, CompletionItemLabel, Command } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { SnippetParser } from '../../../../editor/contrib/snippet/browser/snippetParser.js';
import { localize } from '../../../../nls.js';
import { ISnippetsService } from './snippets.js';
import { Snippet, SnippetSource } from './snippetsFile.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ILanguageConfigurationService } from '../../../../editor/common/languages/languageConfigurationRegistry.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { getWordAtTextMaxLength, IWordAtPosition } from '../../../../editor/common/core/wordHelper.js';
import { createScopedLineTokens, getWordAtColumn, ILineWordScope } from '../../../../editor/common/languages/supports.js';


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

class SnippetLine {
	private readonly _scopes: ILineWordScope[] = [];
	readonly text: string;

	constructor(model: ITextModel, line: number, beforeColumn: number, config: ILanguageConfigurationService) {
		const tokens = model.tokenization.getLineTokens(line);
		this.text = tokens.getLineContent();
		// Copy language spans rather than retaining the token buffer, which edits can mutate in place.
		for (let i = 0; i < tokens.getCount() && tokens.getStartOffset(i) < beforeColumn - 1;) {
			const scope = createScopedLineTokens(tokens, tokens.getStartOffset(i));
			this._scopes.push(scope.getWordScope(config));
			i += scope.getTokenCount();
		}
	}

	private readonly _scopeAt = (offset: number) => this._scopes[findLastIdxMonotonous(this._scopes, scope => scope.offset <= offset)];

	wordAt(column: number): IWordAtPosition | null {
		const pos = column <= this.text.length && isHighSurrogate(this.text.charCodeAt(column - 2)) ? column - 1 : column;
		return getWordAtColumn(pos, column, this._scopeAt);
	}

	/** Find a point where the original forward walk can resume without inventing or losing an anchor. */
	scanStart(firstMatchColumn: number, wordStart: number): number {
		let start = Math.min(firstMatchColumn, wordStart);
		while (start > 1) {
			const scope = this._scopeAt(start - 2);
			const offset = start - 1 - scope.offset;
			const characters = simpleWordCharacters.get(scope.wordDefinition);
			if (characters && (!characters.test(scope.text[offset - 1]) || (start < wordStart && offset < scope.text.length && !characters.test(scope.text[offset])))) {
				return start;
			}
			// A word ending at the cutoff emits that anchor and advances past it.
			const canJoinAtEnd = start < wordStart && (this.wordAt(start)?.endColumn ?? start) === start;
			const crossing = this._crossingWordStart(scope, offset, canJoinAtEnd ? offset + 1 : offset, characters !== undefined);
			if (crossing === undefined) {
				return start;
			}
			start = crossing;
		}
		return start;
	}

	/** A word that skips the cutoff must start within one word-lookup window to its left. */
	private _crossingWordStart(scope: ILineWordScope, cutoff: number, requiredEnd: number, canSlice: boolean): number | undefined {
		const { text, wordDefinition } = scope;
		if (requiredEnd > text.length) {
			return undefined;
		}
		const maxLength = getWordAtTextMaxLength();
		const from = Math.max(0, requiredEnd - maxLength);
		const fullScope = text.length <= maxLength;
		if (fullScope || canSlice) {
			// For simple patterns, the longest permissible input covers matches on shorter clipped windows too.
			const sticky = new RegExp(wordDefinition.source, wordDefinition.sticky ? wordDefinition.flags : wordDefinition.flags + 'y');
			for (let i = from; i < cutoff; i++) {
				const origin = fullScope ? 0 : i;
				sticky.lastIndex = i - origin;
				if (sticky.test(fullScope ? text : text.substring(i, i + maxLength)) && sticky.lastIndex >= requiredEnd - origin) {
					return scope.offset + i + 1;
				}
			}
		} else {
			// A clipped input can change what an assertion matches; use the editor's actual lookup in that case.
			for (let i = from; i < cutoff; i++) {
				const word = this.wordAt(scope.offset + i + 1);
				if (word && word.endColumn >= scope.offset + requiredEnd + 1) {
					return word.startColumn;
				}
			}
		}
		return undefined;
	}
}

/** For simple word definitions a character excluded by every atom is a guaranteed word boundary. */
const simpleWordCharacters = new WeakCachedFunction((definition: RegExp): RegExp | undefined => {
	if (!/^[gi]*$/.test(definition.flags)) {
		return undefined;
	}
	const tokens = /(?<atom>\[(?:\\.|[^\]\\])*\]|\\[dDsSwW]|\\[^\w]|[^\\[\]().|*+?{}^$]|\.)|\(\?:|\((?!\?)|[)|?*+]/gy;
	const atoms = new Set<string>();
	while (tokens.lastIndex < definition.source.length) {
		const match = tokens.exec(definition.source);
		if (!match) {
			return undefined;
		}
		if (match.groups?.atom) {
			atoms.add(match.groups.atom);
		}
	}
	return atoms.size ? new RegExp([...atoms].join('|'), definition.ignoreCase ? 'i' : '') : undefined;
});

/** Every suffix starting here or later is a subsequence of the snippet prefix. */
function firstMatchingColumn(text: string, endColumn: number, prefix: string): number {
	let column = endColumn;
	for (let i = prefix.length - 1; i >= 0 && column > 1; i--) {
		if (text[column - 2] === prefix[i]) {
			column--;
		}
	}
	return column;
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

	async provideCompletionItems(model: ITextModel, position: Position, context: CompletionContext, token = CancellationToken.None): Promise<CompletionList> {

		const sw = new StopWatch();

		const line = position.lineNumber;
		const word = model.getWordAtPosition(position) ?? { startColumn: position.column, endColumn: position.column, word: '' };
		const snippetLine = new SnippetLine(model, line, word.startColumn, this._languageConfigurationService);

		const columnOffset = position.column - 1;
		const triggerCharacterLow = context.triggerCharacter?.toLowerCase() ?? '';
		const languageId = this._getLanguageIdAtPosition(model, position);
		const languageConfig = this._languageConfigurationService.getLanguageConfiguration(languageId);
		const available = await this._snippets.getSnippets(languageId, model.uri);
		if (model.isDisposed() || token.isCancellationRequested) {
			return { suggestions: [] };
		}

		const lineContentLow = snippetLine.text.toLowerCase();
		const wordEndColumn = Math.min(word.endColumn, lineContentLow.length + 1);
		const snippets = new Map<Snippet, number>();
		let firstMatchColumn = wordEndColumn;
		for (const snippet of available) {
			if (context.triggerKind === CompletionTriggerKind.TriggerCharacter && !snippet.prefixLow.startsWith(triggerCharacterLow)) {
				continue;
			}
			const column = firstMatchingColumn(lineContentLow, wordEndColumn, snippet.prefixLow);
			snippets.set(snippet, column);
			firstMatchColumn = Math.min(firstMatchColumn, column);
		}
		const anchors = snippets.size ? this._computeSnippetPositions(snippetLine, word, firstMatchColumn) : [];

		// loop over possible snippets and match them against the anchors
		const suggestions: SnippetCompletion[] = [];

		for (const [snippet, column] of snippets) {
			const startColumn = anchors.find(anchor => anchor >= column && (anchor >= wordEndColumn || !/\s/.test(lineContentLow[anchor - 1]) || /^\s/.test(snippet.prefixLow)));
			if (startColumn === undefined) {
				continue;
			}

			const pos = startColumn - 1;

			const prefixRestLen = snippet.prefixLow.length - (columnOffset - pos);
			const endsWithPrefixRest = compareSubstring(lineContentLow, snippet.prefixLow, columnOffset, columnOffset + prefixRestLen, columnOffset - pos);

			let endColumn = endsWithPrefixRest === 0 ? position.column + prefixRestLen : position.column;

			// First check if there is anything to the right of the cursor
			if (columnOffset < lineContentLow.length) {
				const autoClosingPairs = languageConfig.getAutoClosingPairs();
				const standardAutoClosingPairConditionals = autoClosingPairs.autoClosingPairsCloseSingleChar.get(lineContentLow[columnOffset]);
				// If the character to the right of the cursor is a closing character of an autoclosing pair
				if (standardAutoClosingPairConditionals?.some(p =>
					// and the start position is the opening character of an autoclosing pair
					p.open === lineContentLow[pos] &&
					// and the snippet prefix contains the opening and closing pair at its edges
					snippet.prefix.startsWith(p.open) &&
					snippet.prefix[snippet.prefix.length - 1] === p.close)
				) {
					// Eat the character that was likely inserted because of auto-closing pairs
					endColumn++;
				}
			}

			const replace = Range.fromPositions({ lineNumber: line, column: startColumn }, { lineNumber: line, column: endColumn });
			const insert = replace.setEndPosition(line, position.column);

			suggestions.push(new SnippetCompletion(snippet, { replace, insert }));
			snippets.delete(snippet);
		}

		// add remaining snippets when the current prefix ends in whitespace or when line is empty
		// and when not having a trigger character
		if (!triggerCharacterLow && (/\s/.test(lineContentLow[columnOffset - 1]) || !lineContentLow)) {
			for (const snippet of snippets.keys()) {
				const insert = Range.fromPositions(position);
				const replace = lineContentLow.startsWith(snippet.prefixLow, columnOffset) ? insert.setEndPosition(position.lineNumber, position.column + snippet.prefixLow.length) : insert;
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

	private _computeSnippetPositions(line: SnippetLine, word: IWordAtPosition, firstMatchColumn: number): number[] {
		const result: number[] = [];
		const firstColumn = line.scanStart(firstMatchColumn, word.startColumn);

		for (let column = firstColumn; column < word.startColumn; column++) {
			const wordInfo = line.wordAt(column);
			if (column >= firstMatchColumn) {
				result.push(column);
			}
			if (wordInfo) {
				column = wordInfo.endColumn;

				// the character right after a word is an anchor, always
				if (column >= firstMatchColumn) {
					result.push(column);
				}
			}
		}

		if (word.word.length > 0 || word.startColumn === 1) {
			result.push(word.startColumn);
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
