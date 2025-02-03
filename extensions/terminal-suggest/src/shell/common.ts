/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { exec, spawn, type ExecOptionsWithStringEncoding } from 'node:child_process';
import type { ICompletionResource } from '../types';

export async function spawnHelper(command: string, args: string[], options: ExecOptionsWithStringEncoding): Promise<string> {
	// This must be run with interactive, otherwise there's a good chance aliases won't
	// be set up. Note that this could differ from the actual aliases as it's a new bash
	// session, for the same reason this would not include aliases that are created
	// by simply running `alias ...` in the terminal.
	return new Promise<string>((resolve, reject) => {
		const child = spawn(command, args, options);
		let stdout = '';
		child.stdout.on('data', (data) => {
			stdout += data;
		});
		child.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`process exited with code ${code}`));
			} else {
				resolve(stdout);
			}
		});
	});
}

export async function execHelper(commandLine: string, options: ExecOptionsWithStringEncoding): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		exec(commandLine, options, (error, stdout) => {
			if (error) {
				reject(error);
			} else {
				resolve(stdout);
			}
		});
	});
}

export async function getAliasesHelper(command: string, args: string[], regex: RegExp, options: ExecOptionsWithStringEncoding): Promise<ICompletionResource[]> {
	// This must be run with interactive, otherwise there's a good chance aliases won't
	// be set up. Note that this could differ from the actual aliases as it's a new bash
	// session, for the same reason this would not include aliases that are created
	// by simply running `alias ...` in the terminal.
	const aliasOutput = await spawnHelper(command, args, options);
	const result: ICompletionResource[] = [];
	for (const line of aliasOutput.split('\n')) {
		const match = line.match(regex);
		if (!match?.groups) {
			continue;
		}
		let definitionCommand = '';
		let definitionIndex = match.groups.resolved.indexOf(' ');
		if (definitionIndex === -1) {
			definitionIndex = match.groups.resolved.length;
		}
		definitionCommand = match.groups.resolved.substring(0, definitionIndex);
		result.push({
			label: match.groups.alias,
			detail: match.groups.resolved,
			kind: vscode.TerminalCompletionItemKind.Alias,
			definitionCommand,
		});
	}
	return result;
}
