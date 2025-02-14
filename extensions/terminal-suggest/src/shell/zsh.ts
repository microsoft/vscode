/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ICompletionResource } from '../types';
import { execHelper, getAliasesHelper } from './common';
import { type ExecOptionsWithStringEncoding } from 'node:child_process';

export async function getZshGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	if (!cachedZshCommandDescriptions) {
		await createCommandDescriptionsCache(options);
	}
	return [
		...await getAliases(options),
		...await getBuiltins(options, existingCommands),
	];
}

async function getAliases(options: ExecOptionsWithStringEncoding): Promise<ICompletionResource[]> {
	return getAliasesHelper('zsh', ['-ic', 'alias'], /^(?<alias>[a-zA-Z0-9\.:-]+)=(?:'(?<resolved>.+)'|(?<resolved>.+))$/, options);
}

async function getBuiltins(
	options: ExecOptionsWithStringEncoding,
	existingCommands?: Set<string>,
): Promise<(string | ICompletionResource)[]> {
	const compgenOutput = await execHelper('printf "%s\\n" ${(k)builtins}', options);
	const filter = (cmd: string) => cmd && !existingCommands?.has(cmd);
	const builtins: string[] = compgenOutput.split('\n').filter(filter);
	const completions: ICompletionResource[] = [];
	if (builtins.find(r => r === '.')) {
		completions.push({
			label: '.',
			detail: 'Source a file in the current shell',
			kind: vscode.TerminalCompletionItemKind.Method
		});
	}

	for (const cmd of builtins) {
		if (typeof cmd === 'string') {
			try {
				completions.push({
					label: cmd,
					documentation: getCommandDescription(cmd),
					kind: vscode.TerminalCompletionItemKind.Method
				});

			} catch (e) {
				// Ignore errors
				console.log(`Error getting info for ${e}`);
				completions.push({
					label: cmd,
					kind: vscode.TerminalCompletionItemKind.Method
				});
			}
		}
	}

	return completions;
}
let cachedZshCommandDescriptions: Map<string, string> | undefined;
async function createCommandDescriptionsCache(options: ExecOptionsWithStringEncoding): Promise<void> {
	cachedZshCommandDescriptions = new Map();
	try {
		let output = (await execHelper('man zshbuiltins', options));
		if (output) {
			// Extract bold words
			const boldRegex = /(?:\w\x08\w)+/g;
			const boldMatches = output.match(boldRegex) || [];
			const boldCommands = new Set<string>();

			// Process each bold match and clean it up (remove backspaces)
			for (const match of boldMatches) {
				const cleaned = match.replace(/\x08./g, '');
				boldCommands.add(cleaned);
			}

			// Strip all backspaces from the output
			output = output.replace(/.\x08/g, '');
			const lines = output.split('\n');

			let command: string | undefined;
			let description: string[] = [];

			// Iterate through lines and capture command-descriptions
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim();

				// Detect potential command name, the first word on the line
				const words = line.split(/\s+/);
				const potentialCommand = words[0];

				if (boldCommands.has(potentialCommand)) {
					// Store the previous command and its description
					if (command && description.length) {
						cachedZshCommandDescriptions.set(command, description.join(' ').trim());
					}

					// Capture new command name
					command = potentialCommand;
					description = [];

					// Skip this line (it's a command name)
					continue;
				}

				// Capture description lines
				if (command) {
					description.push(line);
				}
			}

			// Store the last command-description pair
			if (command && description.length) {
				cachedZshCommandDescriptions.set(command, description.join(' ').trim());
			}
		}
	} catch {
		// Ignore errors
	}
}



export function getCommandDescription(command: string): string | undefined {
	return cachedZshCommandDescriptions?.get(command);
}
