/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TelemetrySampleData = {
	sessionId: string;
	selfTime: number;
	totalTime: number;
	percentage: number;
	functionName: string;
	callstack: string;
	extensionId: string;
};

export type TelemetrySampleDataClassification = {
	owner: 'jrieken';
	comment: 'A callstack that took a long time to execute';
	sessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Session identifier that allows to correlate samples from one profile' };
	selfTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Self time of the sample' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time of the sample' };
	percentage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Relative time (percentage) of the sample' };
	functionName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the sample' };
	callstack: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The stacktrace leading into the sample' };
	extensionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The extension for the sample (iff applicable)' };
};
