/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import { isPowerShell } from '../../runInTerminalHelpers.js';
import type { ICommandLinePresenter, ICommandLinePresenterOptions, ICommandLinePresenterResult } from './commandLinePresenter.js';

/**
 * Command line presenter for Node.js inline commands (`node -e "..."`).
 * Extracts the JavaScript code and sets up JavaScript syntax highlighting.
 */
export class NodeCommandLinePresenter implements ICommandLinePresenter {
	present(options: ICommandLinePresenterOptions): ICommandLinePresenterResult | undefined {
		const commandLine = options.commandLine.forDisplay;
		const extractedNode = extractNodeCommand(commandLine, options.shell, options.os);
		if (extractedNode) {
			return {
				commandLine: extractedNode,
				language: 'javascript',
				languageDisplayName: 'Node.js',
			};
		}
		return undefined;
	}
}

/**
 * Extracts the JavaScript code from a `node -e "..."` or `node -e '...'` command,
 * returning the code with properly unescaped quotes.
 *
 * @param commandLine The full command line to parse
 * @param shell The shell path (to determine quote escaping style)
 * @param os The operating system
 * @returns The extracted JavaScript code, or undefined if not a node -e/--eval command
 */
export function extractNodeCommand(commandLine: string, shell: string, os: OperatingSystem): string | undefined {
	// Match node/nodejs -e/--eval "..." pattern (double quotes)
	const doubleQuoteMatch = commandLine.match(/^node(?:js)?\s+(?:-e|--eval)\s+"(?<code>.+)"$/s);
	if (doubleQuoteMatch?.groups?.code) {
		let jsCode = doubleQuoteMatch.groups.code.trim();

		// Unescape quotes based on shell type
		if (isPowerShell(shell, os)) {
			// PowerShell uses backtick-quote (`") to escape quotes inside double-quoted strings
			jsCode = jsCode.replace(/`"/g, '"');
		} else {
			// Bash/sh/zsh use backslash-quote (\")
			jsCode = jsCode.replace(/\\"/g, '"');
		}

		return jsCode;
	}

	// Match node/nodejs -e/--eval '...' pattern (single quotes)
	// Single quotes in bash/sh/zsh are literal - no escaping inside
	// Single quotes in PowerShell are also literal
	const singleQuoteMatch = commandLine.match(/^node(?:js)?\s+(?:-e|--eval)\s+'(?<code>.+)'$/s);
	if (singleQuoteMatch?.groups?.code) {
		return singleQuoteMatch.groups.code.trim();
	}

	return undefined;
}
