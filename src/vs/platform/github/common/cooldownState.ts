/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { RequestQueue } from './requestQueue.js';
import { IRequestScheduler, schedulerDelay } from './scheduler.js';
import { RequestAccount } from './types.js';

/** Normalized quota observations; all timestamps use absolute epoch milliseconds. */
export interface RateLimitState {
	readonly limit?: number;
	readonly remaining?: number;
	readonly used?: number;
	readonly resetAt?: number;
	readonly blockedUntil?: number;
}

/** Stores domain-supplied cooldowns and releases unused state only after required waits expire. */
export class CooldownState extends Disposable {
	protected readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	protected readonly _states = new Map<string, RateLimitState>();
	protected readonly _accountBlockedUntil = new Map<string, number>();
	private readonly _inactiveAccounts = new Map<string, number>();
	private readonly _accountOwners = new Map<string, Set<object>>();
	private readonly _cleanup = this._register(new MutableDisposable());

	constructor(protected readonly _scheduler: IRequestScheduler) {
		super();
	}

	getState(account: RequestAccount, resource: string): RateLimitState | undefined {
		return this._states.get(this._key(account, resource));
	}

	getDelay(account: RequestAccount, resource: string): number {
		const accountKey = RequestQueue.accountKey(account);
		const state = this._states.get(this._key(account, resource));
		const resourceBlockedUntil = state?.blockedUntil ?? (state?.remaining === 0 ? state.resetAt : undefined);
		const accountBlockedUntil = this._accountBlockedUntil.get(accountKey);
		const blockedUntil = resourceBlockedUntil === undefined
			? accountBlockedUntil
			: accountBlockedUntil === undefined ? resourceBlockedUntil : Math.max(resourceBlockedUntil, accountBlockedUntil);
		const delay = blockedUntil === undefined ? 0 : Math.max(0, blockedUntil - this._scheduler.now());
		return account.kind === 'bootstrap' && account.accountId !== undefined
			? Math.max(delay, this.getDelay({ ...account, accountId: undefined }, resource))
			: delay;
	}

	updateCooldown(account: RequestAccount, resource: string, delay: number): void {
		if (delay <= 0) {
			return;
		}
		const key = this._key(account, resource);
		const previous = this._states.get(key);
		this._states.set(key, { ...previous, blockedUntil: Math.max(previous?.blockedUntil ?? 0, this._scheduler.now() + delay) });
		this._onDidChange.fire();
	}

	preserveCooldown(account: RequestAccount, resource: string, delay: number): void {
		if (delay <= 0) {
			return;
		}
		const key = this._key(account, resource);
		const previous = this._states.get(key);
		this._states.set(key, { ...previous, blockedUntil: Math.max(previous?.blockedUntil ?? 0, this._scheduler.now() + delay) });
		this.releaseAccount(account);
		this._onDidChange.fire();
	}

	async wait(account: RequestAccount, resource: string, signal: AbortSignal): Promise<void> {
		const delay = this.getDelay(account, resource);
		if (delay > 0) {
			await schedulerDelay(this._scheduler, delay, signal);
		}
	}

	clearAccount(account: RequestAccount): void {
		this._clearAccount(RequestQueue.accountKey(account));
		this._scheduleCleanup();
		this._onDidChange.fire();
	}

	retainAccount(account: RequestAccount, owner?: object): void {
		const accountKey = RequestQueue.accountKey(account);
		if (owner) {
			let owners = this._accountOwners.get(accountKey);
			if (!owners) {
				owners = new Set();
				this._accountOwners.set(accountKey, owners);
			}
			owners.add(owner);
		}
		if (this._inactiveAccounts.delete(accountKey)) {
			this._scheduleCleanup();
		}
	}

	releaseAccount(account: RequestAccount, owner?: object): void {
		if (this._store.isDisposed) {
			return;
		}
		const accountKey = RequestQueue.accountKey(account);
		const owners = this._accountOwners.get(accountKey);
		if (owner) {
			owners?.delete(owner);
		}
		if (owners?.size) {
			return;
		}
		this._accountOwners.delete(accountKey);
		const prefix = `${accountKey}\x00`;
		let expiresAt = this._accountBlockedUntil.get(accountKey) ?? 0;
		for (const [key, state] of this._states) {
			if (key.startsWith(prefix)) {
				expiresAt = Math.max(expiresAt, state.blockedUntil ?? (state.remaining === 0 ? state.resetAt ?? 0 : 0));
			}
		}
		if (expiresAt > this._scheduler.now()) {
			this._inactiveAccounts.set(accountKey, expiresAt);
		} else {
			this._clearAccount(accountKey);
		}
		this._scheduleCleanup();
	}

	protected _clearAccount(accountKey: string): void {
		const prefix = `${accountKey}\x00`;
		for (const key of this._states.keys()) {
			if (key.startsWith(prefix)) {
				this._states.delete(key);
			}
		}
		this._accountBlockedUntil.delete(accountKey);
		this._inactiveAccounts.delete(accountKey);
	}

	private _scheduleCleanup(): void {
		this._cleanup.clear();
		if (this._inactiveAccounts.size === 0 || this._store.isDisposed) {
			return;
		}
		let next = Infinity;
		for (const expiresAt of this._inactiveAccounts.values()) {
			next = Math.min(next, expiresAt);
		}
		this._cleanup.value = this._scheduler.schedule(() => {
			for (const [accountKey, expiresAt] of this._inactiveAccounts) {
				if (expiresAt <= this._scheduler.now()) {
					this._clearAccount(accountKey);
				}
			}
			this._scheduleCleanup();
		}, Math.max(0, next - this._scheduler.now()));
	}

	override dispose(): void {
		this._states.clear();
		this._accountBlockedUntil.clear();
		this._inactiveAccounts.clear();
		this._accountOwners.clear();
		super.dispose();
	}

	protected _key(account: RequestAccount, resource: string): string {
		return `${RequestQueue.accountKey(account)}\x00${resource}`;
	}
}
