/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fuzzyScore, FuzzyScoreOptions, fuzzyScoreGracefulAggressive } from '../../../../../../../base/common/filters.js';
import { InternalSuggestOptions } from '../../../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { IWordAtPosition, getWordAtText } from '../../../../../../../editor/common/core/wordHelper.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';

export const attachedContextCompletionSortText = '\u0000';
export const attachedContextCompletionAdditionalTriggerCharacters = [':', '-'] as const;

export function getAttachedContextCompletionSortText(score: number): string {
	return `${attachedContextCompletionSortText}${(0x7FFFFFFF - score).toString(16).padStart(8, '0')}`;
}

/**
 * `fuzzyScore` only looks at the first 128 characters of the text it matches against.
 */
const maxPromptSlashCommandFilterTextLength = 128;

/**
 * Word suffix aliases, with their `/`, are not shortened below this length.
 */
const minPromptSlashCommandAliasLength = 10;

export function getPromptSlashCommandFilterText(name: string): string | undefined {
	const command = `/${name}`;
	const displayCommand = name.includes(':') ? `/${name.replace(/:/g, ' ')}` : undefined;
	const commands = displayCommand ? `${command} ${displayCommand}` : command;
	const skillStart = name.lastIndexOf(':') + 1;
	const skillName = name.slice(skillStart);
	const wordSuffixes = [...skillName.matchAll(/-(?=[^-])/g)].map(match => `/${skillName.slice(match.index + 1)}`);

	// Word suffixes go before the commands so that a later word of the name ranks like
	// the start of a command, in the room the commands leave. When there is no room
	// even for the shortest suffix, the commands are cut: they keep at least half of the
	// window, and their start up to the first word of the skill, or only their plugin
	// prefix when that leaves no room for the last word, so that a long command stays
	// matchable by its plugin prefix, and the suffixes share the rest.
	const room = maxPromptSlashCommandFilterTextLength - commands.length;
	const lastSuffixLength = wordSuffixes.length ? wordSuffixes[wordSuffixes.length - 1].length + 1 : 0;
	const roomAfter = (commandStartLength: number) => maxPromptSlashCommandFilterTextLength - Math.max(commandStartLength, maxPromptSlashCommandFilterTextLength / 2);
	const firstWordLength = command.length - (wordSuffixes.length ? wordSuffixes[0].length - 1 : 0);
	const commandStartLength = skillStart && roomAfter(firstWordLength) < lastSuffixLength ? skillStart + 1 : firstWordLength;
	const budget = lastSuffixLength <= room
		? room
		: Math.max(roomAfter(commandStartLength), minPromptSlashCommandAliasLength + 1);
	const suffixes = fitPromptSlashCommandAliases(wordSuffixes, budget);
	return displayCommand || suffixes.length ? [...suffixes, commands].join(' ') : undefined;
}

/**
 * Fits slash command aliases, longest first and each followed by a space, into `budget`
 * characters. Aliases that are too long are shortened to a common length, since an alias
 * is matched by its start, but not below {@link minPromptSlashCommandAliasLength}: if they
 * still do not fit, the longest are dropped. Aliases that end up the same are kept once.
 */
function fitPromptSlashCommandAliases(aliases: string[], budget: number): string[] {
	const length = (kept: string[], maxAliasLength: number) => kept.reduce((total, alias) => total + Math.min(alias.length, maxAliasLength) + 1, 0);
	let first = 0;
	for (let shortest = length(aliases, minPromptSlashCommandAliasLength); first < aliases.length && shortest > budget; first++) {
		shortest -= Math.min(aliases[first].length, minPromptSlashCommandAliasLength) + 1;
	}
	const kept = aliases.slice(first);
	let maxAliasLength = minPromptSlashCommandAliasLength;
	for (let tooLong = Math.max(maxAliasLength, ...kept.map(alias => alias.length)) + 1; tooLong - maxAliasLength > 1;) {
		const candidate = Math.floor((maxAliasLength + tooLong) / 2);
		if (length(kept, candidate) <= budget) {
			maxAliasLength = candidate;
		} else {
			tooLong = candidate;
		}
	}
	return [...new Set(kept.map(alias => alias.slice(0, maxAliasLength)))];
}

export function getAttachedContextCompletionMatch(typedWord: string, leader: string, name: string, kind: string, suggestOptions: InternalSuggestOptions): { filterText: string; score: number } | undefined {
	if (!typedWord) {
		return { filterText: typedWord, score: 0 };
	}

	const searchableText = `${leader}${name} ${leader}attachment:${name} ${name} ${kind}`;
	const scoreFn = suggestOptions.filterGraceful ? fuzzyScoreGracefulAggressive : fuzzyScore;
	const score = scoreFn(
		typedWord,
		typedWord.toLowerCase(),
		0,
		searchableText,
		searchableText.toLowerCase(),
		0,
		{ ...FuzzyScoreOptions.default, firstMatchCanBeWeak: !suggestOptions.matchOnWordStartOnly }
	);
	return score ? { filterText: typedWord, score: score[0] } : undefined;
}

export function escapeForCharClass(text: string): string {
	return text.replace(/[-\\^\]]/g, '\\$&');
}

export interface IChatCompletionRangeResult {
	insert: Range;
	replace: Range;
	varWord: IWordAtPosition | null;
}

export function getCompletionRangeWord(rangeResult: IChatCompletionRangeResult): string | undefined {
	return rangeResult.varWord?.word.slice(0, rangeResult.insert.endColumn - rangeResult.insert.startColumn);
}

export function computeCompletionRanges(model: ITextModel, position: Position, reg: RegExp, onlyOnWordStart = false): IChatCompletionRangeResult | undefined {
	const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
	if (!varWord && model.getWordUntilPosition(position).word) {
		// inside a "normal" word
		return;
	}

	if (!varWord && position.column > 1) {
		const textBefore = model.getValueInRange(new Range(position.lineNumber, position.column - 1, position.lineNumber, position.column));
		if (textBefore !== ' ') {
			return;
		}
	}

	if (varWord && onlyOnWordStart) {
		const wordBefore = model.getWordUntilPosition({ lineNumber: position.lineNumber, column: varWord.startColumn });
		if (wordBefore.word) {
			// inside a word
			return;
		}
	}

	let insert: Range;
	let replace: Range;
	if (!varWord) {
		insert = replace = Range.fromPositions(position);
	} else {
		insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
		replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
	}

	return { insert, replace, varWord };
}

export function isEmptyUpToCompletionWord(model: ITextModel, rangeResult: IChatCompletionRangeResult): boolean {
	const startToCompletionWordStart = new Range(1, 1, rangeResult.replace.startLineNumber, rangeResult.replace.startColumn);
	return !!model.getValueInRange(startToCompletionWordStart).match(/^\s*$/);
}

/**
 * Returns `true` when the cursor sits inside a non-empty token whose first
 * character is one of the given trigger characters (or is positioned right
 * after such a token). Used to gate completion providers so they only run
 * when the user is actively editing a trigger-led token.
 */
export function isAtTriggerCharacterToken(model: ITextModel, position: Position, triggerCharacters: readonly string[]): boolean {
	if (triggerCharacters.length === 0) {
		return false;
	}
	const line = model.getLineContent(position.lineNumber);
	const beforeCursor = line.slice(0, position.column - 1);
	// The current token is everything from the last whitespace char (or
	// start-of-line) up to the cursor.
	const wsIdx = beforeCursor.search(/\s\S*$/);
	const token = wsIdx >= 0 ? beforeCursor.slice(wsIdx + 1) : beforeCursor;
	if (token.length > 0 && triggerCharacters.includes(token[0])) {
		return true;
	}
	return triggerCharacters.includes('/') && /^\s*\//.test(beforeCursor);
}
