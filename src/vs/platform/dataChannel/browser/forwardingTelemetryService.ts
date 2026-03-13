/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClassifiedEvent, OmitMetadata, IGDPRProperty, StrictPropertyCheck } from '../../telemetry/common/gdprTypings.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { IDataChannelService } from '../common/dataChannel.js';

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
		@IDataChannelService dataChannelService: IDataChannelService,
	) {
		super(telemetryService, (eventName, data) => {
			// filter for extension
			let forward = true;
			if (data && shouldForwardToChannel in data) {
				forward = Boolean(data[shouldForwardToChannel]);
			}

			if (forward) {
				dataChannelService.getDataChannel<IEditTelemetryData>('editTelemetry').sendData({ eventName, data: data ?? {} });
			}
		});
	}
}

const shouldForwardToChannel = Symbol('shouldForwardToChannel');
export function forwardToChannelIf(value: boolean): Record<string, unknown> {
	return {
		// This will not be sent via telemetry, it is just a marker
		[shouldForwardToChannel]: value
	};
}

export function isCopilotLikeExtension(extensionId: string | undefined): boolean {
	if (!extensionId) {
		return false;
	}
	const extIdLowerCase = extensionId.toLowerCase();
	return extIdLowerCase === 'github.copilot' || extIdLowerCase === 'github.copilot-chat';
}
