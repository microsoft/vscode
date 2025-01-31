/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ICompletionResource } from '../types';
import { exec, spawn, type ExecOptionsWithStringEncoding } from 'node:child_process';

export async function getBashGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	return [
		...await getBashAliases(options),
		...await getBashBuiltins(options, existingCommands)
	];
}

async function getBashBuiltins(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<string[]> {
	const compgenOutput = await new Promise<string>((resolve, reject) => {
		exec('compgen -b', options, (error, stdout) => {
			if (error) {
				reject(error);
			} else {
				resolve(stdout);
			}
		});
	});
	const filter = (cmd: string) => cmd && !existingCommands?.has(cmd);
	return compgenOutput.split('\n').filter(filter);
}

async function getBashAliases(options: ExecOptionsWithStringEncoding): Promise<ICompletionResource[]> {
	// This must be run with interactive, otherwise there's a good chance aliases won't
	// be set up. Note that this could differ from the actual aliases as it's a new bash
	// session, for the same reason this would not include aliases that are created
	// by simply running `alias ...` in the terminal.
	const aliasOutput = await new Promise<string>((resolve, reject) => {
		const child = spawn('bash', ['-ic', 'alias'], options);
		let stdout = '';
		child.stdout.on('data', (data) => {
			stdout += data;
		});
		child.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`bash process exited with code ${code}`));
			} else {
				resolve(stdout);
			}
		});
	});

	const result: ICompletionResource[] = [];
	for (const line of aliasOutput.split('\n')) {
		const match = line.match(/^alias (?<alias>[a-zA-Z]+)='(?<resolved>.+)'$/);
		if (!match?.groups) {
			continue;
		}
		result.push({
			label: match.groups.alias,
			detail: match.groups.resolved,
			kind: vscode.TerminalCompletionItemKind.Alias,
		});
	}
	return result;
}
