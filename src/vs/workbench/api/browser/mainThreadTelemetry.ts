/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from '../../../platform/telemetry/common/gdprTypings.js';
import { ITelemetryService, TelemetryLevel, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from '../../../platform/telemetry/common/telemetry.js';
import { supportsTelemetry } from '../../../platform/telemetry/common/telemetryUtils.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostTelemetryShape, MainContext, MainThreadTelemetryShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadTelemetry)
export class MainThreadTelemetry extends Disposable implements MainThreadTelemetryShape {
	private readonly _proxy: ExtHostTelemetryShape;

	private static readonly _name = 'pluginHostTelemetry';

	constructor(
		extHostContext: IExtHostContext,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTelemetry);

		if (supportsTelemetry(this._productService, this._environmentService)) {
			this._register(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(TELEMETRY_SETTING_ID) || e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID)) {
					this._proxy.$onDidChangeTelemetryLevel(this.telemetryLevel);
				}
			}));
		}
		this._proxy.$initializeTelemetryLevel(this.telemetryLevel, supportsTelemetry(this._productService, this._environmentService), this._productService.enabledTelemetryLevels);
	}

	private get telemetryLevel(): TelemetryLevel {
		if (!supportsTelemetry(this._productService, this._environmentService)) {
			return TelemetryLevel.NONE;
		}

		return this._telemetryService.telemetryLevel;
	}

	$publicLog(eventName: string, data: any = Object.create(null)): void {
		// __GDPR__COMMON__ "pluginHostTelemetry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		data[MainThreadTelemetry._name] = true;
		this._telemetryService.publicLog(eventName, data);
	}

	$publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
		this.$publicLog(eventName, data as any);
	}
}


