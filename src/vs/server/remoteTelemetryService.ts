/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ClassifiedEvent, GDPRClassification, StrictPropertyCheck } from 'vs/platform/telemetry/common/gdprTypings';
import { ITelemetryData, ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ITelemetryServiceConfig, TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { NullTelemetryServiceShape } from 'vs/platform/telemetry/common/telemetryUtils';

export interface IRemoteTelemetryService extends ITelemetryService {
	permanentlyDisableTelemetry(): void
}

export class RemoteTelemetryService extends TelemetryService implements IRemoteTelemetryService {
	private _isDisabled = false;
	constructor(
		config: ITelemetryServiceConfig,
		@IConfigurationService _configurationService: IConfigurationService
	) {
		super(config, _configurationService);
	}

	override publicLog(eventName: string, data?: ITelemetryData, anonymizeFilePaths?: boolean): Promise<void> {
		if (this._isDisabled) {
			return Promise.resolve(undefined);
		}
		return super.publicLog(eventName, data, anonymizeFilePaths);
	}

	override publicLog2<E extends ClassifiedEvent<T> = never, T extends GDPRClassification<T> = never>(eventName: string, data?: StrictPropertyCheck<T, E>, anonymizeFilePaths?: boolean): Promise<void> {
		if (this._isDisabled) {
			return Promise.resolve(undefined);
		}
		return super.publicLog2(eventName, data, anonymizeFilePaths);
	}

	override publicLogError(errorEventName: string, data?: ITelemetryData): Promise<void> {
		if (this._isDisabled) {
			return Promise.resolve(undefined);
		}
		return super.publicLogError(errorEventName, data);
	}

	override publicLogError2<E extends ClassifiedEvent<T> = never, T extends GDPRClassification<T> = never>(eventName: string, data?: StrictPropertyCheck<T, E>): Promise<void> {
		if (this._isDisabled) {
			return Promise.resolve(undefined);
		}
		return super.publicLogError2(eventName, data);
	}

	permanentlyDisableTelemetry(): void {
		this._isDisabled = true;
		this.dispose();
	}
}

export const RemoteNullTelemetryService = new class extends NullTelemetryServiceShape implements IRemoteTelemetryService {
	permanentlyDisableTelemetry(): void { return; } // No-op, telemetry is already disabled
};

export const IRemoteTelemetryService = refineServiceDecorator<ITelemetryService, IRemoteTelemetryService>(ITelemetryService);
