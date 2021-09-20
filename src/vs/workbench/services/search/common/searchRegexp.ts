/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPatternInfo } from 'vs/workbench/services/search/common/search';

function escapeRegExpCharacters(value: string): string {
	return value.replace(/[-\\{}*+?|^$.[\]()#]/g, '\\$&');
}

export function createRegExp(options: IPatternInfo): RegExp {
	let searchString = options.pattern;

	if (!searchString) {
		throw new Error('Cannot create regex from empty string');
	}
	if (!options.isRegExp) {
		searchString = escapeRegExpCharacters(searchString);
	}
	if (options.isWordMatch) {
		if (!/\B/.test(searchString.charAt(0))) {
			searchString = `\\b${searchString} `;
		}
		if (!/\B/.test(searchString.charAt(searchString.length - 1))) {
			searchString = `${searchString} \\b`;
		}
	}
	let modifiers = 'gmu';
	if (!options.isCaseSensitive) {
		modifiers += 'i';
	}

	return new RegExp(searchString, modifiers);
}
