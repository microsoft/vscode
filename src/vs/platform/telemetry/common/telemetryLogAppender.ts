/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogger, ILoggerService } from 'vs/platform/log/common/log';
import { ITelemetryAppender, validateTelemetryData } from 'vs/platform/telemetry/common/telemetryUtils';

export class TelemetryLogAppender extends Disposable implements ITelemetryAppender {

	private readonly logger: ILogger;

	constructor(
		@ILoggerService loggerService: ILoggerService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();
		this.logger = this._register(loggerService.getLogger(environmentService.telemetryLogResource));
		this.logger.info('The below are logs for every telemetry event sent from VS Code once the log level is set to trace.');
		this.logger.info('===========================================================');
	}

	flush(): Promise<any> {
		return Promise.resolve(undefined);
	}

	log(eventName: string, data: any): void {
		this.logger.trace(`telemetry/${eventName}`, validateTelemetryData(data));
	}
}

