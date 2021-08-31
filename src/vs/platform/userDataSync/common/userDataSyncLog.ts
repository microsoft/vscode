/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { AbstractLogger, ILogger, ILoggerService } from 'vs/platform/log/common/log';
import { IUserDataSyncLogService } from 'vs/platform/userDataSync/common/userDataSync';

export class UserDataSyncLogService extends AbstractLogger implements IUserDataSyncLogService {

	declare readonly _serviceBrand: undefined;
	private readonly logger: ILogger;

	constructor(
		@ILoggerService loggerService: ILoggerService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();
		this.logger = this._register(loggerService.createLogger(environmentService.userDataSyncLogResource, { name: 'settingssync' }));
	}

	trace(message: string, ...args: any[]): void {
		this.logger.trace(message, ...args);
	}

	debug(message: string, ...args: any[]): void {
		this.logger.debug(message, ...args);
	}

	info(message: string, ...args: any[]): void {
		this.logger.info(message, ...args);
	}

	warn(message: string, ...args: any[]): void {
		this.logger.warn(message, ...args);
	}

	error(message: string | Error, ...args: any[]): void {
		this.logger.error(message, ...args);
	}

	critical(message: string | Error, ...args: any[]): void {
		this.logger.critical(message, ...args);
	}

	flush(): void {
		this.logger.flush();
	}

}
