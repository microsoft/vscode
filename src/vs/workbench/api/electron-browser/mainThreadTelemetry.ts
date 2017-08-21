/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ITelemetryService, ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { MainThreadTelemetryShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from "vs/workbench/api/electron-browser/extHostCustomers";

@extHostNamedCustomer(MainContext.MainThreadTelemetry)
export class MainThreadTelemetry implements MainThreadTelemetryShape {

	private _telemetryService: ITelemetryService;

	constructor(
		extHostContext: IExtHostContext,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		this._telemetryService = telemetryService;
	}

	public dispose(): void {
	}

	public $publicLog(eventName: string, data?: any): void {
		this._telemetryService.publicLog(eventName, data);
	}

	public $getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return this._telemetryService.getTelemetryInfo();
	}
}
