/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService, TelemetryDestination, TelemetryEventMeasurements, TelemetryEventProperties } from './telemetry';

export class NullTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;

	dispose(): void {
		return;
	}

	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendMSFTTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendGHTelemetryException(maybeError: unknown, origin: string): void {
		return;
	}
	sendTelemetryEvent(eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendTelemetryErrorEvent(eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	setSharedProperty(name: string, value: string): void {
		return;
	}
	setAdditionalExpAssignments(expAssignments: string[]): void {
		return;
	}
	postEvent(eventName: string, props: Map<string, string>): void {
		return;
	}

	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendEnhancedGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}

}
