/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { MainThreadTestingShape, TestRunUpdate } from './extHost.protocol.js';

/** Batches ordered updates for one test run, owning queued buffers until delivery. */
export class BatchedTestRunRpc extends Disposable {
	private pendingUpdates: TestRunUpdate[] = [];
	private pendingSize = 0;
	private readonly scheduler = this._register(new RunOnceScheduler(() => this.flush(), 0));

	constructor(
		private readonly proxy: Pick<MainThreadTestingShape, '$applyTestRunUpdates'>,
		private readonly controllerId: string,
		private readonly runId: string,
	) {
		super();
	}

	/** Queues an update, flushing when either the payload or entry limit is reached. */
	public add(update: TestRunUpdate): void {
		if (this._store.isDisposed) {
			return;
		}

		// State updates are the hot path; avoid serializing them to estimate size.
		let size: number;
		if (update.type === 'state') {
			size = update.taskId.length + update.testId.length;
		} else if (update.type === 'output' && typeof update.output !== 'string') {
			const { output, ...metadata } = update;
			size = output.byteLength + JSON.stringify(metadata).length;
			// Extensions may reuse or mutate their byte arrays before the next flush.
			update = { ...update, output: output.clone() };
		} else {
			size = JSON.stringify(update).length;
		}

		if (this.pendingSize + size > 64 * 1024) {
			this.flush();
		}
		this.pendingUpdates.push(update);
		this.pendingSize += size;
		if (this.pendingUpdates.length >= 1024 || this.pendingSize >= 64 * 1024) {
			this.flush();
		} else if (!this.scheduler.isScheduled()) {
			this.scheduler.schedule();
		}
	}

	/** Delivers all earlier updates before a lifecycle or result-reading RPC. */
	public flush(): void {
		this.scheduler.cancel();
		if (this.pendingUpdates.length) {
			const updates = this.pendingUpdates;
			this.pendingUpdates = [];
			this.pendingSize = 0;
			this.proxy.$applyTestRunUpdates(this.controllerId, this.runId, new SerializableObjectWithBuffers(updates));
		}
	}

	public override dispose(): void {
		this.flush();
		super.dispose();
	}
}
