/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from '../../../base/common/errors.js';
import BaseErrorTelemetry from '../common/errorTelemetry.js';
import { ITelemetryService } from '../common/telemetry.js';
import { ILogService } from '../../../platform/log/common/log.js';

export default class ErrorTelemetry extends BaseErrorTelemetry {
	constructor(
		private readonly logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(telemetryService);
	}

	protected override installErrorListeners(): void {
		// We handle uncaught exceptions here to prevent electron from opening a dialog to the user
		setUnexpectedErrorHandler(error => this.onUnexpectedError(error));

		process.on('uncaughtException', error => {
			if (!isSigPipeError(error)) {
				onUnexpectedError(error);
			}
		});

		process.on('unhandledRejection', (reason: unknown) => onUnexpectedError(reason));
	}

	private onUnexpectedError(error: Error): void {
		this.logService.error(`[uncaught exception in main]: ${error}`);
		if (error.stack) {
			this.logService.error(error.stack);
		}
	}
}
