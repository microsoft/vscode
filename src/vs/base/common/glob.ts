/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from './arrays.js';
import { isThenable } from './async.js';
import { CharCode } from './charCode.js';
import { isEqualOrParent } from './extpath.js';
import { LRUCache } from './map.js';
import { basename, extname, isAbsolute, posix, sep } from './path.js';
import { isLinux } from './platform.js';
import { endsWithIgnoreCase, equalsIgnoreCase, escapeRegExpCharacters, ltrim, rtrim } from './strings.js';

export interface IRelativePattern {

	/**
	 * A base file path to which this pattern will be matched against relatively.
	 */
	readonly base: string;

	/**
	 * A file glob pattern like `*.{ts,js}` that will be matched on file paths
	 * relative to the base path.
	 *
	 * Example: Given a base of `/home/work/folder` and a file path of `/home/work/folder/index.js`,
	 * the file glob pattern will match on `index.js`.
	 */
	readonly pattern: string;
}

export interface IExpression {
	[pattern: string]: boolean | SiblingClause;
}

export function getEmptyExpression(): IExpression {
	return Object.create(null);
}

interface SiblingClause {
	when: string;
}

export const GLOBSTAR = '**';
export const GLOB_SPLIT = '/';

const PATH_REGEX = '[/\\\\]';		// any slash or backslash
const NO_PATH_REGEX = '[^/\\\\]';	// any non-slash and non-backslash
const ALL_FORWARD_SLASHES = /\//g;

function starsToRegExp(starCount: number, isLastPattern?: boolean): string {
	switch (starCount) {
		case 0:
			return '';
		case 1:
			return `${NO_PATH_REGEX}*?`; // 1 star matches any number of characters except path separator (/ and \) - non greedy (?)
		default:
			// Matches:  (Path Sep OR Path Val followed by Path Sep) 0-many times except when it's the last pattern
			//           in which case also matches (Path Sep followed by Path Val)
			// Group is non capturing because we don't need to capture at all (?:...)
			// Overall we use non-greedy matching because it could be that we match too much
			return `(?:${PATH_REGEX}|${NO_PATH_REGEX}+${PATH_REGEX}${isLastPattern ? `|${PATH_REGEX}${NO_PATH_REGEX}+` : ''})*?`;
	}
}

export function splitGlobAware(pattern: string, splitChar: string): string[] {
	if (!pattern) {
		return [];
	}

	const segments: string[] = [];

	let inBraces = false;
	let inBrackets = false;

	let curVal = '';
	for (const char of pattern) {
		switch (char) {
			case splitChar:
				if (!inBraces && !inBrackets) {
					segments.push(curVal);
					curVal = '';

					continue;
				}
				break;
			case '{':
				inBraces = true;
				break;
			case '}':
				inBraces = false;
				break;
			case '[':
				inBrackets = true;
				break;
			case ']':
				inBrackets = false;
				break;
		}

		curVal += char;
	}

	// Tail
	if (curVal) {
		segments.push(curVal);
	}

	return segments;
}

function parseRegExp(pattern: string): string {
	if (!pattern) {
		return '';
	}

	let regEx = '';

	// Split up into segments for each slash found
	const segments = splitGlobAware(pattern, GLOB_SPLIT);

	// Special case where we only have globstars
	if (segments.every(segment => segment === GLOBSTAR)) {
		regEx = '.*';
	}

	// Build regex over segments
	else {
		let previousSegmentWasGlobStar = false;
		segments.forEach((segment, index) => {

			// Treat globstar specially
			if (segment === GLOBSTAR) {

				// if we have more than one globstar after another, just ignore it
				if (previousSegmentWasGlobStar) {
					return;
				}

				regEx += starsToRegExp(2, index === segments.length - 1);
			}

			// Anything else, not globstar
			else {

				// States
				let inBraces = false;
				let braceVal = '';

				let inBrackets = false;
				let bracketVal = '';

				for (const char of segment) {

					// Support brace expansion
					if (char !== '}' && inBraces) {
						braceVal += char;
						continue;
					}

					// Support brackets
					if (inBrackets && (char !== ']' || !bracketVal) /* ] is literally only allowed as first character in brackets to match it */) {
						let res: string;

						// range operator
						if (char === '-') {
							res = char;
						}

						// negation operator (only valid on first index in bracket)
						else if ((char === '^' || char === '!') && !bracketVal) {
							res = '^';
						}

						// glob split matching is not allowed within character ranges
						// see http://man7.org/linux/man-pages/man7/glob.7.html
						else if (char === GLOB_SPLIT) {
							res = '';
						}

						// anything else gets escaped
						else {
							res = escapeRegExpCharacters(char);
						}

						bracketVal += res;
						continue;
					}

					switch (char) {
						case '{':
							inBraces = true;
							continue;

						case '[':
							inBrackets = true;
							continue;

						case '}': {
							const choices = splitGlobAware(braceVal, ',');

							// Converts {foo,bar} => [foo|bar]
							const braceRegExp = `(?:${choices.map(choice => parseRegExp(choice)).join('|')})`;

							regEx += braceRegExp;

							inBraces = false;
							braceVal = '';

							break;
						}

						case ']': {
							regEx += ('[' + bracketVal + ']');

							inBrackets = false;
							bracketVal = '';

							break;
						}

						case '?':
							regEx += NO_PATH_REGEX; // 1 ? matches any single character except path separator (/ and \)
							continue;

						case '*':
							regEx += starsToRegExp(1);
							continue;

						default:
							regEx += escapeRegExpCharacters(char);
					}
				}

				// Tail: Add the slash we had split on if there is more to
				// come and the remaining pattern is not a globstar
				// For example if pattern: some/**/*.js we want the "/" after
				// some to be included in the RegEx to prevent a folder called
				// "something" to match as well.
				if (
					index < segments.length - 1 &&			// more segments to come after this
					(
						segments[index + 1] !== GLOBSTAR ||	// next segment is not **, or...
						index + 2 < segments.length			// ...next segment is ** but there is more segments after that
					)
				) {
					regEx += PATH_REGEX;
				}
			}

			// update globstar state
			previousSegmentWasGlobStar = (segment === GLOBSTAR);
		});
	}

	return regEx;
}

// regexes to check for trivial glob patterns that just check for String#endsWith
const T1 = /^\*\*\/\*\.[\w\.-]+$/; 													// **/*.something
const T2 = /^\*\*\/([\w\.-]+)\/?$/; 												// **/something
const T3 = /^{\*\*\/\*?[\w\.-]+\/?(,\*\*\/\*?[\w\.-]+\/?)*}$/; 						// {**/*.something,**/*.else} or {**/package.json,**/project.json}
const T3_2 = /^{\*\*\/\*?[\w\.-]+(\/(\*\*)?)?(,\*\*\/\*?[\w\.-]+(\/(\*\*)?)?)*}$/; 	// Like T3, with optional trailing /**
const T4 = /^\*\*((\/[\w\.-]+)+)\/?$/; 												// **/something/else
const T5 = /^([\w\.-]+(\/[\w\.-]+)*)\/?$/; 											// something/else

export type ParsedPattern = (path: string, basename?: string) => boolean;

// The `ParsedExpression` returns a `Promise`
// iff `hasSibling` returns a `Promise`.
export type ParsedExpression = (path: string, basename?: string, hasSibling?: (name: string) => boolean | Promise<boolean>) => string | null | Promise<string | null> /* the matching pattern */;

export interface IGlobOptions {

	/**
	 * Simplify patterns for use as exclusion filters during
	 * tree traversal to skip entire subtrees. Cannot be used
	 * outside of a tree traversal.
	 */
	trimForExclusions?: boolean;

	/**
	 * Whether glob pattern matching should be case insensitive.
	 */
	ignoreCase?: boolean;
}

interface IGlobOptionsInternal extends IGlobOptions {
	equals: (a: string, b: string) => boolean;
	endsWith: (str: string, candidate: string) => boolean;
	isEqualOrParent: (base: string, candidate: string) => boolean;
}

interface ParsedStringPattern {
	(path: string, basename?: string): string | null | Promise<string | null> /* the matching pattern */;
	basenames?: string[];
	patterns?: string[];
	allBasenames?: string[];
	allPaths?: string[];
}

interface ParsedExpressionPattern {
	(path: string, basename?: string, name?: string, hasSibling?: (name: string) => boolean | Promise<boolean>): string | null | Promise<string | null> /* the matching pattern */;
	requiresSiblings?: boolean;
	allBasenames?: string[];
	allPaths?: string[];
}

const CACHE = new LRUCache<string, ParsedStringPattern>(10000); // bounded to 10000 elements

const FALSE = function () {
	return false;
};

const NULL = function (): string | null {
	return null;
};

/**
 * Check if a provided parsed pattern or expression
 * is empty - hence it won't ever match anything.
 *
 * See {@link FALSE} and {@link NULL}.
 */
export function isEmptyPattern(pattern: ParsedPattern | ParsedExpression): pattern is (typeof FALSE | typeof NULL) {
	if (pattern === FALSE) {
		return true;
	}

	if (pattern === NULL) {
		return true;
	}

	return false;
}

function parsePattern(arg1: string | IRelativePattern, options: IGlobOptions, cacheKey?: string): ParsedStringPattern {
	if (!arg1) {
		return NULL;
	}

	// Handle relative patterns
	let pattern: string;
	if (typeof arg1 !== 'string') {
		pattern = arg1.pattern;
	} else {
		pattern = arg1;
	}

	// Whitespace trimming
	pattern = pattern.trim();

	const ignoreCase = options.ignoreCase ?? false;
	const internalOptions = {
		...options,
		equals: ignoreCase ? equalsIgnoreCase : (a: string, b: string) => a === b,
		endsWith: ignoreCase ? endsWithIgnoreCase : (str: string, candidate: string) => str.endsWith(candidate),
		isEqualOrParent: (base: string, candidate: string) => isEqualOrParent(base, candidate, options.ignoreCase ?? !isLinux /* preserve old behaviour for when option is not adopted */)
	};

	// Check cache
	const patternKey = `${cacheKey === undefined ? `default:${ignoreCase ? pattern.toLowerCase() : pattern}` : `custom:${cacheKey}`}_${!!options.trimForExclusions}_${ignoreCase}`;
	let parsedPattern = CACHE.get(patternKey);
	if (parsedPattern) {
		return wrapRelativePattern(parsedPattern, arg1, internalOptions);
	}

	// Check for Trivials
	let match: RegExpExecArray | null;
	if (T1.test(pattern)) {
		parsedPattern = trivia1(pattern.substring(4), pattern, internalOptions); 			// common pattern: **/*.txt just need endsWith check
	} else if (match = T2.exec(trimForExclusions(pattern, internalOptions))) { 				// common pattern: **/some.txt just need basename check
		parsedPattern = trivia2(match[1], pattern, internalOptions);
	} else if ((options.trimForExclusions ? T3_2 : T3).test(pattern)) { 					// repetition of common patterns (see above) {**/*.txt,**/*.png}
		parsedPattern = trivia3(pattern, internalOptions);
	} else if (match = T4.exec(trimForExclusions(pattern, internalOptions))) { 				// common pattern: **/something/else just need endsWith check
		parsedPattern = trivia4and5(match[1].substring(1), pattern, true, internalOptions);
	} else if (match = T5.exec(trimForExclusions(pattern, internalOptions))) { 				// common pattern: something/else just need equals check
		parsedPattern = trivia4and5(match[1], pattern, false, internalOptions);
	}

	// Otherwise convert to pattern
	else {
		parsedPattern = toRegExp(pattern, internalOptions);
	}

	// Cache
	CACHE.set(patternKey, parsedPattern);

	return wrapRelativePattern(parsedPattern, arg1, internalOptions);
}

function wrapRelativePattern(parsedPattern: ParsedStringPattern, arg2: string | IRelativePattern, options: IGlobOptionsInternal): ParsedStringPattern {
	if (typeof arg2 === 'string') {
		return parsedPattern;
	}

	const wrappedPattern: ParsedStringPattern = function (path, basename) {
		if (!options.isEqualOrParent(path, arg2.base)) {
			// skip glob matching if `base` is not a parent of `path`
			return null;
		}

		// Given we have checked `base` being a parent of `path`,
		// we can now remove the `base` portion of the `path`
		// and only match on the remaining path components
		// For that we try to extract the portion of the `path`
		// that comes after the `base` portion. We have to account
		// for the fact that `base` might end in a path separator
		// (https://github.com/microsoft/vscode/issues/162498)

		return parsedPattern(ltrim(path.substring(arg2.base.length), sep), basename);
	};

	// Make sure to preserve associated metadata
	wrappedPattern.allBasenames = parsedPattern.allBasenames;
	wrappedPattern.allPaths = parsedPattern.allPaths;
	wrappedPattern.basenames = parsedPattern.basenames;
	wrappedPattern.patterns = parsedPattern.patterns;

	return wrappedPattern;
}

function trimForExclusions(pattern: string, options: IGlobOptions): string {
	return options.trimForExclusions && pattern.endsWith('/**') ? pattern.substring(0, pattern.length - 2) : pattern; // dropping **, tailing / is dropped later
}

// common pattern: **/*.txt just need endsWith check
function trivia1(base: string, pattern: string, options: IGlobOptionsInternal): ParsedStringPattern {
	return function (path: string, basename?: string) {
		return typeof path === 'string' && options.endsWith(path, base) ? pattern : null;
	};
}

// common pattern: **/some.txt just need basename check
function trivia2(base: string, pattern: string, options: IGlobOptionsInternal): ParsedStringPattern {
	const slashBase = `/${base}`;
	const backslashBase = `\\${base}`;

	const parsedPattern: ParsedStringPattern = function (path: string, basename?: string) {
		if (typeof path !== 'string') {
			return null;
		}

		if (basename) {
			return options.equals(basename, base) ? pattern : null;
		}

		return options.equals(path, base) || options.endsWith(path, slashBase) || options.endsWith(path, backslashBase) ? pattern : null;
	};

	const basenames = [base];
	parsedPattern.basenames = basenames;
	parsedPattern.patterns = [pattern];
	parsedPattern.allBasenames = basenames;

	return parsedPattern;
}

// repetition of common patterns (see above) {**/*.txt,**/*.png}
function trivia3(pattern: string, options: IGlobOptionsInternal): ParsedStringPattern {
	const parsedPatterns = aggregateBasenameMatches(pattern.slice(1, -1)
		.split(',')
		.map(pattern => parsePattern(pattern, options))
		.filter(pattern => pattern !== NULL), pattern, options.ignoreCase);

	const patternsLength = parsedPatterns.length;
	if (!patternsLength) {
		return NULL;
	}

	if (patternsLength === 1) {
		return parsedPatterns[0];
	}

	const parsedPattern: ParsedStringPattern = function (path: string, basename?: string) {
		for (let i = 0, n = parsedPatterns.length; i < n; i++) {
			if (parsedPatterns[i](path, basename)) {
				return pattern;
			}
		}

		return null;
	};

	const withBasenames = parsedPatterns.find(pattern => !!pattern.allBasenames);
	if (withBasenames) {
		parsedPattern.allBasenames = withBasenames.allBasenames;
	}

	const allPaths = parsedPatterns.reduce((all, current) => current.allPaths ? all.concat(current.allPaths) : all, [] as string[]);
	if (allPaths.length) {
		parsedPattern.allPaths = allPaths;
	}

	return parsedPattern;
}

// common patterns: **/something/else just need endsWith check, something/else just needs and equals check
function trivia4and5(targetPath: string, pattern: string, matchPathEnds: boolean, options: IGlobOptionsInternal): ParsedStringPattern {
	const usingPosixSep = sep === posix.sep;
	const nativePath = usingPosixSep ? targetPath : targetPath.replace(ALL_FORWARD_SLASHES, sep);
	const nativePathEnd = sep + nativePath;
	const targetPathEnd = posix.sep + targetPath;

	let parsedPattern: ParsedStringPattern;
	if (matchPathEnds) {
		parsedPattern = function (path: string, basename?: string) {
			return typeof path === 'string' && (
				(options.equals(path, nativePath) || options.endsWith(path, nativePathEnd)) ||
				!usingPosixSep && (options.equals(path, targetPath) || options.endsWith(path, targetPathEnd))
			) ? pattern : null;
		};
	} else {
		parsedPattern = function (path: string, basename?: string) {
			return typeof path === 'string' && (options.equals(path, nativePath) || (!usingPosixSep && options.equals(path, targetPath))) ? pattern : null;
		};
	}

	parsedPattern.allPaths = [(matchPathEnds ? '*/' : './') + targetPath];

	return parsedPattern;
}

function toRegExp(pattern: string, options: IGlobOptions): ParsedStringPattern {
	try {
		const regExp = new RegExp(`^${parseRegExp(pattern)}$`, options.ignoreCase ? 'i' : undefined);
		return function (path: string) {
			regExp.lastIndex = 0; // reset RegExp to its initial state to reuse it!

			return typeof path === 'string' && regExp.test(path) ? pattern : null;
		};
	} catch {
		return NULL;
	}
}

/**
 * Simplified glob matching. Supports a subset of glob patterns:
 * * `*` to match zero or more characters in a path segment
 * * `?` to match on one character in a path segment
 * * `**` to match any number of path segments, including none
 * * `{}` to group conditions (e.g. *.{ts,js} matches all TypeScript and JavaScript files)
 * * `[]` to declare a range of characters to match in a path segment (e.g., `example.[0-9]` to match on `example.0`, `example.1`, …)
 * * `[!...]` to negate a range of characters to match in a path segment (e.g., `example.[!0-9]` to match on `example.a`, `example.b`, but not `example.0`)
 */
export function match(pattern: string | IRelativePattern, path: string, options?: IGlobOptions): boolean;
export function match(expression: IExpression, path: string, options?: IGlobOptions): boolean;
export function match(arg1: string | IExpression | IRelativePattern, path: string, options?: IGlobOptions): boolean {
	if (!arg1 || typeof path !== 'string') {
		return false;
	}

	return parse(arg1, options)(path) as boolean;
}

/**
 * Simplified glob matching. Supports a subset of glob patterns:
 * * `*` to match zero or more characters in a path segment
 * * `?` to match on one character in a path segment
 * * `**` to match any number of path segments, including none
 * * `{}` to group conditions (e.g. *.{ts,js} matches all TypeScript and JavaScript files)
 * * `[]` to declare a range of characters to match in a path segment (e.g., `example.[0-9]` to match on `example.0`, `example.1`, …)
 * * `[!...]` to negate a range of characters to match in a path segment (e.g., `example.[!0-9]` to match on `example.a`, `example.b`, but not `example.0`)
 */
export function parse(pattern: string | IRelativePattern, options?: IGlobOptions): ParsedPattern;
export function parse(expression: IExpression, options?: IGlobOptions): ParsedExpression;
export function parse(arg1: string | IExpression | IRelativePattern, options?: IGlobOptions): ParsedPattern | ParsedExpression;
export function parse(arg1: string | IExpression | IRelativePattern, options: IGlobOptions = {}): ParsedPattern | ParsedExpression {
	if (!arg1) {
		return FALSE;
	}

	// Glob with String
	if (typeof arg1 === 'string' || isRelativePattern(arg1)) {
		const parsedPattern = parsePattern(arg1, options);
		if (parsedPattern === NULL) {
			return FALSE;
		}

		const resultPattern: ParsedPattern & { allBasenames?: string[]; allPaths?: string[] } = function (path: string, basename?: string) {
			return !!parsedPattern(path, basename);
		};

		if (parsedPattern.allBasenames) {
			resultPattern.allBasenames = parsedPattern.allBasenames;
		}

		if (parsedPattern.allPaths) {
			resultPattern.allPaths = parsedPattern.allPaths;
		}

		return resultPattern;
	}

	// Glob with Expression
	return parsedExpression(arg1, options);
}

//#region Exclude exceptions

const EXCLUDE_EXCEPTION_PREFIX = '!';
const VERSION_CONTROL_FOLDERS = ['.git', '.svn', '.hg', '.jj'];

/**
 * Regular expression source that matches the keys of exclude exceptions, for use in JSON schemas.
 */
export const EXCLUDE_EXCEPTION_KEY_PATTERN = '^\\s*!';

/**
 * An exclude expression parsed with support for `!`-prefixed exception keys.
 */
export interface IParsedExcludeExpression {

	/**
	 * Matches like {@link parse}, except that a path covered by an exception never matches.
	 * When the expression has no exceptions, this is the result of {@link parse}.
	 */
	readonly matches: ParsedExpression;

	/**
	 * Matches the exclude patterns only, ignoring exceptions.
	 */
	readonly matchesExclude: ParsedExpression;

	/**
	 * The patterns of the enabled exceptions, see {@link getExcludeExceptions}.
	 */
	readonly exceptions: readonly string[];

	/**
	 * Whether the path or one of its parent folders matches an exception. Paths in version
	 * control folders are not excepted, see {@link getFoldersSkippedByExcludeExceptions}.
	 */
	isExcepted(path: string, basename?: string): boolean;

	/**
	 * Whether an exception could match a path below the folder, so that the
	 * folder must be traversed even when it is excluded. Version control folders
	 * are skipped, see {@link getFoldersSkippedByExcludeExceptions}.
	 */
	couldExceptionMatchBeneath(folderPath: string): boolean;
}

/**
 * Whether the key of an exclude expression is an exception, i.e. starts with `!`.
 */
export function isExcludeException(pattern: string): boolean {
	return pattern.trimStart().startsWith(EXCLUDE_EXCEPTION_PREFIX);
}

/**
 * Rewrites a pattern starting with `!` so that it matches a literal `!`
 * instead of being treated as an exclude exception.
 */
export function escapeExcludeException(pattern: string): string {
	const trimmed = pattern.trimStart();

	return trimmed.startsWith(EXCLUDE_EXCEPTION_PREFIX) ? `{!}${trimmed.substring(EXCLUDE_EXCEPTION_PREFIX.length)}` : pattern;
}

/**
 * Returns the patterns, without the leading `!`, of the enabled exceptions of an exclude expression. Paths
 * matching an exception, and everything beneath them, are never excluded. Exceptions are relative to the
 * folder that is searched or shown, so absolute exceptions are ignored.
 */
export function getExcludeExceptions(expression: IExpression | undefined): string[] {
	const exceptions: string[] = [];
	if (!expression) {
		return exceptions;
	}

	for (const key of Object.keys(expression)) {
		if (expression[key] !== true || !isExcludeException(key)) {
			continue;
		}

		const pattern = rtrim(key.trimStart().substring(EXCLUDE_EXCEPTION_PREFIX.length).trim(), GLOB_SPLIT);
		if (pattern && !isAbsolute(pattern)) {
			exceptions.push(pattern);
		}
	}

	return exceptions;
}

/**
 * Returns the version control folders (such as `.git`) that exclude exceptions do not look into or re-include,
 * unless an exception names the folder, because they are large and rarely contain files to re-include.
 */
export function getFoldersSkippedByExcludeExceptions(exceptions: readonly string[]): string[] {
	const namedSegments = new Set(exceptions.flatMap(exception => expandBraces(exception).flatMap(pattern => splitGlobAware(pattern, GLOB_SPLIT))));

	return VERSION_CONTROL_FOLDERS.filter(folder => !namedSegments.has(folder));
}

/**
 * Expands the brace groups of a pattern into its alternatives, for example `{a,b}/c` into `a/c` and `b/c`.
 * Like the rest of the glob support, braces do not nest.
 */
function expandBraces(pattern: string): string[] {
	const start = pattern.indexOf('{');
	const end = start === -1 ? -1 : pattern.indexOf('}', start);
	if (end === -1) {
		return [pattern];
	}

	const prefix = pattern.substring(0, start);
	const alternatives = splitGlobAware(pattern.substring(start + 1, end), ',');
	const suffixes = expandBraces(pattern.substring(end + 1));

	return (alternatives.length ? alternatives : ['']).flatMap(alternative => suffixes.map(suffix => `${prefix}${alternative}${suffix}`));
}

/**
 * Returns a copy of the expression without exception keys, for consumers
 * that only understand plain exclude patterns.
 */
export function withoutExcludeExceptions(expression: IExpression): IExpression {
	const result: IExpression = Object.create(null);
	for (const key of Object.keys(expression)) {
		if (!isExcludeException(key)) {
			result[key] = expression[key];
		}
	}

	return result;
}

/**
 * Parses an exclude expression that may contain `!`-prefixed exception keys.
 * A path is excluded when it matches an exclude pattern (or is below an excluded
 * folder) and neither the path nor one of its parent folders matches an exception.
 */
export function parseExcludeExpression(expression: IExpression, options: IGlobOptions = {}): IParsedExcludeExpression {
	const exceptions = getExcludeExceptions(expression);
	const hasExceptionKeys = Object.keys(expression).some(isExcludeException);
	const matchesExclude = parse(hasExceptionKeys ? withoutExcludeExceptions(expression) : expression, options);
	if (!exceptions.length) {
		return {
			matches: matchesExclude,
			matchesExclude,
			exceptions,
			isExcepted: () => false,
			couldExceptionMatchBeneath: () => false
		};
	}

	const exceptionExpression: IExpression = Object.create(null);
	for (const exception of exceptions) {
		exceptionExpression[exception] = true;
		exceptionExpression[`${exception}${GLOB_SPLIT}${GLOBSTAR}`] = true;
	}

	const matchesException = parse(exceptionExpression, { ...options, trimForExclusions: false });
	const exceptionSegments = exceptions.map(exception => parseSegmentMatchers(exception, !!options.ignoreCase));
	const skippedFolders = new Set(getFoldersSkippedByExcludeExceptions(exceptions));
	const toSegments = (path: string) => {
		const trimmed = rtrim(rtrim(path, GLOB_SPLIT), '\\');
		return trimmed ? trimmed.split(/[/\\]/) : [];
	};
	const isInSkippedFolder = (segments: string[]) => segments.some(segment => skippedFolders.has(segment));
	const isExcepted = (path: string, basename?: string) => !!matchesException(path, basename) && !isInSkippedFolder(toSegments(path));

	const matches: ParsedExpression = (path, basename, hasSibling) => {
		const result = matchesExclude(path, basename, hasSibling);
		if (isThenable(result)) {
			return result.then(pattern => pattern && !isExcepted(path, basename) ? pattern : null);
		}

		return result && !isExcepted(path, basename) ? result : null;
	};

	return {
		matches,
		matchesExclude,
		exceptions,
		isExcepted,
		couldExceptionMatchBeneath: folderPath => {
			const segments = toSegments(folderPath);
			return !isInSkippedFolder(segments) && exceptionSegments.some(matchers => couldMatchBeneath(matchers, segments));
		}
	};
}

/**
 * The exclude checks that a walk of a folder tree needs, for example an {@link IParsedExcludeExpression}.
 */
export interface IExcludeTreeEvaluator {
	matchesExclude(path: string, basename?: string, hasSibling?: (name: string) => boolean): unknown;
	isExcepted(path: string, basename?: string): boolean;
	couldExceptionMatchBeneath(folderPath: string): boolean;
}

export interface IExcludeTreeEntry {
	readonly path: string;
	readonly basename?: string;
	readonly isDirectory: boolean;

	/**
	 * Whether the parent folder is excluded, as evaluated for the parent.
	 */
	readonly isParentExcluded: boolean;

	/**
	 * Whether something besides the exclude patterns hides the entry, for example an ignore file. Exceptions override it too.
	 */
	readonly isHidden?: () => boolean;

	readonly hasSibling?: (name: string) => boolean;
}

/**
 * Evaluates an entry while walking a folder tree. It is excluded when it or its parent folder is excluded and no
 * exception matches it. It is visited when it is not excluded, or is a folder that an exception could match beneath.
 */
export function evaluateExcludeTreeEntry(evaluator: IExcludeTreeEvaluator, entry: IExcludeTreeEntry): { isExcluded: boolean; isVisited: boolean } {
	const isMatched = entry.isParentExcluded || !!evaluator.matchesExclude(entry.path, entry.basename, entry.hasSibling) || !!entry.isHidden?.();
	const isExcluded = isMatched && !evaluator.isExcepted(entry.path, entry.basename);

	return { isExcluded, isVisited: !isExcluded || (entry.isDirectory && evaluator.couldExceptionMatchBeneath(entry.path)) };
}

type SegmentMatcher = typeof GLOBSTAR | ((segment: string) => boolean);

function parseSegmentMatchers(pattern: string, ignoreCase: boolean): SegmentMatcher[] {
	return splitGlobAware(pattern, GLOB_SPLIT).map(segment => {
		if (segment === GLOBSTAR) {
			return GLOBSTAR;
		}

		if (segment.includes(GLOB_SPLIT) || hasGlobstarAlternative(segment)) {
			return GLOBSTAR; // a brace expansion with a path separator or a globstar, e.g. `{a/b,c}` or `{**,c}`, can span any number of segments
		}

		try {
			const regExp = new RegExp(`^${parseRegExp(segment)}$`, ignoreCase ? 'i' : undefined);

			return (value: string) => regExp.test(value);
		} catch {
			return () => false;
		}
	});
}

/**
 * Whether a brace group of the segment has an alternative that is a globstar, such as `{**,c}`. A globstar
 * inside an alternative, such as `**.js`, matches within a single segment like `*`.
 */
function hasGlobstarAlternative(segment: string): boolean {
	for (const match of segment.matchAll(/\{(?<alternatives>[^}]*)\}/g)) {
		if (splitGlobAware(match.groups?.alternatives ?? '', ',').includes(GLOBSTAR)) {
			return true;
		}
	}

	return false;
}

/**
 * Whether the pattern could match a path that starts with the given folder segments.
 */
function couldMatchBeneath(matchers: SegmentMatcher[], folderSegments: string[]): boolean {
	const visited = new Set<number>();
	const visit = (matcherIndex: number, folderIndex: number): boolean => {
		if (folderIndex === folderSegments.length) {
			return true;
		}

		if (matcherIndex === matchers.length) {
			return false;
		}

		const key = matcherIndex * (folderSegments.length + 1) + folderIndex;
		if (visited.has(key)) {
			return false;
		}
		visited.add(key);

		const matcher = matchers[matcherIndex];
		if (matcher === GLOBSTAR) {
			return visit(matcherIndex + 1, folderIndex) || visit(matcherIndex, folderIndex + 1);
		}

		return matcher(folderSegments[folderIndex]) && visit(matcherIndex + 1, folderIndex + 1);
	};

	return visit(0, 0);
}

//#endregion

export function isRelativePattern(obj: unknown): obj is IRelativePattern {
	const rp = obj as IRelativePattern | undefined | null;
	if (!rp) {
		return false;
	}

	return typeof rp.base === 'string' && typeof rp.pattern === 'string';
}

export function getBasenameTerms(patternOrExpression: ParsedPattern | ParsedExpression): string[] {
	return (<ParsedStringPattern>patternOrExpression).allBasenames || [];
}

export function getPathTerms(patternOrExpression: ParsedPattern | ParsedExpression): string[] {
	return (<ParsedStringPattern>patternOrExpression).allPaths || [];
}

function parsedExpression(expression: IExpression, options: IGlobOptions): ParsedExpression {
	const parsedPatterns = aggregateBasenameMatches(Object.getOwnPropertyNames(expression)
		.map(pattern => parseExpressionPattern(pattern, expression[pattern], options))
		.filter(pattern => pattern !== NULL), undefined, options.ignoreCase);

	const patternsLength = parsedPatterns.length;
	if (!patternsLength) {
		return NULL;
	}

	if (!parsedPatterns.some(parsedPattern => !!(<ParsedExpressionPattern>parsedPattern).requiresSiblings)) {
		if (patternsLength === 1) {
			return parsedPatterns[0] as ParsedStringPattern;
		}

		const resultExpression: ParsedStringPattern = function (path: string, basename?: string) {
			let resultPromises: Promise<string | null>[] | undefined = undefined;

			for (let i = 0, n = parsedPatterns.length; i < n; i++) {
				const result = parsedPatterns[i](path, basename);
				if (typeof result === 'string') {
					return result; // immediately return as soon as the first expression matches
				}

				// If the result is a promise, we have to keep it for
				// later processing and await the result properly.
				if (isThenable(result)) {
					if (!resultPromises) {
						resultPromises = [];
					}

					resultPromises.push(result);
				}
			}

			// With result promises, we have to loop over each and
			// await the result before we can return any result.
			if (resultPromises) {
				return (async () => {
					for (const resultPromise of resultPromises) {
						const result = await resultPromise;
						if (typeof result === 'string') {
							return result;
						}
					}

					return null;
				})();
			}

			return null;
		};

		const withBasenames = parsedPatterns.find(pattern => !!pattern.allBasenames);
		if (withBasenames) {
			resultExpression.allBasenames = withBasenames.allBasenames;
		}

		const allPaths = parsedPatterns.reduce((all, current) => current.allPaths ? all.concat(current.allPaths) : all, [] as string[]);
		if (allPaths.length) {
			resultExpression.allPaths = allPaths;
		}

		return resultExpression;
	}

	const resultExpression: ParsedStringPattern = function (path: string, base?: string, hasSibling?: (name: string) => boolean | Promise<boolean>) {
		let name: string | undefined = undefined;
		let resultPromises: Promise<string | null>[] | undefined = undefined;

		for (let i = 0, n = parsedPatterns.length; i < n; i++) {

			// Pattern matches path
			const parsedPattern = (<ParsedExpressionPattern>parsedPatterns[i]);
			if (parsedPattern.requiresSiblings && hasSibling) {
				if (!base) {
					base = basename(path);
				}

				if (!name) {
					name = base.substring(0, base.length - extname(path).length);
				}
			}

			const result = parsedPattern(path, base, name, hasSibling);
			if (typeof result === 'string') {
				return result; // immediately return as soon as the first expression matches
			}

			// If the result is a promise, we have to keep it for
			// later processing and await the result properly.
			if (isThenable(result)) {
				if (!resultPromises) {
					resultPromises = [];
				}

				resultPromises.push(result);
			}
		}

		// With result promises, we have to loop over each and
		// await the result before we can return any result.
		if (resultPromises) {
			return (async () => {
				for (const resultPromise of resultPromises) {
					const result = await resultPromise;
					if (typeof result === 'string') {
						return result;
					}
				}

				return null;
			})();
		}

		return null;
	};

	const withBasenames = parsedPatterns.find(pattern => !!pattern.allBasenames);
	if (withBasenames) {
		resultExpression.allBasenames = withBasenames.allBasenames;
	}

	const allPaths = parsedPatterns.reduce((all, current) => current.allPaths ? all.concat(current.allPaths) : all, [] as string[]);
	if (allPaths.length) {
		resultExpression.allPaths = allPaths;
	}

	return resultExpression;
}

function parseExpressionPattern(pattern: string, value: boolean | SiblingClause, options: IGlobOptions): (ParsedStringPattern | ParsedExpressionPattern) {
	if (value === false) {
		return NULL; // pattern is disabled
	}

	const parsedPattern = parsePattern(pattern, options, pattern);
	if (parsedPattern === NULL) {
		return NULL;
	}

	// Expression Pattern is <boolean>
	if (typeof value === 'boolean') {
		return parsedPattern;
	}

	// Expression Pattern is <SiblingClause>
	if (value) {
		const when = value.when;
		if (typeof when === 'string') {
			const result: ParsedExpressionPattern = (path: string, basename?: string, name?: string, hasSibling?: (name: string) => boolean | Promise<boolean>) => {
				if (!hasSibling || !parsedPattern(path, basename)) {
					return null;
				}

				const clausePattern = when.replace('$(basename)', () => name!);
				const matched = hasSibling(clausePattern);
				return isThenable(matched) ?
					matched.then(match => match ? pattern : null) :
					matched ? pattern : null;
			};

			result.requiresSiblings = true;

			return result;
		}
	}

	// Expression is anything
	return parsedPattern;
}

function aggregateBasenameMatches(parsedPatterns: Array<ParsedStringPattern | ParsedExpressionPattern>, result?: string, ignoreCase?: boolean): Array<ParsedStringPattern | ParsedExpressionPattern> {
	const basenamePatterns = parsedPatterns.filter(parsedPattern => !!(<ParsedStringPattern>parsedPattern).basenames);
	if (basenamePatterns.length < 2) {
		return parsedPatterns;
	}

	const basenames = basenamePatterns.reduce<string[]>((all, current) => {
		const basenames = (<ParsedStringPattern>current).basenames;

		return basenames ? all.concat(basenames) : all;
	}, [] as string[]);

	let patterns: string[];
	if (result) {
		patterns = [];

		for (let i = 0, n = basenames.length; i < n; i++) {
			patterns.push(result);
		}
	} else {
		patterns = basenamePatterns.reduce((all, current) => {
			const patterns = (<ParsedStringPattern>current).patterns;

			return patterns ? all.concat(patterns) : all;
		}, [] as string[]);
	}

	const aggregate: ParsedStringPattern = function (path: string, basename?: string) {
		if (typeof path !== 'string') {
			return null;
		}

		if (!basename) {
			let i: number;
			for (i = path.length; i > 0; i--) {
				const ch = path.charCodeAt(i - 1);
				if (ch === CharCode.Slash || ch === CharCode.Backslash) {
					break;
				}
			}

			basename = path.substring(i);
		}

		const index = ignoreCase ? basenames.findIndex(candidate => equalsIgnoreCase(candidate, basename)) : basenames.indexOf(basename);
		return index !== -1 ? patterns[index] : null;
	};

	aggregate.basenames = basenames;
	aggregate.patterns = patterns;
	aggregate.allBasenames = basenames;

	const aggregatedPatterns = parsedPatterns.filter(parsedPattern => !(<ParsedStringPattern>parsedPattern).basenames);
	aggregatedPatterns.push(aggregate);

	return aggregatedPatterns;
}

// NOTE: This is not used for actual matching, only for resetting watcher when patterns change.
// That is why it's ok to avoid case-insensitive comparison here.
export function patternsEquals(patternsA: Array<string | IRelativePattern> | undefined, patternsB: Array<string | IRelativePattern> | undefined): boolean {
	return equals(patternsA, patternsB, (a, b) => {
		if (typeof a === 'string' && typeof b === 'string') {
			return a === b;
		}

		if (typeof a !== 'string' && typeof b !== 'string') {
			return a.base === b.base && a.pattern === b.pattern;
		}

		return false;
	});
}
