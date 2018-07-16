/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The normalize() method returns the Unicode Normalization Form of a given string. The form will be
 * the Normalization Form Canonical Composition.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize}
 */
export const canNormalize = typeof ((<any>'').normalize) === 'function';

export function normalizeNFC(str: string): string {
	return normalize(str, 'NFC');
}

export function normalizeNFD(str: string): string {
	return normalize(str, 'NFD');
}

const nonAsciiCharactersPattern = /[^\u0000-\u0080]/;
function normalize(str: string, form: string): string {
	if (!canNormalize || !str) {
		return str;
	}

	let res: string;
	if (nonAsciiCharactersPattern.test(str)) {
		res = (<any>str).normalize(form);
	} else {
		res = str;
	}

	return res;
}
