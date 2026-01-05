/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IPCClient } from './ipc/ipcClient';

function fatal(err: unknown): void {
	console.error(err);
	process.exit(1);
}

function main(argv: string[]): void {
	const ipcClient = new IPCClient('git-editor');
	const commitMessagePath = argv[argv.length - 1];

	ipcClient.call({ commitMessagePath }).then(() => {
		setTimeout(() => process.exit(0), 0);
	}).catch(err => fatal(err));
}

main(process.argv);
