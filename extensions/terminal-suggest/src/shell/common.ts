/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec, spawn, type ExecOptionsWithStringEncoding } from 'node:child_process';

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

