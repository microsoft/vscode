/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommandFileWriteParser } from './commandFileWriteParser.js';
import { stripQuotes, tokenizeCommand } from './commandParserUtils.js';

/**
 * Parser for detecting file writes from `tee` commands.
 *
 * `tee` reads from stdin and writes to stdout and one or more files.
 *
 * Handles:
 * - `tee file.txt` (write to file)
 * - `tee -a file.txt` (append to file)
 * - `tee file1.txt file2.txt` (write to multiple files)
 * - `tee --append file.txt` (long form append)
 */
export class TeeFileWriteParser implements ICommandFileWriteParser {
	readonly commandName = 'tee';

	canHandle(commandText: string): boolean {
		return /^tee(\s|$)/.test(commandText);
	}

	extractFileWrites(commandText: string): string[] {
		const tokens = tokenizeCommand(commandText);
		return this._extractFileTargets(tokens);
	}

	/**
	 * Extracts file targets from tokenized tee command arguments.
	 * All non-option arguments after `tee` are file targets.
	 */
	private _extractFileTargets(tokens: string[]): string[] {
		if (tokens.length === 0 || tokens[0] !== 'tee') {
			return [];
		}

		const files: string[] = [];
		let i = 1; // Skip 'tee'
		let endOfOptions = false;

		while (i < tokens.length) {
			const token = tokens[i];

			// After --, all remaining tokens are file targets
			if (endOfOptions) {
				files.push(stripQuotes(token));
				i++;
				continue;
			}

			// End-of-options marker
			if (token === '--') {
				endOfOptions = true;
				i++;
				continue;
			}

			// Long options
			if (token.startsWith('--')) {
				if (token === '--output-error') {
					// --output-error takes an argument (warn, warn-nopipe, exit, exit-nopipe)
					i += 2;
					continue;
				}
				if (token.startsWith('--output-error=')) {
					i++;
					continue;
				}
				// Other long options like --append, --help, --version
				i++;
				continue;
			}

			// Short options
			if (token.startsWith('-') && token.length > 1) {
				// Flags like -a, -i, -p, or combined like -ai
				i++;
				continue;
			}

			// Non-option argument: this is a file target
			files.push(stripQuotes(token));
			i++;
		}

		return files;
	}
}
