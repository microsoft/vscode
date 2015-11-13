/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import {match as matchGlobPattern} from 'vs/base/common/glob';

export interface LanguageFilter {
	language?: string;
	scheme?: string;
	pattern?: string;
}

export type LanguageSelector = string|LanguageFilter|(string|LanguageFilter)[];

export interface ModelLike {
	uri: URI;
	language: string;
}

export default function matches(selection: LanguageSelector, model: ModelLike): boolean {
	return score(selection, model) > 0;
}

export function score(selector: LanguageSelector, model: ModelLike): number {

	if (Array.isArray(selector)) {
		// for each
		let values = (<LanguageSelector[]>selector).map(item => score(item, model));
		return Math.max(...values);

	} else if (typeof selector === 'string') {
		// compare language id
		if (selector === model.language) {
			return 10;
		} else if (selector === '*') {
			return 5;
		} else  {
			return 0;
		}
	} else if (selector) {
		let filter = <LanguageFilter>selector;
		let value = 0;

		// language id
		if (filter.language) {
			if (filter.language === model.language) {
				value += 10;
			} else if (filter.language === '*') {
				value += 5;
			} else {
				return 0;
			}
		}

		// scheme
		if (filter.scheme) {
			if (filter.scheme === model.uri.scheme) {
				value += 10;
			} else {
				return 0;
			}
		}

		// match fsPath with pattern
		if (filter.pattern) {
			if (filter.pattern === model.uri.fsPath) {
				value += 10;
			} else if (matchGlobPattern(filter.pattern, model.uri.fsPath)) {
				value += 5;
			} else {
				return 0;
			}
		}

		return value;
	}
}
