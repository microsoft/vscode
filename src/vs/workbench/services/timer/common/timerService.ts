/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITimerService = createDecorator<ITimerService>('timerService');

export interface IMemoryInfo {
	workingSetSize: number;
	peakWorkingSetSize: number;
	privateBytes: number;
	sharedBytes: number;
}

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
