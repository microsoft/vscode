/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchesFuzzy2 } from '../../../base/common/filters.js';

/**
 * A leading slash token in a user-message input.
 */
export interface ILeadingSlashToken {
	/** The token text between the slash and the cursor, used to filter completions. */
	readonly typed: string;
	/** The offset of the slash, where the replaced range starts. */
	readonly rangeStart: number;
	/** The cursor offset, where the replaced range ends so text after the cursor is kept. */
	readonly rangeEnd: number;
}

/**
 * Extracts the `/word` token before the cursor when the slash is at the start
 * of the input.
 */
export function extractLeadingSlashToken(text: string, offset: number): ILeadingSlashToken | undefined {
	const token = extractWhitespaceDelimitedSlashToken(text, offset);
	return token?.rangeStart === 0 ? token : undefined;
}

/**
 * Extracts the `/word` token before the cursor when the slash is either at
 * the start of the input or immediately follows whitespace.
 */
export function extractWhitespaceDelimitedSlashToken(text: string, offset: number): ILeadingSlashToken | undefined {
	if (offset < 0 || offset > text.length) {
		return undefined;
	}

	let start = offset;
	while (start > 0 && !isSlashTokenWhitespace(text.charCodeAt(start - 1))) {
		start--;
	}
	if (start >= offset || text.charCodeAt(start) !== 0x2f /* / */) {
		return undefined;
	}

	return { typed: text.slice(start + 1, offset), rangeStart: start, rangeEnd: offset };
}

/**
 * Tests whether a slash completion name fuzzy matches the typed token text.
 */
export function matchesSlashCompletion(typed: string, name: string): boolean {
	if (typed.length === 0 || name.toLowerCase().startsWith(typed.toLowerCase())) {
		return true;
	}
	return typed.length > 1 && matchesFuzzy2(typed, name) !== null;
}

function isSlashTokenWhitespace(ch: number): boolean {
	return ch === 0x20 /* space */ || ch === 0x09 /* tab */ || ch === 0x0a /* \n */ || ch === 0x0d /* \r */;
}
