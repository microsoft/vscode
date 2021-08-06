/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { main } from 'vs/server/node/cli.main';

main(process.argv, {
	createRequestOptions: () => {
		const ipcHandlePath = process.env['VSCODE_IPC_HOOK_CLI'];

		if (!ipcHandlePath) {
			throw new Error('Missing VSCODE_IPC_HOOK_CLI');
		}
		return {
			socketPath: ipcHandlePath,
			method: 'POST'
		};
	}
});


