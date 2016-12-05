/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export function getWordAtText(text: string, offset: number, wordDefinition: RegExp): { start: number, length: number } {
	let lineStart = offset;
	while (lineStart > 0 && !isNewlineCharacter(text.charCodeAt(lineStart - 1))) {
		lineStart--;
	}
	let offsetInLine = offset - lineStart;
	let lineText = text.substr(lineStart);

	// make a copy of the regex as to not keep the state
	let flags = wordDefinition.ignoreCase ? 'gi' : 'g';
	wordDefinition = new RegExp(wordDefinition.source, flags);

	let match = wordDefinition.exec(lineText);
	while (match && match.index + match[0].length < offsetInLine) {
		match = wordDefinition.exec(lineText);
	}
	if (match && match.index <= offsetInLine) {
		return { start: match.index + lineStart, length: match[0].length };
	}

	return { start: offset, length: 0 };
}

export function startsWith(haystack: string, needle: string): boolean {
	if (haystack.length < needle.length) {
		return false;
	}

	for (let i = 0; i < needle.length; i++) {
		if (haystack[i] !== needle[i]) {
			return false;
		}
	}

	return true;
}


const CR = '\r'.charCodeAt(0);
const NL = '\n'.charCodeAt(0);
function isNewlineCharacter(charCode: number) {
	return charCode === CR || charCode === NL;
}