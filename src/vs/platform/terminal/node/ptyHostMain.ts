/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefaultURITransformer } from 'vs/base/common/uriIpc';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Server as ChildProcessServer } from 'vs/base/parts/ipc/node/ipc.cp';
import { Server as UtilityProcessServer } from 'vs/base/parts/ipc/node/ipc.mp';
import { localize } from 'vs/nls';
import { OPTIONS, parseArgs } from 'vs/platform/environment/node/argv';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { getLogLevel } from 'vs/platform/log/common/log';
import { LoggerChannel } from 'vs/platform/log/common/logIpc';
import { LogService } from 'vs/platform/log/common/logService';
import { LoggerService } from 'vs/platform/log/node/loggerService';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IReconnectConstants, TerminalIpcChannels } from 'vs/platform/terminal/common/terminal';
import { HeartbeatService } from 'vs/platform/terminal/node/heartbeatService';
import { PtyService } from 'vs/platform/terminal/node/ptyService';
import { isUtilityProcess } from 'vs/base/parts/sandbox/node/electronTypes';
import { timeout } from 'vs/base/common/async';

startPtyHost();

async function startPtyHost() {
	// Parse environment variables
	const startupDelay = parseInt(process.env.VSCODE_STARTUP_DELAY ?? '0');
	const simulatedLatency = parseInt(process.env.VSCODE_LATENCY ?? '0');
	const reconnectConstants: IReconnectConstants = {
		graceTime: parseInt(process.env.VSCODE_RECONNECT_GRACE_TIME || '0'),
		shortGraceTime: parseInt(process.env.VSCODE_RECONNECT_SHORT_GRACE_TIME || '0'),
		scrollback: parseInt(process.env.VSCODE_RECONNECT_SCROLLBACK || '100')
	};

	// Sanitize environment
	delete process.env.VSCODE_RECONNECT_GRACE_TIME;
	delete process.env.VSCODE_RECONNECT_SHORT_GRACE_TIME;
	delete process.env.VSCODE_RECONNECT_SCROLLBACK;
	delete process.env.VSCODE_LATENCY;
	delete process.env.VSCODE_STARTUP_DELAY;

	// Delay startup if needed, this must occur before RPC is setup to avoid the channel from timing
	// out.
	if (startupDelay) {
		await timeout(startupDelay);
	}

	// Setup RPC
	const _isUtilityProcess = isUtilityProcess(process);
	let server: ChildProcessServer<string> | UtilityProcessServer;
	if (_isUtilityProcess) {
		server = new UtilityProcessServer();
	} else {
		server = new ChildProcessServer(TerminalIpcChannels.PtyHost);
	}

	// Services
	const productService: IProductService = { _serviceBrand: undefined, ...product };
	const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
	const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
	server.registerChannel(TerminalIpcChannels.Logger, new LoggerChannel(loggerService, () => DefaultURITransformer));
	const logger = loggerService.createLogger('ptyhost', { name: localize('ptyHost', "Pty Host") });
	const logService = new LogService(logger);

	// Log developer config
	if (startupDelay) {
		logService.warn(`Pty Host startup is delayed ${startupDelay}ms`);
	}
	if (simulatedLatency) {
		logService.warn(`Pty host is simulating ${simulatedLatency}ms latency`);
	}

	// Heartbeat responsiveness tracking
	const heartbeatService = new HeartbeatService();
	server.registerChannel(TerminalIpcChannels.Heartbeat, ProxyChannel.fromService(heartbeatService));

	// Init pty service
	const ptyService = new PtyService(logService, productService, reconnectConstants, simulatedLatency);
	const ptyServiceChannel = ProxyChannel.fromService(ptyService);
	server.registerChannel(TerminalIpcChannels.PtyHost, ptyServiceChannel);

	// Register a channel for direct communication via Message Port
	if (_isUtilityProcess) {
		server.registerChannel(TerminalIpcChannels.PtyHostWindow, ptyServiceChannel);
	}

	// Clean up
	process.once('exit', () => {
		logService.dispose();
		heartbeatService.dispose();
		ptyService.dispose();
	});
}
