/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

/**
 * MarkedString can be used to render human readable text. It is either a markdown string
 * or a code-block that provides a language and a code snippet. Note that
 * markdown strings will be sanitized - that means html will be escaped.
 */
export type MarkedString = string | { readonly language: string; readonly value: string };

export function markedStringsEquals(a: MarkedString | MarkedString[], b: MarkedString | MarkedString[]): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}

	if (Array.isArray(a)) {
		if (!Array.isArray(b)) {
			return false;
		}
		return markedStringArrEquals(a, b);
	}
	return markedStringEqual(a, b as MarkedString);
}


function markedStringArrEquals(a: MarkedString[], b: MarkedString[]): boolean {
	let aLen = a.length,
		bLen = b.length;

	if (aLen !== bLen) {
		return false;
	}

	for (let i = 0; i < aLen; i++) {
		if (!markedStringEqual(a[i], b[i])) {
			return false;
		}
	}

	return true;
}
function markedStringEqual(a: MarkedString, b: MarkedString): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	if (typeof a === 'string' || typeof b === 'string') {
		return typeof a === 'string' && typeof b === 'string' && a === b;
	}
	return (
		a.language === b.language
		&& a.value === b.value
	);
}

export function textToMarkedString(text: string): MarkedString {
	return text.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&'); // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
}

export function removeMarkdownEscapes(text: string): string {
	if (!text) {
		return text;
	}
	return text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');
}
