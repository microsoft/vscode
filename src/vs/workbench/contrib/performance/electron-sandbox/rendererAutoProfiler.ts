/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ITimerService } from 'vs/workbench/services/timer/browser/timerService';


export class RendererProfiling {

	private readonly _disposables = new DisposableStore();

	constructor(
		@ITimerService timerService: ITimerService,
		@INativeHostService nativeHostService: INativeHostService,
		@ILogService logService: ILogService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {

		timerService.whenReady().then(() => {

			// SLOW threshold
			const slowThreshold = (timerService.startupMetrics.timers.ellapsedRequire / 2) | 0;

			// Keep a record of the last events
			const eventHistory = new RingBuffer<string>(5);
			this._disposables.add(commandService.onWillExecuteCommand(e => eventHistory.push(e.commandId)));

			const sessionDisposables = this._disposables.add(new DisposableStore());

			const obs = new PerformanceObserver(list => {

				let maxDuration = 0;
				for (const entry of list.getEntries()) {
					maxDuration = Math.max(maxDuration, entry.duration);
				}
				obs.takeRecords();

				if (maxDuration < slowThreshold) {
					return;
				}

				// pause observation, we'll take a detailed look
				obs.disconnect();

				const sessionId = generateUuid();
				logService.warn(`[perf] Renderer reported VERY LONG TASK (${maxDuration}ms), starting auto profiling session '${sessionId}'`);


				// send telemetry event
				telemetryService.publicLog2<TelemetryEventData, TelemetryEventClassification>('perf.freeze.events', {
					sessionId: sessionId,
					events: JSON.stringify(eventHistory.values()),
				});

				// start heartbeat monitoring
				nativeHostService.startHeartbeat(sessionId).then(success => {
					if (!success) {
						logService.warn('[perf] FAILED to start heartbeat sending');
						return;
					}

					// start sending a repeated heartbeat which is expected to be received by the main side
					const handle1 = setInterval(() => nativeHostService.sendHeartbeat(sessionId), 500);

					// stop heartbeat after 20s
					const handle2 = setTimeout(() => sessionDisposables.clear(), 20 * 1000);

					// cleanup
					// - stop heartbeat
					// - reconnect perf observer
					sessionDisposables.add(toDisposable(() => {
						clearInterval(handle1);
						clearTimeout(handle2);
						nativeHostService.stopHeartbeat(sessionId);
						logService.warn(`[perf] STOPPING to send heartbeat`);

						obs.observe({ entryTypes: ['longtask'] });
					}));

				});
			});

			this._disposables.add(toDisposable(() => obs.disconnect()));
			obs.observe({ entryTypes: ['longtask'] });
		});
	}

	dispose(): void {
		this._disposables.dispose();
	}
}


registerAction2(class SLOW extends Action2 {

	constructor() {
		super({
			id: 'slow.fib',
			title: 'Fib(N)',
			f1: true,
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]): void {
		function fib(n: number): number {
			if (n <= 2) {
				return n;
			}
			return fib(n - 1) + fib(n - 2);
		}

		console.log('fib(44): ', fib(44));
	}
});


type TelemetryEventData = {
	sessionId: string;
	events: string;
};

type TelemetryEventClassification = {
	owner: 'jrieken';
	comment: 'A list of events that happened before a long task was reported';
	sessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Session identifier that allows to correlate samples and events' };
	events: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'List of events' };
};

class RingBuffer<T> {

	private static _value = {};

	private readonly _data: any[];

	private _index: number = 0;
	private _size: number = 0;

	constructor(size: number) {
		this._size = size;
		this._data = new Array(size);
		this._data.fill(RingBuffer._value, 0, size);
	}

	push(value: T): void {
		this._data[this._index] = value;
		this._index = (this._index + 1) % this._size;
	}

	values(): T[] {
		return [...this._data.slice(this._index), this._data.slice(0, this._index)].filter(a => a !== RingBuffer._value);
	}
}
