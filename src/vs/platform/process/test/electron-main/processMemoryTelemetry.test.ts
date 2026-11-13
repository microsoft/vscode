/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { BrowserWindow, ProcessMetric, WebContents } from 'electron';
import { timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ILifecycleMainService } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { MEMORY_SAMPLING_PROBABILITY_SETTING_ID } from '../../common/processMemory.js';
import { ProcessMemoryTelemetry } from '../../electron-main/processMemoryTelemetry.js';

suite('ProcessMemoryTelemetry', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const MINUTE = 60 * 1000;
	const MB = 1024;
	const WINDOW_PID = 3;
	const EXTENSION_HOST_PID = 4;

	function metric(pid: number, type: ProcessMetric['type'], creationTime: number, workingSetMb: number, options?: { privateMb?: number; serviceName?: string }): ProcessMetric {
		return upcastPartial<ProcessMetric>({
			pid,
			type,
			creationTime,
			serviceName: options?.serviceName,
			memory: { workingSetSize: workingSetMb * MB, peakWorkingSetSize: (workingSetMb + 1) * MB, privateBytes: options?.privateMb !== undefined ? options.privateMb * MB : undefined }
		});
	}

	function createTelemetry(probability: number, getAppMetrics: () => ProcessMetric[]): { events: { eventName: string; data: unknown }[]; telemetry: ProcessMemoryTelemetry } {
		const events: { eventName: string; data: unknown }[] = [];
		const window = upcastPartial<ICodeWindow>({
			win: upcastPartial<BrowserWindow>({ webContents: upcastPartial<WebContents>({ isDestroyed: () => false, getOSProcessId: () => WINDOW_PID }) })
		});

		const telemetry = store.add(new ProcessMemoryTelemetry(
			{ getAppMetrics, getUtilityProcesses: () => [{ pid: EXTENSION_HOST_PID, name: 'extension-host [1]', type: 'extensionHost' }] },
			upcastPartial<IWindowsMainService>({ getWindows: () => [window] }),
			new TestConfigurationService({ [MEMORY_SAMPLING_PROBABILITY_SETTING_ID]: probability }),
			upcastPartial<ITelemetryService>({ telemetryLevel: TelemetryLevel.USAGE, publicLog2: (eventName: string, data?: unknown) => { events.push({ eventName, data }); } }),
			upcastPartial<ILifecycleMainService>({ onWillShutdown: Event.None })
		));

		return { events, telemetry };
	}

	test('reports each process except windows when it has been running for a milestone', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1000 }, async () => {
		let metrics = [
			metric(1, 'Browser', 0, 200, { privateMb: 150 }),
			metric(2, 'GPU', 0, 300),
			metric(WINDOW_PID, 'Tab', 0, 900),
			metric(EXTENSION_HOST_PID, 'Utility', 0, 400, { serviceName: 'node.mojom.NodeService' }),
			metric(5, 'Utility', 0, 50, { serviceName: 'network.mojom.NetworkService' }),
			metric(6, 'Tab', 0, 100),
			metric(7, 'Zygote', 0, 10),
		];
		const { events, telemetry } = createTelemetry(1, () => metrics);

		await timeout(21.5 * MINUTE);
		metrics = metrics.map(m => m.pid === EXTENSION_HOST_PID ? metric(EXTENSION_HOST_PID, 'Utility', 21 * MINUTE, 500) : m); // restarted with the same pid
		await timeout(15 * MINUTE);
		telemetry.dispose();

		const sample = (processType: string, instanceId: number, workingSetMb: number, privateMb?: number) => ({ eventName: 'memory.processSample', data: { processType, instanceId, milestoneMinutes: 15, workingSetMb, peakWorkingSetMb: workingSetMb + 1, privateMb } });
		assert.deepStrictEqual(events, [
			sample('main', 1, 200, 150),
			sample('gpu', 2, 300),
			sample('extensionHost', 3, 400),
			sample('networkService', 4, 50),
			sample('renderer', 5, 100),
			sample('extensionHost', 6, 500),
		]);
	}));

	test('does not measure processes when the session is not sampled', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1000 }, async () => {
		let measured = 0;
		const { events, telemetry } = createTelemetry(0, () => {
			measured++;
			return [metric(1, 'Browser', 0, 200)];
		});

		await timeout(16 * MINUTE);
		telemetry.dispose();

		assert.deepStrictEqual({ events, measured }, { events: [], measured: 0 });
	}));
});
