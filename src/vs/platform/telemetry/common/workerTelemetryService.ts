/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Telemetry = require('vs/platform/telemetry/common/telemetry');
import AbstractTelemetryService = require('vs/platform/telemetry/common/abstractTelemetryService');
import {OneWorkerAttr} from 'vs/platform/thread/common/threadService';
import {ITelemetryService, ITelemetryAppender} from 'vs/platform/telemetry/common/telemetry';
import {IThreadService, ThreadAffinity} from 'vs/platform/thread/common/thread';
import {AbstractRemoteTelemetryService} from 'vs/platform/telemetry/common/abstractRemoteTelemetryService';

export class WorkerTelemetryService extends AbstractRemoteTelemetryService {

	protected handleEvent(eventName:string, data?:any):void {
		var data = data || {};
		data['workerTelemetry'] = true;
		super.handleEvent(eventName, data);
	}
}