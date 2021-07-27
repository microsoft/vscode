/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { setUnexpectedErrorHandler } from 'vs/base/common/errors';
import * as proxyAgent from 'vs/base/node/proxy_agent';
import { CodeServerMessage, VscodeMessage } from 'vs/base/common/ipc';
import { enableCustomMarketplace } from 'vs/server/marketplace';
import { VscodeServer } from 'vs/server/server';
import { ConsoleMainLogger } from 'vs/platform/log/common/log';

const logger = new ConsoleMainLogger();

setUnexpectedErrorHandler((error) => {
	logger.warn('Uncaught error', error instanceof Error ? error.message : error);
});
enableCustomMarketplace();
proxyAgent.monkeyPatch(true);

/**
 * Ensure we control when the process exits.
 */
const exit = process.exit;
process.exit = function (code?: number) {
	logger.warn(`process.exit() was prevented: ${code || 'unknown code'}.`);
} as (code?: number) => never;

// Kill VS Code if the parent process dies.
if (typeof process.env.CODE_SERVER_PARENT_PID !== 'undefined') {
	const parentPid = parseInt(process.env.CODE_SERVER_PARENT_PID, 10);
	setInterval(() => {
		try {
			process.kill(parentPid, 0); // Throws an exception if the process doesn't exist anymore.
		} catch (e) {
			exit();
		}
	}, 5000);
} else {
	logger.error('no parent process');
	exit(1);
}

const vscode = new VscodeServer();
const send = (message: VscodeMessage): void => {
	if (!process.send) {
		throw new Error('not spawned with IPC');
	}
	process.send(message);
};

// Wait for the init message then start up VS Code. Subsequent messages will
// return new workbench options without starting a new instance.
process.on('message', async (message: CodeServerMessage, socket) => {
	logger.debug('got message from code-server', message.type);
	logger.trace('code-server message content', message);
	switch (message.type) {
		case 'init':
			try {
				const workbenchOptions = await vscode.initialize(message.options);

				send({ type: 'options', id: message.id, options: workbenchOptions });
			} catch (error) {
				logger.error(error.message);
				logger.error(error.stack);
				exit(1);
			}
			break;
		case 'cli':
			try {
				await vscode.cli(message.args);
				exit(0);
			} catch (error) {
				logger.error(error.message);
				logger.error(error.stack);
				exit(1);
			}
			break;
		case 'socket':
			vscode.handleWebSocket(socket, message.query, message.permessageDeflate);
			break;
	}
});
if (!process.send) {
	logger.error('not spawned with IPC');
	exit(1);
} else {
	// This lets the parent know the child is ready to receive messages.
	send({ type: 'ready' });
}
