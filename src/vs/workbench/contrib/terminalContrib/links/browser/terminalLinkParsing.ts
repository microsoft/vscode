/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This module is responsible for parsing possible links out of lines with only access to the line
 * text and the target operating system, ie. it does not do any validation that paths actually
 * exist.
 */

import { Lazy } from 'vs/base/common/lazy';
import { OperatingSystem } from 'vs/base/common/platform';

export interface IParsedLink {
	path: ILinkPartialRange;
	prefix?: ILinkPartialRange;
	suffix?: ILinkSuffix;
}

export interface ILinkSuffix {
	row: number | undefined;
	col: number | undefined;
	rowEnd: number | undefined;
	colEnd: number | undefined;
	suffix: ILinkPartialRange;
}

export interface ILinkPartialRange {
	index: number;
	text: string;
}

/**
 * A regex that extracts the link suffix which contains line and column information. The link suffix
 * must terminate at the end of line.
 */
const linkSuffixRegexEol = new Lazy<RegExp>(() => generateLinkSuffixRegex(true));
/**
 * A regex that extracts the link suffix which contains line and column information.
 */
const linkSuffixRegex = new Lazy<RegExp>(() => generateLinkSuffixRegex(false));

function generateLinkSuffixRegex(eolOnly: boolean) {
	let ri = 0;
	let ci = 0;
	let rei = 0;
	let cei = 0;
	function r(): string {
		return `(?<row${ri++}>\\d+)`;
	}
	function c(): string {
		return `(?<col${ci++}>\\d+)`;
	}
	function re(): string {
		return `(?<rowEnd${rei++}>\\d+)`;
	}
	function ce(): string {
		return `(?<colEnd${cei++}>\\d+)`;
	}

	const eolSuffix = eolOnly ? '$' : '';

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
		// foo 339:12                             [#140780]
		// "foo",339
		// "foo",339:12
		`(?::| |['"],)${r()}(:${c()})?` + eolSuffix,
		// The quotes below are optional          [#171652]
		// "foo", line 339                        [#40468]
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
		// "foo" line 339 column 12
		// "foo", line 339, character 12          [#171880]
		// "foo", line 339, characters 12-14      [#171880]
		// "foo", lines 339-341                   [#171880]
		// "foo", lines 339-341, characters 12-14 [#178287]
		`['"]?(?:,? |: ?| on )lines? ${r()}(?:-${re()})?(?:,? (?:col(?:umn)?|characters?) ${c()}(?:-${ce()})?)?` + eolSuffix,
		// foo(339)
		// foo(339,12)
		// foo(339, 12)
		// foo (339)
		//   ...
		// foo: (339)
		//   ...
		`:? ?[\\[\\(]${r()}(?:, ?${c()})?[\\]\\)]` + eolSuffix,
	];

	const suffixClause = lineAndColumnRegexClauses
		// Join all clauses together
		.join('|')
		// Convert spaces to allow the non-breaking space char (ascii 160)
		.replace(/ /g, `[${'\u00A0'} ]`);

	return new RegExp(`(${suffixClause})`, eolOnly ? undefined : 'g');
}

/**
 * Removes the optional link suffix which contains line and column information.
 * @param link The link to use.
 */
export function removeLinkSuffix(link: string): string {
	const suffix = getLinkSuffix(link)?.suffix;
	if (!suffix) {
		return link;
	}
	return link.substring(0, suffix.index);
}

/**
 * Removes any query string from the link.
 * @param link The link to use.
 */
export function removeLinkQueryString(link: string): string {
	// Skip ? in UNC paths
	const start = link.startsWith('\\\\?\\') ? 4 : 0;
	const index = link.indexOf('?', start);
	if (index === -1) {
		return link;
	}
	return link.substring(0, index);
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

/**
 * Returns the optional link suffix which contains line and column information.
 * @param link The link to parse.
 */
export function getLinkSuffix(link: string): ILinkSuffix | null {
	return toLinkSuffix(linkSuffixRegexEol.value.exec(link));
}

export function toLinkSuffix(match: RegExpExecArray | null): ILinkSuffix | null {
	const groups = match?.groups;
	if (!groups || match.length < 1) {
		return null;
	}
	return {
		row: parseIntOptional(groups.row0 || groups.row1 || groups.row2),
		col: parseIntOptional(groups.col0 || groups.col1 || groups.col2),
		rowEnd: parseIntOptional(groups.rowEnd0 || groups.rowEnd1 || groups.rowEnd2),
		colEnd: parseIntOptional(groups.colEnd0 || groups.colEnd1 || groups.colEnd2),
		suffix: { index: match.index, text: match[0] }
	};
}

function parseIntOptional(value: string | undefined): number | undefined {
	if (value === undefined) {
		return value;
	}
	return parseInt(value);
}

// This defines valid path characters for a link with a suffix, the first `[]` of the regex includes
// characters the path is not allowed to _start_ with, the second `[]` includes characters not
// allowed at all in the path. If the characters show up in both regexes the link will stop at that
// character, otherwise it will stop at a space character.
const linkWithSuffixPathCharacters = /(?<path>[^\s\|<>\[\({][^\s\|<>]*)$/;

export function detectLinks(line: string, os: OperatingSystem) {
	// 1: Detect all links on line via suffixes first
	const results = detectLinksViaSuffix(line);

	// 2: Detect all links without suffixes and merge non-conflicting ranges into the results
	const noSuffixPaths = detectPathsNoSuffix(line, os);
	binaryInsertList(results, noSuffixPaths);

	return results;
}

function binaryInsertList(list: IParsedLink[], newItems: IParsedLink[]) {
	if (list.length === 0) {
		list.push(...newItems);
	}
	for (const item of newItems) {
		binaryInsert(list, item, 0, list.length);
	}
}

function binaryInsert(list: IParsedLink[], newItem: IParsedLink, low: number, high: number) {
	if (list.length === 0) {
		list.push(newItem);
		return;
	}
	if (low > high) {
		return;
	}
	// Find the index where the newItem would be inserted
	const mid = Math.floor((low + high) / 2);
	if (
		mid >= list.length ||
		(newItem.path.index < list[mid].path.index && (mid === 0 || newItem.path.index > list[mid - 1].path.index))
	) {
		// Check if it conflicts with an existing link before adding
		if (
			mid >= list.length ||
			(newItem.path.index + newItem.path.text.length < list[mid].path.index && (mid === 0 || newItem.path.index > list[mid - 1].path.index + list[mid - 1].path.text.length))
		) {
			list.splice(mid, 0, newItem);
		}
		return;
	}
	if (newItem.path.index > list[mid].path.index) {
		binaryInsert(list, newItem, mid + 1, high);
	} else {
		binaryInsert(list, newItem, low, mid - 1);
	}
}

function detectLinksViaSuffix(line: string): IParsedLink[] {
	const results: IParsedLink[] = [];

	// 1: Detect link suffixes on the line
	const suffixes = detectLinkSuffixes(line);
	for (const suffix of suffixes) {
		const beforeSuffix = line.substring(0, suffix.suffix.index);
		const possiblePathMatch = beforeSuffix.match(linkWithSuffixPathCharacters);
		if (possiblePathMatch && possiblePathMatch.index !== undefined && possiblePathMatch.groups?.path) {
			let linkStartIndex = possiblePathMatch.index;
			let path = possiblePathMatch.groups.path;
			// Extract a path prefix if it exists (not part of the path, but part of the underlined
			// section)
			let prefix: ILinkPartialRange | undefined = undefined;
			const prefixMatch = path.match(/^(?<prefix>['"]+)/);
			if (prefixMatch?.groups?.prefix) {
				prefix = {
					index: linkStartIndex,
					text: prefixMatch.groups.prefix
				};
				path = path.substring(prefix.text.length);

				// If there are multiple characters in the prefix, trim the prefix if the _first_
				// suffix character is the same as the last prefix character. For example, for the
				// text `echo "'foo' on line 1"`:
				//
				// - Prefix='
				// - Path=foo
				// - Suffix=' on line 1
				//
				// If this fails on a multi-character prefix, just keep the original.
				if (prefixMatch.groups.prefix.length > 1) {
					if (suffix.suffix.text[0].match(/['"]/) && prefixMatch.groups.prefix[prefixMatch.groups.prefix.length - 1] === suffix.suffix.text[0]) {
						const trimPrefixAmount = prefixMatch.groups.prefix.length - 1;
						prefix.index += trimPrefixAmount;
						prefix.text = prefixMatch.groups.prefix[prefixMatch.groups.prefix.length - 1];
						linkStartIndex += trimPrefixAmount;
					}
				}
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

	return results;
}

enum RegexPathConstants {
	PathPrefix = '(?:\\.\\.?|\\~)',
	PathSeparatorClause = '\\/',
	// '":; are allowed in paths but they are often separators so ignore them
	// Also disallow \\ to prevent a catastropic backtracking case #24795
	ExcludedPathCharactersClause = '[^\\0<>\\?\\s!`&*()\'":;\\\\]',
	ExcludedStartPathCharactersClause = '[^\\0<>\\s!`&*()\\[\\]\'":;\\\\]',

	WinOtherPathPrefix = '\\.\\.?|\\~',
	WinPathSeparatorClause = '(?:\\\\|\\/)',
	WinExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!`&*()\'":;]',
	WinExcludedStartPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!`&*()\\[\\]\'":;]',
}

/**
 * A regex that matches non-Windows paths, such as `/foo`, `~/foo`, `./foo`, `../foo` and
 * `foo/bar`.
 */
const unixLocalLinkClause = '(?:(?:' + RegexPathConstants.PathPrefix + '|(?:' + RegexPathConstants.ExcludedStartPathCharactersClause + RegexPathConstants.ExcludedPathCharactersClause + '*))?(?:' + RegexPathConstants.PathSeparatorClause + '(?:' + RegexPathConstants.ExcludedPathCharactersClause + ')+)+)';

/**
 * A regex clause that matches the start of an absolute path on Windows, such as: `C:`, `c:` and
 * `\\?\C` (UNC path).
 */
export const winDrivePrefix = '(?:\\\\\\\\\\?\\\\)?[a-zA-Z]:';

/**
 * A regex that matches Windows paths, such as `\\?\c:\foo`, `c:\foo`, `~\foo`, `.\foo`, `..\foo`
 * and `foo\bar`.
 */
const winLocalLinkClause = '(?:(?:' + `(?:${winDrivePrefix}|${RegexPathConstants.WinOtherPathPrefix})` + '|(?:' + RegexPathConstants.WinExcludedStartPathCharactersClause + RegexPathConstants.WinExcludedPathCharactersClause + '*))?(?:' + RegexPathConstants.WinPathSeparatorClause + '(?:' + RegexPathConstants.WinExcludedPathCharactersClause + ')+)+)';

function detectPathsNoSuffix(line: string, os: OperatingSystem): IParsedLink[] {
	const results: IParsedLink[] = [];

	const regex = new RegExp(os === OperatingSystem.Windows ? winLocalLinkClause : unixLocalLinkClause, 'g');
	let match;
	while ((match = regex.exec(line)) !== null) {
		let text = match[0];
		let index = match.index;
		if (!text) {
			// Something matched but does not comply with the given match index, since this would
			// most likely a bug the regex itself we simply do nothing here
			break;
		}

		// Adjust the link range to exclude a/ and b/ if it looks like a git diff
		if (
			// --- a/foo/bar
			// +++ b/foo/bar
			((line.startsWith('--- a/') || line.startsWith('+++ b/')) && index === 4) ||
			// diff --git a/foo/bar b/foo/bar
			(line.startsWith('diff --git') && (text.startsWith('a/') || text.startsWith('b/')))
		) {
			text = text.substring(2);
			index += 2;
		}

		results.push({
			path: {
				index,
				text
			},
			prefix: undefined,
			suffix: undefined
		});
	}

	return results;
}
