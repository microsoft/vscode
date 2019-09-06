/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchesFuzzy, IMatch } from 'vs/base/common/filters';
import { ltrim } from 'vs/base/common/strings';

const octiconStartMarker = '$(';

export interface IParsedOcticons {
	text: string;
	octiconOffsets?: number[];
}

export function parseOcticons(text: string): IParsedOcticons {
	const firstOcticonIndex = text.indexOf(octiconStartMarker);
	if (firstOcticonIndex === -1) {
		return { text }; // return early if the word does not include an octicon
	}

	return doParseOcticons(text, firstOcticonIndex);
}

function doParseOcticons(text: string, firstOcticonIndex: number): IParsedOcticons {
	const octiconOffsets: number[] = [];
	let textWithoutOcticons: string = '';

	function appendChars(chars: string) {
		if (chars) {
			textWithoutOcticons += chars;

			for (const _ of chars) {
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
	const length = text.length;

	// Append all characters until the first octicon
	appendChars(text.substr(0, firstOcticonIndex));

	// example: $(file-symlink-file) my cool $(other-octicon) entry
	while (offset < length) {
		char = text[offset];
		nextChar = text[offset + 1];

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

	return { text: textWithoutOcticons, octiconOffsets };
}

export function matchesFuzzyOcticonAware(query: string, target: IParsedOcticons, enableSeparateSubstringMatching = false): IMatch[] | null {
	const { text, octiconOffsets } = target;

	// Return early if there are no octicon markers in the word to match against
	if (!octiconOffsets || octiconOffsets.length === 0) {
		return matchesFuzzy(query, text, enableSeparateSubstringMatching);
	}

	// Trim the word to match against because it could have leading
	// whitespace now if the word started with an octicon
	const wordToMatchAgainstWithoutOcticonsTrimmed = ltrim(text, ' ');
	const leadingWhitespaceOffset = text.length - wordToMatchAgainstWithoutOcticonsTrimmed.length;

	// match on value without octicons
	const matches = matchesFuzzy(query, wordToMatchAgainstWithoutOcticonsTrimmed, enableSeparateSubstringMatching);

	// Map matches back to offsets with octicons and trimming
	if (matches) {
		for (const match of matches) {
			const octiconOffset = octiconOffsets[match.start + leadingWhitespaceOffset] /* octicon offsets at index */ + leadingWhitespaceOffset /* overall leading whitespace offset */;
			match.start += octiconOffset;
			match.end += octiconOffset;
		}
	}

	return matches;
}