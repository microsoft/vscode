/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';

export const openVscodeUri = (remoteCommand: string | undefined, uri: string): Promise<void> => {
	let command: string;
	let shell = false;
	let args = [uri];
	if (remoteCommand) {
		const [cmd, ...cmdArgs] = remoteCommand.split(' ');
		command = cmd;
		args = [...cmdArgs, uri];
	} else {
		switch (process.platform) {
			case 'win32':
				command = 'cmd';
				shell = true;
				args = ['/c', 'start', '""', `"${uri}"`];
				break;
			case 'darwin':
				command = 'open';
				break;
			case 'linux':
			default:
				command = 'xdg-open';
				break;
		}
	}

	return new Promise((resolve, reject) => {
		let std = '';
		const cmd = spawn(command, args, {
			stdio: 'pipe',
			shell,
			env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
		});
		cmd.stdout.setEncoding('utf8').on('data', d => std += d);
		cmd.stderr.setEncoding('utf8').on('data', d => std += d);

		cmd.on('error', reject);
		cmd.on('exit', code => {
			if (code !== 0) {
				reject(new Error(`Failed to open: ${std}`));
			} else {
				resolve();
			}
		});
	});
};
