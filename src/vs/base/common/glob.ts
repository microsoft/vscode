/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');

var CACHE: { [glob: string]: RegExp } = Object.create(null);

export interface IExpression {
	[pattern: string]: boolean|SiblingClause|any;
}

export interface SiblingClause {
	when: string;
}

var PATH_REGEX = '[/\\\\]';		// any slash or backslash
var NO_PATH_REGEX = '[^/\\\\]';	// any non-slash and non-backslash

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

	var segments: string[] = [];

	var inBraces = false;
	var inBrackets = false;

	var char: string;
	var curVal = '';
	for (var i = 0; i < pattern.length; i++) {
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

	var regEx = '';

	// Split up into segments for each slash found
	var segments = splitGlobAware(pattern, '/');

	// Special case where we only have globstars
	if (segments.every(s => s === '**')) {
		regEx = '.*';
	}

	// Build regex over segments
	else {
		var previousSegmentWasGlobStar = false;
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
			var inBraces = false;
			var braceVal = '';

			var inBrackets = false;
			var bracketVal = '';

			var char: string;
			for (var i = 0; i < segment.length; i++) {
				char = segment[i];

				// Support brace expansion
				if (char !== '}' && inBraces) {
					braceVal += char;
					continue;
				}

				// Support brackets
				if (char !== ']' && inBrackets) {
					var res: string;
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
						var choices = splitGlobAware(braceVal, ',');

						// Converts {foo,bar} => [foo|bar]
						var braceRegExp = '(?:' + choices.reduce((prevValue, curValue, index, array) => {
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
		var cached = CACHE[pattern];
		cached.lastIndex = 0; // reset RegExp to its initial state to reuse it!

		return cached;
	}

	var regEx = parseRegExp(pattern);

	// Wrap it
	regEx = '^' + regEx + '$';

	// Convert to regexp and be ready for errors
	var result: RegExp;
	try {
		result = new RegExp(regEx);
	} catch (error) {
		result = /.^/; // create a regex that matches nothing if we cannot parse the pattern
	}

	// Make sure to cache
	CACHE[pattern] = result;

	return result;
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
export function match(arg1: string|IExpression, path: string, siblings?: string[]): any {
	if (!arg1 || !path) {
		return false;
	}

	// Glob with String
	if (typeof arg1 === 'string') {
		try {
			return globToRegExp(arg1).test(path);
		} catch (error) {
			return false; // ignore pattern if the regex is invalid
		}
	}

	// Glob with Expression
	return matchExpression(<IExpression>arg1, path, siblings);
}

function matchExpression(expression: IExpression, path: string, siblings?: string[]): string /* the matching pattern */ {
	var patterns = Object.getOwnPropertyNames(expression);
	for (var i = 0; i < patterns.length; i++) {
		var pattern = patterns[i];

		// Pattern matches path
		if (match(pattern, path)) {
			var value = expression[pattern];

			// Expression Pattern is <boolean>
			if (typeof value === 'boolean') {
				if (value === false) {
					continue; // pattern is disabled
				}

				return pattern;
			}

			// Expression Pattern is <SiblingClause>
			if (value && typeof (<SiblingClause>value).when === 'string') {
				if (!siblings || !siblings.length) {
					continue; // pattern is malformed or we don't have siblings
				}

				var clause = <SiblingClause>value;
				var basename = strings.rtrim(paths.basename(path), paths.extname(path));
				var clausePattern = strings.replaceAll(clause.when, '$(basename)', basename);
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