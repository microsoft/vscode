/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as timer from 'vs/base/common/timer';
import { ITimerService, IStartupMetrics, IInitData, IMemoryInfo } from 'vs/workbench/services/timer/common/timerService';

import * as os from 'os';

export class TimerService implements ITimerService {

	public _serviceBrand: any;

	public get start(): Date { return this._start; }
	private _start: Date;

	public get windowLoad(): Date { return this._windowLoad; };
	private _windowLoad: Date;

	public get beforeLoadWorkbenchMain(): Date { return this._beforeLoadWorkbenchMain; };
	private _beforeLoadWorkbenchMain: Date;
	public get afterLoadWorkbenchMain(): Date { return this._afterLoadWorkbenchMain; };
	private _afterLoadWorkbenchMain: Date;

	public get isInitialStartup(): boolean { return this._isInitialStartup; };
	private _isInitialStartup: boolean;
	public get hasAccessibilitySupport(): boolean { return this._hasAccessibilitySupport; };
	private _hasAccessibilitySupport: boolean;

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
		this._start = initData.start;

		this._windowLoad = initData.windowLoad;

		this._beforeLoadWorkbenchMain = initData.beforeLoadWorkbenchMain;
		this._afterLoadWorkbenchMain = initData.afterLoadWorkbenchMain;

		this._isInitialStartup = initData.isInitialStartup;
		this._hasAccessibilitySupport = initData.hasAccessibilitySupport;

		// forward start time to time keeper
		timer.TimeKeeper.PARSE_TIME = initData.isInitialStartup ? initData.start : initData.windowLoad;
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

		try {
			totalmem = os.totalmem();
			freemem = os.freemem();
			platform = os.platform();
			release = os.release();
			loadavg = os.loadavg();
			meminfo = process.getProcessMemoryInfo();

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
			hasAccessibilitySupport: !!this.hasAccessibilitySupport,
			emptyWorkbench: this.isEmptyWorkbench
		};

		if (initialStartup) {
			this._startupMetrics.timers.ellapsedWindowLoad = Math.round(this.windowLoad.getTime() - this.start.getTime());
		}
	}
}