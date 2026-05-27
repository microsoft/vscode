/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { serve } from '../../../base/parts/ipc/node/ipc.net.js';
import { TerminalDaemon } from './terminalDaemon.js';
import { TerminalIpcChannels } from '../common/terminal.js';
import { LogService } from '../../log/common/logService.js';
import { LoggerService } from '../../log/node/loggerService.js';
import { NativeEnvironmentService } from '../../environment/node/environmentService.js';
import { parseArgs, OPTIONS } from '../../environment/node/argv.js';
import product from '../../product/common/product.js';
import { IProductService } from '../../product/common/productService.js';
import { getLogLevel } from '../../log/common/log.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { DefaultURITransformer } from '../../../base/common/uriIpc.js';
import { LoggerChannel } from '../../log/common/logIpc.js';
import { localize } from '../../../nls.js';

async function main() {
	// Parse environment and args
	const productService: IProductService = { _serviceBrand: undefined, ...product };
	const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
	const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
	const logger = loggerService.createLogger('terminaldaemon', { name: 'Terminal Daemon' });
	const logService = new LogService(logger);

	const disposables = new DisposableStore();

	const pipePath = process.env.VSCODE_TERMINAL_DAEMON_PIPE;
	if (!pipePath) {
		logService.error('VSCODE_TERMINAL_DAEMON_PIPE environment variable not set');
		process.exit(1);
	}

	try {
		const server = await serve(pipePath);
		
		// Register channels
		server.registerChannel(TerminalIpcChannels.Logger, new LoggerChannel(loggerService, () => DefaultURITransformer));
		
		const daemon = new TerminalDaemon(logService, productService);
		disposables.add(daemon);
		
		const daemonChannel = ProxyChannel.fromService(daemon, disposables);
		server.registerChannel(TerminalIpcChannels.PtyHost, daemonChannel);

		logService.info(`Terminal Daemon started successfully at ${pipePath}`);

		// Clean up on exit
		process.once('exit', () => {
			logService.trace('Terminal Daemon exiting');
			disposables.dispose();
			logService.dispose();
		});

		// Handle SIGTERM/SIGINT
		process.once('SIGTERM', () => process.exit(0));
		process.once('SIGINT', () => process.exit(0));

	} catch (err) {
		logService.error('Failed to start Terminal Daemon', err);
		process.exit(1);
	}
}

main();
