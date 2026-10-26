/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from './glob.js';
import { startsWithIgnoreCase, stripUTF8BOM } from './strings.js';

/**
 * Decides whether a path relative to the folder of an ignore file is ignored
 * (`true`), re-included (`false`) or not matched by any pattern (`undefined`).
 */
type IgnoreMatcher = (relativePath: string, isDir: boolean) => boolean | undefined;

/**
 * Globs that match every entry of the folder that contains an ignore file:
 * `*` or `**`, optionally preceded by `**` segments.
 */
const MATCH_ALL_ENTRIES_GLOB = /^(\*\*\/)*\*\*?$/;

export class IgnoreFile {

	private readonly location: string;
	private parsed: { readonly matcher: IgnoreMatcher; readonly ignoresAllEntries: boolean };

	constructor(
		contents: string,
		location: string,
		private readonly parent?: IgnoreFile,
		private readonly ignoreCase = false) {
		if (location[location.length - 1] === '\\') {
			throw Error('Unexpected path format, do not use trailing backslashes');
		}
		this.location = location[location.length - 1] === '/' ? location : `${location}/`;
		this.parsed = this.parseIgnoreFile(contents);
	}

	/**
	 * Updates the contents of the ignore file. Preserving the location and parent
	 * @param contents The new contents of the gitignore file
	 */
	updateContents(contents: string) {
		this.parsed = this.parseIgnoreFile(contents);
	}

	/**
	 * Whether the patterns ignore every entry of the folder that contains the
	 * ignore file, as `*` does. `git status` then reports the folder itself as
	 * ignored, although no pattern matches it.
	 */
	get ignoresAllEntries(): boolean {
		return this.parsed.ignoresAllEntries;
	}

	/**
	 * Returns true if a path in a traversable directory has not been ignored.
	 *
	 * Note: For performance reasons this does not check if the parent directories have been ignored,
	 * so it should always be used in tandem with `shouldTraverseDir` when walking a directory.
	 *
	 * In cases where a path must be tested in isolation, `isArbitraryPathIncluded` should be used.
	 */
	isPathIncludedInTraversal(path: string, isDir: boolean): boolean {
		if (path[0] !== '/' || path[path.length - 1] === '/') {
			throw Error('Unexpected path format, expected to begin with slash and end without. got:' + path);
		}

		const ignored = this.isPathIgnored(path, isDir);

		return !ignored;
	}

	/**
	 * Returns true if an arbitrary path has not been ignored.
	 * This is an expensive operation and should only be used outside of traversals.
	 */
	isArbitraryPathIgnored(path: string, isDir: boolean): boolean {
		if (path[0] !== '/' || path[path.length - 1] === '/') {
			throw Error('Unexpected path format, expected to begin with slash and end without. got:' + path);
		}

		const segments = path.split('/').filter(x => x);
		let ignored = false;

		let walkingPath = '';

		for (let i = 0; i < segments.length; i++) {
			const isLast = i === segments.length - 1;
			const segment = segments[i];

			walkingPath = walkingPath + '/' + segment;

			if (!this.isPathIncludedInTraversal(walkingPath, isLast ? isDir : true)) {
				ignored = true;
				break;
			}
		}

		return ignored;
	}

	private isPathIgnored(path: string, isDir: boolean): boolean {
		const isInLocation = this.ignoreCase ? startsWithIgnoreCase(path, this.location) : path.startsWith(this.location);
		if (isInLocation) {
			const ignored = this.parsed.matcher(path.substring(this.location.length), isDir);
			if (ignored !== undefined) {
				return ignored; // patterns in this file take precedence over patterns in parent files
			}
		}

		return this.parent?.isPathIgnored(path, isDir) ?? false;
	}

	private parseIgnoreFile(contents: string): { matcher: IgnoreMatcher; ignoresAllEntries: boolean } {
		const patterns = parseGitIgnore(contents);
		const lastNegation = patterns.findLastIndex(pattern => pattern.negated);

		// The last pattern that matches a path decides whether it is ignored.
		// Consecutive patterns that have the same effect are matched together.
		const groups: { negated: boolean; any: glob.IExpression; directories: glob.IExpression }[] = [];
		for (let i = 0; i < patterns.length; i++) {
			const pattern = patterns[i];

			let group = groups.at(-1);
			if (group?.negated !== pattern.negated) {
				group = { negated: pattern.negated, any: Object.create(null), directories: Object.create(null) };
				groups.push(group);
			}

			// Patterns are matched against paths relative to the location
			let globPattern = pattern.anchored ? pattern.glob : `**/${pattern.glob}`;

			// A trailing `/**` matches everything inside a folder, but not the
			// folder itself. Unless a later pattern may re-include something
			// inside, the folder is skipped as a whole when traversing.
			if (globPattern.endsWith('/**')) {
				if (!pattern.directoryOnly && i > lastNegation) {
					group.directories[globPattern.substring(0, globPattern.length - 3)] = true;
				}
				globPattern += '/*';
			}

			(pattern.directoryOnly ? group.directories : group.any)[globPattern] = true;
		}

		const options: glob.IGlobOptions = { ignoreCase: this.ignoreCase };
		const matchers = groups.map(group => ({
			negated: group.negated,
			any: glob.parse(group.any, options),
			directories: glob.parse(group.directories, options)
		}));

		const matcher: IgnoreMatcher = (relativePath, isDir) => {
			const basename = relativePath.substring(relativePath.lastIndexOf('/') + 1);
			for (let i = matchers.length - 1; i >= 0; i--) {
				const { negated, any, directories } = matchers[i];
				if (any(relativePath, basename) || (isDir && directories(relativePath, basename))) {
					return !negated;
				}
			}

			return undefined;
		};

		// No later negation may re-include an entry that such a pattern ignores
		const ignoresAllEntries = patterns.slice(lastNegation + 1).some(pattern => !pattern.directoryOnly && MATCH_ALL_ENTRIES_GLOB.test(pattern.glob));

		return { matcher, ignoresAllEntries };
	}
}

/**
 * A pattern of a `.gitignore` file, see https://git-scm.com/docs/gitignore.
 */
export interface IGitIgnorePattern {

	/**
	 * Whether the pattern re-includes the paths it matches (it starts with `!`).
	 */
	readonly negated: boolean;

	/**
	 * Whether the pattern only matches directories (it ends with `/`).
	 */
	readonly directoryOnly: boolean;

	/**
	 * Whether the pattern contains a `/` before its end. An anchored pattern is
	 * matched against paths relative to the folder of the ignore file. Otherwise
	 * the pattern contains no `/` and matches the name of a file or folder at
	 * any depth below that folder.
	 */
	readonly anchored: boolean;

	/**
	 * The pattern as a glob without leading or trailing `/`. Characters that git
	 * matches literally but globs treat specially, such as `{` or escaped
	 * characters, are put into brackets (`[{]`).
	 */
	readonly glob: string;
}

/**
 * Parses the contents of a `.gitignore` file. Blank lines and comments are
 * skipped, and so are patterns that cannot match any path, such as patterns
 * with an unclosed bracket expression, or that use bracket expressions which
 * are not supported (see `toBracketExpression`). Skipping a pattern means
 * ignoring less than git does, never more.
 */
export function parseGitIgnore(contents: string): IGitIgnorePattern[] {
	const patterns: IGitIgnorePattern[] = [];
	for (const line of stripUTF8BOM(contents).split('\n')) {
		const pattern = parseGitIgnoreLine(line);
		if (pattern) {
			patterns.push(pattern);
		}
	}

	return patterns;
}

function parseGitIgnoreLine(line: string): IGitIgnorePattern | undefined {
	if (line.endsWith('\r')) {
		line = line.substring(0, line.length - 1);
	}

	if (line.startsWith('#')) {
		return undefined;
	}

	line = trimTrailingSpaces(line);

	const negated = line.startsWith('!');
	if (negated) {
		line = line.substring(1);
	}

	const directoryOnly = line.endsWith('/');
	if (directoryOnly) {
		line = line.substring(0, line.length - 1);
	}

	const anchored = line.includes('/');
	if (line.startsWith('/')) {
		line = line.substring(1);
	}

	const globPattern = toGlob(line);

	return globPattern ? { negated, directoryOnly, anchored, glob: globPattern } : undefined;
}

/**
 * Removes trailing spaces unless they are escaped with a backslash. Unlike
 * other whitespace, leading spaces are part of the pattern.
 */
function trimTrailingSpaces(line: string): string {
	let lastSpace = -1;
	for (let i = 0; i < line.length; i++) {
		if (line[i] === ' ') {
			if (lastSpace === -1) {
				lastSpace = i;
			}
		} else {
			if (line[i] === '\\') {
				i++; // skip the escaped character
			}
			lastSpace = -1;
		}
	}

	return lastSpace === -1 ? line : line.substring(0, lastSpace);
}

/**
 * Characters that git matches literally but globs treat specially, and
 * bracket expressions that match them literally.
 */
const LITERAL_CHARACTERS: { readonly [character: string]: string } = {
	'*': '[*]',
	'?': '[?]',
	'[': '[[]',
	']': '[]]',
	'{': '[{]',
	'}': '[}]',
	'(': '[(]',
	')': '[)]',
	'\\': '[\\]',
};

/**
 * Converts the pattern of a line, without negation and leading or trailing
 * `/`, into a glob. Returns `undefined` for patterns that cannot match any
 * path.
 */
function toGlob(pattern: string): string | undefined {
	let result = '';
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		switch (char) {
			case '\\': {
				const escaped = pattern[++i];
				if (escaped === undefined || escaped === '/') {
					return undefined; // a trailing backslash never matches, escaped separators are not supported
				}
				result += LITERAL_CHARACTERS[escaped] ?? escaped;
				break;
			}
			case '[': {
				const bracketExpression = toBracketExpression(pattern, i);
				if (!bracketExpression) {
					return undefined;
				}
				result += bracketExpression.glob;
				i = bracketExpression.end;
				break;
			}
			case '*': {
				// Consecutive asterisks only match across folders when they form a whole segment
				const start = i;
				while (pattern[i + 1] === '*') {
					i++;
				}
				const isSegment = (start === 0 || pattern[start - 1] === '/') && (i === pattern.length - 1 || pattern[i + 1] === '/');
				result += isSegment && i > start ? '**' : '*';
				break;
			}
			case '?':
			case '/':
				result += char;
				break;
			default:
				result += LITERAL_CHARACTERS[char] ?? char;
		}
	}

	// Paths never contain empty, `.` or `..` segments
	if (result.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
		return undefined;
	}

	// Globs ignore leading and trailing whitespace
	return result.replace(/^\s|\s$/g, whitespace => `[${whitespace}]`);
}

/**
 * Characters and ranges of characters that both git and globs match literally
 * inside a bracket expression.
 */
const BRACKET_EXPRESSION_MEMBERS = /^(?:[^[\]\\/!^-](?:-[^[\]\\/!^-])?)+$/u;

/**
 * Converts the bracket expression that starts at `start` into a glob and
 * returns it with the index of its closing bracket. Only characters and
 * ranges, optionally negated by a leading `!` or `^`, are supported. Returns
 * `undefined` for other expressions, which ignore files rarely use, such as
 * character classes, escapes or `]` as a member.
 */
function toBracketExpression(pattern: string, start: number): { glob: string; end: number } | undefined {
	let i = start + 1;
	const negated = pattern[i] === '!' || pattern[i] === '^';
	if (negated) {
		i++;
	}

	const end = pattern.indexOf(']', i);
	const members = end === -1 ? '' : pattern.substring(i, end);
	if (!BRACKET_EXPRESSION_MEMBERS.test(members)) {
		return undefined;
	}

	for (const [, from, to] of members.matchAll(/(.)-(.)/gu)) {
		if (from > to) {
			return undefined; // globs reject reversed ranges
		}
	}

	return { glob: `[${negated ? '^' : ''}${members}]`, end };
}
