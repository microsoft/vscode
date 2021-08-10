/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { LocalReconnectConstants } from 'vs/platform/terminal/common/terminal';
import { PtyHostService } from 'vs/platform/terminal/node/ptyHostService';
import { main } from 'vs/server/node/server.main';
import { REMOTE_TERMINAL_CHANNEL_NAME } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';

main({
	start: (services, channelServer) => {
		const reconnectConstants = {
			GraceTime: LocalReconnectConstants.GraceTime,
			ShortGraceTime: LocalReconnectConstants.ShortGraceTime
		};
		const configurationService = services.get(IConfigurationService);
		const logService = services.get(ILogService);
		const telemetryService = services.get(ITelemetryService);
		const ptyHostService = new PtyHostService(reconnectConstants, configurationService, logService, telemetryService);
		channelServer.registerChannel(REMOTE_TERMINAL_CHANNEL_NAME, {
			call: async (ctx: RemoteAgentConnectionContext, command: string, arg?: any, cancellationToken?: CancellationToken) => {
				const serviceRecord = ptyHostService as unknown as Record<string, (arg?: any) => Promise<any>>;
				const serviceFunc = serviceRecord[command.substring(1)];
				if (!serviceFunc) {
					logService.error('Unknown command: ' + command);
					return undefined;
				}
				if (Array.isArray(arg)) {
					return serviceFunc.call(ptyHostService, ...arg);
				} else {
					return serviceFunc.call(ptyHostService, arg);
				}
			},
			listen: (ctx: RemoteAgentConnectionContext, event: string) => {
				const serviceRecord = ptyHostService as unknown as Record<string, Event<any>>;
				const result = serviceRecord[event.substring(1, event.endsWith('Event') ? event.length - 'Event'.length : undefined)];
				if (!result) {
					logService.error('Unknown event: ' + event);
					return new Emitter<any>().event;
				}
				return result;
			}
		});
	}
});
