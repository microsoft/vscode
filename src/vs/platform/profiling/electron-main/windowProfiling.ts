/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Profile, ProfileResult } from 'v8-inspect-profiler';
import { BrowserWindow } from 'electron';
import { timeout } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';
import { Promises } from 'vs/base/node/pfs';
import { tmpdir } from 'os';
import { join } from 'vs/base/common/path';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Utils } from 'vs/platform/profiling/common/profiling';
import { bottomUp, buildModel, } from 'vs/platform/profiling/common/profilingModel';
import { reportSample } from 'vs/platform/profiling/common/profilingTelemetrySpec';
import { onUnexpectedError } from 'vs/base/common/errors';

export const enum ProfilingOutput {
	Failure,
	Irrelevant,
	Interesting,
}

export class WindowProfiler {

	constructor(
		private readonly _window: BrowserWindow,
		private readonly _sessionId: string,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		// noop
	}

	async inspect(duration: number, baseline: number): Promise<ProfilingOutput> {

		const success = await this._connect();
		if (!success) {
			return ProfilingOutput.Failure;
		}

		const inspector = this._window.webContents.debugger;
		await inspector.sendCommand('Profiler.start');
		this._logService.warn('[perf] profiling STARTED', this._sessionId);
		await timeout(duration);
		const data: ProfileResult = await inspector.sendCommand('Profiler.stop');
		this._logService.warn('[perf] profiling DONE', this._sessionId);
		const result = this._digest(data.profile, baseline);
		await this._disconnect();
		return result;
	}

	private async _connect() {
		try {
			const inspector = this._window.webContents.debugger;
			inspector.attach();
			await inspector.sendCommand('Profiler.enable');
			return true;
		} catch (error) {
			this._logService.error(error, '[perf] FAILED to enable profiler', this._sessionId);
			return false;
		}
	}

	private async _disconnect() {
		try {
			const inspector = this._window.webContents.debugger;
			await inspector.sendCommand('Profiler.disable');
			inspector.detach();
		} catch (error) {
			this._logService.error(error, '[perf] FAILED to disable profiler', this._sessionId);
		}
	}

	private _digest(profile: Profile, perfBaseline: number): ProfilingOutput {
		if (!Utils.isValidProfile(profile)) {
			this._logService.warn('[perf] INVALID profile: no samples or timeDeltas', this._sessionId);
			return ProfilingOutput.Irrelevant;
		}

		const model = buildModel(profile);
		const samples = bottomUp(model, 5, false)
			.filter(s => !s.isSpecial);

		if (samples.length === 0 || samples[1].percentage < 10) {
			// ignore this profile because 90% of the time is spent inside "special" frames
			// like idle, GC, or program
			this._logService.warn('[perf] profiling did NOT reveal anything interesting', this._sessionId);
			return ProfilingOutput.Irrelevant;
		}

		// send telemetry events
		for (const sample of samples) {
			reportSample(
				{ sample, perfBaseline, source: '<<renderer>>' },
				this._telemetryService,
				this._logService
			);
		}

		// save to disk
		this._store(profile).catch(onUnexpectedError);

		return ProfilingOutput.Interesting;
	}

	private async _store(profile: Profile): Promise<void> {
		const path = join(tmpdir(), `renderer-profile-${Date.now()}.cpuprofile`);
		await Promises.writeFile(path, JSON.stringify(profile));
		this._logService.info(`[perf] stored profile to DISK '${path}'`, this._sessionId);
	}
}
