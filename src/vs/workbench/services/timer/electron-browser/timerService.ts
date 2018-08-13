/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITimerService, IStartupMetrics, IMemoryInfo } from 'vs/workbench/services/timer/common/timerService';
import { virtualMachineHint } from 'vs/base/node/id';
import * as perf from 'vs/base/common/performance';
import * as os from 'os';
import { getAccessibilitySupport } from 'vs/base/browser/browser';
import { AccessibilitySupport } from 'vs/base/common/platform';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';

export class TimerService implements ITimerService {

	public _serviceBrand: any;

	private _startupMetrics: IStartupMetrics;

	constructor(
		private readonly _configuration: IWindowConfiguration,
		private readonly _isEmptyWorkbench: boolean
	) {
		//
	}

	get startupMetrics(): IStartupMetrics {
		if (!this._startupMetrics) {
			this._computeStartupMetrics();
		}
		return this._startupMetrics;
	}

	public _computeStartupMetrics(): void {
		const now = Date.now();
		const initialStartup = !!this._configuration.isInitialStartup;
		const startMark = initialStartup ? 'main:started' : 'main:loadWindow';

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

		this._startupMetrics = {
			version: 1,
			ellapsed: perf.getDuration(startMark, 'didStartWorkbench'),
			timers: {
				ellapsedAppReady: initialStartup ? perf.getDuration('main:started', 'main:appReady') : undefined,
				ellapsedNlsGeneration: perf.getDuration('nlsGeneration:start', 'nlsGeneration:end'),
				ellapsedWindowLoad: initialStartup ? perf.getDuration('main:appReady', 'main:loadWindow') : undefined,
				ellapsedWindowLoadToRequire: perf.getDuration('main:loadWindow', 'willLoadWorkbenchMain'),
				ellapsedRequire: perf.getDuration('willLoadWorkbenchMain', 'didLoadWorkbenchMain'),
				ellapsedExtensions: perf.getDuration('willLoadExtensions', 'didLoadExtensions'),
				ellapsedEditorRestore: perf.getDuration('willRestoreEditors', 'didRestoreEditors'),
				ellapsedViewletRestore: perf.getDuration('willRestoreViewlet', 'didRestoreViewlet'),
				ellapsedWorkbench: perf.getDuration('willStartWorkbench', 'didStartWorkbench'),
				ellapsedExtensionsReady: perf.getDuration(startMark, 'didLoadExtensions'),
				ellapsedTimersToTimersComputed: Date.now() - now,
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
			hasAccessibilitySupport: getAccessibilitySupport() === AccessibilitySupport.Enabled,
			emptyWorkbench: this._isEmptyWorkbench
		};
	}
}
