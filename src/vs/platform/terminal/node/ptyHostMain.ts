/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { PtyService } from 'vs/platform/terminal/node/ptyService';
import { TerminalIpcChannels } from 'vs/platform/terminal/common/terminal';
import { ConsoleLogger, LogService } from 'vs/platform/log/common/log';
import { LogLevelChannel } from 'vs/platform/log/common/logIpc';
import { HeartbeatService } from 'vs/platform/terminal/node/heartbeatService';

const server = new Server('ptyHost');

const lastPtyId = parseInt(process.env.VSCODE_LAST_PTY_ID || '0');
delete process.env.VSCODE_LAST_PTY_ID;

const logService = new LogService(new ConsoleLogger());
const logChannel = new LogLevelChannel(logService);
server.registerChannel(TerminalIpcChannels.Log, logChannel);

const heartbeatService = new HeartbeatService();
server.registerChannel(TerminalIpcChannels.Heartbeat, ProxyChannel.fromService(heartbeatService));

const ptyService = new PtyService(lastPtyId, logService);
server.registerChannel(TerminalIpcChannels.PtyHost, ProxyChannel.fromService(ptyService));

process.once('exit', () => {
	logService.dispose();
	heartbeatService.dispose();
	ptyService.dispose();
});
