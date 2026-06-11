/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetrySenderApi } from './telemetry';

export class FailingTelemetryReporter implements ITelemetrySenderApi {
	sendEventData(eventName: string, data?: Record<string, any> | undefined): void {
		throw new Error('Telemetry disabled');
	}
	sendErrorData(error: Error, data?: Record<string, any> | undefined): void {
		throw new Error('Telemetry disabled');
	}
	flush(): void | Thenable<void> {
		return Promise.resolve();
	}
}
