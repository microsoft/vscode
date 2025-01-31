/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ICompletionResource } from '../types';
import { exec, type ExecOptionsWithStringEncoding } from 'node:child_process';

export async function getPwshGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	return [
		...await getCommands(options, existingCommands),
	];
}

const enum PwshCommandType {
	Alias = 1
}

async function getCommands(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<ICompletionResource[]> {

	const output = await new Promise<string>((resolve, reject) => {
		exec('Get-Command -All | Select-Object Name, CommandType, DisplayName, Definition | ConvertTo-Json', {
			...options,
			maxBuffer: 1024 * 1024 * 100 // This is a lot of content, increase buffer size
		}, (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(stdout);
		});
	});
	let json: any;
	try {
		json = JSON.parse(output);
	} catch (e) {
		console.error('Error parsing pwsh output:', e);
		return [];
	}
	return (json as any[]).map(e => {
		switch (e.CommandType) {
			case PwshCommandType.Alias: {
				return {
					label: e.Name,
					detail: e.DisplayName,
					kind: vscode.TerminalCompletionItemKind.Alias,
				};
			}
			default: {
				return {
					label: e.Name,
					detail: e.Definition,
				};
			}
		}
	});
}
