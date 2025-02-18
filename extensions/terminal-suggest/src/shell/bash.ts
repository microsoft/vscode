/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ICompletionResource } from '../types';
import { type ExecOptionsWithStringEncoding } from 'node:child_process';
import { execHelper, generateDetailAndDocs, getAliasesHelper } from './common';

export async function getBashGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	return [
		...await getAliases(options),
		...await getBuiltins(options, 'compgen -b', existingCommands)
	];
}

async function getAliases(options: ExecOptionsWithStringEncoding): Promise<ICompletionResource[]> {
	return getAliasesHelper('bash', ['-ic', 'alias'], /^alias (?<alias>[a-zA-Z0-9\.:-]+)='(?<resolved>.+)'$/, options);
}

export async function getBuiltins(
	options: ExecOptionsWithStringEncoding,
	scriptToRun: string,
	existingCommands?: Set<string>,
): Promise<(string | ICompletionResource)[]> {
	const compgenOutput = await execHelper(scriptToRun, options);
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
				const helpOutput = (await execHelper(`help ${cmd}`, options))?.trim();
				const helpLines = helpOutput?.split('\n');
				const description = helpLines?.[1]?.split(' ').slice(2).join(' ').trim();
				const args = helpLines?.[0]?.split(' ').slice(1).join(' ').trim();
				const { detail, documentation } = generateDetailAndDocs(description, args);
				completions.push({
					label: cmd,
					detail,
					documentation,
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
