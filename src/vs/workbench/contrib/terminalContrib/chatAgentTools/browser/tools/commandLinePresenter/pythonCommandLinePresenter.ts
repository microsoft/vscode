/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import { isPowerShell } from '../../runInTerminalHelpers.js';
import type { ICommandLinePresenter, ICommandLinePresenterOptions, ICommandLinePresenterResult } from './commandLinePresenter.js';

/**
 * Command line presenter for Python inline commands (`python -c "..."`).
 * Extracts the Python code and sets up Python syntax highlighting.
 */
export class PythonCommandLinePresenter implements ICommandLinePresenter {
	present(options: ICommandLinePresenterOptions): ICommandLinePresenterResult | undefined {
		const commandLine = options.commandLine.forDisplay;
		const extractedPython = extractPythonCommand(commandLine, options.shell, options.os);
		if (extractedPython) {
			return {
				commandLine: extractedPython,
				language: 'python',
				languageDisplayName: 'Python',
			};
		}
		return undefined;
	}
}

/**
 * Extracts the Python code from a `python -c "..."` or `python -c '...'` command,
 * returning the code with properly unescaped quotes.
 *
 * @param commandLine The full command line to parse
 * @param shell The shell path (to determine quote escaping style)
 * @param os The operating system
 * @returns The extracted Python code, or undefined if not a python -c command
 */
export function extractPythonCommand(commandLine: string, shell: string, os: OperatingSystem): string | undefined {
	// Match python/python3 -c "..." pattern (double quotes)
	const doubleQuoteMatch = commandLine.match(/^python(?:3)?\s+-c\s+"(?<python>.+)"$/s);
	if (doubleQuoteMatch?.groups?.python) {
		let pythonCode = doubleQuoteMatch.groups.python.trim();

		// Unescape quotes based on shell type
		if (isPowerShell(shell, os)) {
			// PowerShell uses backtick-quote (`") to escape quotes inside double-quoted strings
			pythonCode = pythonCode.replace(/`"/g, '"');
		} else {
			// Bash/sh/zsh use backslash-quote (\")
			pythonCode = pythonCode.replace(/\\"/g, '"');
		}

		return pythonCode;
	}

	// Match python/python3 -c '...' pattern (single quotes)
	// Single quotes in bash/sh/zsh are literal - no escaping inside
	// Single quotes in PowerShell are also literal
	const singleQuoteMatch = commandLine.match(/^python(?:3)?\s+-c\s+'(?<python>.+)'$/s);
	if (singleQuoteMatch?.groups?.python) {
		return singleQuoteMatch.groups.python.trim();
	}

	return undefined;
}
