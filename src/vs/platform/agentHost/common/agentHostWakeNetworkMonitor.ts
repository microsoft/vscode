/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, IntervalTimer } from '../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';

/** How long scheduled work waits after a full wake, so the network has time to reconnect. */
export const SCHEDULED_WORK_WAKE_SETTLE_MS = 15_000;

/** How long after a full wake scheduled work waits at most for an offline network, so it still runs and fails visibly. */
export const SCHEDULED_WORK_WAKE_NETWORK_CAP_MS = 2 * 60_000;

/** How often {@link AgentHostWakeNetworkMonitor} checks the network while it is offline after a wake. */
export const WAKE_NETWORK_POLL_INTERVAL_MS = 1_000;

/**
 * Checks whether the network is online after each full wake, then polls while it is offline until it is back or
 * {@link SCHEDULED_WORK_WAKE_NETWORK_CAP_MS} passes. Only an offline result is conclusive; the settle delay covers the rest.
 */
export class AgentHostWakeNetworkMonitor extends Disposable {

	private readonly _poll = this._register(new MutableDisposable<DisposableStore>());
	private _isOnline = true;

	constructor(
		private readonly _checkOnline: () => boolean,
		private readonly _onDidChangeOnline: (online: boolean) => void,
	) {
		super();
	}

	/** The network state the monitor last observed. */
	get isOnline(): boolean {
		return this._isOnline;
	}

	handleWake(): void {
		this._poll.clear();
		if (this._check()) {
			return;
		}
		const poll = this._poll.value = new DisposableStore();
		poll.add(disposableTimeout(() => this._poll.clear(), SCHEDULED_WORK_WAKE_NETWORK_CAP_MS));
		poll.add(new IntervalTimer()).cancelAndSet(() => {
			if (this._check()) {
				this._poll.clear();
			}
		}, WAKE_NETWORK_POLL_INTERVAL_MS);
	}

	handleSleep(): void {
		this._poll.clear();
	}

	private _check(): boolean {
		const online = this._checkOnline();
		if (online !== this._isOnline) {
			this._isOnline = online;
			this._onDidChangeOnline(online);
		}
		return online;
	}
}
