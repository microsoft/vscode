/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { AbstractLogger, ILogger, ILoggerService } from 'vs/platform/log/common/log';
import { IEditSessionsLogService } from 'vs/workbench/contrib/sessionSync/common/sessionSync';

export class EditSessionsLogService extends AbstractLogger implements IEditSessionsLogService {

	declare readonly _serviceBrand: undefined;
	private readonly logger: ILogger;

	constructor(
		@ILoggerService loggerService: ILoggerService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();
		this.logger = this._register(loggerService.createLogger(environmentService.editSessionsLogResource, { name: 'editsessions' }));
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
