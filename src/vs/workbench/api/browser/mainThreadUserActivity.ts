/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IUserActivityCaptureService, IUserActivityEvent } from '../../services/userActivity/common/userActivityCapture.js';
import { ExtHostContext, ExtHostUserActivityShape, MainContext, MainThreadUserActivityShape } from '../common/extHost.protocol.js';

/** How often recorded events go to the extension host. */
const FLUSH_INTERVAL = 1000;
/** A batch this large goes at once. */
const FLUSH_SIZE = 50;
/** Events beyond this many, while the extension host does not take them, drop the oldest. */
const MAX_QUEUE = 500;

/**
 * Proposed API `userActivity`: captures what the user does in the window while an extension of
 * this host listens, and sends it there in batches.
 */
@extHostNamedCustomer(MainContext.MainThreadUserActivity)
export class MainThreadUserActivity extends Disposable implements MainThreadUserActivityShape {

	private readonly proxy: ExtHostUserActivityShape;
	private readonly listening = this._register(new MutableDisposable<DisposableStore>());
	private queue: IUserActivityEvent[] = [];
	private readonly flusher = this._register(new RunOnceScheduler(() => this.flush(), FLUSH_INTERVAL));

	constructor(
		extHostContext: IExtHostContext,
		@IUserActivityCaptureService private readonly captureService: IUserActivityCaptureService,
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostUserActivity);
	}

	$setListening(listening: boolean): void {
		if (!listening) {
			this.listening.clear();
			this.flusher.cancel();
			this.queue = [];
			return;
		}
		if (this.listening.value) {
			return;
		}
		const store = new DisposableStore();
		store.add(this.captureService.onDidRecord(e => this.enqueue(e)));
		store.add(this.captureService.start());
		this.listening.value = store;
	}

	private enqueue(event: IUserActivityEvent): void {
		this.queue.push(event);
		if (this.queue.length > MAX_QUEUE) {
			this.queue.splice(0, this.queue.length - MAX_QUEUE);
		}
		if (this.queue.length >= FLUSH_SIZE) {
			this.flush();
		} else if (!this.flusher.isScheduled()) {
			this.flusher.schedule();
		}
	}

	private flush(): void {
		this.flusher.cancel();
		if (!this.queue.length || !this.listening.value) {
			return;
		}
		const batch = this.queue;
		this.queue = [];
		this.proxy.$acceptUserActivity(batch);
	}

	override dispose(): void {
		this.queue = [];
		super.dispose();
	}
}
