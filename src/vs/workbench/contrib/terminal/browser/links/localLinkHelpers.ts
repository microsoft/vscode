/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from 'vs/base/common/platform';

export interface LineColumnMatchInfo {
	/**
	 * Full matched label.
	 */
	label: string;
	/**
	 * Index of full matched label.
	 */
	index: number;
	/**
	 * Line the local link is pointing at, or 1.
	 */
	line: number;
	/**
	 * Column the local link is pointing at, or 1.
	 */
	column: number;
}

export interface LocalLinkMatchInfo extends LineColumnMatchInfo {
	/**
	 * Path in the local link.
	 */
	path: string;
}

/**
 * Encapsulation that links can be enclosed with to safely show/pass link
 * that contains spaces or other less safe symbols.
 *
 * Should be escaped for regex. Should be single characters.
 * Doubling the prefix will work by itself (i.e. `''my path/file.txt''` works).
 *
 * Note: Making it work for more than single character width could possible,
 * but is unrealistic edge case.
 */
const encapsulationPairs = [
	// Start, end
	['"', '"'],
	[`'`, `'`],
	['`', '`'],
	['\\(', '\\)'],
	['\\[', '\\]'],
	['\\{', '\\}'],
	['<', '>'],
];

/**
 * A careful regex, matching Unix paths when no encapsulation was provided,
 * therefore no spaces can be used, nor encapsulation symbols and other (&!`).
 *
 * Example paths:
 * /foo, ~/foo, ./foo, ../foo, ././foo/bar/../xyz, etc.
 *
 * Groups 0 and 1 contains whole matched path if any.
 */
const unixCarefulLocalPathClause = (
	`(` + (
		`[^\\s\\/:;,*?<>|!&()[\\]"'\`]*` +
		`\\/+` +
		`(?:` + (
			`[^\\s\\/:;,*?<>|!&()[\\]"'\`]+` +
			`\\/*`
		) + `)*`
	) + `)`
);

/**
 * A regex that matches Unix paths, allowing for encapsulation by quotes or
 * brackets, allowing path to contain spaces and other symbols (&!) incl. chars
 * for encapsulation other than the one used.
 *
 * Example paths:
 * * `"path/with spaces" `
 * * `'/foo/Shelby & Sons/bar'`
 * * `[dir/IMPORTANT!!!.txt]`
 *
 * Group 0 contains whole path if any, but includes leading prefix therefore
 * shouldn't be used, as it can fail (i.e. `"'d/f'"` -> g0 == `'d/f`).
 *
 * To capture whole path, find first not empty group after 1.
 */
const unixLocalPathClause = '(?:' + encapsulationPairs.map(([prefix, suffix]) => (
	`(?:` + (
		prefix +
		`(` + (
			// While all path/names shouldn't start with space, it's disallowed
			// mainly to prevent false positives for text like:
			// `foo "bar" not_a_dir/not_a_file.txt "xyz" fgh`.
			`(?!\\s)` +
			`[^${suffix}${prefix}\\/:;*?<>|]*` +
			// At least one path separator required to consider it as path
			`\\/+` +
			`(?:` + (
				`[^${suffix}\\/:;*?<>|]+` +
				`\\/*`
			) + `)*`
		) + `)` +
		// Try catch end of the encapsulation if possible
		suffix + `?`
	) + `)`
)).join('|') + '|' + unixCarefulLocalPathClause + ')';

/**
 * Windows absolute paths do specify disk they are "absolute" to.
 */
export const winDrivePrefix = '(?:(?:\\\\\\\\\\?\\\\)?[a-zA-Z]:)';

/**
 * A careful regex, matching Windows paths when no encapsulation was provided,
 * therefore no spaces can be used, nor encapsulation symbols and other (&!`).
 *
 * Example paths:
 * C:\foo, \\?\c:\foo, ~\foo, .\foo, ..\foo, ./foo, C:/foo\../bar etc.
 *
 * Groups 0 and 1 contains whole matched path if any.
 */
const winCarefulLocalPathClause = (
	`(` + (
		`(?:` + (
			winDrivePrefix +
			`|` +
			`[^\\s\\/\\\\:;,*?<>|"!&()[\\]"'\`]+`
		) + `)` +
		`[\\/\\\\]+` +
		`(?:` + (
			`[^\\s\\/\\\\:;,*?<>|"!&()[\\]"'\`]+` +
			`[\\/\\\\]*`
		) + `)*`
	) + `)`
);

/**
 * A regex that matches Unix paths, allowing for encapsulation by quotes or
 * brackets, allowing path to contain spaces and other symbols (&!) incl. chars
 * for encapsulation other than the one used.
 *
 * Example paths:
 * * `"C:\\path/with spaces" `
 * * `'C:\foo\Shelby & Sons\bar'`
 * * `[dir/IMPORTANT!!!.txt]`
 *
 * Group 0 contains whole path if any, but includes leading prefix therefore
 * shouldn't be used, as it can fail (i.e. `"'d/f'"` -> g0 == `'d/f`).
 *
 * To capture whole path, find first not empty group after 1.
 */
const winLocalPathClause = '(?:' + encapsulationPairs.map(([prefix, suffix]) => (
	`(?:` + (
		prefix +
		`(` + (
			`(?!\\s)` +
			`(?:` + (
				winDrivePrefix +
				`|` +
				`[^${suffix}${prefix}\\/\\\\:;*?<>|"]+`
			) + `)` +
			// At least one path separator required to consider it as path
			`[\\/\\\\]+` +
			`(?:` + (
				`[^${suffix}\\/\\\\:;*;?<>|"]+` +
				`[\\/\\\\]*`
			) + `)*`
		) + `)` +
		// Try catch end of the encapsulation if possible
		suffix + `?`
	) + `)`
)).join('|') + '|' + winCarefulLocalPathClause + ')';

/**
 * Regexps used to match paths consists of multiple groups, matched mutually
 * exclusive, using different encapsulations or without any (the careful one).
 */
const numberOfPathGroups = encapsulationPairs.length + 1;

/**
 * A regular expressions clauses that match link and column notations.
 *
 * Odd groups should contain nothing or line number,
 * even groups should contain nothing or column number.
 * Therefore, empty group is required if its specific line-number-only clause.
 *
 * Only first not empty pair of groups will be matched and used.
 */
const lineAndColumnClauses = [
	// (file path):45, (file path) on 45, (file path) on line 45 column 18, (file path):45:18
	'(?:' + (
		// Account for anything left next to te captured path, i.e. ?123
		// TODO: idk is it necessary, it was '\\S*' before, don't want to break something by accident
		'[^\\s:;,@([]*' +

		// Most commonly,
		'(?::|,)?' +
		'\\s*' +

		// Optional parenthesis start
		'(?:[([]\\s*)?' +

		// Line
		'(?:(?:on|at|@)\\s*)?' +
		'(?:line\\s)?' +
		'(\\d+)' +

		// Optional column
		'(?:' + (
			'\\s*' +
			'(?:(?::|,|and)\\s*)?' +
			'(?:(?:on|at|@)\\s*)?' +
			'(?:column\\s*)?' +
			'(\\d+)'
		) + ')?' +

		// Try catch parenthesis end
		'(?:\\s*[)\\]])?'
	) + ')',
];

const lineAndColumnClause = `(?:${lineAndColumnClauses.join('|')})`;

// TODO: is caching RegExp object using global variables okay?

/**
 * RegExp to parse Unix local link (path with line and column).
 * Cached to avoid recompilations.
 */
const unixLocalLinkRegex = new RegExp(`${unixLocalPathClause}${lineAndColumnClause}?`, 'g');

/**
 * RegExp to parse Windows local link (path with line and column).
 * Cached to avoid recompilations.
 */
const winLocalLinkRegex = new RegExp(`${winLocalPathClause}${lineAndColumnClause}?`, 'g');

/**
 * Last group index in the local link regex, including line and column clauses.
 * Should point at column group usually.
 */
const lastGroupIndex = numberOfPathGroups + lineAndColumnClauses.length + 1;

/**
 * RegExp to parse line and column.
 * Cached to avoid recompilations.
 */
const lineAndColumnOnlyRegex = new RegExp(lineAndColumnClause);

/**
 * Searches for local links in provided text, including line and column number.
 * @param text String of text to search the links in.
 * @param os Selects `OperatingSystem` preference for links matching.
 * @returns Array of `LocalLinkMatchInfo` containing matches info.
 */
export const matchAllLocalLinks = (text: string, os: OperatingSystem): LocalLinkMatchInfo[] => {
	const result: LocalLinkMatchInfo[] = [];

	// Reuse cached regex
	const rex = os === OperatingSystem.Windows ? winLocalLinkRegex : unixLocalLinkRegex;
	rex.lastIndex = 0;

	let match;
	while ((match = rex.exec(text)) !== null) {
		// Find first not empty group after first (after index 0)
		let i = 0;
		while (i < numberOfPathGroups) {
			if (match[++i]) {
				break;
			}
		}
		const path = match[i];
		if (!path) {
			// Something matched, but can't find group which did it?
			break;
		}

		// Find line and column groups (first not empty after path groups)
		let line;
		let column;
		for (let i = numberOfPathGroups + 1; i <= lastGroupIndex; i++) {
			line = parseInt(match[i]);
			if (line) {
				column = parseInt(match[i + 1]);
				break;
			}
		}

		result.push({
			label: match[0],
			index: match.index,
			path,
			line: line || 1,
			column: column || 1,
		});
	}

	// TODO: could be refactored into generator? lease for cached RegExp would be required, or abandon caching (30ms diff?)

	return result;
};

/**
 * Searches for line and column numbers pair in string.
 * @param text Text to search in.
 * @returns Match info for first found clause, or null if not found.
 */
export const matchLineAndColumnNumbers = (text: string): LineColumnMatchInfo | null => {
	const match = lineAndColumnOnlyRegex.exec(text);
	if (!match) {
		return null;
	}

	// Find line and column groups (first not empty after path groups)
	let line;
	let column;
	for (let i = 1; i <= lineAndColumnClauses.length + 1; i++) {
		line = parseInt(match[i]);
		if (line) {
			column = parseInt(match[i + 1]);
			break;
		}
	}

	return {
		label: match[0],
		index: match.index,
		line: line || 1,
		column: column || 1,
	};
};
