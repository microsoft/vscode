/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { autorun, derived, observableValue, transaction, type IObservable } from '../../../base/common/observable.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { SCHEDULED_WORK_WAKE_NETWORK_CAP_MS, SCHEDULED_WORK_WAKE_SETTLE_MS } from '../common/agentHostWakeNetworkMonitor.js';

export const IAgentHostSystemWakeService = createDecorator<IAgentHostSystemWakeService>('agentHostSystemWakeService');

/**
 * Tracks whether the machine running this Agent Host is fully awake. It is not
 * fully awake while it sleeps or during a background maintenance wake (macOS
 * dark wake), when work the host starts stalls as soon as the machine sleeps
 * again.
 *
 * The local client process that owns the host reports transitions. Hosts
 * without a reporter, such as remote hosts, are always fully awake.
 */
export interface IAgentHostSystemWakeService {
	readonly _serviceBrand: undefined;
	readonly isFullyAwake: IObservable<boolean>;
	/**
	 * Whether scheduled work may start: the machine is fully awake and, after a wake, had time to reconnect. It stays
	 * false for {@link SCHEDULED_WORK_WAKE_SETTLE_MS} after a wake, then while the network is offline, at most until
	 * {@link SCHEDULED_WORK_WAKE_NETWORK_CAP_MS} after the wake.
	 */
	readonly isReadyForScheduledWork: IObservable<boolean>;
	setFullyAwake(fullyAwake: boolean): void;
	setNetworkOnline(online: boolean): void;
}

type ScheduledWorkHold = 'asleep' | 'settling' | 'offline';

export class AgentHostSystemWakeService extends Disposable implements IAgentHostSystemWakeService {
	declare readonly _serviceBrand: undefined;

	private readonly _isFullyAwake = observableValue<boolean>(this, true);
	readonly isFullyAwake: IObservable<boolean> = this._isFullyAwake;
	private readonly _isNetworkOnline = observableValue<boolean>(this, true);
	/** Whether the settle delay after the latest wake is still running. */
	private readonly _isSettling = observableValue<boolean>(this, false);
	/** Whether an offline network still holds scheduled work, until the cap after the latest wake. */
	private readonly _isWaitingForNetwork = observableValue<boolean>(this, false);
	private readonly _wakeTimers = this._register(new MutableDisposable<DisposableStore>());

	private readonly _scheduledWorkHold = derived<ScheduledWorkHold | undefined>(this, reader => {
		if (!this._isFullyAwake.read(reader)) {
			return 'asleep';
		}
		if (this._isSettling.read(reader)) {
			return 'settling';
		}
		if (this._isWaitingForNetwork.read(reader) && !this._isNetworkOnline.read(reader)) {
			return 'offline';
		}
		return undefined;
	});
	readonly isReadyForScheduledWork: IObservable<boolean> = derived(this, reader => this._scheduledWorkHold.read(reader) === undefined);

	constructor(@ILogService private readonly _logService: ILogService) {
		super();
		let previousHold: ScheduledWorkHold | undefined;
		this._register(autorun(reader => {
			const hold = this._scheduledWorkHold.read(reader);
			if (hold === previousHold) {
				return;
			}
			if (hold === 'settling' || hold === 'offline') {
				this._logService.info(`[AgentHost] Scheduled work held after wake: reason=${hold}`);
			} else if (hold === undefined) {
				this._logService.info(`[AgentHost] Scheduled work released after wake: reason=${this._isNetworkOnline.read(reader) ? 'ready' : 'cap'}`);
			}
			previousHold = hold;
		}));
	}

	setFullyAwake(fullyAwake: boolean): void {
		if (this._isFullyAwake.get() === fullyAwake) {
			return;
		}
		// Clearing the previous wake's timers keeps them from releasing a later wake.
		this._wakeTimers.clear();
		transaction(tx => {
			this._isFullyAwake.set(fullyAwake, tx);
			this._isSettling.set(fullyAwake, tx);
			this._isWaitingForNetwork.set(fullyAwake, tx);
		});
		if (!fullyAwake) {
			return;
		}
		const wakeTimers = this._wakeTimers.value = new DisposableStore();
		wakeTimers.add(disposableTimeout(() => this._isSettling.set(false, undefined), SCHEDULED_WORK_WAKE_SETTLE_MS));
		wakeTimers.add(disposableTimeout(() => this._isWaitingForNetwork.set(false, undefined), SCHEDULED_WORK_WAKE_NETWORK_CAP_MS));
	}

	setNetworkOnline(online: boolean): void {
		this._isNetworkOnline.set(online, undefined);
	}
}
