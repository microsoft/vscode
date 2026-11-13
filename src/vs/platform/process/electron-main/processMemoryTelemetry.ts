/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProcessMetric } from 'electron';
import { IntervalTimer } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUtilityProcessInfo } from '../../utilityProcess/electron-main/utilityProcess.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { AwakeUptimeClock, isMemorySampled, MEMORY_SAMPLING_INTERVAL, toMegabytes } from '../common/processMemory.js';

type ProcessMemorySampleEvent = {
	processType: string;
	instanceId: number;
	milestoneMinutes: number;
	workingSetMb: number;
	peakWorkingSetMb: number;
	privateMb: number | undefined;
};

type ProcessMemorySampleClassification = {
	owner: 'alexdima';
	comment: 'Memory of a VS Code process other than a window when it has been running for a while, to detect memory leaks and growth. Windows send memory.windowSample instead.';
	processType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The kind of process: main, gpu, renderer (not a window, for example a webview), networkService, chromiumUtility, or the type of a VS Code utility process such as extensionHost, fileWatcher, shared-process, ptyHost or agentHost.' };
	instanceId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Sequence number of the process within this session, to follow one process across milestones when several processes of a type run.' };
	milestoneMinutes: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Minutes the process has been running while the machine was awake: 15, 60, 240, 480, 1440, and then every 1440 more.' };
	workingSetMb: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Working set of the process in megabytes.' };
	peakWorkingSetMb: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Largest working set of the process so far in megabytes.' };
	privateMb: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Private memory of the process in megabytes. Only on Windows.' };
};

/**
 * Where {@link ProcessMemoryTelemetry} gets the processes of the application from.
 */
export interface IProcessMemorySource {
	getAppMetrics(): ProcessMetric[];
	getUtilityProcesses(): readonly IUtilityProcessInfo[];
}

/**
 * Reports the memory of every process except windows, which report their own,
 * when it reaches a milestone of awake uptime.
 */
export class ProcessMemoryTelemetry extends Disposable {

	private readonly processes = new Map<string, { readonly instanceId: number; readonly clock: AwakeUptimeClock }>();
	private nextInstanceId = 1;
	private readonly random = Math.random();

	constructor(
		private readonly source: IProcessMemorySource,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService
	) {
		super();

		const timer = this._register(new IntervalTimer());
		timer.cancelAndSet(() => this.sample(), MEMORY_SAMPLING_INTERVAL);
		this._register(lifecycleMainService.onWillShutdown(() => timer.cancel()));
	}

	private sample(): void {
		if (!isMemorySampled(this.random, this.configurationService, this.telemetryService)) {
			this.processes.clear();
			return;
		}

		const now = Date.now();
		const windowPids = new Set<number>();
		for (const window of this.windowsMainService.getWindows()) {
			if (window.win && !window.win.webContents.isDestroyed()) {
				windowPids.add(window.win.webContents.getOSProcessId());
			}
		}
		const utilityProcessTypes = new Map(this.source.getUtilityProcesses().map(({ pid, type }) => [pid, type]));

		const seen = new Set<string>();
		for (const metric of this.source.getAppMetrics()) {
			const processType = getProcessType(metric, windowPids, utilityProcessTypes);
			if (!processType) {
				continue;
			}

			// pids get reused, the creation time tells processes apart
			const key = `${metric.pid}:${metric.creationTime}`;
			seen.add(key);

			let tracked = this.processes.get(key);
			if (!tracked) {
				tracked = { instanceId: this.nextInstanceId++, clock: new AwakeUptimeClock(metric.creationTime, now) };
				this.processes.set(key, tracked);
			}

			const milestoneMinutes = tracked.clock.advance(now);
			if (milestoneMinutes !== undefined) {
				const { workingSetSize, peakWorkingSetSize, privateBytes } = metric.memory;
				this.telemetryService.publicLog2<ProcessMemorySampleEvent, ProcessMemorySampleClassification>('memory.processSample', {
					processType,
					instanceId: tracked.instanceId,
					milestoneMinutes,
					workingSetMb: toMegabytes(workingSetSize),
					peakWorkingSetMb: toMegabytes(Math.max(peakWorkingSetSize, workingSetSize)),
					privateMb: privateBytes !== undefined ? toMegabytes(privateBytes) : undefined
				});
			}
		}

		for (const key of this.processes.keys()) {
			if (!seen.has(key)) {
				this.processes.delete(key);
			}
		}
	}
}

function getProcessType(metric: ProcessMetric, windowPids: ReadonlySet<number>, utilityProcessTypes: ReadonlyMap<number, string>): string | undefined {
	switch (metric.type) {
		case 'Browser':
			return 'main';
		case 'GPU':
			return 'gpu';
		case 'Tab':
			return windowPids.has(metric.pid) ? undefined : 'renderer';
		case 'Utility':
			return utilityProcessTypes.get(metric.pid) ?? (metric.serviceName === 'network.mojom.NetworkService' ? 'networkService' : 'chromiumUtility');
		default:
			return undefined;
	}
}
