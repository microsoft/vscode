/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {AbstractRemoteTelemetryService} from 'vs/platform/telemetry/common/abstractRemoteTelemetryService';

export class WorkerTelemetryService extends AbstractRemoteTelemetryService {

	protected handleEvent(eventName: string, data?: any): void {
		data = data || {};
		data['workerTelemetry'] = true;
		super.handleEvent(eventName, data);
	}
}