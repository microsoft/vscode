/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { match as matchGlobPattern } from 'vs/base/common/glob'; // TODO@Alex

export interface LanguageFilter {
	language?: string;
	scheme?: string;
	pattern?: string;
}

export type LanguageSelector = string | LanguageFilter | (string | LanguageFilter)[];

export default function matches(selection: LanguageSelector, uri: URI, language: string): boolean {
	return score(selection, uri, language) > 0;
}

export function score(selector: LanguageSelector, candidateUri: URI, candidateLanguage: string): number {

	if (Array.isArray(selector)) {
		// array -> take max individual value
		let ret = 0;
		for (const filter of selector) {
			const value = score(filter, candidateUri, candidateLanguage);
			if (value === 10) {
				return value; // already at the highest
			}
			if (value > ret) {
				ret = value;
			}
		}
		return ret;

	} else if (typeof selector === 'string') {
		// short-hand notion, desugars to
		// 'fooLang' -> [{ language: 'fooLang', scheme: 'file' }, { language: 'fooLang', scheme: 'untitled' }]
		// '*' -> { language: '*', scheme: '*' }
		if (selector === '*') {
			return 5;
		} else if (selector === candidateLanguage) {
			return 10;
		} else {
			return 0;
		}

	} else if (selector) {
		// filter -> select accordingly, use defaults for scheme
		const { language, pattern, scheme } = selector;

		let ret = 0;

		if (scheme) {
			if (scheme === candidateUri.scheme) {
				ret = 10;
			} else if (scheme === '*') {
				ret = 5;
			} else {
				return 0;
			}
		}

		if (language) {
			if (language === candidateLanguage) {
				ret = 10;
			} else if (language === '*') {
				ret = Math.max(ret, 5);
			} else {
				return 0;
			}
		}

		if (pattern) {
			if (pattern === candidateUri.fsPath || matchGlobPattern(pattern, candidateUri.fsPath)) {
				ret = 10;
			} else {
				return 0;
			}
		}

		return ret;

	} else {
		return 0;
	}
}
