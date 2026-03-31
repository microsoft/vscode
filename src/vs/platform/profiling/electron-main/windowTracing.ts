/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow } from 'electron';
import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { ILogService } from '../../log/common/log.js';

export interface ITracingProfile {
	readonly traceEvents: readonly object[];
}

export class WindowTracer {

	private readonly _traceEvents: object[] = [];
	private _stopDeferred: DeferredPromise<ITracingProfile> | undefined;

	constructor(
		private readonly _window: BrowserWindow,
		private readonly _sessionId: string,
		@ILogService private readonly _logService: ILogService,
	) { }

	async start(): Promise<void> {
		const inspector = this._window.webContents.debugger;

		inspector.attach('1.3');
		inspector.on('message', (_event, method, params) => {
			if (method === 'Tracing.dataCollected') {
				this._traceEvents.push(...params.value);
			}
		});

		await inspector.sendCommand('Tracing.start', {
			categories: [
				'devtools.timeline',
				'v8.execute',
				'disabled-by-default-devtools.timeline',
				'disabled-by-default-devtools.timeline.frame',
				'blink.user_timing',
				'blink.console',
				'latencyInfo'
			].join(','),
			transferMode: 'ReportEvents'
		});

		this._stopDeferred = new DeferredPromise();
		this._logService.warn('[perf] tracing STARTED', this._sessionId);
	}

	async stop(): Promise<ITracingProfile> {
		const inspector = this._window.webContents.debugger;

		try {
			await inspector.sendCommand('Tracing.end');
			// Wait briefly for remaining dataCollected events to flush
			await timeout(500);
			this._logService.warn('[perf] tracing DONE', this._sessionId);
		} finally {
			inspector.removeAllListeners('message');
			try {
				inspector.detach();
			} catch {
				// debugger may already be detached
			}
		}

		const result: ITracingProfile = { traceEvents: this._traceEvents };
		this._stopDeferred?.complete(result);
		this._stopDeferred = undefined;
		return result;
	}
}
