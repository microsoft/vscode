/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService, ITelemetryData, TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ClassifiedEvent, StrictPropertyCheck, OmitMetadata, IGDPRProperty } from '../../../../platform/telemetry/common/gdprTypings.js';
import { IRequestService } from '../../../../platform/request/common/request.js';

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
		@IConfigurationService configurationService: IConfigurationService,
		@IRequestService requestService: IRequestService
	) {
		super();

		// Telemetry has been removed - always use NullTelemetryService
		this.impl = NullTelemetryService;
		this.sendErrorTelemetry = false;
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
