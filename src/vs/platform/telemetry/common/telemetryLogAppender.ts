/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ILogger, ILoggerService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryAppender, TelemetryLogGroup, isLoggingOnly, telemetryLogId, validateTelemetryData } from './telemetryUtils.js';

export class TelemetryLogAppender extends Disposable implements ITelemetryAppender {

	private readonly logger: ILogger;

	constructor(
		private readonly prefix: string,
		remote: boolean,
		@ILoggerService loggerService: ILoggerService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IProductService productService: IProductService,
	) {
		super();

		const id = remote ? 'remoteTelemetry' : telemetryLogId;
		const logger = loggerService.getLogger(id);
		if (logger) {
			this.logger = this._register(logger);
		} else {
			// Not a perfect check, but a nice way to indicate if we only have logging enabled for debug purposes and nothing is actually being sent
			const justLoggingAndNotSending = isLoggingOnly(productService, environmentService);
			const logSuffix = justLoggingAndNotSending ? ' (Not Sent)' : '';
			this.logger = this._register(loggerService.createLogger(id,
				{
					name: localize('telemetryLog', "Telemetry{0}", logSuffix),
					group: TelemetryLogGroup,
					hidden: true
				}));
		}
	}

	flush(): Promise<void> {
		return Promise.resolve();
	}

	log(eventName: string, data: any): void {
		this.logger.trace(`${this.prefix}telemetry/${eventName}`, validateTelemetryData(data));
	}
}

