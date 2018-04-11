/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITimerService = createDecorator<ITimerService>('timerService');

/* __GDPR__FRAGMENT__
	"IMemoryInfo" : {
		"workingSetSize" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"peakWorkingSetSize": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"privateBytes": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"sharedBytes": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
	}
*/
export interface IMemoryInfo {
	workingSetSize: number;
	peakWorkingSetSize: number;
	privateBytes: number;
	sharedBytes: number;
}

/* __GDPR__FRAGMENT__
	"IStartupMetrics" : {
		"version" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"elapsed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.elapsedAppReady" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.elapsedWindowLoad" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.elapsedWindowLoadToRequire" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.elapsedExtensions" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.elapsedExtensionsReady" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.elapsedRequire" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.elapsedViewletRestore" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.elapsedEditorRestore" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.elapsedWorkbench" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.elapsedTimersToTimersComputed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.elapsedNlsGeneration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"platform" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"release" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"arch" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"totalmem" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"freemem" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"meminfo" : { "${inline}": [ "${IMemoryInfo}" ] },
		"cpus.count" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"cpus.speed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"cpus.model" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"initialStartup" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"hasAccessibilitySupport" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"isVMLikelyhood" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"emptyWorkbench" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"loadavg" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	}
*/
export interface IStartupMetrics {
	version: number;
	elapsed: number;
	timers: {
		elapsedAppReady?: number;
		elapsedWindowLoad?: number;
		elapsedWindowLoadToRequire: number;
		elapsedExtensions: number;
		elapsedExtensionsReady: number;
		elapsedRequire: number;
		elapsedViewletRestore: number;
		elapsedEditorRestore: number;
		elapsedWorkbench: number;
		elapsedTimersToTimersComputed: number;
		elapsedNlsGeneration: number;
	};
	platform: string;
	release: string;
	arch: string;
	totalmem: number;
	freemem: number;
	meminfo: IMemoryInfo;
	cpus: { count: number; speed: number; model: string; };
	initialStartup: boolean;
	hasAccessibilitySupport: boolean;
	isVMLikelyhood: number;
	emptyWorkbench: boolean;
	loadavg: number[];
}

export interface IInitData {
	start: number;
	windowLoad: number;
	isInitialStartup: boolean;
	hasAccessibilitySupport: boolean;
}

export interface ITimerService extends IInitData {
	_serviceBrand: any;

	readonly startupMetrics: IStartupMetrics;
}
