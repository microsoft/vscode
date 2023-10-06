/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from './strings';

export function buildReplaceStringWithCasePreserved(regExp: RegExp, matches: string[] | null, pattern: string): string {
	if (matches && (matches[0] !== '')) {
		if (matches[0].toUpperCase() === matches[0]) {
			return pattern.toUpperCase();
		} else if (matches[0].toLowerCase() === matches[0]) {
			return pattern.toLowerCase();
		}
		else {
			const splitPattern = pattern.match(regExp);
			if (!splitPattern) {
				return pattern;
			}
			const splitMatch = matches[0].match(regExp);
			if (!splitMatch) {
				return pattern;
			}
			let replaceString: string = '';
			splitPattern.forEach((splitValue, index) => {
				replaceString += index < splitMatch.length
					? buildPartReplaceStringWithCasePreserved([splitMatch[index]], splitValue)
					: buildPartReplaceStringWithCasePreserved([splitMatch[splitMatch.length - 1]], splitValue);
			});
			return replaceString;
		}
	} else {
		return pattern;
	}
}

function buildPartReplaceStringWithCasePreserved(matches: string[] | null, pattern: string): string {
	if (matches && (matches[0] !== '')) {
		if (matches[0].toUpperCase() === matches[0] && matches[0].length > 2) {
			return pattern.toUpperCase();
		} else if (matches[0].toLowerCase() === matches[0] && matches[0].length > 2) {
			return pattern.toLowerCase();
		} else if (strings.containsUppercaseCharacter(matches[0][0]) && pattern.length > 0) {
			return pattern[0].toUpperCase() + pattern.substr(1);
		} else if (matches[0][0].toUpperCase() !== matches[0][0] && pattern.length > 0) {
			return pattern[0].toLowerCase() + pattern.substr(1);
		} else {
			// we don't understand its pattern yet.
			return pattern;
		}
	} else {
		return pattern;
	}
}
