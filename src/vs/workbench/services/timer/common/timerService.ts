/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITimerService = createDecorator<ITimerService>('timerService');

/* __GDPR__FRAGMENT__
	"IMemoryInfo" : {
		"workingSetSize" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"peakWorkingSetSize": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"privateBytes": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"sharedBytes": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
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
		"ellapsed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"timers.ellapsedAppReady" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"timers.ellapsedWindowLoad" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"timers.ellapsedWindowLoadToRequire" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"timers.ellapsedExtensions" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"timers.ellapsedExtensionsReady" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"timers.ellapsedRequire" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"timers.ellapsedViewletRestore" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"timers.ellapsedEditorRestore" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"timers.ellapsedWorkbench" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"timers.ellapsedTimersToTimersComputed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"platform" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"release" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"arch" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"totalmem" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"meminfo" : { "${inline}": [ "${IMemoryInfo}" ] },
		"cpus.count" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"cpus.speed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"cpus.model" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"initialStartup" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"hasAccessibilitySupport" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"isVMLikelyhood" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"emptyWorkbench" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
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

	appReady: number;

	windowLoad: number;

	beforeLoadWorkbenchMain: number;
	afterLoadWorkbenchMain: number;

	isInitialStartup: boolean;
	hasAccessibilitySupport: boolean;
}

export interface ITimerService extends IInitData {
	_serviceBrand: any;

	beforeDOMContentLoaded: number;
	afterDOMContentLoaded: number;

	beforeWorkbenchOpen: number;
	workbenchStarted: number;

	beforeExtensionLoad: number;
	afterExtensionLoad: number;

	restoreViewletDuration: number;
	restoreEditorsDuration: number;

	readonly startupMetrics: IStartupMetrics;
}
