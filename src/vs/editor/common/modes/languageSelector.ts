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

export function score(selector: LanguageSelector, uri: URI, language: string): number {

	if (Array.isArray(selector)) {
		// for each
		let values = (<LanguageSelector[]>selector).map(item => score(item, uri, language));
		return Math.max(...values);

	} else if (typeof selector === 'string') {
		// compare language id
		if (selector === language) {
			return 10;
		} else if (selector === '*') {
			return 5;
		} else {
			return 0;
		}
	} else if (selector) {
		// all must match but only highest score counts
		const filter = <LanguageFilter>selector;

		let valueLanguage = 0;
		let valueScheme = 0;
		let valuePattern = 0;

		// language id
		if (filter.language) {
			if (filter.language === language) {
				valueLanguage = 10;
			} else if (filter.language === '*') {
				valueLanguage = 5;
			} else {
				return 0;
			}
		}

		// scheme
		if (filter.scheme) {
			if (filter.scheme === uri.scheme) {
				valueScheme = 10;
			} else {
				return 0;
			}
		}

		// match fsPath with pattern
		if (filter.pattern) {
			if (filter.pattern === uri.fsPath) {
				valuePattern = 10;
			} else if (matchGlobPattern(filter.pattern, uri.fsPath)) {
				valuePattern = 5;
			} else {
				return 0;
			}
		}

		return Math.max(valueLanguage, valueScheme, valuePattern);
	}
	return undefined;
}
