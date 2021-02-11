/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogService, ConsoleLogger, MultiplexLogService, ILogger } from 'vs/platform/log/common/log';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { LogLevelChannelClient, FollowerLogService } from 'vs/platform/log/common/logIpc';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { LoggerService } from 'vs/workbench/services/log/electron-sandbox/loggerService';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';

export class NativeLogService extends LogService {

	constructor(name: string, loggerService: LoggerService, mainProcessService: IMainProcessService, environmentService: INativeWorkbenchEnvironmentService) {

		const disposables = new DisposableStore();
		const loggerClient = new LogLevelChannelClient(mainProcessService.getChannel('logLevel'));

		// Extension development test CLI: forward everything to main side
		const loggers: ILogger[] = [];
		if (environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI) {
			loggers.push(loggerService.createConsoleMainLogger());
		}

		// Normal logger: spdylog and console
		else {
			loggers.push(
				disposables.add(new ConsoleLogger(environmentService.configuration.logLevel)),
				disposables.add(loggerService.createLogger(environmentService.logFile, { name }))
			);
		}

		const multiplexLogger = disposables.add(new MultiplexLogService(loggers));
		const followerLogger = disposables.add(new FollowerLogService(loggerClient, multiplexLogger));
		super(followerLogger);

		this._register(disposables);
	}

}
