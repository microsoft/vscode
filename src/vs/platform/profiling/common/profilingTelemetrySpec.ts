/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';
import { BottomUpSample } from './profilingModel.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { errorHandler } from '../../../base/common/errors.js';

type TelemetrySampleData = {
	selfTime: number;
	totalTime: number;
	percentage: number;
	perfBaseline: number;
	functionName: string;
	callers: string;
	callersAnnotated: string;
	source: string;
};

type TelemetrySampleDataClassification = {
	owner: 'jrieken';
	comment: 'A callstack that took a long time to execute';
	selfTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Self time of the sample' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Total time of the sample' };
	percentage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Relative time (percentage) of the sample' };
	perfBaseline: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Performance baseline for the machine' };
	functionName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the sample' };
	callers: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The heaviest call trace into this sample' };
	callersAnnotated: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The heaviest call trace into this sample annotated with respective costs' };
	source: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The source - either renderer or an extension' };
};

export interface SampleData {
	perfBaseline: number;
	sample: BottomUpSample;
	source: string;
}

export function reportSample(data: SampleData, telemetryService: ITelemetryService, logService: ILogService, sendAsErrorTelemtry: boolean): void {

	const { sample, perfBaseline, source } = data;

	// send telemetry event
	telemetryService.publicLog2<TelemetrySampleData, TelemetrySampleDataClassification>(`unresponsive.sample`, {
		perfBaseline,
		selfTime: sample.selfTime,
		totalTime: sample.totalTime,
		percentage: sample.percentage,
		functionName: sample.location,
		callers: sample.caller.map(c => c.location).join('<'),
		callersAnnotated: sample.caller.map(c => `${c.percentage}|${c.location}`).join('<'),
		source
	});

	// log a fake error with a clearer stack
	const fakeError = new PerformanceError(data);
	if (sendAsErrorTelemtry) {
		errorHandler.onUnexpectedError(fakeError);
	} else {
		logService.error(fakeError);
	}
}

class PerformanceError extends Error {
	readonly selfTime: number;

	constructor(data: SampleData) {
		// Since the stacks are available via the sample
		// we can avoid collecting them when constructing the error.
		if (Error.hasOwnProperty('stackTraceLimit')) {
			// eslint-disable-next-line local/code-no-any-casts
			const Err = Error as any as { stackTraceLimit: number }; // For the monaco editor checks.
			const stackTraceLimit = Err.stackTraceLimit;
			Err.stackTraceLimit = 0;
			super(`PerfSampleError: by ${data.source} in ${data.sample.location}`);
			Err.stackTraceLimit = stackTraceLimit;
		} else {
			super(`PerfSampleError: by ${data.source} in ${data.sample.location}`);
		}
		this.name = 'PerfSampleError';
		this.selfTime = data.sample.selfTime;

		const trace = [data.sample.absLocation, ...data.sample.caller.map(c => c.absLocation)];
		this.stack = `\n\t at ${trace.join('\n\t at ')}`;
	}
}
