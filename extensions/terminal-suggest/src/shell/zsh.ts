/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ICompletionResource } from '../types';
import { execHelper, getAliasesHelper } from './common';
import { type ExecOptionsWithStringEncoding } from 'node:child_process';
import { readFile } from 'fs/promises';
import * as path from 'path';

let cachedCommandDescriptions: Map<string, string> | undefined;

export async function getZshGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	if (!cachedCommandDescriptions) {
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

async function createCommandDescriptionsCache(options: ExecOptionsWithStringEncoding): Promise<void> {
	cachedCommandDescriptions = new Map();
	let output = '';
	try {
		const filePath = path.join(__dirname, '../../zshbuiltins.json');
		const fileData = await readFile(filePath, 'utf8');
		const json = JSON.parse(fileData);
		output = json.output;
	} catch {
		// Fallback: run man command if JSON file is not available
		output = await execHelper('man zshbuiltins', options);
	}

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
			const words = line.split(/\s+/);
			const potentialCommand = words[0];

			if (boldCommands.has(potentialCommand)) {
				if (command && description.length) {
					cachedCommandDescriptions.set(command, description.join(' ').trim());
				}
				command = potentialCommand;
				description = [];
				continue;
			}

			if (command) {
				description.push(line);
			}
		}

		if (command && description.length) {
			cachedCommandDescriptions.set(command, description.join(' ').trim());
		}
	}
}

export function getCommandDescription(command: string): string | undefined {
	return cachedCommandDescriptions?.get(command);
}
