/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { IPCClient } from './ipc/ipcClient';

function fatal(err: unknown): void {
	console.error('Missing or invalid credentials.');
	console.error(err);
	process.exit(1);
}

function main(argv: string[]): void {
	if (!process.env['VSCODE_GIT_ASKPASS_PIPE']) {
		return fatal('Missing pipe');
	}

	if (!process.env['VSCODE_GIT_ASKPASS_TYPE']) {
		return fatal('Missing type');
	}

	if (process.env['VSCODE_GIT_ASKPASS_TYPE'] !== 'https' && process.env['VSCODE_GIT_ASKPASS_TYPE'] !== 'ssh') {
		return fatal(`Invalid type: ${process.env['VSCODE_GIT_ASKPASS_TYPE']}`);
	}

	if (process.env['VSCODE_GIT_COMMAND'] === 'fetch' && !!process.env['VSCODE_GIT_FETCH_SILENT']) {
		return fatal('Skip silent fetch commands');
	}

	const output = process.env['VSCODE_GIT_ASKPASS_PIPE'];
	const askpassType = process.env['VSCODE_GIT_ASKPASS_TYPE'] as 'https' | 'ssh';

	const ipcClient = new IPCClient('askpass');
	ipcClient.call({ askpassType, argv })
		.then(res => {
			fs.writeFileSync(output, res + '\n');
			setTimeout(() => process.exit(0), 0);
		}).catch(err => fatal(err));
}

main(process.argv);
