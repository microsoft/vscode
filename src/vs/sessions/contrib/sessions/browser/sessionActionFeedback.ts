/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';

/**
 * Tracks short-lived, user-facing feedback for actions taken on individual
 * session items in the sessions list (e.g. approving a tool invocation).
 *
 * When a session's pending action is approved, {@link approvedCount} briefly
 * reflects how many sessions were approved within a rolling window; each new
 * approval increments the count and restarts the window. The sessions titlebar
 * widget owns an instance and surfaces this as a transient "Approved N sessions"
 * message.
 */
export class SessionActionFeedback extends Disposable {

	/** How long the "Approved N sessions" message stays visible, in milliseconds. */
	private static readonly WINDOW_MS = 3000;

	private readonly _approvedCount = observableValue<number>('approvedCount', 0);
	/** Number of sessions approved within the current window; `0` when idle. */
	readonly approvedCount: IObservable<number> = this._approvedCount;

	private readonly _resetScheduler = this._register(new RunOnceScheduler(
		() => this._approvedCount.set(0, undefined),
		SessionActionFeedback.WINDOW_MS,
	));

	/** Report that a session's pending action was approved. Restarts the window. */
	notifyApproved(): void {
		this._approvedCount.set(this._approvedCount.get() + 1, undefined);
		this._resetScheduler.schedule();
	}
}
