/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import MarkdownIt = require('markdown-it');
import { Lazy } from '../vs/base/common/lazy';
import { extname } from '../vs/base/common/resources';
import { escapeRegExpCharacters } from '../vs/base/common/strings';
import { URI } from '../vs/base/common/uri';
import { getLanguage, wellKnownLanguages } from './languages';

/**
 *
 * @param code A block of source code that might contain markdown code block fences
 * @returns A fence with the required number of backticks to avoid prematurely terminating the code block
 */
export function getFenceForCodeBlock(code: string, minNumberOfBackticks = 3) {
	const backticks = code.matchAll(/^\s*(```+)/gm);
	const backticksNeeded = Math.max(minNumberOfBackticks, ...Array.from(backticks, d => d[1].length + 1));
	return '`'.repeat(backticksNeeded);
}

export const filepathCodeBlockMarker = 'filepath:';

export function createFilepathRegexp(languageId?: string): RegExp {
	const language = getLanguage(languageId);
	const prefixes: string[] = ['#', '\\/\\/']; // always allow # and // as comment start
	const suffixes: string[] = [];
	function add(lineComment: { start: string; end?: string }) {
		prefixes.push(escapeRegExpCharacters(lineComment.start));
		if (lineComment.end) {
			suffixes.push(escapeRegExpCharacters(lineComment.end));
		}
	}
	add(language.lineComment);
	language.alternativeLineComments?.forEach(add);
	const startMatch = `(?:${prefixes.join('|')})`;
	const optionalEndMatch = suffixes.length ? `(?:\\s*${suffixes.join('|')})?` : '';
	return new RegExp(`^\\s*${startMatch}\\s*${filepathCodeBlockMarker}\\s*(.*?)${optionalEndMatch}\\s*$`);
}

/**
 * Create a markdown code block with an optional language id and an optional file path.
 * @param filePath The file path to include in the code block. To create the file path use the {@link IPromptPathRepresentationService}
 */
export function createFencedCodeBlock(languageId: string, code: string, shouldTrim = true, filePath?: string, minNumberOfBackticksOrStyle: string | number = 3): string {
	const fence = typeof minNumberOfBackticksOrStyle === 'number'
		? getFenceForCodeBlock(code, minNumberOfBackticksOrStyle)
		: minNumberOfBackticksOrStyle;

	let filepathComment = '';
	if (filePath) {
		filepathComment = getFilepathComment(languageId, filePath);
	}

	return `${fence}${fence && (languageIdToMDCodeBlockLang(languageId) + '\n')}${filepathComment}${shouldTrim ? code.trim() : code}${fence && ('\n' + fence)}`;
}

export function getFilepathComment(languageId: string, filePath: string): string {
	const language = getLanguage(languageId);
	const { start, end } = language.lineComment;
	return end ? `${start} ${filepathCodeBlockMarker} ${filePath} ${end}\n` : `${start} ${filepathCodeBlockMarker} ${filePath}\n`;
}

export function removeLeadingFilepathComment(codeblock: string, languageId: string, filepath: string): string {
	const filepathComment = getFilepathComment(languageId, filepath);
	if (codeblock.startsWith(filepathComment)) {
		return codeblock.substring(filepathComment.length);
	}

	return codeblock;
}

export function languageIdToMDCodeBlockLang(languageId: string): string {
	const language = getLanguage(languageId);
	return language?.markdownLanguageIds?.[0] ?? languageId;
}

const mdLanguageIdToLanguageId = new Lazy(() => {
	const result = new Map<string, string>();
	wellKnownLanguages.forEach((language, languageId) => {
		if (language.markdownLanguageIds) {
			language.markdownLanguageIds.forEach(mdLanguageId => {
				result.set(mdLanguageId, languageId);
			});
		} else {
			result.set(languageId, languageId);
		}
	});
	return result;
});

export function mdCodeBlockLangToLanguageId(mdLanguageId: string): string | undefined {
	return mdLanguageIdToLanguageId.value.get(mdLanguageId);
}

export function getLanguageId(uri: URI) {
	const ext = extname(uri).toLowerCase();

	return Object.keys(wellKnownLanguages).find(id => {
		return wellKnownLanguages.get(id)?.extensions?.includes(ext);
	}) || ext.replace(/^\./, '');
}

export function getMdCodeBlockLanguage(uri: URI) {
	const languageId = getLanguageId(uri);

	return languageIdToMDCodeBlockLang(languageId);
}

export interface MarkdownCodeBlock {
	/** The fence characters used to start the block. */
	readonly startMarkup: string;

	/** The markdown language id of the code block, e.g. 'typescript'. May be empty */
	readonly language: string;

	/** The code content of the block. */
	readonly code: string;

	readonly startLine: number;
	readonly endLine: number;
}

export function extractCodeBlocks(text: string): MarkdownCodeBlock[] {
	const out: MarkdownCodeBlock[] = [];
	const md = new MarkdownIt();
	const tokens = md.parse(text, {});
	for (const token of flattenTokensLists(tokens)) {
		if (token.map && token.type === 'fence') {
			out.push({
				startMarkup: token.markup,
				// Trim trailing newline since this is always included
				code: token.content.replace(/\n$/, ''),
				language: token.info.trim(),
				startLine: token.map[0],
				endLine: token.map[1],
			});
		}
	}
	return out;
}

export function extractInlineCode(text: string): string[] {
	const out: string[] = [];
	const md = new MarkdownIt();
	const tokens = md.parse(text, {});
	for (const token of flattenTokensLists(tokens)) {
		if (token.type === 'code_inline') {
			out.push(token.content.replace(/\n$/, ''));
		}
	}
	return out;
}

function* flattenTokensLists(tokensList: readonly MarkdownIt.Token[]): Iterable<MarkdownIt.Token> {
	for (const entry of tokensList) {
		if (entry.children) {
			yield* flattenTokensLists(entry.children);
		}
		yield entry;
	}
}
