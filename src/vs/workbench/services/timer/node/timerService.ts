/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITimerService, IStartupMetrics, IInitData, IMemoryInfo } from 'vs/workbench/services/timer/common/timerService';
import { virtualMachineHint } from 'vs/base/node/id';
import * as perf from 'vs/base/common/performance';
import * as os from 'os';

export class TimerService implements ITimerService {

	public _serviceBrand: any;

	public readonly start: number;
	public readonly windowLoad: number;

	public readonly isInitialStartup: boolean;
	public readonly hasAccessibilitySupport: boolean;

	private _startupMetrics: IStartupMetrics;

	constructor(initData: IInitData, private isEmptyWorkbench: boolean) {
		this.start = initData.start;
		this.windowLoad = initData.windowLoad;

		this.isInitialStartup = initData.isInitialStartup;
		this.hasAccessibilitySupport = initData.hasAccessibilitySupport;
	}

	get startupMetrics(): IStartupMetrics {
		if (!this._startupMetrics) {
			this._computeStartupMetrics();
		}
		return this._startupMetrics;
	}

	public _computeStartupMetrics(): void {
		const now = Date.now();
		const initialStartup = !!this.isInitialStartup;
		const start = initialStartup ? this.start : this.windowLoad;

		let totalmem: number;
		let freemem: number;
		let cpus: { count: number; speed: number; model: string; };
		let platform: string;
		let release: string;
		let arch: string;
		let loadavg: number[];
		let meminfo: IMemoryInfo;
		let isVMLikelyhood: number;

		try {
			totalmem = os.totalmem();
			freemem = os.freemem();
			platform = os.platform();
			release = os.release();
			arch = os.arch();
			loadavg = os.loadavg();
			meminfo = process.getProcessMemoryInfo();

			isVMLikelyhood = Math.round((virtualMachineHint.value() * 100));

			const rawCpus = os.cpus();
			if (rawCpus && rawCpus.length > 0) {
				cpus = { count: rawCpus.length, speed: rawCpus[0].speed, model: rawCpus[0].model };
			}
		} catch (error) {
			// ignore, be on the safe side with these hardware method calls
		}

		let nlsStart = perf.getEntry('mark', 'nlsGeneration:start');
		let nlsEnd = perf.getEntry('mark', 'nlsGeneration:end');
		let nlsTime = nlsStart && nlsEnd ? nlsEnd.startTime - nlsStart.startTime : 0;
		this._startupMetrics = {
			version: 1,
			ellapsed: perf.getEntry('mark', 'didStartWorkbench').startTime - start,
			timers: {
				ellapsedExtensions: perf.getDuration('willLoadExtensions', 'didLoadExtensions'),
				ellapsedExtensionsReady: perf.getEntry('mark', 'didLoadExtensions').startTime - start,
				ellapsedRequire: perf.getDuration('willLoadWorkbenchMain', 'didLoadWorkbenchMain'),
				ellapsedEditorRestore: perf.getDuration('willRestoreEditors', 'didRestoreEditors'),
				ellapsedViewletRestore: perf.getDuration('willRestoreViewlet', 'didRestoreViewlet'),
				ellapsedWorkbench: perf.getDuration('willStartWorkbench', 'didStartWorkbench'),
				ellapsedWindowLoadToRequire: perf.getEntry('mark', 'willLoadWorkbenchMain').startTime - this.windowLoad,
				ellapsedTimersToTimersComputed: Date.now() - now,
				ellapsedNlsGeneration: nlsTime
			},
			platform,
			release,
			arch,
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
			this._startupMetrics.timers.ellapsedAppReady = perf.getDuration('main:started', 'main:appReady');
			this._startupMetrics.timers.ellapsedWindowLoad = this.windowLoad - perf.getEntry('mark', 'main:appReady').startTime;
		}
	}
}
