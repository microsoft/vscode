/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Lazy } from 'vs/base/common/lazy';

/**
 * A regex that extracts the link suffix which contains line and column information.
 */
const linkSuffixRegex = new Lazy<RegExp>(() => {
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
		// foo 339:12                   [#140780]
		// "foo",339
		// "foo",339:12
		`(?::| |['"],)${l()}(:${c()})?$`,
		// "foo", line 339               [#40468]
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
		`['"](?:, |: ?| on )line ${l()}(, col(?:umn)? ${c()})?$`,
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

	return new RegExp(`(${suffixClause})`);
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
export function getLinkSuffix(link: string): { row: number | undefined; col: number | undefined; suffix: { index: number; text: string } } | null {
	const matches = linkSuffixRegex.getValue().exec(link);
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
