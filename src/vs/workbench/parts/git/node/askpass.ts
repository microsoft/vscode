/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { connect } from 'vs/base/parts/ipc/node/ipc.net';
import { IAskpassChannel, AskpassChannelClient } from 'vs/workbench/parts/git/common/gitIpc';
import * as fs from 'fs';

function fatal(err: any): void {
	console.error(err);
	process.exit(1);
}

function main(argv: string[]): void {
	if (argv.length !== 5) {
		return fatal('Wrong number of arguments');
	}

	if (!process.env['VSCODE_IPC_HOOK']) {
		return fatal('Missing ipc hook');
	}

	if (!process.env['VSCODE_GIT_REQUEST_ID']) {
		return fatal('Missing git id');
	}

	if (!process.env['VSCODE_GIT_ASKPASS_PIPE']) {
		return fatal('Missing pipe');
	}

	var id = process.env['VSCODE_GIT_REQUEST_ID'];
	var output = process.env['VSCODE_GIT_ASKPASS_PIPE'];
	var request = argv[2];
	var host = argv[4].substring(1, argv[4].length - 2);

	connect(process.env['VSCODE_IPC_HOOK'])
		.then(client => {
			const channel = client.getChannel<IAskpassChannel>('askpass');
			const service = new AskpassChannelClient(channel);

			return service.askpass(id, host, process.env['MONACO_GIT_COMMAND']).then(result => {
				if (result) {
					fs.writeFileSync(output, (/^Username$/i.test(request) ? result.username : result.password) + '\n');
				}

				return client;
			});
		})
		.done(c => {
			c.dispose();
			setTimeout(() => process.exit(0), 0);
		});
}

main(process.argv);
