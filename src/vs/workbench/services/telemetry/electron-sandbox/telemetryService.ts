/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService, ITelemetryData, TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { supportsTelemetry, NullTelemetryService, getPiiPathsFromEnvironment, isInternalTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Disposable } from 'vs/base/common/lifecycle';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IProductService } from 'vs/platform/product/common/productService';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { resolveWorkbenchCommonProperties } from 'vs/workbench/services/telemetry/common/workbenchCommonProperties';
import { TelemetryService as BaseTelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ClassifiedEvent, StrictPropertyCheck, OmitMetadata, IGDPRProperty } from 'vs/platform/telemetry/common/gdprTypings';
import { process } from 'vs/base/parts/sandbox/electron-sandbox/globals';

export class TelemetryService extends Disposable implements ITelemetryService {

	declare readonly _serviceBrand: undefined;

	private impl: ITelemetryService;
	public readonly sendErrorTelemetry: boolean;

	get sessionId(): string { return this.impl.sessionId; }
	get machineId(): string { return this.impl.machineId; }
	get sqmId(): string { return this.impl.sqmId; }
	get devDeviceId(): string { return this.impl.devDeviceId; }
	get firstSessionDate(): string { return this.impl.firstSessionDate; }
	get msftInternal(): boolean | undefined { return this.impl.msftInternal; }

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IProductService productService: IProductService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();

		if (supportsTelemetry(productService, environmentService)) {
			const isInternal = isInternalTelemetry(productService, configurationService);
			const channel = sharedProcessService.getChannel('telemetryAppender');
			const config: ITelemetryServiceConfig = {
				appenders: [new TelemetryAppenderClient(channel)],
				commonProperties: resolveWorkbenchCommonProperties(storageService, environmentService.os.release, environmentService.os.hostname, productService.commit, productService.version, environmentService.machineId, environmentService.sqmId, environmentService.devDeviceId, isInternal, process, environmentService.remoteAuthority),
				piiPaths: getPiiPathsFromEnvironment(environmentService),
				sendErrorTelemetry: true
			};

			this.impl = this._register(new BaseTelemetryService(config, configurationService, productService));
		} else {
			this.impl = NullTelemetryService;
		}

		this.sendErrorTelemetry = this.impl.sendErrorTelemetry;
	}

	setExperimentProperty(name: string, value: string): void {
		return this.impl.setExperimentProperty(name, value);
	}

	get telemetryLevel(): TelemetryLevel {
		return this.impl.telemetryLevel;
	}

	publicLog(eventName: string, data?: ITelemetryData) {
		this.impl.publicLog(eventName, data);
	}

	publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>) {
		this.publicLog(eventName, data as ITelemetryData);
	}

	publicLogError(errorEventName: string, data?: ITelemetryData) {
		this.impl.publicLogError(errorEventName, data);
	}

	publicLogError2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>) {
		this.publicLogError(eventName, data as ITelemetryData);
	}
}

registerSingleton(ITelemetryService, TelemetryService, InstantiationType.Delayed);
