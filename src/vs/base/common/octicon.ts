/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { matchesFuzzy, IMatch } from 'vs/base/common/filters';
import { ltrim } from 'vs/base/common/strings';

const octiconStartMarker = '$(';

export function removeOcticons(word: string): string {
	const firstOcticonIndex = word.indexOf(octiconStartMarker);
	if (firstOcticonIndex === -1) {
		return word; // return early if the word does not include an octicon
	}

	return doParseOcticonAware(word, firstOcticonIndex).wordWithoutOcticons.trim();
}

function doParseOcticonAware(word: string, firstOcticonIndex: number): { wordWithoutOcticons: string, octiconOffsets: number[] } {
	const octiconOffsets: number[] = [];
	let wordWithoutOcticons: string = '';

	function appendChars(chars: string) {
		if (chars) {
			wordWithoutOcticons += chars;

			for (let i = 0; i < chars.length; i++) {
				octiconOffsets.push(octiconsOffset); // make sure to fill in octicon offsets
			}
		}
	}

	let currentOcticonStart = -1;
	let currentOcticonValue: string = '';
	let octiconsOffset = 0;

	let char: string;
	let nextChar: string;

	let offset = firstOcticonIndex;
	const length = word.length;

	// Append all characters until the first octicon
	appendChars(word.substr(0, firstOcticonIndex));

	// example: $(file-symlink-file) my cool $(other-octicon) entry
	while (offset < length) {
		char = word[offset];
		nextChar = word[offset + 1];

		// beginning of octicon: some value $( <--
		if (char === octiconStartMarker[0] && nextChar === octiconStartMarker[1]) {
			currentOcticonStart = offset;

			// if we had a previous potential octicon value without
			// the closing ')', it was actually not an octicon and
			// so we have to add it to the actual value
			appendChars(currentOcticonValue);

			currentOcticonValue = octiconStartMarker;

			offset++; // jump over '('
		}

		// end of octicon: some value $(some-octicon) <--
		else if (char === ')' && currentOcticonStart !== -1) {
			const currentOcticonLength = offset - currentOcticonStart + 1; // +1 to include the closing ')'
			octiconsOffset += currentOcticonLength;
			currentOcticonStart = -1;
			currentOcticonValue = '';
		}

		// within octicon
		else if (currentOcticonStart !== -1) {
			currentOcticonValue += char;
		}

		// any value outside of octicons
		else {
			appendChars(char);
		}

		offset++;
	}

	// if we had a previous potential octicon value without
	// the closing ')', it was actually not an octicon and
	// so we have to add it to the actual value
	appendChars(currentOcticonValue);

	return { wordWithoutOcticons, octiconOffsets };
}

export function matchesFuzzyOcticonAware(word: string, wordToMatchAgainst: string, enableSeparateSubstringMatching = false): IMatch[] {

	// Return early if there are no octicon markers in the word to match against
	const firstOcticonIndex = wordToMatchAgainst.indexOf(octiconStartMarker);
	if (firstOcticonIndex === -1) {
		return matchesFuzzy(word, wordToMatchAgainst, enableSeparateSubstringMatching);
	}

	// Parse
	const { wordWithoutOcticons, octiconOffsets } = doParseOcticonAware(wordToMatchAgainst, firstOcticonIndex);

	// Trim the word to match against because it could have leading
	// whitespace now if the word started with an octicon
	const wordToMatchAgainstWithoutOcticonsTrimmed = ltrim(wordWithoutOcticons, ' ');
	const leadingWhitespaceOffset = wordWithoutOcticons.length - wordToMatchAgainstWithoutOcticonsTrimmed.length;

	// match on value without octicons
	const matches = matchesFuzzy(word, wordToMatchAgainstWithoutOcticonsTrimmed, enableSeparateSubstringMatching);

	// Map matches back to offsets with octicons and trimming
	if (matches) {
		for (let i = 0; i < matches.length; i++) {
			const octiconOffset = octiconOffsets[matches[i].start] /* octicon offsets at index */ + leadingWhitespaceOffset /* overall leading whitespace offset */;
			matches[i].start += octiconOffset;
			matches[i].end += octiconOffset;
		}
	}

	return matches;
}