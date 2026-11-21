/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Parses a standard .env/.envrc file into a map of the environment variables
 * it defines.
 *
 * todo@connor4312: this can go away (if only used in Node.js targets) and be
 * replaced with `util.parseEnv`. However, currently calling that makes the
 * extension host crash.
 */
export function parseEnvFile(src: string) {
	const result = new Map<string, string>();

	// Normalize line breaks
	const normalizedSrc = src.replace(/\r\n?/g, '\n');
	const lines = normalizedSrc.split('\n');

	for (let i = 0; i < lines.length; i++) {
		// Skip empty lines and comments
		let line = lines[i].trim();
		if (!line || line.startsWith('#')) {
			continue;
		}

		// A quoted value may span multiple lines, join them back together
		const endLine = findMultilineValueEnd(line, i);
		if (endLine !== -1) {
			line = [line, ...lines.slice(i + 1, endLine + 1)].join('\n');
			i = endLine;
		}

		// Parse the line into key and value
		const [key, value] = parseLine(line);
		if (key) {
			result.set(key, value);
		}
	}

	return result;

	/**
	 * If the value on `line` opens a quote that is not closed on the same
	 * line, returns the index of the line that closes it. Otherwise -1.
	 */
	function findMultilineValueEnd(line: string, lineIndex: number): number {
		const separatorIndex = findIndexOutsideQuotes(line, c => c === '=' || c === ':');
		if (separatorIndex === -1) {
			return -1;
		}

		const value = line.substring(separatorIndex + 1).trimStart();
		const quote = value[0];
		if (quote !== '"' && quote !== '\'' && quote !== '`') {
			return -1;
		}

		if (findClosingQuote(value, quote, 1) !== -1) {
			return -1;
		}

		for (let j = lineIndex + 1; j < lines.length; j++) {
			if (findClosingQuote(lines[j], quote, 0) !== -1) {
				return j;
			}
		}

		// Unterminated, leave the line as is
		return -1;
	}

	function findClosingQuote(text: string, quote: string, start: number): number {
		for (let i = start; i < text.length; i++) {
			if (text[i] === quote && text[i - 1] !== '\\') {
				return i;
			}
		}
		return -1;
	}

	function parseLine(line: string): [string, string] | [null, null] {
		// Handle export prefix
		if (line.startsWith('export ')) {
			line = line.substring(7).trim();
		}

		// Find the key-value separator
		const separatorIndex = findIndexOutsideQuotes(line, c => c === '=' || c === ':');
		if (separatorIndex === -1) {
			return [null, null];
		}

		const key = line.substring(0, separatorIndex).trim();
		let value = line.substring(separatorIndex + 1).trim();

		// Handle comments and remove them
		const commentIndex = findIndexOutsideQuotes(value, c => c === '#');
		if (commentIndex !== -1) {
			value = value.substring(0, commentIndex).trim();
		}

		// Process quoted values
		if (value.length >= 2) {
			const firstChar = value[0];
			const lastChar = value[value.length - 1];

			if ((firstChar === '"' && lastChar === '"') ||
				(firstChar === '\'' && lastChar === '\'') ||
				(firstChar === '`' && lastChar === '`')) {
				// Remove surrounding quotes
				value = value.substring(1, value.length - 1);

				// Handle escaped characters in double quotes
				if (firstChar === '"') {
					value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
				}
			}
		}

		return [key, value];
	}

	function findIndexOutsideQuotes(text: string, predicate: (char: string) => boolean): number {
		let inQuote = false;
		let quoteChar = '';

		for (let i = 0; i < text.length; i++) {
			const char = text[i];

			if (inQuote) {
				if (char === quoteChar && text[i - 1] !== '\\') {
					inQuote = false;
				}
			} else if (char === '"' || char === '\'' || char === '`') {
				inQuote = true;
				quoteChar = char;
			} else if (predicate(char)) {
				return i;
			}
		}

		return -1;
	}
}
