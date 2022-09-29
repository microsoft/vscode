/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Profile, ProfileNode, ProfileResult } from 'v8-inspect-profiler';
import { BrowserWindow } from 'electron';
import { timeout } from 'vs/base/common/async';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { Promises } from 'vs/base/node/pfs';
import { tmpdir } from 'os';
import { join } from 'vs/base/common/path';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Utils } from 'vs/platform/profiling/common/profiling';


type TelemetrySampleData = {
	sessionId: string;
	selfTime: number;
	totalTime: number;
	functionName: string;
	callstack: string;
};

type TelemetrySampleDataClassification = {
	owner: 'jrieken';
	comment: 'A callstack that took a long time to execute';
	sessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Session identifier that allows to correlate samples from one profile' };
	selfTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Self time of the sample' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Total time of the sample' };
	functionName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the sample' };
	callstack: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The stacktrace leading into the sample' };
};

class Node {

	// these are set later
	parent: Node | undefined;
	children: Node[] = [];
	selfTime: number = -1;
	totalTime: number = -1;

	constructor(
		readonly node: ProfileNode,
		readonly callFrame: typeof node.callFrame,
	) {
		// noop
	}

	toString() {
		return `${this.callFrame.url}#${this.callFrame.functionName}@${this.callFrame.lineNumber}:${this.callFrame.columnNumber}`;
	}

	static makeTotals(call: Node) {
		if (call.totalTime !== -1) {
			return call.totalTime;
		}
		let result = call.selfTime;
		for (const child of call.children) {
			result += Node.makeTotals(child);
		}
		call.totalTime = result;
		return result;
	}
}

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

		if (!profile.samples || !profile.timeDeltas) {
			this._logService.warn('[perf] INVALID profile: no samples or timeDeltas', this._sessionId);
			return;
		}

		// PII removal - no absolute paths
		Utils.rewriteAbsolutePaths(profile, 'piiRemoved');

		// create nodes
		const all = new Map<number, Node>();
		for (const node of profile.nodes) {
			all.set(node.id, new Node(node, node.callFrame));
		}

		// set children/parents
		for (const node of profile.nodes) {
			if (node.children) {
				const parent = all.get(node.id)!;
				for (const id of node.children) {
					const child = all.get(id)!;
					parent.children.push(child);
					child.parent = parent;
				}
			}
		}

		// SELF times
		const duration = (profile.endTime - profile.startTime);
		let lastNodeTime = duration - profile.timeDeltas[0];
		for (let i = 0; i < profile.samples.length - 1; i++) {
			const sample = profile.samples[i];
			const node = all.get(sample);
			if (node) {
				const duration = profile.timeDeltas[i + 1];
				node.selfTime += duration;
				lastNodeTime -= duration;
			}
		}
		const lastNode = all.get(profile.samples[profile.samples.length - 1]);
		if (lastNode) {
			lastNode.selfTime += lastNodeTime;
		}

		// TOTAL times
		all.forEach(Node.makeTotals);

		const sorted = Array.from(all.values()).sort((a, b) => b.selfTime - a.selfTime);

		if (sorted[0].callFrame.functionName === '(idle)') {
			this._logService.warn('[perf] top stack is IDLE, ignoring this profile...', this._sessionId);
			this._telemetryService.publicLog2<TelemetrySampleData, TelemetrySampleDataClassification>('prof.sample', {
				sessionId: this._sessionId,
				selfTime: 0,
				totalTime: 0,
				functionName: '(idle)',
				callstack: ''
			});
			return;
		}

		for (let i = 0; i < sorted.length; i++) {
			if (i > 4) {
				// report top 5
				break;
			}
			const node = sorted[i];
			const callstack: string[] = [];
			let candidate: Node | undefined = node;
			while (candidate) {
				callstack.push(candidate.toString());
				candidate = candidate.parent;
			}

			const data: TelemetrySampleData = {
				sessionId: this._sessionId,
				selfTime: node.selfTime / 1000,
				totalTime: node.totalTime / 1000,
				functionName: node.callFrame.functionName,
				callstack: callstack.join('\n')
			};
			this._telemetryService.publicLog2<TelemetrySampleData, TelemetrySampleDataClassification>('prof.freeze.sample', data);
		}
	}
}
