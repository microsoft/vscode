/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ICompletionResource } from '../types';
import { execHelper, getAliasesHelper } from './common';
import { type ExecOptionsWithStringEncoding } from 'node:child_process';
import { zshBuiltinsCommandDescriptionsCache } from './zshBuiltinsCache';

const commandDescriptionsCache: Map<string, { shortDescription?: string; description: string; args: string | undefined }> | undefined = parseCache(zshBuiltinsCommandDescriptionsCache);

export async function getZshGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	return [
		...await getAliases(options),
		...await getBuiltins(options, existingCommands),
	];
}

async function getAliases(options: ExecOptionsWithStringEncoding): Promise<ICompletionResource[]> {
	const args = process.platform === 'darwin' ? ['-icl', 'alias'] : ['-ic', 'alias'];
	return getAliasesHelper('zsh', args, /^(?<alias>[a-zA-Z0-9\._:-]+)=(?<quote>['"]?)(?<resolved>.+?)\k<quote>$/, options);
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


	for (const cmd of commandDescriptionsCache?.keys() ?? []) {
		if (typeof cmd === 'string') {
			try {
				const result = getCommandDescription(cmd);
				completions.push({
					label: { label: cmd, description: result?.description },
					detail: result?.args,
					documentation: new vscode.MarkdownString(result?.documentation),
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

export function getCommandDescription(command: string): { documentation?: string; description?: string; args?: string | undefined } | undefined {
	if (!zshBuiltinsCommandDescriptionsCache) {
		return undefined;
	}
	const result = commandDescriptionsCache?.get(command);
	if (result?.shortDescription) {
		return {
			description: result.shortDescription,
			args: result.args,
			documentation: result.description
		};
	} else {
		return {
			description: result?.description,
			args: result?.args,
			documentation: result?.description
		};
	}
}

function parseCache(cache: Object): Map<string, { shortDescription?: string; description: string; args: string | undefined }> | undefined {
	if (!cache) {
		return undefined;
	}
	const result = new Map<string, { shortDescription?: string; description: string; args: string | undefined }>();
	for (const [key, value] of Object.entries(cache)) {
		result.set(key, value);
	}
	return result;
}
