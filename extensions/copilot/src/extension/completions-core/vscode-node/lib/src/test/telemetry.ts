/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsTelemetryService } from '../../../bridge/src/completionsTelemetryServiceBridge';
import { ICompletionsTelemetryReporters } from '../telemetry';
import { ICompletionsPromiseQueueService, PromiseQueue } from '../util/promiseQueue';
import { TelemetrySpy } from './telemetrySpy';

export type EventData = {
	baseType: 'EventData';
	baseData: {
		ver: number;
		name: string;
		properties: {
			copilot_build: string;
			common_os: string;
			[key: string]: string;
		};
		measurements: {
			timeSinceIssuedMs: number;
			[key: string]: number;
		};
	};
};

export type ExceptionData = {
	baseType: 'ExceptionData';
	baseData: {
		ver: number;
		exceptions: [
			{
				hasFullStack: boolean;
				parsedStack: [
					{
						sizeInBytes: number;
						level: number;
						method: string;
						assembly: string;
						fileName: string;
						line: number;
					}?,
				];
				message: string;
				typeName: string;
			},
		];
		properties: {
			copilot_build: string;
			common_os: string;
			[key: string]: string;
		};
		measurements: {
			timeSinceIssuedMs: number;
			[key: string]: number;
		};
		severityLevel: number;
	};
};

export type CapturedTelemetry<Event = Record<string, unknown>> = {
	ver: number;
	sampleRate: number;
	tags: { [key: string]: string };
	data: Event;
	iKey: string;
	name: string;
	time: string;
};

export type AuthorizationHeader = string | undefined;

export class TestPromiseQueue extends PromiseQueue {
	async awaitPromises() {
		// Distinct from flush() in that errors are thrown
		await Promise.all(this.promises);
	}
}

// export function isStandardTelemetryMessage(message: CapturedTelemetry<unknown>): boolean {
//     return message.iKey === APP_INSIGHTS_KEY;
// }

// export function isEnhancedTelemetryMessage(message: CapturedTelemetry<unknown>): boolean {
//     return message.iKey === APP_INSIGHTS_KEY_SECURE;
// }

export function isEvent(message: CapturedTelemetry): message is CapturedTelemetry<EventData> {
	return message.data.baseType === 'EventData';
}

export function isException(message: CapturedTelemetry): message is CapturedTelemetry<ExceptionData> {
	return message.data.baseType === 'ExceptionData';
}

export function allEvents(messages: CapturedTelemetry[]): messages is CapturedTelemetry<EventData>[] {
	for (const message of messages) {
		if (!isEvent(message)) {
			return false;
		}
	}
	return true;
}

export async function withInMemoryTelemetry<T>(
	accessor: ServicesAccessor,
	work: (accessor: ServicesAccessor) => T | Promise<T>
): Promise<{ reporter: TelemetrySpy; enhancedReporter: TelemetrySpy; result: T }> {
	const reporter = new TelemetrySpy();
	const enhancedReporter = new TelemetrySpy();
	const telemetryService = accessor.get(ICompletionsTelemetryService);
	const reporters = accessor.get(ICompletionsTelemetryReporters);
	try {
		telemetryService.setSpyReporters(reporter, enhancedReporter);
		reporters.setReporter(reporter);
		reporters.setEnhancedReporter(enhancedReporter);
		const result = await work(accessor);
		const queue = accessor.get(ICompletionsPromiseQueueService) as TestPromiseQueue;
		await queue.awaitPromises();

		return { reporter, enhancedReporter: enhancedReporter, result };
	} finally {
		telemetryService.clearSpyReporters();
	}
}
