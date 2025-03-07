/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { IProductService } from '../../product/common/productService.js';
import { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from './gdprTypings.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from './telemetry.js';
import { ITelemetryServiceConfig, TelemetryService } from './telemetryService.js';
import { NullTelemetryServiceShape } from './telemetryUtils.js';

export interface IServerTelemetryService extends ITelemetryService {
	updateInjectedTelemetryLevel(telemetryLevel: TelemetryLevel): Promise<void>;
}

export class ServerTelemetryService extends TelemetryService implements IServerTelemetryService {
	// Because we cannot read the workspace config on the remote site
	// the ServerTelemetryService is responsible for knowing its telemetry level
	// this is done through IPC calls and initial value injections
	private _injectedTelemetryLevel: TelemetryLevel;
	constructor(
		config: ITelemetryServiceConfig,
		injectedTelemetryLevel: TelemetryLevel,
		@IConfigurationService _configurationService: IConfigurationService,
		@IProductService _productService: IProductService
	) {
		super(config, _configurationService, _productService);
		this._injectedTelemetryLevel = injectedTelemetryLevel;
	}

	override publicLog(eventName: string, data?: ITelemetryData) {
		if (this._injectedTelemetryLevel < TelemetryLevel.USAGE) {
			return;
		}
		return super.publicLog(eventName, data);
	}

	override publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>) {
		return this.publicLog(eventName, data as ITelemetryData | undefined);
	}

	override publicLogError(errorEventName: string, data?: ITelemetryData) {
		if (this._injectedTelemetryLevel < TelemetryLevel.ERROR) {
			return Promise.resolve(undefined);
		}
		return super.publicLogError(errorEventName, data);
	}

	override publicLogError2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>) {
		return this.publicLogError(eventName, data as ITelemetryData | undefined);
	}

	async updateInjectedTelemetryLevel(telemetryLevel: TelemetryLevel): Promise<void> {
		if (telemetryLevel === undefined) {
			this._injectedTelemetryLevel = TelemetryLevel.NONE;
			throw new Error('Telemetry level cannot be undefined. This will cause infinite looping!');
		}
		// We always take the most restrictive level because we don't want multiple clients to connect and send data when one client does not consent
		this._injectedTelemetryLevel = this._injectedTelemetryLevel ? Math.min(this._injectedTelemetryLevel, telemetryLevel) : telemetryLevel;
		if (this._injectedTelemetryLevel === TelemetryLevel.NONE) {
			this.dispose();
		}
	}
}

export const ServerNullTelemetryService = new class extends NullTelemetryServiceShape implements IServerTelemetryService {
	async updateInjectedTelemetryLevel(): Promise<void> { return; } // No-op, telemetry is already disabled
};

export const IServerTelemetryService = refineServiceDecorator<ITelemetryService, IServerTelemetryService>(ITelemetryService);
