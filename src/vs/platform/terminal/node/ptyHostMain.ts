/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'vs/base/common/path';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { OPTIONS, parseArgs } from 'vs/platform/environment/node/argv';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { ConsoleLogger, getLogLevel, LogService, MultiplexLogService } from 'vs/platform/log/common/log';
import { LogLevelChannel } from 'vs/platform/log/common/logIpc';
import { SpdLogLogger } from 'vs/platform/log/node/spdlogLog';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IReconnectConstants, TerminalIpcChannels, TerminalLogConstants } from 'vs/platform/terminal/common/terminal';
import { HeartbeatService } from 'vs/platform/terminal/node/heartbeatService';
import { PtyService } from 'vs/platform/terminal/node/ptyService';

const server = new Server('ptyHost');

const lastPtyId = parseInt(process.env.VSCODE_LAST_PTY_ID || '0');
delete process.env.VSCODE_LAST_PTY_ID;

// Logging
const productService: IProductService = { _serviceBrand: undefined, ...product };
const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
const logService = new LogService(new MultiplexLogService([
	new ConsoleLogger(),
	new SpdLogLogger(TerminalLogConstants.FileName, join(environmentService.logsPath, `${TerminalLogConstants.FileName}.log`), true, false, getLogLevel(environmentService))
]));
const logLevelChannel = new LogLevelChannel(logService);
server.registerChannel(TerminalIpcChannels.Log, logLevelChannel);

const heartbeatService = new HeartbeatService();
server.registerChannel(TerminalIpcChannels.Heartbeat, ProxyChannel.fromService(heartbeatService));

const reconnectConstants: IReconnectConstants = {
	graceTime: parseInt(process.env.VSCODE_RECONNECT_GRACE_TIME || '0'),
	shortGraceTime: parseInt(process.env.VSCODE_RECONNECT_SHORT_GRACE_TIME || '0'),
	scrollback: parseInt(process.env.VSCODE_RECONNECT_SCROLLBACK || '100')
};
delete process.env.VSCODE_RECONNECT_GRACE_TIME;
delete process.env.VSCODE_RECONNECT_SHORT_GRACE_TIME;
delete process.env.VSCODE_RECONNECT_SCROLLBACK;

const ptyService = new PtyService(lastPtyId, logService, reconnectConstants);
server.registerChannel(TerminalIpcChannels.PtyHost, ProxyChannel.fromService(ptyService));

process.once('exit', () => {
	logService.dispose();
	heartbeatService.dispose();
	ptyService.dispose();
});
