/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { MainThreadTelemetryShape, MainContext, IExtHostContext } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ClassifiedEvent, IPropertyData, IGDPRProperty, StrictPropertyCheck } from 'vs/platform/telemetry/common/gdprTypings';

@extHostNamedCustomer(MainContext.MainThreadTelemetry)
export class MainThreadTelemetry implements MainThreadTelemetryShape {

	private static readonly _name = 'pluginHostTelemetry';

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
		// __GDPR__COMMON__ "pluginHostTelemetry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		data[MainThreadTelemetry._name] = true;
		this._telemetryService.publicLog(eventName, data);
	}

	$publicLog2<E extends ClassifiedEvent<T> = never, T extends { [_ in keyof T]: IPropertyData | IGDPRProperty | undefined } = never>(eventName: string, data: StrictPropertyCheck<E, ClassifiedEvent<T>, 'Type of classified event does not match event properties'>): void {
		// __GDPR__COMMON__ "pluginHostTelemetry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		data[MainThreadTelemetry._name] = true;
		this._telemetryService.publicLog2<E, T>(eventName, data);
	}
}
