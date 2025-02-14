/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICompletionResource } from '../types';
import { execHelper, getAliasesHelper, getZshBashBuiltins } from './common';
import { type ExecOptionsWithStringEncoding } from 'node:child_process';

export async function getZshGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	if (!cachedZshCommandDescriptions) {
		await createCommandsCache(options);
	}
	return [
		...await getAliases(options),
		...await getZshBashBuiltins(options, 'printf "%s\\n" ${(k)builtins}', getCommandDescription, existingCommands),
	];
}

async function getAliases(options: ExecOptionsWithStringEncoding): Promise<ICompletionResource[]> {
	return getAliasesHelper('zsh', ['-ic', 'alias'], /^(?<alias>[a-zA-Z0-9\.:-]+)=(?:'(?<resolved>.+)'|(?<resolved>.+))$/, options);
}


let cachedZshCommandDescriptions: Map<string, string> | undefined;
async function createCommandsCache(options: ExecOptionsWithStringEncoding): Promise<void> {
	cachedZshCommandDescriptions = new Map();
	try {
		let output = (await execHelper('man zshbuiltins', options));
		if (output) {
			// Remove backspace formatting
			output = output.replace(/.\x08/g, '');
			const lines = output.split('\n');
			let command: string | undefined;
			let description: string[] = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];

				// Detect command names (lines starting with exactly 7 spaces)
				const cmdMatch = line.match(/^\s{7}(\S+)/);
				if (cmdMatch?.length && cmdMatch.length > 1) {
					command = cmdMatch[1];
					// Store the previous command and its description
					if (command && description.length) {
						cachedZshCommandDescriptions.set(command, description.join(' ').trim());
					}

					// Capture the new command name
					command = cmdMatch[1];
					description = [];
					// Move to the next line to check for description
					continue;
				}

				// Capture description lines (14 spaces indentation)
				if (command && line.match(/^\s{14}/)) {
					description.push(line.trim());
				}
			}

			// Store the last command-description pair
			if (command && description.length) {
				cachedZshCommandDescriptions.set(command, description.join(' ').trim());
			}
		}
	} catch {
		// ignore
	}
}

export function getCommandDescription(command: string): string | undefined {
	return cachedZshCommandDescriptions?.get(command);
}
