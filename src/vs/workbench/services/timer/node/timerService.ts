/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITimerService, IStartupMetrics, IInitData, IMemoryInfo } from 'vs/workbench/services/timer/common/timerService';
import { virtualMachineHint } from 'vs/base/node/id';

import * as os from 'os';

export class TimerService implements ITimerService {

	public _serviceBrand: any;

	public readonly start: Date;
	public readonly appReady: Date;
	public readonly windowLoad: Date;

	public readonly beforeLoadWorkbenchMain: Date;
	public readonly afterLoadWorkbenchMain: Date;

	public readonly isInitialStartup: boolean;
	public readonly hasAccessibilitySupport: boolean;

	public beforeDOMContentLoaded: Date;
	public afterDOMContentLoaded: Date;

	public beforeWorkbenchOpen: Date;
	public workbenchStarted: Date;

	public beforeExtensionLoad: Date;
	public afterExtensionLoad: Date;

	public restoreViewletDuration: number;
	public restoreEditorsDuration: number;

	public get startupMetrics(): IStartupMetrics {
		if (!this._startupMetrics) {
			this.computeStartupMetrics();
		}

		return this._startupMetrics;
	};
	private _startupMetrics: IStartupMetrics;

	constructor(initData: IInitData, private isEmptyWorkbench: boolean) {
		this.start = initData.start;
		this.appReady = initData.appReady;
		this.windowLoad = initData.windowLoad;

		this.beforeLoadWorkbenchMain = initData.beforeLoadWorkbenchMain;
		this.afterLoadWorkbenchMain = initData.afterLoadWorkbenchMain;

		this.isInitialStartup = initData.isInitialStartup;
		this.hasAccessibilitySupport = initData.hasAccessibilitySupport;
	}

	public computeStartupMetrics(): void {
		const now = Date.now();
		const initialStartup = !!this.isInitialStartup;
		const start = initialStartup ? this.start : this.windowLoad;

		let totalmem: number;
		let freemem: number;
		let cpus: { count: number; speed: number; model: string; };
		let platform: string;
		let release: string;
		let loadavg: number[];
		let meminfo: IMemoryInfo;
		let isVMLikelyhood: number;

		try {
			totalmem = os.totalmem();
			freemem = os.freemem();
			platform = os.platform();
			release = os.release();
			loadavg = os.loadavg();
			meminfo = process.getProcessMemoryInfo();

			isVMLikelyhood = Math.round((virtualMachineHint.value() * 100));

			const rawCpus = os.cpus();
			if (rawCpus && rawCpus.length > 0) {
				cpus = { count: rawCpus.length, speed: rawCpus[0].speed, model: rawCpus[0].model };
			}
		} catch (error) {
			console.error(error); // be on the safe side with these hardware method calls
		}

		this._startupMetrics = {
			version: 1,
			ellapsed: Math.round(this.workbenchStarted.getTime() - start.getTime()),
			timers: {
				ellapsedExtensions: Math.round(this.afterExtensionLoad.getTime() - this.beforeExtensionLoad.getTime()),
				ellapsedExtensionsReady: Math.round(this.afterExtensionLoad.getTime() - start.getTime()),
				ellapsedRequire: Math.round(this.afterLoadWorkbenchMain.getTime() - this.beforeLoadWorkbenchMain.getTime()),
				ellapsedViewletRestore: Math.round(this.restoreViewletDuration),
				ellapsedEditorRestore: Math.round(this.restoreEditorsDuration),
				ellapsedWorkbench: Math.round(this.workbenchStarted.getTime() - this.beforeWorkbenchOpen.getTime()),
				ellapsedWindowLoadToRequire: Math.round(this.beforeLoadWorkbenchMain.getTime() - this.windowLoad.getTime()),
				ellapsedTimersToTimersComputed: Date.now() - now
			},
			platform,
			release,
			totalmem,
			freemem,
			meminfo,
			cpus,
			loadavg,
			initialStartup,
			isVMLikelyhood,
			hasAccessibilitySupport: !!this.hasAccessibilitySupport,
			emptyWorkbench: this.isEmptyWorkbench
		};

		if (initialStartup) {
			this._startupMetrics.timers.ellapsedAppReady = Math.round(this.appReady.getTime() - this.start.getTime());
			this._startupMetrics.timers.ellapsedWindowLoad = Math.round(this.windowLoad.getTime() - this.appReady.getTime());
		}
	}
}
