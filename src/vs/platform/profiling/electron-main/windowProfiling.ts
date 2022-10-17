/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Profile, ProfileResult } from 'v8-inspect-profiler';
import { BrowserWindow } from 'electron';
import { timeout } from 'vs/base/common/async';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { Promises } from 'vs/base/node/pfs';
import { tmpdir } from 'os';
import { join } from 'vs/base/common/path';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Utils } from 'vs/platform/profiling/common/profiling';
import { bottomUp, } from 'vs/platform/profiling/common/profilingModel';
import { TelemetrySampleData, TelemetrySampleDataClassification } from 'vs/platform/profiling/common/profilingTelemetrySpec';


export class WindowProfiler {

	private _profileAtOrAfter: number = 0;
	private _session = new DisposableStore();
	private _isProfiling?: Promise<any>;

	private _isStarted: boolean = false;

	constructor(
		private readonly _window: BrowserWindow,
		private readonly _sessionId: string,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		// noop
	}

	async stop() {

		await this._isProfiling;

		this._logService.warn('[perf] STOPPING to monitor renderer', this._sessionId);
		this._session.clear();

		try {
			const inspector = this._window.webContents.debugger;
			await inspector.sendCommand('Profiler.disable');
			inspector.detach();
		} catch (error) {
			this._logService.error('[perf] FAILED to disable profiler', this._sessionId);
		}
	}

	receiveHeartbeat(): void {
		this._profileAtOrAfter = Date.now() + 1000;
		// this._logService.info('[perf] received heartbeat', this.id);
	}

	async start() {
		if (this._isStarted) {
			this._logService.warn('[perf] already STARTED, ignoring request', this._sessionId);
			return;
		}

		try {
			const inspector = this._window.webContents.debugger;
			inspector.attach();
			await inspector.sendCommand('Profiler.enable');
		} catch (error) {
			this._logService.error('[perf] FAILED to enable profiler', this._sessionId);
			return;
		}

		this._logService.warn('[perf] started to EXPECT frequent heartbeat', this._sessionId);

		this._session.clear();
		this._profileAtOrAfter = Date.now();

		const handle = setInterval(() => {
			if (Date.now() >= this._profileAtOrAfter) {
				clearInterval(handle);
				this._captureRendererProfile();
			}
		}, 500);

		this._session.add(toDisposable(() => {
			this._isStarted = false;
			clearInterval(handle);
		}));
	}


	private async _captureRendererProfile(): Promise<void> {
		this._logService.warn('[perf] MISSED heartbeat, trying to profile renderer', this._sessionId);

		const profiling = (async () => {
			const inspector = this._window.webContents.debugger;
			await inspector.sendCommand('Profiler.start');
			this._logService.warn('[perf] profiling STARTED', this._sessionId);
			await timeout(5000);
			const res: ProfileResult = await inspector.sendCommand('Profiler.stop');
			this._logService.warn('[perf] profiling DONE', this._sessionId);
			await this._store(res.profile);
			this._digest(res.profile);
		})();

		this._isProfiling = profiling
			.catch(err => {
				this._logService.error('[perf] profiling the renderer FAILED', this._sessionId);
				this._logService.error(err);
			}).finally(() => {
				this._isProfiling = undefined;
			});
	}

	private async _store(profile: Profile): Promise<void> {
		try {
			const path = join(tmpdir(), `renderer-profile-${Date.now()}.cpuprofile`);
			await Promises.writeFile(path, JSON.stringify(profile));
			this._logService.info('[perf] stored profile to DISK', this._sessionId, path);
		} catch (error) {
			this._logService.error('[perf] FAILED to write profile to disk', this._sessionId, error);
		}
	}

	private _digest(profile: Profile): void {
		// https://chromedevtools.github.io/devtools-protocol/tot/Profiler/#type-Profile

		if (!Utils.isValidProfile(profile)) {
			this._logService.warn('[perf] INVALID profile: no samples or timeDeltas', this._sessionId);
			return;
		}

		const samples = bottomUp(profile, 5, false);

		for (const sample of samples) {
			const data: TelemetrySampleData = {
				sessionId: this._sessionId,
				selfTime: sample.selfTime,
				totalTime: sample.totalTime,
				percentage: sample.percentage,
				functionName: sample.location,
				callstack: sample.caller.map(c => `${c.percentage}|${c.location}`).join('<'),
				extensionId: ''
			};
			this._telemetryService.publicLog2<TelemetrySampleData, TelemetrySampleDataClassification>('prof.freeze.sample', data);
		}
	}
}
