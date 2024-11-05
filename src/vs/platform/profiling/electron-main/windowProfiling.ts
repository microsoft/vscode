/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProfileResult } from 'v8-inspect-profiler';
import { BrowserWindow } from 'electron';
import { timeout } from '../../../base/common/async.js';
import { ILogService } from '../../log/common/log.js';
import { IV8Profile } from '../common/profiling.js';

export class WindowProfiler {

	constructor(
		private readonly _window: BrowserWindow,
		private readonly _sessionId: string,
		@ILogService private readonly _logService: ILogService,
	) { }

	async inspect(duration: number): Promise<IV8Profile> {

		await this._connect();

		const inspector = this._window.webContents.debugger;
		await inspector.sendCommand('Profiler.start');
		this._logService.warn('[perf] profiling STARTED', this._sessionId);
		await timeout(duration);
		const data: ProfileResult = await inspector.sendCommand('Profiler.stop');
		this._logService.warn('[perf] profiling DONE', this._sessionId);

		await this._disconnect();
		return data.profile;
	}

	private async _connect() {
		const inspector = this._window.webContents.debugger;
		inspector.attach();
		await inspector.sendCommand('Profiler.enable');
	}

	private async _disconnect() {
		const inspector = this._window.webContents.debugger;
		await inspector.sendCommand('Profiler.disable');
		inspector.detach();
	}
}
