/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../../base/common/async.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';

/**
 * Storage key under which the current leader for the automations scheduler
 * is advertised. APPLICATION/MACHINE scope so all VS Code windows on the
 * same machine race for the same key.
 */
const LEADER_KEY = 'chat.automations.leader';

/**
 * How often the leader writes a fresh heartbeat.
 */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Maximum age before a heartbeat is considered stale and the leader slot
 * is up for grabs. Three times the heartbeat interval gives us tolerance
 * for one missed write (e.g. main thread stall) before failover.
 */
export const DEFAULT_STALE_AFTER_MS = 90_000;

interface ILeaderRecord {
	readonly instanceId: string;
	readonly heartbeatAt: number;
	/**
	 * Random per-write nonce used to break the leader-election TOCTOU
	 * race. After `writeLeader`, the evaluator re-reads storage and only
	 * promotes itself to leader if the on-disk nonce matches what it
	 * just wrote — i.e., no other window clobbered the slot between
	 * read and write. Older persisted records without a nonce are
	 * treated as nonce `''` (still works because we only compare for
	 * equality after our own write).
	 */
	readonly nonce: string;
}

export interface IAutomationLeaderElectionOptions {
	readonly heartbeatIntervalMs?: number;
	readonly staleAfterMs?: number;
	readonly now?: () => number;
	/** Stable id for this window/instance. Defaults to a fresh UUID. */
	readonly instanceId?: string;
}

/**
 * Cooperative leader election across all VS Code windows that share the
 * application storage. A single leader window owns the scheduler tick;
 * the rest stand down. If the leader's heartbeat goes stale the next
 * window to evaluate claims the slot.
 *
 * Test seam: call `evaluateForTesting()` to advance the algorithm
 * without waiting for the real interval timer.
 */
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

		// Try to claim immediately on construction so a single-window
		// startup does not have to wait one heartbeat to start ticking.
		this.evaluate();

		// Re-evaluate on every heartbeat. Whether we're the leader or not
		// we want to (a) refresh our heartbeat if we hold the slot, or
		// (b) take over if the current leader's heartbeat went stale.
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

		// Generate a fresh nonce for this write attempt and confirm we
		// won the slot by reading our own nonce back. This narrows the
		// dual-leader window: if another window wrote between our read
		// and write, the readback will see their nonce instead and we
		// stand down.
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
			// `nonce` is optional in older persisted records; coerce.
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

	/**
	 * Best-effort: if we're the leader, write a tombstone so the next
	 * window doesn't have to wait `staleAfterMs` to take over after a
	 * clean shutdown. We write a tombstone (empty instanceId) rather
	 * than removing the key so a concurrent successor's record is less
	 * likely to be silently deleted by our stale read — and so any
	 * window that sees the tombstone treats it as immediately claimable.
	 */
	private releaseIfLeader(): void {
		const current = this.readLeader();
		if (current?.instanceId !== this._instanceId) {
			return;
		}
		this.writeLeader({ instanceId: '', heartbeatAt: 0, nonce: '' });
	}
}

/**
 * Lightweight subset of {@link IDisposable} we export here so the
 * scheduler can hold the leader election without re-exporting the
 * concrete class for tests.
 */
export interface IAutomationLeaderElection extends IDisposable {
	readonly isLeader: IObservable<boolean>;
	readonly instanceId: string;
	evaluateForTesting(): void;
}
