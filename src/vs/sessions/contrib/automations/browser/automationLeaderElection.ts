/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../base/common/async.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

const LEADER_KEY = 'chat.automations.leader';

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

// 3x heartbeat interval. Tolerates one missed write before failover.
export const DEFAULT_STALE_AFTER_MS = 90_000;

interface ILeaderRecord {
	readonly instanceId: string;
	readonly heartbeatAt: number;
	// Per-write nonce to detect races during leader claims.
	readonly nonce: string;
}

export interface IAutomationLeaderElectionOptions {
	readonly heartbeatIntervalMs?: number;
	readonly staleAfterMs?: number;
	readonly now?: () => number;
	readonly instanceId?: string;
}

export class AutomationLeaderElection extends Disposable {

	private readonly _isLeader: ISettableObservable<boolean>;
	readonly isLeader: IObservable<boolean>;

	private readonly _instanceId: string;
	private readonly _heartbeatIntervalMs: number;
	private readonly _staleAfterMs: number;
	private readonly _now: () => number;

	private readonly _timer = this._register(new IntervalTimer());

	constructor(
		private readonly storageService: IStorageService,
		private readonly logService: ILogService,
		options: IAutomationLeaderElectionOptions = {},
	) {
		super();

		this._instanceId = options.instanceId ?? generateUuid();
		this._heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
		this._staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
		this._now = options.now ?? Date.now;

		this._isLeader = observableValue<boolean>(this, false);
		this.isLeader = this._isLeader;

		this._register(toDisposable(() => this.releaseIfLeader()));

		this.evaluate();

		this._timer.cancelAndSet(() => this.evaluate(), this._heartbeatIntervalMs);
	}

	get instanceId(): string {
		return this._instanceId;
	}

	/** Test-only: drive the evaluation cycle synchronously. */
	evaluateForTesting(): void {
		this.evaluate();
	}

	private evaluate(): void {
		const now = this._now();
		const current = this.readLeader();

		const claimable =
			!current ||
			current.instanceId === this._instanceId ||
			current.instanceId === '' ||
			(now - current.heartbeatAt) > this._staleAfterMs;

		if (!claimable) {
			if (this._isLeader.get()) {
				this.logService.info(`[AutomationLeaderElection] window ${this._instanceId} stood down for ${current!.instanceId}.`);
			}
			this._isLeader.set(false, undefined);
			return;
		}

		// Write a nonce and verify we won by reading it back (narrows dual-leader window).
		const nonce = generateUuid();
		const writeOk = this.writeLeader({ instanceId: this._instanceId, heartbeatAt: now, nonce });
		if (!writeOk) {
			this._isLeader.set(false, undefined);
			return;
		}
		const verify = this.readLeader();
		if (verify?.instanceId === this._instanceId && verify.nonce === nonce) {
			if (!this._isLeader.get()) {
				this.logService.info(`[AutomationLeaderElection] window ${this._instanceId} claimed leader slot.`);
			}
			this._isLeader.set(true, undefined);
		} else {
			if (this._isLeader.get()) {
				this.logService.info(`[AutomationLeaderElection] window ${this._instanceId} lost leader race to ${verify?.instanceId ?? '<none>'}.`);
			}
			this._isLeader.set(false, undefined);
		}
	}

	private readLeader(): ILeaderRecord | undefined {
		let raw: string | undefined;
		try {
			raw = this.storageService.get(LEADER_KEY, StorageScope.APPLICATION);
		} catch (err) {
			this.logService.warn('[AutomationLeaderElection] storage read failed', err);
			return undefined;
		}
		if (!raw) {
			return undefined;
		}
		try {
			const parsed = JSON.parse(raw) as ILeaderRecord;
			if (typeof parsed?.instanceId !== 'string' || typeof parsed?.heartbeatAt !== 'number') {
				return undefined;
			}
			// `nonce` is optional in older persisted records. Coerce to empty string.
			return { instanceId: parsed.instanceId, heartbeatAt: parsed.heartbeatAt, nonce: typeof parsed.nonce === 'string' ? parsed.nonce : '' };
		} catch {
			return undefined;
		}
	}

	/** Returns true if the write succeeded, false if storage threw. */
	private writeLeader(record: ILeaderRecord): boolean {
		try {
			this.storageService.store(LEADER_KEY, JSON.stringify(record), StorageScope.APPLICATION, StorageTarget.MACHINE);
			return true;
		} catch (err) {
			this.logService.warn('[AutomationLeaderElection] storage write failed', err);
			return false;
		}
	}

	// Write a tombstone on clean shutdown so the next window can claim immediately.
	private releaseIfLeader(): void {
		const current = this.readLeader();
		if (current?.instanceId !== this._instanceId) {
			return;
		}
		this.writeLeader({ instanceId: '', heartbeatAt: 0, nonce: '' });
	}
}

export interface IAutomationLeaderElection extends IDisposable {
	readonly isLeader: IObservable<boolean>;
	readonly instanceId: string;
	evaluateForTesting(): void;
}
