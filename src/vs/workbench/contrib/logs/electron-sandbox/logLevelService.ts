/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILoggerService, LogLevel } from 'vs/platform/log/common/log';
import { IOutputService } from 'vs/workbench/services/output/common/output';
import { IMainProcessService, ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { LogLevelService as CommonLogLevelService } from 'vs/workbench/contrib/logs/common/logLevelService';
import { remotePtyHostLog, remoteServerLog, sharedLogChannelId, userDataSyncLogChannelId } from 'vs/workbench/contrib/logs/common/logConstants';
import { LogLevelChannelClient } from 'vs/platform/log/common/logIpc';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { LOG_CHANNEL_ID as remoteTunnelLogChannelId } from 'vs/platform/remoteTunnel/common/remoteTunnel';

export class LogLevelService extends CommonLogLevelService {

	constructor(
		@IOutputService outputService: IOutputService,
		@ILoggerService loggerService: ILoggerService,
		@ISharedProcessService private readonly sharedProcessService: ISharedProcessService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
	) {
		super(outputService, loggerService);
	}

	override setLogLevel(id: string, logLevel: LogLevel): boolean {
		if (!super.setLogLevel(id, logLevel)) {
			return false;
		}

		const channel = this.outputService.getChannelDescriptor(id);
		const resource = channel?.log ? channel.file : undefined;

		LogLevelChannelClient.setLevel(this.mainProcessService.getChannel('logLevel'), logLevel, resource);
		if (id === sharedLogChannelId || id === userDataSyncLogChannelId || id === remoteTunnelLogChannelId) {
			LogLevelChannelClient.setLevel(this.sharedProcessService.getChannel('logLevel'), logLevel, resource);
			return true;
		}

		const connection = this.remoteAgentService.getConnection();
		if ((id === remoteServerLog || id === remotePtyHostLog) && connection) {
			connection.withChannel('logger', (channel) => LogLevelChannelClient.setLevel(channel, logLevel, resource));
			return true;
		}

		return true;
	}

}

