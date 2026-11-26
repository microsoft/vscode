/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { ITelemetryService, TelemetryLevel } from '../../common/telemetry.js';
import { NullTelemetryServiceShape } from '../../common/telemetryUtils.js';

export class TestTelemetryService<TData = unknown> extends NullTelemetryServiceShape {
	constructor(readonly events: { readonly name: string; readonly data: TData }[] = []) {
		super();
	}

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data: data as TData });
		}
	}
}

function isTelemetryData(data: unknown): data is Record<string, unknown> {
	return typeof data === 'object' && data !== null;
}

/**
 * Records only the `publicLog2` events that carry a data object, typing each payload as a record.
 */
export class TestDataTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName && isTelemetryData(data)) {
			this.events.push({ name: eventName, data });
		}
	}
}

/** A telemetry event captured by a test service. */
export interface ICapturingTelemetryEvent<TData> {
	readonly eventName: string;
	readonly data: TData;
	readonly level?: 'usage' | 'error';
}

/** Controls which telemetry channels and metadata the test service records. */
export interface ICapturingTelemetryServiceOptions<TData> {
	readonly telemetryLevel?: TelemetryLevel;
	readonly sendErrorTelemetry?: boolean;
	readonly captureLegacyEvents?: boolean;
	readonly captureErrors?: boolean;
	readonly distinguishErrors?: boolean;
	readonly separateErrors?: boolean;
	readonly normalizeData?: (data: unknown) => TData;
	readonly sessionId?: string;
	readonly machineId?: string;
	readonly sqmId?: string;
	readonly devDeviceId?: string;
	readonly firstSessionDate?: string;
}

/**
 * A telemetry service test double that captures usage and error events without
 * requiring each suite to implement the full service contract.
 */
export class CapturingTelemetryService<TData = unknown> implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly events: ICapturingTelemetryEvent<TData>[] = [];
	readonly errorEvents: ICapturingTelemetryEvent<TData>[] = [];
	readonly experimentProperties: Record<string, string> = {};
	readonly commonProperties: Record<string, string | boolean> = {};
	readonly commonPropertyUpdates: { readonly name: string; readonly value: string | boolean | undefined }[] = [];
	telemetryLevel: TelemetryLevel;
	readonly sendErrorTelemetry: boolean;
	readonly sessionId: string;
	readonly machineId: string;
	readonly sqmId: string;
	readonly devDeviceId: string;
	readonly firstSessionDate: string;

	private readonly _onDidLog = new Emitter<void>();
	readonly onDidLog: Event<void> = this._onDidLog.event;

	constructor(private readonly options: ICapturingTelemetryServiceOptions<TData> = {}) {
		this.telemetryLevel = options.telemetryLevel ?? TelemetryLevel.USAGE;
		this.sendErrorTelemetry = options.sendErrorTelemetry ?? false;
		this.sessionId = options.sessionId ?? 'test-session';
		this.machineId = options.machineId ?? 'test-machine';
		this.sqmId = options.sqmId ?? 'test-sqm';
		this.devDeviceId = options.devDeviceId ?? 'test-dev-device';
		this.firstSessionDate = options.firstSessionDate ?? 'test-first-session-date';
	}

	publicLog(eventName?: string, data?: unknown): void {
		if (this.options.captureLegacyEvents) {
			this.recordEvent(eventName, data, 'usage');
		}
	}

	publicLog2(eventName?: string, data?: unknown): void {
		this.recordEvent(eventName, data, 'usage');
	}

	publicLogError(eventName?: string, data?: unknown): void {
		if (this.options.captureErrors && this.options.captureLegacyEvents) {
			this.recordEvent(eventName, data, 'error');
		}
	}

	publicLogError2(eventName?: string, data?: unknown): void {
		if (this.options.captureErrors) {
			this.recordEvent(eventName, data, 'error');
		}
	}

	setExperimentProperty(name?: string, value?: string): void {
		this.experimentProperties[name ?? ''] = value ?? '';
	}

	setCommonProperty(name?: string, value?: string | boolean): void {
		if (!name) {
			return;
		}
		this.commonPropertyUpdates.push({ name, value });
		if (value === undefined) {
			delete this.commonProperties[name];
		} else {
			this.commonProperties[name] = value;
		}
	}

	private recordEvent(eventName: string | undefined, data: unknown, level: 'usage' | 'error'): void {
		if (!eventName) {
			return;
		}
		const event: ICapturingTelemetryEvent<TData> = {
			eventName,
			data: this.options.normalizeData ? this.options.normalizeData(data) : data as TData,
			...(this.options.distinguishErrors ? { level } : {}),
		};
		(level === 'error' && this.options.separateErrors ? this.errorEvents : this.events).push(event);
		this._onDidLog.fire();
	}
}
