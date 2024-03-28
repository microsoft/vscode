/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { CursorColumns } from 'vs/editor/common/core/cursorColumns';

function _normalizeIndentationFromWhitespace(str: string, indentSize: number, insertSpaces: boolean): string {
	// We know the full string is made of whitespace characters
	let spacesCnt = 0;
	for (let i = 0; i < str.length; i++) {
		if (str.charAt(i) === '\t') {
			// When the character instead is a tab character, then do the following calculation:
			// spacesCnt = spacesCnt + indentSize - (spacesCnt % indentSize)
			spacesCnt = CursorColumns.nextIndentTabStop(spacesCnt, indentSize);
		} else {
			// Increase the count when we encounter a space character
			spacesCnt++;
		}
	}

	let result = '';
	if (!insertSpaces) {
		// Find the number of tabs that can fit
		const tabsCnt = Math.floor(spacesCnt / indentSize);
		// Find the number of spaces that need to be used
		spacesCnt = spacesCnt % indentSize;
		// Add the tabs to the result
		for (let i = 0; i < tabsCnt; i++) {
			result += '\t';
		}
	}

	// Fill in with spaces
	for (let i = 0; i < spacesCnt; i++) {
		result += ' ';
	}

	return result;
}

export function normalizeIndentation(str: string, indentSize: number, insertSpaces: boolean): string {
	// We find the index of the first non whitespace character in the string
	let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(str);
	// If it is -1, we set the index to the string length
	if (firstNonWhitespaceIndex === -1) {
		firstNonWhitespaceIndex = str.length;
	}
	// We find the string corresponding to the indentation and send that as the first parameter
	// We normalize this indentation and add the remaining string (without the indentation) to the end
	return _normalizeIndentationFromWhitespace(str.substring(0, firstNonWhitespaceIndex), indentSize, insertSpaces) + str.substring(firstNonWhitespaceIndex);
}
