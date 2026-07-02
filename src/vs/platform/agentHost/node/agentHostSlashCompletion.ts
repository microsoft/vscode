/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A leading slash token in a user-message input.
 */
export interface ILeadingSlashToken {
	/** The token including the leading slash. */
	readonly token: string;
	/** The typed token text after the slash. */
	readonly typed: string;
	/** The start offset of the token range to replace. */
	readonly rangeStart: number;
	/** The end offset of the token range to replace. */
	readonly rangeEnd: number;
}

/**
 * Extracts the leading `/word` token from the input, where the token is the
 * run of non-whitespace characters starting at offset 0. Returns `undefined`
 * if the input does not start with `/` or the cursor is past the token.
 */
export function extractLeadingSlashToken(text: string, offset: number): ILeadingSlashToken | undefined {
	if (text.length === 0 || text.charCodeAt(0) !== 0x2f /* / */) {
		return undefined;
	}
	let end = 1;
	while (end < text.length) {
		if (isSlashTokenWhitespace(text.charCodeAt(end))) {
			break;
		}
		end++;
	}
	if (offset < 0 || offset > end) {
		return undefined;
	}
	const token = text.slice(0, end);
	return { token, typed: token.slice(1), rangeStart: 0, rangeEnd: end };
}

/**
 * Extracts the slash token containing the cursor when the slash is either at
 * the start of the input or immediately follows whitespace.
 */
export function extractWhitespaceDelimitedSlashToken(text: string, offset: number): ILeadingSlashToken | undefined {
	if (text.length === 0 || offset < 0 || offset > text.length) {
		return undefined;
	}

	let start = offset;
	while (start > 0 && !isSlashTokenWhitespace(text.charCodeAt(start - 1))) {
		start--;
	}
	if (start >= text.length || text.charCodeAt(start) !== 0x2f /* / */) {
		return undefined;
	}

	let end = start + 1;
	while (end < text.length && !isSlashTokenWhitespace(text.charCodeAt(end))) {
		end++;
	}
	if (offset > end) {
		return undefined;
	}

	const token = text.slice(start, end);
	return { token, typed: token.slice(1), rangeStart: start, rangeEnd: end };
}

function isSlashTokenWhitespace(ch: number): boolean {
	return ch === 0x20 /* space */ || ch === 0x09 /* tab */ || ch === 0x0a /* \n */ || ch === 0x0d /* \r */;
}
