/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { ITimerService } from 'vs/workbench/services/timer/browser/timerService';


export class RendererProfiling {

	private readonly _disposables = new DisposableStore();

	constructor(
		@ITimerService timerService: ITimerService,
		@INativeHostService nativeHostService: INativeHostService,
		@ILogService logService: ILogService,
	) {


		timerService.whenReady().then(() => {
			const slowThreshold = (timerService.startupMetrics.timers.ellapsedRequire / 2) | 0;

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

				nativeHostService.startHeartbeat().then(success => {
					if (!success) {
						logService.warn('[perf] FAILED to start heartbeat sending');
						return;
					}
					logService.warn(`[perf] Renderer reported VERY LONG TASK (${maxDuration}ms), started to send heartbeat`);

					// start sending a repeated heartbeat which is expected to be received by the main side
					const handle1 = setInterval(() => nativeHostService.sendHeartbeat(), 500);

					// stop heartbeat after 20s
					const handle2 = setTimeout(() => sessionDisposables.clear(), 20 * 1000);

					// cleanup
					// - stop heartbeat
					// - reconnect perf observer
					sessionDisposables.add(toDisposable(() => {
						clearInterval(handle1);
						clearTimeout(handle2);
						nativeHostService.stopHeartbeat();
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
