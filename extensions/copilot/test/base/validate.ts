/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export type KeywordPredicate =
	| string
	| { anyOf: readonly KeywordPredicate[] }
	| { allOf: readonly KeywordPredicate[] }
	| { not: readonly KeywordPredicate[] }
	;

export function validate(answer: string, predicate: readonly KeywordPredicate[] | object): string | undefined {
	const predicates = Array.isArray(predicate) ? predicate : Object.entries(predicate).map(([key, value]) => ({ [key]: value }));
	const errors = predicates.map(pred => validatePredicate(answer, pred)).filter(err => !!err);
	if (errors.length) {
		return `Failed checks:\n${errors.join('\n')}`;
	}
	return undefined;
}

function validatePredicate(answer: string, predicate: KeywordPredicate): string | undefined {
	if (typeof predicate === 'string') {
		const startsWithWordChar = /^\w/.test(predicate);
		const endsWithWordChar = /\w$/.test(predicate);
		// Use word boundaries to prevent matching inside words
		if (!new RegExp((startsWithWordChar ? '\\b' : '') + escapeRegExpCharacters(predicate) + (endsWithWordChar ? '\\b' : ''), 'i').test(answer)) {
			return `Missing keyword: ${predicate}`;
		}
		return;
	} else {
		if ('anyOf' in predicate) {
			const errors = (predicate.anyOf as readonly KeywordPredicate[])
				.map(pred => validatePredicate(answer, pred));

			if (!errors.some(err => typeof err === 'undefined')) {
				return `All anyOf checks failed:\n${errors.join('\n')}`;
			}
		}

		if ('allOf' in predicate) {
			const result = validate(answer, predicate.allOf);
			if (result?.length) {
				return result;
			}
		}

		if ('not' in predicate) {
			const result = validate(answer, predicate.not);
			if (!result?.length) {
				return 'Expected not';
			}
		}

		return;
	}
}

/**
 * Escapes regular expression characters in a given string
 */
function escapeRegExpCharacters(value: string): string {
	return value.replace(/[\\\{\}\*\+\?\|\^\$\.\[\]\(\)]/g, '\\$&');
}