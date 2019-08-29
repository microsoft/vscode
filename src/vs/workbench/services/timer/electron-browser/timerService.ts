/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { virtualMachineHint } from 'vs/base/node/id';
import * as os from 'os';
import { TimerService as BaseTimerService, IMemoryInfo, IStartupMetrics } from 'vs/workbench/services/timer/browser/timerService';

export class TimerService extends BaseTimerService {

	protected async _computeStartupMetrics(): Promise<IStartupMetrics> {

		const data = await super._computeStartupMetrics();

		let totalmem: number | undefined;
		let freemem: number | undefined;
		let cpus: { count: number; speed: number; model: string; } | undefined;
		let platform: string | undefined;
		let release: string | undefined;
		let arch: string | undefined;
		let loadavg: number[] | undefined;
		let meminfo: IMemoryInfo | undefined;
		let isVMLikelyhood: number | undefined;

		try {
			totalmem = os.totalmem();
			freemem = os.freemem();
			platform = os.platform();
			release = os.release();
			arch = os.arch();
			loadavg = os.loadavg();

			const processMemoryInfo = await process.getProcessMemoryInfo();
			meminfo = {
				workingSetSize: processMemoryInfo.residentSet,
				privateBytes: processMemoryInfo.private,
				sharedBytes: processMemoryInfo.shared
			};

			isVMLikelyhood = Math.round((virtualMachineHint.value() * 100));

			const rawCpus = os.cpus();
			if (rawCpus && rawCpus.length > 0) {
				cpus = { count: rawCpus.length, speed: rawCpus[0].speed, model: rawCpus[0].model };
			}
		} catch (error) {
			// ignore, be on the safe side with these hardware method calls
		}

		const systemData: Partial<IStartupMetrics> = {
			totalmem, freemem, cpus, platform, release, arch, loadavg, meminfo, isVMLikelyhood
		};

		return {
			...data,
			...systemData,
			didUseCachedData: didUseCachedData()
		};
	}
}


//#region cached data logic

export function didUseCachedData(): boolean {
	// We surely don't use cached data when we don't tell the loader to do so
	if (!Boolean((<any>global).require.getConfig().nodeCachedData)) {
		return false;
	}
	// There are loader events that signal if cached data was missing, rejected,
	// or used. The former two mean no cached data.
	let cachedDataFound = 0;
	for (const event of require.getStats()) {
		switch (event.type) {
			case LoaderEventType.CachedDataRejected:
				return false;
			case LoaderEventType.CachedDataFound:
				cachedDataFound += 1;
				break;
		}
	}
	return cachedDataFound > 0;
}

//#endregion
