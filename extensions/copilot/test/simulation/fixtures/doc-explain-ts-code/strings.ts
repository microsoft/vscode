/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from './charCode';

export function getNLines(str: string, n = 1): string {
	if (n === 0) {
		return '';
	}

	let idx = -1;
	do {
		idx = str.indexOf('\n', idx + 1);
		n--;
	} while (n > 0 && idx >= 0);

	if (idx === -1) {
		return str;
	}

	if (str[idx - 1] === '\r') {
		idx--;
	}

	return str.substr(0, idx);
}

export function singleLetterHash(n: number): string {
	const LETTERS_CNT = (CharCode.Z - CharCode.A + 1);

	n = n % (2 * LETTERS_CNT);

	if (n < LETTERS_CNT) {
		return String.fromCharCode(CharCode.a + n);
	}

	return String.fromCharCode(CharCode.A + n - LETTERS_CNT);
}
