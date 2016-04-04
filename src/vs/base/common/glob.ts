/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');

const CACHE: { [glob: string]: RegExp } = Object.create(null);

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
			return NO_PATH_REGEX + '*?'; // 1 star matches any number of characters except path separator (/ and \) - non greedy (?)
		default:
			// Matches:  (Path Sep    OR     Path Val followed by Path Sep     OR    Path Sep followed by Path Val) 0-many times
			// Group is non capturing because we don't need to capture at all (?:...)
			// Overall we use non-greedy matching because it could be that we match too much
			return '(?:' + PATH_REGEX + '|' + NO_PATH_REGEX + '+' + PATH_REGEX + '|' + PATH_REGEX + NO_PATH_REGEX + '+)*?';
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
						let braceRegExp = '(?:' + choices.reduce((prevValue, curValue, i, array) => {
							return prevValue + '|' + parseRegExp(curValue);
						}, parseRegExp(choices[0]) /* parse the first segment as regex and give as initial value */) + ')';

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

function globToRegExp(pattern: string): RegExp {
	if (!pattern) {
		return null;
	}

	// Whitespace trimming
	pattern = pattern.trim();

	// Check cache
	if (CACHE[pattern]) {
		let cached = CACHE[pattern];
		cached.lastIndex = 0; // reset RegExp to its initial state to reuse it!

		return cached;
	}

	let regEx = parseRegExp(pattern);

	// Wrap it
	regEx = '^' + regEx + '$';

	// Convert to regexp and be ready for errors
	let result = toRegExp(regEx);

	// Make sure to cache
	CACHE[pattern] = result;

	return result;
}

function toRegExp(regEx: string): RegExp {
	try {
		return new RegExp(regEx);
	} catch (error) {
		return /.^/; // create a regex that matches nothing if we cannot parse the pattern
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
export function match(expression: IExpression, path: string, siblings?: string[]): string /* the matching pattern */;
export function match(arg1: string | IExpression, path: string, siblings?: string[]): any {
	if (!arg1 || !path) {
		return false;
	}

	// Glob with String
	if (typeof arg1 === 'string') {
		var regExp = globToRegExp(arg1);
		return regExp && regExp.test(path);
	}

	// Glob with Expression
	return matchExpression(<IExpression>arg1, path, siblings);
}

function matchExpression(expression: IExpression, path: string, siblings?: string[]): string /* the matching pattern */ {
	let patterns = Object.getOwnPropertyNames(expression);
	let basename: string;
	for (let i = 0; i < patterns.length; i++) {
		let pattern = patterns[i];

		let value = expression[pattern];
		if (value === false) {
			continue; // pattern is disabled
		}

		// Pattern matches path
		if (match(pattern, path)) {

			// Expression Pattern is <boolean>
			if (typeof value === 'boolean') {
				return pattern;
			}

			// Expression Pattern is <SiblingClause>
			if (value && typeof (<SiblingClause>value).when === 'string') {
				if (!siblings || !siblings.length) {
					continue; // pattern is malformed or we don't have siblings
				}

				if (!basename) {
					basename = strings.rtrim(paths.basename(path), paths.extname(path));
				}

				let clause = <SiblingClause>value;
				let clausePattern = clause.when.replace('$(basename)', basename);
				if (siblings.some((sibling) => sibling === clausePattern)) {
					return pattern;
				} else {
					continue; // pattern does not match in the end because the when clause is not satisfied
				}
			}

			// Expression is Anything
			return pattern;
		}
	}

	return null;
}