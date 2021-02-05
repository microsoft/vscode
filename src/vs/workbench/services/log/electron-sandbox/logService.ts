/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogService, ConsoleLogger, MultiplexLogService, ILogger, AdapterLogger } from 'vs/platform/log/common/log';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { LoggerChannelClient, FollowerLogService } from 'vs/platform/log/common/logIpc';
import { DisposableStore } from 'vs/base/common/lifecycle';

export class NativeLogService extends LogService {

	constructor(mainProcessService: IMainProcessService, environmentService: INativeWorkbenchEnvironmentService) {

		const disposables = new DisposableStore();
		const loggerClient = new LoggerChannelClient(mainProcessService.getChannel('logger'));

		// Extension development test CLI: forward everything to main side
		const loggers: ILogger[] = [];
		if (environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI) {
			loggers.push(
				disposables.add(new AdapterLogger({ log: (type, args) => loggerClient.consoleLog(type, args) }, environmentService.configuration.logLevel))
			);
		}

		// Normal logger: spdylog and console
		else {
			loggers.push(
				disposables.add(new ConsoleLogger(environmentService.configuration.logLevel)),
				disposables.add(loggerClient.getLogger(environmentService.logFile))
			);
		}

		const multiplexLogger = disposables.add(new MultiplexLogService(loggers));
		const followerLogger = disposables.add(new FollowerLogService(loggerClient, multiplexLogger));
		super(followerLogger);

		this._register(disposables);
	}

}
