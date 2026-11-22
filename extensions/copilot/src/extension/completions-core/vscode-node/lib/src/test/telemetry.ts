/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsTelemetryService } from '../../../bridge/src/completionsTelemetryServiceBridge';
import { ICompletionsTelemetryReporters } from '../telemetry';
import { ICompletionsPromiseQueueService, PromiseQueue } from '../util/promiseQueue';
import { TelemetrySpy } from './telemetrySpy';

export class TestPromiseQueue extends PromiseQueue {
	async awaitPromises() {
		// Distinct from flush() in that errors are thrown
		await Promise.all(this.promises);
	}
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
		// eslint-disable-next-line local/code-no-accessor-after-await
		const queue = accessor.get(ICompletionsPromiseQueueService) as TestPromiseQueue;
		await queue.awaitPromises();

		return { reporter, enhancedReporter: enhancedReporter, result };
	} finally {
		telemetryService.clearSpyReporters();
	}
}
