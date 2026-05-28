/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { inputLatency } from '../../../../base/browser/performance.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, throttledObservable } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

export class InputLatencyContrib extends Disposable implements IWorkbenchContribution {
	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		const probability = observableConfigValue('telemetry.performance.inputLatencySamplingProbability', 0, this._configurationService);
		const sessionRandom = Math.random();
		const shouldReport = derived(reader => sessionRandom < probability.read(reader));

		const throttled = throttledObservable(
			derived(reader => ({ sampleCount: inputLatency.sampleCount.read(reader), shouldReport: shouldReport.read(reader) })),
			60_000,
		);
		this._register(autorun(reader => {
			const { shouldReport } = throttled.read(reader);

			const measurements = inputLatency.getAndClearMeasurements();
			if (!measurements) {
				return;
			}

			if (shouldReport) {
				this._logSamples(measurements);
			}
		}));
	}

	private _logSamples(measurements: inputLatency.IInputLatencyMeasurements): void {
		type InputLatencyStatisticFragment = {
			owner: 'hediet';
			comment: 'Represents a set of statistics collected about input latencies';
			average: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The average time it took to execute.' };
			max: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The maximum time it took to execute.' };
			min: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The minimum time it took to execute.' };
		};

		type PerformanceInputLatencyClassification = {
			owner: 'hediet';
			comment: 'This is a set of samples of the time (in milliseconds) that various events took when typing in the editor';
			keydown: InputLatencyStatisticFragment;
			input: InputLatencyStatisticFragment;
			render: InputLatencyStatisticFragment;
			total: InputLatencyStatisticFragment;
			sampleCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of samples measured.' };
			gpuAcceleration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether GPU acceleration was enabled at the time the event was reported.' };
			usedJSHeapSize: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The JS heap size in bytes at the time of reporting, or -1 if unavailable.' };
			jsHeapSizeLimit: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The JS heap size limit in bytes, or -1 if unavailable.' };
			jsHeapUsagePercentage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The JS heap usage as a percentage (0-100), or -1 if unavailable.' };
		};

		type PerformanceInputLatencyEvent = inputLatency.IInputLatencyMeasurements & {
			gpuAcceleration: boolean;
			usedJSHeapSize: number;
			jsHeapSizeLimit: number;
			jsHeapUsagePercentage: number;
		};

		const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory;
		const usedJSHeapSize = memory?.usedJSHeapSize ?? -1;
		const jsHeapSizeLimit = memory?.jsHeapSizeLimit ?? -1;
		const jsHeapUsagePercentage = (usedJSHeapSize >= 0 && jsHeapSizeLimit > 0)
			? Math.round(usedJSHeapSize / jsHeapSizeLimit * 100)
			: -1;

		this._telemetryService.publicLog2<PerformanceInputLatencyEvent, PerformanceInputLatencyClassification>('performance.inputLatency', {
			keydown: measurements.keydown,
			input: measurements.input,
			render: measurements.render,
			total: measurements.total,
			sampleCount: measurements.sampleCount,
			gpuAcceleration: this._configurationService.getValue('editor.experimentalGpuAcceleration') === 'on',
			usedJSHeapSize,
			jsHeapSizeLimit,
			jsHeapUsagePercentage,
		});
	}
}
