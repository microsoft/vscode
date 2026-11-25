/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { TestMessageType } from '../../contrib/testing/common/testTypes.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { MainThreadTestingShape, TestRunUpdate } from './extHost.protocol.js';

/** Batches ordered test run updates, flushing when the run or controller changes. */
export class BatchedTestRunRpc extends Disposable {
	private pendingUpdates: TestRunUpdate[] = [];
	private pendingSize = 0;
	private controllerId: string | undefined;
	private runId: string | undefined;
	private readonly scheduler = this._register(new RunOnceScheduler(() => this.flush(), 0));

	constructor(
		private readonly proxy: Pick<MainThreadTestingShape, '$applyTestRunUpdates'>,
	) {
		super();
	}

	/** Queues an update, flushing when either the payload or entry limit is reached. */
	public add(controllerId: string, runId: string, update: TestRunUpdate): void {
		if (this._store.isDisposed) {
			return;
		}

		// State updates are the hot path; avoid serializing them to estimate size.
		let size: number;
		if (update.type === 'state') {
			size = update.taskId.length + update.testId.length;
		} else if (update.type === 'output') {
			const { output, ...metadata } = update;
			// String encoding creates owned bytes; extension-owned bytes need a snapshot.
			const buffer = typeof output === 'string' ? VSBuffer.fromString(output) : output.clone();
			size = buffer.byteLength + JSON.stringify(metadata).length;
			update = { ...update, output: buffer };
		} else {
			if (update.type === 'messages') {
				update = {
					...update,
					messages: update.messages.map(message => message.type === TestMessageType.Error && typeof message.message !== 'string'
						? { ...message, message: snapshotMarkdownTrust(message.message) }
						: message),
				};
			} else if (update.type === 'tests') {
				update = {
					...update,
					tests: update.tests.map(test => test.error && typeof test.error !== 'string'
						? { ...test, error: snapshotMarkdownTrust(test.error) }
						: test),
				};
			}
			size = JSON.stringify(update).length;
		}

		if (this.controllerId !== controllerId || this.runId !== runId || this.pendingSize + size > 64 * 1024) {
			this.flush();
		}
		this.controllerId = controllerId;
		this.runId = runId;
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
			this.proxy.$applyTestRunUpdates(this.controllerId!, this.runId!, new SerializableObjectWithBuffers(updates));
		}
	}

	public override dispose(): void {
		this.flush();
		super.dispose();
	}
}

function snapshotMarkdownTrust(markdown: IMarkdownString): IMarkdownString {
	return typeof markdown.isTrusted === 'object'
		? { ...markdown, isTrusted: { enabledCommands: [...markdown.isTrusted.enabledCommands] } }
		: markdown;
}
