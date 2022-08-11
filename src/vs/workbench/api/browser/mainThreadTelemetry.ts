/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogger, ILoggerService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from 'vs/platform/telemetry/common/gdprTypings';
import { ITelemetryService, TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { supportsTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ExtHostContext, ExtHostTelemetryShape, MainContext, MainThreadTelemetryShape } from '../common/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadTelemetry)
export class MainThreadTelemetry extends Disposable implements MainThreadTelemetryShape {
	private readonly _proxy: ExtHostTelemetryShape;

	private static readonly _name = 'pluginHostTelemetry';

	private readonly _extensionTelemetryLog: ILogger;

	constructor(
		extHostContext: IExtHostContext,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IProductService private readonly _productService: IProductService,
		@ILoggerService loggerService: ILoggerService,
	) {
		super();

		const logger = loggerService.getLogger(this._environmentService.extensionTelemetryLogResource);
		if (logger) {
			this._extensionTelemetryLog = this._register(logger);
		} else {
			this._extensionTelemetryLog = this._register(loggerService.createLogger(this._environmentService.extensionTelemetryLogResource));
			this._extensionTelemetryLog.info('Below are logs for extension telemetry events sent to the telemetry output channel API once the log level is set to trace.');
			this._extensionTelemetryLog.info('===========================================================');
		}

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTelemetry);

		if (supportsTelemetry(this._productService, this._environmentService)) {
			this._register(_telemetryService.telemetryLevel.onDidChange(level => {
				this._proxy.$onDidChangeTelemetryLevel(level);
			}));
		}

		this._proxy.$initializeTelemetryLevel(this.telemetryLevel, this._productService.enabledTelemetryLevels);
	}

	private get telemetryLevel(): TelemetryLevel {
		if (!supportsTelemetry(this._productService, this._environmentService)) {
			return TelemetryLevel.NONE;
		}

		return this._telemetryService.telemetryLevel.value;
	}

	$publicLog(eventName: string, data: any = Object.create(null)): void {
		// __GDPR__COMMON__ "pluginHostTelemetry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		data[MainThreadTelemetry._name] = true;
		this._telemetryService.publicLog(eventName, data);
	}

	$publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
		this.$publicLog(eventName, data as any);
	}

	$logTelemetryToOutputChannel(eventName: string, data: Record<string, any>) {
		this._extensionTelemetryLog.trace(eventName, data);
		this._extensionTelemetryLog.flush();
	}
}


