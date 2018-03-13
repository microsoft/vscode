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
		"ellapsed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedAppReady" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedWindowLoad" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedWindowLoadToRequire" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedExtensions" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedExtensionsReady" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedRequire" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedViewletRestore" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedEditorRestore" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedWorkbench" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedTimersToTimersComputed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedNlsGeneration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
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
	ellapsed: number;
	timers: {
		ellapsedAppReady?: number;
		ellapsedWindowLoad?: number;
		ellapsedWindowLoadToRequire: number;
		ellapsedExtensions: number;
		ellapsedExtensionsReady: number;
		ellapsedRequire: number;
		ellapsedViewletRestore: number;
		ellapsedEditorRestore: number;
		ellapsedWorkbench: number;
		ellapsedTimersToTimersComputed: number;
		ellapsedNlsGeneration: number;
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
