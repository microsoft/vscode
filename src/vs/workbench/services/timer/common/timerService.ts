/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITimerService = createDecorator<ITimerService>('timerService');

/* __GDPR__FRAGMENT__
   "IMemoryInfo" : {
	  "workingSetSize" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "peakWorkingSetSize": { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "privateBytes": { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "sharedBytes": { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
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
	  "version" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "ellapsed" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "timers.ellapsedAppReady" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "timers.ellapsedWindowLoad" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "timers.ellapsedWindowLoadToRequire" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "timers.ellapsedExtensions" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "timers.ellapsedExtensionsReady" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "timers.ellapsedRequire" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "timers.ellapsedViewletRestore" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "timers.ellapsedEditorRestore" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "timers.ellapsedWorkbench" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "timers.ellapsedTimersToTimersComputed" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "timers2" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "platform" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "release" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "arch" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "totalmem" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "meminfo" : { "${inline}": [ "${IMemoryInfo}" ] },
	  "cpus.count" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "cpus.speed" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "cpus.model" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "initialStartup" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "hasAccessibilitySupport" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "isVMLikelyhood" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "emptyWorkbench" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
	  "loadavg" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
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
	// GDPR__TODO: Dynamic property set with timer2, cannot be declared in the registry
	timers2: { [name: string]: number };
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
