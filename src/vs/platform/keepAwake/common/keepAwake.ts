/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';

export const PREVENT_SLEEP_ENABLED = 'chat.preventSleep.enabled';
export const PREVENT_SLEEP_GRACE_PERIOD = 'chat.preventSleep.gracePeriod';

export interface IKeepAwakeState {
	readonly enabled: boolean;
	readonly active: boolean;
	readonly inGrace: boolean;
	readonly busySources: readonly string[];
}

export interface IKeepAwakeBlocker {
	start(): number;
	stop(id: number): void;
}

export class KeepAwake extends Disposable {
	private enabled = false;
	private gracePeriodMs = 0;
	private readonly claims = new Set<string>();
	private lastBusyEndedAt: number | undefined;
	private blockerId: number | undefined;
	private failed = false;
	private readonly timer = this._register(new RunOnceScheduler(() => this.update(), 0));
	private readonly _onDidChangeState = this._register(new Emitter<IKeepAwakeState>());
	readonly onDidChangeState = this._onDidChangeState.event;
	private currentState: IKeepAwakeState = { enabled: false, active: false, inGrace: false, busySources: [] };

	constructor(
		private readonly blocker: IKeepAwakeBlocker,
		private readonly onError: (error: unknown) => void,
	) {
		super();
	}

	get state(): IKeepAwakeState { return this.currentState; }

	configure(enabled: boolean, gracePeriodMs: number): void {
		if (enabled === this.enabled && gracePeriodMs === this.gracePeriodMs) {
			return;
		}
		this.enabled = enabled;
		this.gracePeriodMs = gracePeriodMs;
		this.failed = false;
		if (!enabled) {
			this.lastBusyEndedAt = undefined;
		}
		this.update();
	}

	setClaim(source: string, busy: boolean): void {
		const wasBusy = this.claims.size > 0;
		if (busy) {
			this.claims.add(source);
		} else {
			this.claims.delete(source);
		}
		if (wasBusy && this.claims.size === 0 && this.enabled) {
			this.lastBusyEndedAt = Date.now();
		} else if (this.claims.size > 0) {
			this.lastBusyEndedAt = undefined;
		}
		this.update();
	}

	deleteClaim(source: string): void {
		this.setClaim(source, false);
	}

	private update(): void {
		this.timer.cancel();
		const remaining = this.lastBusyEndedAt === undefined ? 0 : this.lastBusyEndedAt + this.gracePeriodMs - Date.now();
		const inGrace = this.enabled && this.claims.size === 0 && remaining > 0;
		const hold = this.enabled && (this.claims.size > 0 || inGrace);
		if (hold && this.blockerId === undefined && !this.failed) {
			try {
				const id = this.blocker.start();
				if (!Number.isInteger(id) || id < 0) {
					throw new Error('Invalid power save blocker id');
				}
				this.blockerId = id;
			} catch (error) {
				this.failed = true;
				this.onError(error);
			}
		} else if (!hold) {
			this.release();
		}
		if (inGrace) {
			this.timer.schedule(remaining);
		}
		const state: IKeepAwakeState = {
			enabled: this.enabled,
			active: this.blockerId !== undefined,
			inGrace: inGrace && this.blockerId !== undefined,
			busySources: [...this.claims].sort(),
		};
		if (state.enabled !== this.currentState.enabled || state.active !== this.currentState.active ||
			state.inGrace !== this.currentState.inGrace || state.busySources.join('\n') !== this.currentState.busySources.join('\n')) {
			this.currentState = state;
			this._onDidChangeState.fire(state);
		}
	}

	private release(): void {
		if (this.blockerId !== undefined) {
			const id = this.blockerId;
			this.blockerId = undefined;
			this.blocker.stop(id);
		}
	}

	override dispose(): void {
		this.release();
		super.dispose();
	}
}
