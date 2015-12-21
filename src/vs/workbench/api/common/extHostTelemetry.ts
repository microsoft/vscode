/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {AbstractRemoteTelemetryService} from 'vs/platform/telemetry/common/abstractRemoteTelemetryService';

export class ExtHostTelemetryService extends AbstractRemoteTelemetryService {

	protected handleEvent(eventName: string, data?: any): void {
		data = data || {};
		data['pluginHostTelemetry'] = true;
		super.handleEvent(eventName, data);
	}
}