/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ClassifiedEvent, GDPRClassification, StrictPropertyCheck } from 'vs/platform/telemetry/common/gdprTypings';

export const ITelemetryService = createDecorator<ITelemetryService>('telemetryService');

export interface ITelemetryInfo {
	sessionId: string;
	machineId: string;
	instanceId: string;
	firstSessionDate: string;
	msftInternal?: boolean;
}

export interface ITelemetryData {
	from?: string;
	target?: string;
	[key: string]: any;
}

export interface ITelemetryService {

	/**
	 * Whether error telemetry will get sent. If false, `publicLogError` will no-op.
	 */
	readonly sendErrorTelemetry: boolean;

	readonly _serviceBrand: undefined;

	/**
	 * Sends a telemetry event that has been privacy approved.
	 * Do not call this unless you have been given approval.
	 */
	publicLog(eventName: string, data?: ITelemetryData, anonymizeFilePaths?: boolean): Promise<void>;

	publicLog2<E extends ClassifiedEvent<T> = never, T extends GDPRClassification<T> = never>(eventName: string, data?: StrictPropertyCheck<T, E>, anonymizeFilePaths?: boolean): Promise<void>;

	publicLogError(errorEventName: string, data?: ITelemetryData): Promise<void>;

	publicLogError2<E extends ClassifiedEvent<T> = never, T extends GDPRClassification<T> = never>(eventName: string, data?: StrictPropertyCheck<T, E>): Promise<void>;

	getTelemetryInfo(): Promise<ITelemetryInfo>;

	setExperimentProperty(name: string, value: string): void;

	telemetryLevel: TelemetryLevel;
}

export interface ITelemetryEndpoint {
	id: string;
	aiKey: string;
	sendErrorTelemetry: boolean;
}

export const ICustomEndpointTelemetryService = createDecorator<ICustomEndpointTelemetryService>('customEndpointTelemetryService');

export interface ICustomEndpointTelemetryService {
	readonly _serviceBrand: undefined;

	publicLog(endpoint: ITelemetryEndpoint, eventName: string, data?: ITelemetryData): Promise<void>;
	publicLogError(endpoint: ITelemetryEndpoint, errorEventName: string, data?: ITelemetryData): Promise<void>;
}

// Keys
export const instanceStorageKey = 'telemetry.instanceId';
export const currentSessionDateStorageKey = 'telemetry.currentSessionDate';
export const firstSessionDateStorageKey = 'telemetry.firstSessionDate';
export const lastSessionDateStorageKey = 'telemetry.lastSessionDate';
export const machineIdKey = 'telemetry.machineId';

// Configuration Keys
export const TELEMETRY_SECTION_ID = 'telemetry';
export const TELEMETRY_SETTING_ID = 'telemetry.telemetryLevel';
export const TELEMETRY_OLD_SETTING_ID = 'telemetry.enableTelemetry';

export const enum TelemetryLevel {
	NONE = 0,
	CRASH = 1,
	ERROR = 2,
	USAGE = 3
}

export const enum TelemetryConfiguration {
	OFF = 'off',
	CRASH = 'crash',
	ERROR = 'error',
	ON = 'all'
}
