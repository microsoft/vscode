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

	for (let line of lines) {
		// Skip empty lines and comments
		line = line.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}

		// Parse the line into key and value
		const [key, value] = parseLine(line);
		if (key) {
			result.set(key, value);
		}
	}

	return result;

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
