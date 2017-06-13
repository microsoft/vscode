/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ITelemetryService, ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { MainThreadTelemetryShape } from '../node/extHost.protocol';

/**
 * Helper always instantiated in the main process to receive telemetry events from remote telemetry services
 */
export class MainThreadTelemetry extends MainThreadTelemetryShape {

	private _telemetryService: ITelemetryService;

	constructor( @ITelemetryService telemetryService: ITelemetryService) {
		super();
		this._telemetryService = telemetryService;
	}

	public $publicLog(eventName: string, data?: any): void {
		this._telemetryService.publicLog(eventName, data);
	}

	public $getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return this._telemetryService.getTelemetryInfo();
	}
}
