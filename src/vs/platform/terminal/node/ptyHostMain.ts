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
import { ConsoleLogger, getLogLevel } from 'vs/platform/log/common/log';
import { LoggerChannel } from 'vs/platform/log/common/logIpc';
import { LogService } from 'vs/platform/log/common/logService';
import { LoggerService } from 'vs/platform/log/node/loggerService';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IReconnectConstants, TerminalIpcChannels } from 'vs/platform/terminal/common/terminal';
import { HeartbeatService } from 'vs/platform/terminal/node/heartbeatService';
import { PtyService } from 'vs/platform/terminal/node/ptyService';
import { isUtilityProcess } from 'vs/base/parts/sandbox/node/electronTypes';

const _isUtilityProcess = isUtilityProcess(process);

let server: ChildProcessServer<string> | UtilityProcessServer;
if (_isUtilityProcess) {
	server = new UtilityProcessServer();
} else {
	server = new ChildProcessServer(TerminalIpcChannels.PtyHost);
}

const lastPtyId = parseInt(process.env.VSCODE_LAST_PTY_ID || '0');
delete process.env.VSCODE_LAST_PTY_ID;

const productService: IProductService = { _serviceBrand: undefined, ...product };
const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);

// Logging
const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
server.registerChannel(TerminalIpcChannels.Logger, new LoggerChannel(loggerService, () => DefaultURITransformer));
const logger = loggerService.createLogger('ptyhost', { name: localize('ptyHost', "Pty Host") });
const logService = new LogService(logger, [new ConsoleLogger()]);

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

const ptyService = new PtyService(lastPtyId, logService, productService, reconnectConstants);
const ptyServiceChannel = ProxyChannel.fromService(ptyService);
server.registerChannel(TerminalIpcChannels.PtyHost, ptyServiceChannel);
if (_isUtilityProcess) {
	server.registerChannel(TerminalIpcChannels.PtyHostWindow, ptyServiceChannel);
}

process.once('exit', () => {
	logService.dispose();
	heartbeatService.dispose();
	ptyService.dispose();
});
