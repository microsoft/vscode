/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');
import {BoundedLinkedMap} from 'vs/base/common/map';

export interface IExpression {
	[pattern: string]: boolean | SiblingClause | any;
}

export interface SiblingClause {
	when: string;
}

const PATH_REGEX = '[/\\\\]';		// any slash or backslash
const NO_PATH_REGEX = '[^/\\\\]';	// any non-slash and non-backslash

function starsToRegExp(starCount: number): string {
	switch (starCount) {
		case 0:
			return '';
		case 1:
			return `${NO_PATH_REGEX}*?`; // 1 star matches any number of characters except path separator (/ and \) - non greedy (?)
		default:
			// Matches:  (Path Sep OR Path Val followed by Path Sep OR Path Sep followed by Path Val) 0-many times
			// Group is non capturing because we don't need to capture at all (?:...)
			// Overall we use non-greedy matching because it could be that we match too much
			return `(?:${PATH_REGEX}|${NO_PATH_REGEX}+${PATH_REGEX}|${PATH_REGEX}${NO_PATH_REGEX}+)*?`;
	}
}

export function splitGlobAware(pattern: string, splitChar: string): string[] {
	if (!pattern) {
		return [];
	}

	let segments: string[] = [];

	let inBraces = false;
	let inBrackets = false;

	let char: string;
	let curVal = '';
	for (let i = 0; i < pattern.length; i++) {
		char = pattern[i];

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
	let segments = splitGlobAware(pattern, '/');

	// Special case where we only have globstars
	if (segments.every(s => s === '**')) {
		regEx = '.*';
	}

	// Build regex over segments
	else {
		let previousSegmentWasGlobStar = false;
		segments.forEach((segment, index) => {

			// Globstar is special
			if (segment === '**') {

				// if we have more than one globstar after another, just ignore it
				if (!previousSegmentWasGlobStar) {
					regEx += starsToRegExp(2);
					previousSegmentWasGlobStar = true;
				}

				return;
			}

			// States
			let inBraces = false;
			let braceVal = '';

			let inBrackets = false;
			let bracketVal = '';

			let char: string;
			for (let i = 0; i < segment.length; i++) {
				char = segment[i];

				// Support brace expansion
				if (char !== '}' && inBraces) {
					braceVal += char;
					continue;
				}

				// Support brackets
				if (char !== ']' && inBrackets) {
					let res: string;
					switch (char) {
						case '-':		// allow the range operator
							res = char;
							break;
						case '^':		// allow the negate operator
							res = char;
							break;
						default:
							res = strings.escapeRegExpCharacters(char);
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

					case '}':
						let choices = splitGlobAware(braceVal, ',');

						// Converts {foo,bar} => [foo|bar]
						let braceRegExp = `(?:${choices.map(c => parseRegExp(c)).join('|')})`;

						regEx += braceRegExp;

						inBraces = false;
						braceVal = '';

						break;

					case ']':
						regEx += ('[' + bracketVal + ']');

						inBrackets = false;
						bracketVal = '';

						break;


					case '?':
						regEx += NO_PATH_REGEX; // 1 ? matches any single character except path separator (/ and \)
						continue;

					case '*':
						regEx += starsToRegExp(1);
						continue;

					default:
						regEx += strings.escapeRegExpCharacters(char);
				}
			}

			// Tail: Add the slash we had split on if there is more to come and the next one is not a globstar
			if (index < segments.length - 1 && segments[index + 1] !== '**') {
				regEx += PATH_REGEX;
			}

			// reset state
			previousSegmentWasGlobStar = false;
		});
	}

	return regEx;
}

// regexes to check for trival glob patterns that just check for String#endsWith
const T1 = /^\*\*\/\*\.[\w\.-]+$/; 						   			// **/*.something
const T2 = /^\*\*\/[\w\.-]+$/; 							   			// **/something
const T3 = /^{\*\*\/[\*\.]?[\w\.-]+(,\*\*\/[\*\.]?[\w\.-]+)*}$/; 	// {**/*.something,**/*.else} or {**/package.json,**/project.json}

export type ParsedPattern = (path: string, basename?: string) => boolean;
export type ParsedExpression = (path: string, basename?: string, siblingsFn?: () => string[]) => string /* the matching pattern */;

interface ParsedStringPattern {
	(path: string, basename: string): string /* the matching pattern */;
	basenames?: string[];
	patterns?: string[];
}
type SiblingsPattern = { siblings: string[], name: string };
interface ParsedExpressionPattern {
	(path: string, basename: string, siblingsPatternFn: () => SiblingsPattern): string /* the matching pattern */;
	requiresSiblings?: boolean;
}

const CACHE = new BoundedLinkedMap<ParsedStringPattern>(10000); // bounded to 10000 elements

const FALSE = function() {
	return false;
};

const NULL = function(): string {
	return null;
};

function parsePattern(pattern: string): ParsedStringPattern {
	if (!pattern) {
		return NULL;
	}

	// Whitespace trimming
	pattern = pattern.trim();

	// Check cache
	let parsedPattern = CACHE.get(pattern);
	if (parsedPattern) {
		return parsedPattern;
	}

	// Check for Trivias
	if (T1.test(pattern)) { // common pattern: **/*.txt just need endsWith check
		const base = pattern.substr(4); // '**/*'.length === 4
		parsedPattern = function (path, basename) {
			return path && strings.endsWith(path, base) ? pattern : null;
		};
	} else if (T2.test(pattern)) { // common pattern: **/some.txt just need basename check
		const base = pattern.substr(3); // '**/'.length === 3
		const slashBase = `/${base}`;
		const backslashBase = `\\${base}`;
		parsedPattern = function (path, basename) {
			if (!path) {
				return null;
			}
			if (basename) {
				return basename === base ? pattern : null;
			}
			return path === base || strings.endsWith(path, slashBase) || strings.endsWith(path, backslashBase) ? pattern : null;
		};
		parsedPattern.basenames = [base];
		parsedPattern.patterns = [pattern];
	} else if (T3.test(pattern)) { // repetition of common patterns (see above) {**/*.txt,**/*.png}
		const parsedPatterns = aggregateBasenameMatches(pattern.slice(1, -1).split(',')
			.map(pattern => parsePattern(pattern))
			.filter(pattern => pattern !== NULL), pattern);
		const n = parsedPatterns.length;
		if (!n) {
			return NULL;
		}
		if (n === 1) {
			return <ParsedStringPattern>parsedPatterns[0];
		}
		parsedPattern = function (path: string, basename: string) {
			for (let i = 0, n = parsedPatterns.length; i < n; i++) {
				if ((<ParsedStringPattern>parsedPatterns[i])(path, basename)) {
					return pattern;
				}
			}
			return null;
		};
	}

	// Otherwise convert to pattern
	else {
		parsedPattern = toRegExp(pattern);
	}

	// Cache
	CACHE.set(pattern, parsedPattern);

	return parsedPattern;
}

function toRegExp(pattern: string): ParsedStringPattern {
	try {
		const regExp = new RegExp(`^${parseRegExp(pattern)}$`);
		return function (path: string, basename: string) {
			regExp.lastIndex = 0; // reset RegExp to its initial state to reuse it!
			return path && regExp.test(path) ? pattern : null;
		};
	} catch (error) {
		return NULL;
	}
}

/**
 * Simplified glob matching. Supports a subset of glob patterns:
 * - * matches anything inside a path segment
 * - ? matches 1 character inside a path segment
 * - ** matches anything including an empty path segment
 * - simple brace expansion ({js,ts} => js or ts)
 * - character ranges (using [...])
 */
export function match(pattern: string, path: string): boolean;
export function match(expression: IExpression, path: string, siblingsFn?: () => string[]): string /* the matching pattern */;
export function match(arg1: string | IExpression, path: string, siblingsFn?: () => string[]): any {
	if (!arg1 || !path) {
		return false;
	}

	return parse(<IExpression>arg1)(path, undefined, siblingsFn);
}

/**
 * Simplified glob matching. Supports a subset of glob patterns:
 * - * matches anything inside a path segment
 * - ? matches 1 character inside a path segment
 * - ** matches anything including an empty path segment
 * - simple brace expansion ({js,ts} => js or ts)
 * - character ranges (using [...])
 */
export function parse(pattern: string): ParsedPattern;
export function parse(expression: IExpression): ParsedExpression;
export function parse(arg1: string | IExpression): any {
	if (!arg1) {
		return FALSE;
	}

	// Glob with String
	if (typeof arg1 === 'string') {
		const parsedPattern = parsePattern(arg1);
		if (parsedPattern === NULL) {
			return FALSE;
		}
		return function (path: string, basename: string) {
			return !!parsedPattern(path, basename);
		};
	}

	// Glob with Expression
	return parsedExpression(<IExpression>arg1);
}

function parsedExpression(expression: IExpression): ParsedExpression {
	const parsedPatterns = aggregateBasenameMatches(Object.getOwnPropertyNames(expression)
		.map(pattern => parseExpressionPattern(pattern, expression[pattern]))
		.filter(pattern => pattern !== NULL));

	const n = parsedPatterns.length;
	if (!n) {
		return NULL;
	}

	if (!parsedPatterns.some(parsedPattern => (<ParsedExpressionPattern>parsedPattern).requiresSiblings)) {
		if (n === 1) {
			return <ParsedStringPattern>parsedPatterns[0];
		}

		return function (path: string, basename: string, siblingsFn?: () => string[]) {
			for (let i = 0, n = parsedPatterns.length; i < n; i++) {
				// Pattern matches path
				const result = (<ParsedStringPattern>parsedPatterns[i])(path, basename);
				if (result) {
					return result;
				}
			}

			return null;
		};
	}

	return function (path: string, basename: string, siblingsFn?: () => string[]) {
		let siblingsPattern: SiblingsPattern;
		let siblingsResolved = !siblingsFn;

		function siblingsPatternFn() {
			// Resolve siblings only once
			if (!siblingsResolved) {
				siblingsResolved = true;
				const siblings = siblingsFn();
				if (siblings && siblings.length) {
					if (!basename) {
						basename = paths.basename(path);
					}
					const name = basename.substr(0, basename.length - paths.extname(path).length);
					siblingsPattern = { siblings, name };
				}
			}
			return siblingsPattern;
		}

		for (let i = 0, n = parsedPatterns.length; i < n; i++) {
			// Pattern matches path
			const result = (<ParsedExpressionPattern>parsedPatterns[i])(path, basename, siblingsPatternFn);
			if (result) {
				return result;
			}
		}

		return null;
	};
}

function parseExpressionPattern(pattern: string, value: any): (ParsedStringPattern | ParsedExpressionPattern) {
	if (value === false) {
		return NULL; // pattern is disabled
	}

	const parsedPattern = parsePattern(pattern);
	if (parsedPattern === NULL) {
		return NULL;
	}

	// Expression Pattern is <boolean>
	if (typeof value === 'boolean') {
		return parsedPattern;
	}

	// Expression Pattern is <SiblingClause>
	if (value) {
		const when = (<SiblingClause>value).when;
		if (typeof when === 'string') {
			const result: ParsedExpressionPattern = function (path: string, basename: string, siblingsPatternFn: () => SiblingsPattern) {
				if (!parsedPattern(path, basename)) {
					return null;
				}

				const siblingsPattern = siblingsPatternFn();
				if (!siblingsPattern) {
					return null; // pattern is malformed or we don't have siblings
				}

				let clausePattern = when.replace('$(basename)', siblingsPattern.name);
				if (siblingsPattern.siblings.indexOf(clausePattern) !== -1) {
					return pattern;
				} else {
					return null; // pattern does not match in the end because the when clause is not satisfied
				}
			};
			result.requiresSiblings = true;
			return result;
		}
	}

	// Expression is Anything
	return parsedPattern;
}

const SLASH = '/'.charCodeAt(0);
const BACKSLASH = '\\'.charCodeAt(0);

function aggregateBasenameMatches(parsedPatterns: (ParsedStringPattern | ParsedExpressionPattern)[], result?: string): (ParsedStringPattern | ParsedExpressionPattern)[] {
	const basenamePatterns = parsedPatterns.filter(parsedPattern => !!(<ParsedStringPattern>parsedPattern).basenames);
	if (basenamePatterns.length < 2) {
		return parsedPatterns;
	}

	const basenames = basenamePatterns.reduce<string[]>((all, current) => all.concat((<ParsedStringPattern>current).basenames), []);
	let patterns: string[];
	if (result) {
		patterns = [];
		for (let i = 0, n = basenames.length; i < n; i++) {
			patterns.push(result);
		}
	} else {
		patterns = basenamePatterns.reduce((all, current) => all.concat((<ParsedStringPattern>current).patterns), []);
	}
	const aggregate: ParsedStringPattern = function (path, basename) {
		if (!path) {
			return null;
		}
		if (!basename) {
			let i: number;
			for (i = path.length; i > 0; i--) {
				const ch = path.charCodeAt(i - 1);
				if (ch === SLASH || ch === BACKSLASH) {
					break;
				}
			}
			basename = path.substr(i);
		}
		const index = basenames.indexOf(basename);
		return index !== -1 ? patterns[index] : null;
	};
	aggregate.basenames = basenames;
	aggregate.patterns = patterns;

	const aggregatedPatterns = parsedPatterns.filter(parsedPattern => !(<ParsedStringPattern>parsedPattern).basenames);
	aggregatedPatterns.push(aggregate);
	return aggregatedPatterns;
}