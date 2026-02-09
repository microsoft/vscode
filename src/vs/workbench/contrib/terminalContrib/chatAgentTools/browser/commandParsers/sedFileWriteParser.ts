/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommandFileWriteParser } from './commandFileWriteParser.js';

/**
 * Parser for detecting file writes from `sed` commands using in-place editing.
 *
 * Handles:
 * - `sed -i 's/foo/bar/' file.txt` (GNU)
 * - `sed -i.bak 's/foo/bar/' file.txt` (GNU with backup suffix)
 * - `sed -i '' 's/foo/bar/' file.txt` (macOS/BSD with empty backup suffix)
 * - `sed --in-place 's/foo/bar/' file.txt` (GNU long form)
 * - `sed --in-place=.bak 's/foo/bar/' file.txt` (GNU long form with backup)
 * - `sed -I 's/foo/bar/' file.txt` (BSD case-insensitive variant)
 */
export class SedFileWriteParser implements ICommandFileWriteParser {
	readonly commandName = 'sed';

	canHandle(commandText: string): boolean {
		// Check if this is a sed command
		if (!commandText.match(/^sed\s+/)) {
			return false;
		}

		// Check for -i, -I, or --in-place flag
		const inPlaceRegex = /(?:^|\s)(-[a-zA-Z]*[iI][a-zA-Z]*\S*|--in-place(?:=\S*)?|(-i|-I)\s*'[^']*'|(-i|-I)\s*"[^"]*")(?:\s|$)/;
		return inPlaceRegex.test(commandText);
	}

	extractFileWrites(commandText: string): string[] {
		const tokens = this._tokenizeCommand(commandText);
		return this._extractFileTargets(tokens);
	}

	/**
	 * Tokenizes a command into individual arguments, handling quotes and escapes.
	 */
	private _tokenizeCommand(commandText: string): string[] {
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
	 * Extracts file targets from tokenized sed command arguments.
	 * Files are generally the last non-option, non-script arguments.
	 */
	private _extractFileTargets(tokens: string[]): string[] {
		if (tokens.length === 0 || tokens[0] !== 'sed') {
			return [];
		}

		const files: string[] = [];
		let i = 1; // Skip 'sed'
		let foundScript = false;

		while (i < tokens.length) {
			const token = tokens[i];

			// Long options
			if (token.startsWith('--')) {
				if (token === '--in-place' || token.startsWith('--in-place=')) {
					// In-place flag (already verified we have one)
					i++;
					continue;
				}
				if (token === '--expression' || token === '--file') {
					// Skip the option and its argument
					i += 2;
					foundScript = true;
					continue;
				}
				if (token.startsWith('--expression=') || token.startsWith('--file=')) {
					i++;
					foundScript = true;
					continue;
				}
				// Other long options like --sandbox, --debug, etc.
				i++;
				continue;
			}

			// Short options
			if (token.startsWith('-') && token.length > 1 && token[1] !== '-') {
				// Could be combined flags like -ni or -i.bak
				const flags = token.slice(1);

				// Check if this is -i with backup suffix attached (e.g., -i.bak)
				const iIndex = flags.indexOf('i');
				const IIndex = flags.indexOf('I');
				const inPlaceIndex = iIndex >= 0 ? iIndex : IIndex;

				if (inPlaceIndex >= 0 && inPlaceIndex < flags.length - 1) {
					// -i.bak style - backup suffix is attached
					i++;
					continue;
				}

				// Check if -i or -I is the last flag and next token could be backup suffix
				if ((flags.endsWith('i') || flags.endsWith('I')) && i + 1 < tokens.length) {
					const nextToken = tokens[i + 1];
					// macOS/BSD style: -i '' or -i "" (empty string backup suffix)
					// Only treat it as a backup suffix if it's empty or looks like a backup
					// extension (starts with '.' and is short). Don't match sed scripts like 's/foo/bar/'.
					if (nextToken === '\'\'' || nextToken === '""') {
						i += 2;
						continue;
					}
					// Check for quoted backup suffixes like '.bak' or ".backup"
					if ((nextToken.startsWith('\'') && nextToken.endsWith('\'')) || (nextToken.startsWith('"') && nextToken.endsWith('"'))) {
						const unquoted = nextToken.slice(1, -1);
						// Backup suffixes typically start with '.' and are short extensions
						if (unquoted.startsWith('.') && unquoted.length <= 10 && !unquoted.includes('/')) {
							i += 2;
							continue;
						}
					}
				}

				// Check for -e or -f which take arguments
				if (flags.includes('e') || flags.includes('f')) {
					const eIndex = flags.indexOf('e');
					const fIndex = flags.indexOf('f');
					const optIndex = eIndex >= 0 ? eIndex : fIndex;

					// If -e or -f is not the last character, the rest of the token is the argument
					if (optIndex < flags.length - 1) {
						foundScript = true;
						i++;
						continue;
					}

					// Otherwise, the next token is the argument
					foundScript = true;
					i += 2;
					continue;
				}

				i++;
				continue;
			}

			// Non-option argument
			if (!foundScript) {
				// First non-option is the script (unless -e/-f was used)
				foundScript = true;
				i++;
				continue;
			}

			// Subsequent non-option arguments are files
			// Strip surrounding quotes from file path
			let file = token;
			if ((file.startsWith('\'') && file.endsWith('\'')) || (file.startsWith('"') && file.endsWith('"'))) {
				file = file.slice(1, -1);
			}
			files.push(file);
			i++;
		}

		return files;
	}
}
