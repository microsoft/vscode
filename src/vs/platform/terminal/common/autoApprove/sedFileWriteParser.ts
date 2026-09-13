/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
export class SedFileWriteParser {
	readonly commandName = 'sed';

	canHandle(commandText: string): boolean {
		const rawTokens = this._tokenizeCommand(commandText);
		const tokens = rawTokens.map(token => this._decodeLiteralToken(token) ?? token);
		if (tokens[0] !== 'sed') {
			return false;
		}
		return this._hasLiteralInPlaceOption(tokens) || this._hasDynamicOption(rawTokens);
	}

	extractFileWrites(commandText: string): string[] {
		const rawTokens = this._tokenizeCommand(commandText);
		const tokens = rawTokens.map(token => this._decodeLiteralToken(token) ?? token);
		const files = this._extractFileTargets(tokens, rawTokens);
		const backupSuffix = this._extractBackupSuffix(tokens, rawTokens);
		if (this._hasDynamicOption(rawTokens)) {
			return [...files, '$SED_IN_PLACE_OPTION'];
		}
		if (!backupSuffix) {
			return files;
		}
		return [
			...files,
			...files.map(file => backupSuffix.includes('*') ? backupSuffix.replaceAll('*', file) : `${file}${backupSuffix}`),
		];
	}

	private _extractBackupSuffix(tokens: string[], rawTokens: string[]): string | undefined {
		let backupSuffix: string | undefined;
		for (let i = 1; i < tokens.length; i++) {
			const token = tokens[i];
			if (token === '--') {
				break;
			}
			if (this._isLongInPlaceOption(token)) {
				backupSuffix = token.includes('=')
					? this._stripSurroundingQuotes(token.slice(token.indexOf('=') + 1))
					: '';
				continue;
			}
			if (!/^-[^-]/.test(token)) {
				continue;
			}
			const flags = token.slice(1);
			const lowerIndex = flags.indexOf('i');
			const upperIndex = flags.indexOf('I');
			const inPlaceIndex = lowerIndex >= 0 ? lowerIndex : upperIndex;
			if (inPlaceIndex < 0) {
				continue;
			}
			const attached = flags.slice(inPlaceIndex + 1);
			if (attached) {
				backupSuffix = this._stripSurroundingQuotes(attached);
				continue;
			}
			const next = tokens[i + 1];
			const rawNext = rawTokens[i + 1];
			if (next === '' || next === '\'\'' || next === '""') {
				backupSuffix = '';
				continue;
			}
			if (next && rawNext && ((rawNext.startsWith('\'') && rawNext.endsWith('\'')) || (rawNext.startsWith('"') && rawNext.endsWith('"')))) {
				if (next.startsWith('.') && next.length <= 10 && !next.includes('/')) {
					backupSuffix = next;
					continue;
				}
			}
			backupSuffix = '';
		}
		return backupSuffix;
	}

	private _stripSurroundingQuotes(value: string): string {
		if (
			(value.startsWith('\'') && value.endsWith('\'')) ||
			(value.startsWith('"') && value.endsWith('"'))
		) {
			return value.slice(1, -1);
		}
		return value;
	}

	private _decodeLiteralToken(value: string): string | undefined {
		let result = '';
		let inSingleQuote = false;
		let inDoubleQuote = false;
		for (let i = 0; i < value.length; i++) {
			const char = value[i];
			if (inSingleQuote) {
				if (char === '\'') {
					inSingleQuote = false;
				} else {
					result += char;
				}
				continue;
			}
			if (inDoubleQuote) {
				if (char === '"') {
					inDoubleQuote = false;
				} else if (char === '\\' && i + 1 < value.length && '$`"\\\n'.includes(value[i + 1])) {
					i++;
					if (value[i] !== '\n') {
						result += value[i];
					}
				} else {
					result += char;
				}
				continue;
			}
			if (char === '\'') {
				inSingleQuote = true;
				continue;
			}
			if (char === '"') {
				inDoubleQuote = true;
				continue;
			}
			if (char === '\\') {
				if (++i >= value.length) {
					return undefined;
				}
				if (value[i] !== '\n') {
					result += value[i];
				}
				continue;
			}
			result += char;
		}
		return inSingleQuote || inDoubleQuote ? undefined : result;
	}

	private _hasDynamicOption(tokens: readonly string[]): boolean {
		for (let i = 1; i < tokens.length; i++) {
			const decoded = this._decodeLiteralToken(tokens[i]);
			if (decoded === '--') {
				break;
			}
			if (
				(decoded !== undefined && this._isLongInPlaceOption(decoded)) ||
				!!decoded?.match(/^-[a-zA-Z]*[iI][a-zA-Z]*\S*$/)
			) {
				continue;
			}
			if (this._containsRuntimeExpansion(tokens[i])) {
				return true;
			}
		}
		return false;
	}

	private _hasLiteralInPlaceOption(tokens: readonly string[]): boolean {
		for (let i = 1; i < tokens.length; i++) {
			const token = tokens[i];
			if (token === '--') {
				return false;
			}
			if (this._isLongInPlaceOption(token) || /^-[a-zA-Z]*[iI][a-zA-Z]*\S*$/.test(token)) {
				return true;
			}
		}
		return false;
	}

	private _isLongInPlaceOption(token: string): boolean {
		return /^--i(?:n(?:-(?:p(?:l(?:a(?:c(?:e)?)?)?)?)?)?)?(?:=.*)?$/.test(token);
	}

	private _containsRuntimeExpansion(value: string): boolean {
		let inSingleQuote = false;
		let inDoubleQuote = false;
		for (let i = 0; i < value.length; i++) {
			const char = value[i];
			if (char === '\\' && !inSingleQuote) {
				i++;
				continue;
			}
			if (char === '\'' && !inDoubleQuote) {
				inSingleQuote = !inSingleQuote;
				continue;
			}
			if (char === '"' && !inSingleQuote) {
				inDoubleQuote = !inDoubleQuote;
				continue;
			}
			if (!inSingleQuote && (char === '$' || char === '`' || char === '!' || (!inDoubleQuote && (char === '*' || char === '?' || char === '[' || char === '{')))) {
				return true;
			}
		}
		return false;
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
	private _extractFileTargets(tokens: string[], rawTokens: string[]): string[] {
		if (tokens.length === 0 || tokens[0] !== 'sed') {
			return [];
		}

		const files: string[] = [];
		let i = 1; // Skip 'sed'
		let foundScript = false;
		let optionsEnded = false;

		while (i < tokens.length) {
			const token = tokens[i];

			// Long options
			if (!optionsEnded && token === '--') {
				optionsEnded = true;
				i++;
				continue;
			}
			if (!optionsEnded && token.startsWith('--')) {
				if (this._isLongInPlaceOption(token)) {
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
			if (!optionsEnded && token.startsWith('-') && token.length > 1 && token[1] !== '-') {
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
					const rawNextToken = rawTokens[i + 1];
					// macOS/BSD style: -i '' or -i "" (empty string backup suffix)
					// Only treat it as a backup suffix if it's empty or looks like a backup
					// extension (starts with '.' and is short). Don't match sed scripts like 's/foo/bar/'.
					if (nextToken === '' || nextToken === '\'\'' || nextToken === '""') {
						i += 2;
						continue;
					}
					// Check for quoted backup suffixes like '.bak' or ".backup"
					if (rawNextToken && ((rawNextToken.startsWith('\'') && rawNextToken.endsWith('\'')) || (rawNextToken.startsWith('"') && rawNextToken.endsWith('"')))) {
						const unquoted = nextToken;
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
