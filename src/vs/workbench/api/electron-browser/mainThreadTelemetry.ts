/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { MainThreadTelemetryShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadTelemetry)
export class MainThreadTelemetry implements MainThreadTelemetryShape {

	private static _name = 'pluginHostTelemetry';

	constructor(
		extHostContext: IExtHostContext,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		//
	}

	dispose(): void {
		//
	}

	$publicLog(eventName: string, data: any = Object.create(null)): void {
		data[MainThreadTelemetry._name] = true;
		this._telemetryService.publicLog(eventName, data);
	}
}
