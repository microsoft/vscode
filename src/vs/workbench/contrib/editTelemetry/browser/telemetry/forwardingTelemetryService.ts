/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClassifiedEvent, OmitMetadata, IGDPRProperty, StrictPropertyCheck } from '../../../../../platform/telemetry/common/gdprTypings.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';

export class InterceptingTelemetryService implements ITelemetryService {
	_serviceBrand: undefined;

	constructor(
		private readonly _baseService: ITelemetryService,
		private readonly _intercept: (eventName: string, data?: ITelemetryData) => void,
	) { }

	get telemetryLevel(): TelemetryLevel {
		return this._baseService.telemetryLevel;
	}

	get sessionId(): string {
		return this._baseService.sessionId;
	}

	get machineId(): string {
		return this._baseService.machineId;
	}

	get sqmId(): string {
		return this._baseService.sqmId;
	}

	get devDeviceId(): string {
		return this._baseService.devDeviceId;
	}

	get firstSessionDate(): string {
		return this._baseService.firstSessionDate;
	}

	get msftInternal(): boolean | undefined {
		return this._baseService.msftInternal;
	}

	get sendErrorTelemetry(): boolean {
		return this._baseService.sendErrorTelemetry;
	}

	publicLog(eventName: string, data?: ITelemetryData): void {
		this._intercept(eventName, data);
		this._baseService.publicLog(eventName, data);
	}

	publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
		this._intercept(eventName, data);
		this._baseService.publicLog2(eventName, data);
	}

	publicLogError(errorEventName: string, data?: ITelemetryData): void {
		this._intercept(errorEventName, data);
		this._baseService.publicLogError(errorEventName, data);
	}

	publicLogError2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
		this._intercept(eventName, data);
		this._baseService.publicLogError2(eventName, data);
	}

	setExperimentProperty(name: string, value: string): void {
		this._baseService.setExperimentProperty(name, value);
	}
}

export interface IEditTelemetryData {
	eventName: string;
	data: Record<string, unknown>;
}

export class DataChannelForwardingTelemetryService extends InterceptingTelemetryService {
	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(telemetryService, (eventName, data) => {
		});
	}
}
