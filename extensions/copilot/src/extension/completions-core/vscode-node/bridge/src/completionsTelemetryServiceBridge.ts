/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService, TelemetryEventMeasurements, TelemetryEventProperties } from '../../../../../platform/telemetry/common/telemetry';
import { wrapEventNameForPrefixRemoval } from '../../../../../platform/telemetry/node/azureInsightsReporter';
import { createServiceIdentifier } from '../../../../../util/common/services';
import { TelemetryMeasurements, TelemetryProperties, TelemetryStore } from '../../lib/src/telemetry';
import type { TelemetrySpy } from '../../lib/src/test/telemetrySpy';

export const ICompletionsTelemetryService = createServiceIdentifier<ICompletionsTelemetryService>('completionsTelemetryService');
export interface ICompletionsTelemetryService {
	readonly _serviceBrand: undefined;

	sendGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements, store?: TelemetryStore): void;
	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements, store?: TelemetryStore): void;
	sendGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements, store?: TelemetryStore): void;
	sendGHTelemetryException(maybeError: unknown, origin: string, store?: TelemetryStore): void;
	setSpyReporters(reporter: TelemetrySpy, enhancedReporter: TelemetrySpy): void;
	clearSpyReporters(): void;
}

export class CompletionsTelemetryServiceBridge implements ICompletionsTelemetryService {
	declare _serviceBrand: undefined;

	private reporter: TelemetrySpy | undefined;
	private enhancedReporter: TelemetrySpy | undefined;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		this.reporter = undefined;
		this.enhancedReporter = undefined;
	}

	sendGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements, store?: TelemetryStore): void {
		this.telemetryService.sendGHTelemetryEvent(wrapEventNameForPrefixRemoval(`copilot/${eventName}`), properties, measurements);
		this.getSpyReporters(store ?? TelemetryStore.Standard)?.sendTelemetryEvent(eventName, properties as TelemetryProperties, measurements as TelemetryMeasurements);
	}

	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements, store?: TelemetryStore): void {
		this.telemetryService.sendEnhancedGHTelemetryEvent(wrapEventNameForPrefixRemoval(`copilot/${eventName}`), properties, measurements);
		this.getSpyReporters(store ?? TelemetryStore.Enhanced)?.sendTelemetryEvent(eventName, properties as TelemetryProperties, measurements as TelemetryMeasurements);
	}

	sendGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements, store?: TelemetryStore): void {
		this.telemetryService.sendGHTelemetryErrorEvent(wrapEventNameForPrefixRemoval(`copilot/${eventName}`), properties, measurements);
		this.getSpyReporters(store ?? TelemetryStore.Enhanced)?.sendTelemetryErrorEvent(eventName, properties as TelemetryProperties, measurements as TelemetryMeasurements);
	}

	sendGHTelemetryException(maybeError: unknown, origin: string, store?: TelemetryStore): void {
		this.telemetryService.sendGHTelemetryException(maybeError, origin);
		if (maybeError instanceof Error) {
			this.getSpyReporters(store ?? TelemetryStore.Enhanced)?.sendTelemetryException(maybeError as Error, undefined, undefined);
		}
	}

	setSpyReporters(reporter: TelemetrySpy, enhancedReporter: TelemetrySpy) {
		this.reporter = reporter;
		this.enhancedReporter = enhancedReporter;
	}

	clearSpyReporters() {
		this.reporter = undefined;
		this.enhancedReporter = undefined;
	}

	private getSpyReporters(store: TelemetryStore): TelemetrySpy | undefined {
		if (TelemetryStore.isEnhanced(store)) {
			return this.enhancedReporter;
		} else {
			return this.reporter;
		}
	}
}