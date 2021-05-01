/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { MainThreadTelemetryShape, MainContext, IExtHostContext, ExtHostTelemetryShape, ExtHostContext } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ClassifiedEvent, StrictPropertyCheck, GDPRClassification } from 'vs/platform/telemetry/common/gdprTypings';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

@extHostNamedCustomer(MainContext.MainThreadTelemetry)
export class MainThreadTelemetry extends Disposable implements MainThreadTelemetryShape {
	private readonly _proxy: ExtHostTelemetryShape;

	private static readonly _name = 'pluginHostTelemetry';

	constructor(
		extHostContext: IExtHostContext,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmenService: IEnvironmentService,
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTelemetry);

		if (!this._environmenService.disableTelemetry) {
			this._register(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectedKeys.includes('telemetry.enableTelemetry')) {
					this._proxy.$onDidChangeTelemetryEnabled(this.telemetryEnabled);
				}
			}));
		}

		this._proxy.$initializeTelemetryEnabled(this.telemetryEnabled);
	}

	private get telemetryEnabled(): boolean {
		if (this._environmenService.disableTelemetry) {
			return false;
		}

		return !!this._configurationService.getValue('telemetry.enableTelemetry');
	}

	$publicLog(eventName: string, data: any = Object.create(null)): void {
		// __GDPR__COMMON__ "pluginHostTelemetry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		data[MainThreadTelemetry._name] = true;
		this._telemetryService.publicLog(eventName, data);
	}

	$publicLog2<E extends ClassifiedEvent<T> = never, T extends GDPRClassification<T> = never>(eventName: string, data: StrictPropertyCheck<T, E>): void {
		this.$publicLog(eventName, data as any);
	}
}


