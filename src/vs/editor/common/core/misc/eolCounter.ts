/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../../base/common/charCode.js';

export const enum StringEOL {
	Unknown = 0,
	Invalid = 3,
	LF = 1,
	CRLF = 2
}

export function countEOL(text: string): [number, number, number, StringEOL] {
	let eolCount = 0;
	let firstLineLength = 0;
	let lastLineStart = 0;
	let eol: StringEOL = StringEOL.Unknown;
	for (let i = 0, len = text.length; i < len; i++) {
		const chr = text.charCodeAt(i);

		if (chr === CharCode.CarriageReturn) {
			if (eolCount === 0) {
				firstLineLength = i;
			}
			eolCount++;
			if (i + 1 < len && text.charCodeAt(i + 1) === CharCode.LineFeed) {
				// \r\n... case
				eol |= StringEOL.CRLF;
				i++; // skip \n
			} else {
				// \r... case
				eol |= StringEOL.Invalid;
			}
			lastLineStart = i + 1;
		} else if (chr === CharCode.LineFeed) {
			// \n... case
			eol |= StringEOL.LF;
			if (eolCount === 0) {
				firstLineLength = i;
			}
			eolCount++;
			lastLineStart = i + 1;
		}
	}
	if (eolCount === 0) {
		firstLineLength = text.length;
	}
	return [eolCount, firstLineLength, text.length - lastLineStart, eol];
}
