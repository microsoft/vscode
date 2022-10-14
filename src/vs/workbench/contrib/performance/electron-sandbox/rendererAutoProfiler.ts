/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITimerService } from 'vs/workbench/services/timer/browser/timerService';


export class RendererProfiling {

	private readonly _disposables = new DisposableStore();

	constructor(
		@ITimerService timerService: ITimerService,
		@INativeHostService nativeHostService: INativeHostService,
		@ILogService logService: ILogService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IViewDescriptorService viewsDescriptorService: IViewDescriptorService,
		@IEditorService editorService: IEditorService,
	) {

		timerService.whenReady().then(() => {

			// SLOW threshold
			const slowThreshold = (timerService.startupMetrics.timers.ellapsedRequire / 2) | 0;

			// Keep a record of the last events
			const eventHistory = new RingBuffer<{ command: string; timestamp: number }>(5);
			this._disposables.add(commandService.onWillExecuteCommand(e => eventHistory.push({ command: e.commandId, timestamp: Date.now() })));


			const obs = new PerformanceObserver(list => {

				let maxDuration = 0;
				for (const entry of list.getEntries()) {
					maxDuration = Math.max(maxDuration, entry.duration);
				}
				obs.takeRecords();

				if (maxDuration < slowThreshold) {
					return;
				}

				const sessionId = generateUuid();

				// all visible views
				const views = viewsDescriptorService.viewContainers.map(container => {
					const model = viewsDescriptorService.getViewContainerModel(container);
					return model.visibleViewDescriptors.map(view => view.id);
				});

				const editors = editorService.visibleEditors.map(editor => editor.typeId);

				// send telemetry event
				telemetryService.publicLog2<TelemetryEventData, TelemetryEventClassification>('perf.freeze.events', {
					sessionId: sessionId,
					timestamp: Date.now() - maxDuration,
					recentCommands: JSON.stringify(eventHistory.values()),
					views: JSON.stringify(views.flat()),
					editors: JSON.stringify(editors),
				});

				// start heartbeat monitoring
				const sessionDisposables = this._disposables.add(new DisposableStore());
				logService.warn(`[perf] Renderer reported VERY LONG TASK (${maxDuration}ms), starting auto profiling session '${sessionId}'`);
				// pause observation, we'll take a detailed look
				obs.disconnect();
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

type TelemetryEventData = {
	sessionId: string;
	timestamp: number;
	recentCommands: string;
	views: string;
	editors: string;
};

type TelemetryEventClassification = {
	owner: 'jrieken';
	comment: 'Insight about what happened before/while a long task was reported';
	sessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Session identifier that allows to correlate CPU samples and events' };
	timestamp: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Unix time at which the long task approximately happened' };
	recentCommands: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Events prior to the long task' };
	views: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Visible views' };
	editors: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Visible editor' };
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
		return [...this._data.slice(this._index), ...this._data.slice(0, this._index)].filter(a => a !== RingBuffer._value);
	}
}
