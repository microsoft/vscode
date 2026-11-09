/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { clearMarks, mark } from '../../../../base/common/performance.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import type { IChatSession } from './chatSessionsService.js';
import type { IChatModel } from './model/chatModel.js';

type TraceEvent = 'contentRequested' | 'historyStarted' | 'historyReady' | 'historyCancelled' | 'historyFailed'
	| 'liveProviderReady' | 'liveStarted' | 'liveReady' | 'liveFailed' | 'liveCancelled'
	| 'contentReady' | 'promoted' | 'discarded' | 'modelReady' | 'modelReused' | 'widgetBound' | 'firstRender' | 'disposed';

const traces = new WeakMap<IChatSession | IChatModel, CloudSandboxSessionTrace>();
let nextTraceId = 0;

/**
 * Temporary local diagnostics; no content, resource identities, or uploaded telemetry.
 * Record DevTools Performance before opening to retain User Timing events after mark cleanup.
 */
export class CloudSandboxSessionTrace extends Disposable {
	readonly id = `sandbox-${++nextTraceId}`;
	private readonly watch = StopWatch.create(false);
	private readonly marks = new Set<string>();

	constructor(private readonly logService: ILogService) {
		super();
		this.record('contentRequested');
	}

	static get(target: IChatSession | IChatModel): CloudSandboxSessionTrace | undefined {
		return traces.get(target);
	}

	associate(target: IChatSession | IChatModel): void {
		traces.set(target, this);
	}

	record(event: TraceEvent, details: Readonly<Record<string, string | number | boolean>> = {}): void {
		if (this._store.isDisposed) {
			return;
		}
		const name = `code/cloudSandbox/${this.id}/${event}`;
		clearMarks(name);
		mark(name);
		this.marks.add(name);
		const fields = Object.entries(details).map(([key, value]) => `${key}=${value}`).join(' ');
		this.logService.info(`[CloudSandboxTrace] traceId=${this.id} event=${event} elapsedMs=${this.watch.elapsed()}${fields ? ` ${fields}` : ''}`);
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this.record('disposed');
		for (const name of this.marks) {
			clearMarks(name);
		}
		this.marks.clear();
		super.dispose();
	}
}
