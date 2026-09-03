/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../base/common/strings.js';

/**
 * Returns the UTF-16 length of a full-width code point that forms a complete grapheme, or `0`.
 */
export function getFullWidthCharacterLength(text: string, offset: number): number {
	const codePoint = text.codePointAt(offset);
	if (codePoint === undefined || !strings.isFullWidthCharacter(codePoint)) {
		return 0;
	}
	const codePointLength = codePoint > 0xFFFF ? 2 : 1;
	const [graphemeStart, graphemeEnd] = strings.getCharContainingOffset(text, offset);
	return graphemeStart === offset && graphemeEnd - graphemeStart === codePointLength ? codePointLength : 0;
}

export function getPreviousFullWidthCharacterLength(text: string, offset: number): number {
	if (offset <= 0) {
		return 0;
	}
	const characterLength = strings.prevCharLength(text, offset);
	const startOffset = offset - characterLength;
	return getFullWidthCharacterLength(text, startOffset) === characterLength ? characterLength : 0;
}

export function containsFullWidthCharacter(text: string, endOffset: number = text.length): boolean {
	const limit = endOffset === -1 ? text.length : Math.min(endOffset, text.length);
	for (let offset = 0; offset < limit; offset++) {
		const characterLength = getFullWidthCharacterLength(text, offset);
		if (characterLength > 0 && offset + characterLength <= limit) {
			return true;
		}
	}
	return false;
}
