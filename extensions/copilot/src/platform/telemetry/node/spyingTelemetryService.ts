/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TelemetryEventMeasurements, TelemetryEventProperties } from '@vscode/extension-telemetry';
import { IGHTelemetryService, ITelemetryEvent, ITelemetryService, TelemetryDestination } from '../common/telemetry';

interface InterceptedTelemetryServiceEvent {
	eventType: TelemetryServiceEventType;
	eventName: string;
	properties?: TelemetryEventProperties;
	measurements?: TelemetryEventMeasurements;
}

const enum TelemetryServiceEventType {
	default = 'default', error = 'error', internal = 'internal'
}

interface InterceptedTelemetrySenderEvent {
	readonly eventType: TelemetrySenderEventType;
	readonly eventName: string;
	readonly data?: Record<string, any>;
}

const enum TelemetrySenderEventType {
	insecure = 'insecure', secure = 'secure'
}

export class SpyingTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;

	dispose(): void {
		return;
	}

	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.addEvent(TelemetryServiceEventType.internal, eventName, properties, measurements);
	}
	sendMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.addEvent(TelemetryServiceEventType.default, eventName, properties, measurements);
	}
	sendMSFTTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.addEvent(TelemetryServiceEventType.error, eventName, properties, measurements);
	}
	sendGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.addEvent(TelemetryServiceEventType.default, eventName, properties, measurements);
	}
	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.addEvent(TelemetryServiceEventType.internal, eventName, properties, measurements);
	}
	sendEnhancedGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.addEvent(TelemetryServiceEventType.internal, eventName, properties, measurements);
	}
	sendGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.addEvent(TelemetryServiceEventType.error, eventName, properties, measurements);
	}

	sendGHTelemetryException(maybeError: unknown, origin: string): void {
		this.addEvent(TelemetryServiceEventType.error, 'exception', { origin, error: String(maybeError) });
	}

	private readonly telemetryServiceEvents: InterceptedTelemetryServiceEvent[] = [];
	private readonly telemetrySenderEvents: InterceptedTelemetrySenderEvent[] = [];

	sendInternalTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.addEvent(TelemetryServiceEventType.internal, eventName, properties, measurements);
	}
	postEvent(eventName: string, props: Map<string, string>): void {
		// Do nothing
	}
	setSharedProperty(name: string, value: string): void {
		// Do nothing
	}
	setAdditionalExpAssignments(expAssignments: string[]): void {
		// Do nothing
	}
	sendTelemetryErrorEvent(eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.addEvent(TelemetryServiceEventType.error, eventName, properties, measurements);
	}
	sendTelemetryEvent(eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.addEvent(TelemetryServiceEventType.default, eventName, properties, measurements);
	}

	private addEvent(eventType: TelemetryServiceEventType, eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		{
			// create a copy, in case the caller modifies the object after calling this method
			this.telemetryServiceEvents.push({
				eventType,
				eventName,
				properties: properties ? { ...properties } : undefined,
				measurements: measurements ? { ...measurements } : undefined
			});
		}
	}

	public installSpyingSenders(ghTelemetry: IGHTelemetryService) {
		const senderEvents = this.telemetrySenderEvents;
		const getSender = (eventType: TelemetrySenderEventType) => ({
			sendEventData(eventName: string, data?: Record<string, any> | undefined): void {
				senderEvents.push({ eventType, eventName, data: { ...data } });
			},
			sendErrorData(error: Error, data?: Record<string, any> | undefined): void {
				senderEvents.push({ eventType, eventName: error.message || error.toString(), data });
			}
		});
		ghTelemetry.setReporter(getSender(TelemetrySenderEventType.insecure));
		ghTelemetry.setSecureReporter(getSender(TelemetrySenderEventType.secure));
	}

	public getEvents(): { telemetryServiceEvents: ITelemetryEvent[]; telemetrySenderEvents: any[] } {
		return {
			telemetryServiceEvents: this.telemetryServiceEvents,
			telemetrySenderEvents: this.telemetrySenderEvents
		};
	}

	public getFilteredEvents<TEventNames extends Partial<Record<TelemetryEventMap[keyof TelemetryEventMap]['eventName'], true>>>(eventNames: TEventNames): (TelemetryEventMap[TelemetryEventMapKeysFilteredByEventName<keyof TEventNames>])[] {
		const set = new Set(Object.keys(eventNames));
		return this.telemetryServiceEvents.filter(e => set.has(e.eventName as any)) as any;
	}
}

type TelemetryEventMapKeysFilteredByEventName<TEventName> = {
	[TKey in keyof TelemetryEventMap]: TelemetryEventMap[TKey]['eventName'] extends TEventName ? TKey : never
}[keyof TelemetryEventMap];

declare global {
	interface TelemetryEventMap {
	}
}
