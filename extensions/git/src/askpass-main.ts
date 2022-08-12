/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as nls from 'vscode-nls';
import { IPCClient } from './ipc/ipcClient';

const localize = nls.loadMessageBundle();

function fatal(err: any): void {
	console.error(localize('missOrInvalid', "Missing or invalid credentials."));
	console.error(err);
	process.exit(1);
}

function main(argv: string[]): void {
	if (argv.length !== 5 && argv.length !== 7) {
		return fatal('Wrong number of arguments');
	}

	if (!process.env['VSCODE_GIT_ASKPASS_PIPE']) {
		return fatal('Missing pipe');
	}

	if (process.env['VSCODE_GIT_COMMAND'] === 'fetch' && !!process.env['VSCODE_GIT_FETCH_SILENT']) {
		return fatal('Skip silent fetch commands');
	}

	const output = process.env['VSCODE_GIT_ASKPASS_PIPE'] as string;

	const askpass = argv.length === 5 ? 'https' : 'ssh';
	const request = askpass === 'https' ? argv[2] : argv[3];
	const data = (askpass === 'https' ? argv[4] : argv[6]).replace(/^["']+|["':]+$/g, '');

	const ipcClient = new IPCClient('askpass');
	ipcClient.call({ request, data }).then(res => {
		fs.writeFileSync(output, res + '\n');
		setTimeout(() => process.exit(0), 0);
	}).catch(err => fatal(err));
}

main(process.argv);
