/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Lazy } from 'vs/base/common/lazy';

export interface IParsedLink {
	path: ILinkPartialRange;
	prefix?: ILinkPartialRange;
	suffix?: ILinkSuffix;
}

export interface ILinkSuffix {
	row: number | undefined;
	col: number | undefined;
	suffix: ILinkPartialRange;
}

export interface ILinkPartialRange {
	index: number;
	text: string;
}

/**
 * A regex that extracts the link suffix which contains line and column information.
 */
const linkSuffixRegexEol = new Lazy<RegExp>(() => {
	let ri = 0;
	let ci = 0;
	function l(): string {
		return `(?<row${ri++}>\\d+)`;
	}
	function c(): string {
		return `(?<col${ci++}>\\d+)`;
	}

	// The comments in the regex below use real strings/numbers for better readability, here's
	// the legend:
	// - Path = foo
	// - Row  = 339
	// - Col  = 12
	//
	// These all support single quote ' in the place of " and [] in the place of ()
	const lineAndColumnRegexClauses = [
		// foo:339
		// foo:339:12
		// foo 339
		// foo 339:12                    [#140780]
		// "foo",339
		// "foo",339:12
		`(?::| |['"],)${l()}(:${c()})?$`,
		// The quotes below are optional [#171652]
		// "foo", line 339                [#40468]
		// "foo", line 339, col 12
		// "foo", line 339, column 12
		// "foo":line 339
		// "foo":line 339, col 12
		// "foo":line 339, column 12
		// "foo": line 339
		// "foo": line 339, col 12
		// "foo": line 339, column 12
		// "foo" on line 339
		// "foo" on line 339, col 12
		// "foo" on line 339, column 12
		`['"]?(?:, |: ?| on )line ${l()}(, col(?:umn)? ${c()})?$`,
		// foo(339)
		// foo(339,12)
		// foo(339, 12)
		// foo (339)
		// foo (339,12)
		// foo (339, 12)
		` ?[\\[\\(]${l()}(?:, ?${c()})?[\\]\\)]$`,
	];

	const suffixClause = lineAndColumnRegexClauses
		// Join all clauses together
		.join('|')
		// Convert spaces to allow the non-breaking space char (ascii 160)
		.replace(/ /g, `[${'\u00A0'} ]`);

	return new RegExp(`(${suffixClause})`);
});

const linkSuffixRegex = new Lazy<RegExp>(() => {
	let ri = 0;
	let ci = 0;
	function l(): string {
		return `(?<row${ri++}>\\d+)`;
	}
	function c(): string {
		return `(?<col${ci++}>\\d+)`;
	}

	const lineAndColumnRegexClauses = [
		// foo:339
		// foo:339:12
		// foo 339
		// foo 339:12                    [#140780]
		// "foo",339
		// "foo",339:12
		`(?::| |['"],)${l()}(:${c()})?`,
		// The quotes below are optional [#171652]
		// foo, line 339                [#40468]
		// foo, line 339, col 12
		// foo, line 339, column 12
		// "foo":line 339
		// "foo":line 339, col 12
		// "foo":line 339, column 12
		// "foo": line 339
		// "foo": line 339, col 12
		// "foo": line 339, column 12
		// "foo" on line 339
		// "foo" on line 339, col 12
		// "foo" on line 339, column 12
		`['"]?(?:, |: ?| on )line ${l()}(, col(?:umn)? ${c()})?`,
		// foo(339)
		// foo(339,12)
		// foo(339, 12)
		// foo (339)
		// foo (339,12)
		// foo (339, 12)
		` ?[\\[\\(]${l()}(?:, ?${c()})?[\\]\\)]`,
	];

	const suffixClause = lineAndColumnRegexClauses
		// Join all clauses together
		.join('|')
		// Convert spaces to allow the non-breaking space char (ascii 160)
		.replace(/ /g, `[${'\u00A0'} ]`);

	return new RegExp(`(${suffixClause})`, 'g');
});

/**
 * Removes the optional link suffix which contains line and column information.
 * @param link The link to parse.
 */
export function removeLinkSuffix(link: string): string {
	const suffix = getLinkSuffix(link)?.suffix;
	if (!suffix) {
		return link;
	}
	return link.substring(0, suffix.index);
}

/**
 * Returns the optional link suffix which contains line and column information.
 * @param link The link to parse.
 */
export function getLinkSuffix(link: string): ILinkSuffix | null {
	const matches = linkSuffixRegexEol.value.exec(link);
	const groups = matches?.groups;
	if (!groups || matches.length < 1) {
		return null;
	}
	const rowString = groups.row0 || groups.row1 || groups.row2;
	const colString = groups.col0 || groups.col1 || groups.col2;
	return {
		row: rowString !== undefined ? parseInt(rowString) : undefined,
		col: colString !== undefined ? parseInt(colString) : undefined,
		suffix: { index: matches.index, text: matches[0] }
	};
}

export function detectLinkSuffixes(line: string): ILinkSuffix[] {
	// Find all suffixes on the line. Since the regex global flag is used, lastIndex will be updated
	// in place such that there are no overlapping matches.
	let match: RegExpExecArray | null;
	const results: ILinkSuffix[] = [];
	linkSuffixRegex.value.lastIndex = 0;
	while ((match = linkSuffixRegex.value.exec(line)) !== null) {
		const suffix = toLinkSuffix(match);
		if (suffix === null) {
			break;
		}
		results.push(suffix);
	}
	return results;
}

export function toLinkSuffix(match: RegExpExecArray | null): ILinkSuffix | null {
	const groups = match?.groups;
	if (!groups || match.length < 1) {
		return null;
	}
	const rowString = groups.row0 || groups.row1 || groups.row2;
	const colString = groups.col0 || groups.col1 || groups.col2;
	return {
		row: rowString !== undefined ? parseInt(rowString) : undefined,
		col: colString !== undefined ? parseInt(colString) : undefined,
		suffix: { index: match.index, text: match[0] }
	};
}

// TODO: Handle ", ', [, ], etc.
const linkWithSuffixPathCharacters = /(?<path>[^\s]+)$/;

export function detectLinks(line: string) {
	const results: IParsedLink[] = [];

	// 1: Detect link suffixes on the line
	const suffixes = detectLinkSuffixes(line);
	for (const suffix of suffixes) {
		const beforeSuffix = line.substring(0, suffix.suffix.index);
		const possiblePathMatch = beforeSuffix.match(linkWithSuffixPathCharacters);
		if (possiblePathMatch && possiblePathMatch.index !== undefined && possiblePathMatch.groups?.path) {
			const linkStartIndex = possiblePathMatch.index;
			let path = possiblePathMatch.groups.path;
			// Extract a path prefix if it exists (not part of the path, but part of the underlined
			// section)
			let prefix: ILinkPartialRange | undefined = undefined;
			const prefixMatch = path.match(/^(?<prefix>['"]+)/);
			if (prefixMatch?.groups?.prefix) {
				prefix = {
					index: linkStartIndex,
					text: prefixMatch?.groups?.prefix
				};
				path = path.substring(prefix.text.length);
			}
			results.push({
				path: {
					index: linkStartIndex + (prefix?.text.length || 0),
					text: path
				},
				prefix,
				suffix
			});
		}
	}


	// TODO: Annotate link prefix, here or in path resolve?

	// Return only link suffixes if they were found
	if (results.length > 0) {
		return results;
	}

	// 2: Detect paths with no suffix
	// TODO: ...

	return results;
}
