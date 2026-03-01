/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tokenizes a shell command into individual arguments, handling quotes and escape sequences.
 *
 * Quotes (single and double) and backslash escapes are preserved in the returned tokens so
 * that callers can detect whether a path was originally quoted.
 */
export function tokenizeCommand(commandText: string): string[] {
	const tokens: string[] = [];
	let current = '';
	let inSingleQuote = false;
	let inDoubleQuote = false;
	let escaped = false;

	for (let i = 0; i < commandText.length; i++) {
		const char = commandText[i];

		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}

		if (char === '\\' && !inSingleQuote) {
			escaped = true;
			current += char;
			continue;
		}

		if (char === '\'' && !inDoubleQuote) {
			inSingleQuote = !inSingleQuote;
			current += char;
			continue;
		}

		if (char === '"' && !inSingleQuote) {
			inDoubleQuote = !inDoubleQuote;
			current += char;
			continue;
		}

		if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
			if (current) {
				tokens.push(current);
				current = '';
			}
			continue;
		}

		current += char;
	}

	if (current) {
		tokens.push(current);
	}

	return tokens;
}

/**
 * Strips surrounding single or double quotes from a token, if present.
 */
export function stripQuotes(token: string): string {
	if (
		(token.startsWith('\'') && token.endsWith('\'')) ||
		(token.startsWith('"') && token.endsWith('"'))
	) {
		return token.slice(1, -1);
	}
	return token;
}
