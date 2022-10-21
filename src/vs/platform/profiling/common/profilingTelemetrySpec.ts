/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringSHA1 } from 'vs/base/common/hash';
import { ILogService } from 'vs/platform/log/common/log';
import { BottomUpSample } from 'vs/platform/profiling/common/profilingModel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

type TelemetrySampleData = {
	selfTime: number;
	totalTime: number;
	percentage: number;
	perfBaseline: number;
	functionName: string;
	callstack: string;
	callstackHash: string;
	extensionId: string;
};

type TelemetrySampleDataClassification = {
	owner: 'jrieken';
	comment: 'A callstack that took a long time to execute';
	selfTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Self time of the sample' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time of the sample' };
	percentage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Relative time (percentage) of the sample' };
	perfBaseline: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Performance baseline for the machine' };
	functionName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the sample' };
	callstack: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The stacktrace leading into the sample' };
	callstackHash: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Hash of the stacktrace' };
	extensionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The extension for the sample (iff applicable)' };
};

type ProfilingSampleError = {
	message: string;
	stack: string;
};

type ProfilingSampleErrorClassification = {
	owner: 'jrieken';
	comment: 'Detail performance trace from a heavy sample to its callers';
	message: { 'classification': 'CallstackOrException'; 'purpose': 'FeatureInsight'; 'comment': 'The message containing the selftime and hash of the real stacktrace' };
	stack: { 'classification': 'CallstackOrException'; 'purpose': 'FeatureInsight'; 'comment': 'A synthetic stack which is the heaviest call to a bottom-up sample annotated with relative times' };
};


export interface SampleData {
	perfBaseline: number;
	sample: BottomUpSample;
	extensionId: string;
}

export function reportSample(name: string, data: SampleData, telemetryService: ITelemetryService, logService: ILogService): void {

	const { sample, perfBaseline, extensionId } = data;

	// identify the sample trace by its locations
	const sha1 = new StringSHA1();
	sample.caller.forEach(c => sha1.update(c.location));
	const callstackHash = sha1.digest();

	// log a fake error with a clearer stack
	const fakeError = new Error(`${callstackHash}|${sample.selfTime}ms`);
	fakeError.name = 'PerfSampleError';
	fakeError.stack = `${fakeError.message} by ${data.extensionId} in ${sample.location}\n` + sample.caller.map(c => `\t at ${c.location} (${c.percentage}%)`).join('\n');
	logService.error(fakeError, `[perf] HEAVY function sample`);

	// send telemetry event AND error
	telemetryService.publicLog2<TelemetrySampleData, TelemetrySampleDataClassification>(`${name}.sample`, {
		perfBaseline,
		selfTime: sample.selfTime,
		totalTime: sample.totalTime,
		percentage: sample.percentage,
		functionName: sample.location,
		callstack: sample.caller.map(c => c.location).join('<'),
		callstackHash,
		extensionId
	});

	telemetryService.publicLogError2<ProfilingSampleError, ProfilingSampleErrorClassification>(`${name}.sampleError`, {
		message: fakeError.message,
		stack: fakeError.stack
	});
}
