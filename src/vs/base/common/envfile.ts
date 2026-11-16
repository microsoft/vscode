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
		let line = lines[i];

		// Skip empty lines and comments
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		let lineToExamine = line.trimStart();
		if (lineToExamine.startsWith('export ')) {
			lineToExamine = lineToExamine.substring(7).trimStart();
		}

		// Check if this line starts a quoted value that spans multiple lines
		const separatorIndex = findIndexOutsideQuotes(lineToExamine, c => c === '=' || c === ':');
		if (separatorIndex !== -1) {
			const valueStart = lineToExamine.substring(separatorIndex + 1).trimStart();
			const quoteChar = valueStart[0];
			if (quoteChar === '"' || quoteChar === '\'' || quoteChar === '`') {
				let hasClosingQuote = false;
				for (let idx = 1; idx < valueStart.length; idx++) {
					if (valueStart[idx] === quoteChar && !isEscaped(valueStart, idx)) {
						hasClosingQuote = true;
						break;
					}
				}

				if (!hasClosingQuote) {
					let closingLineIndex = -1;
					for (let j = i + 1; j < lines.length; j++) {
						const nextLine = lines[j];
						let foundInNextLine = false;
						for (let k = 0; k < nextLine.length; k++) {
							if (nextLine[k] === quoteChar && !isEscaped(nextLine, k)) {
								foundInNextLine = true;
								break;
							}
						}
						if (foundInNextLine) {
							closingLineIndex = j;
							break;
						}
					}

					if (closingLineIndex !== -1) {
						line = lines.slice(i, closingLineIndex + 1).join('\n');
						i = closingLineIndex;
					}
				}
			}
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
				if (char === quoteChar && !isEscaped(text, i)) {
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

	function isEscaped(text: string, index: number): boolean {
		let backslashCount = 0;
		for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
			backslashCount++;
		}
		return backslashCount % 2 === 1;
	}
}
