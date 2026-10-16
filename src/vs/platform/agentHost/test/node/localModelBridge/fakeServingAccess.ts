/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../../../base/common/lifecycle.js';
import { DOWN_MARK_MS, QUEUE_TIMEOUT_MS } from '../../../node/copilot/localModelBridge/shim/constants.js';
import { LocalModelServingError, type IDirectFamilyLookup, type ILocalModelClock, type ILocalModelLiveGates, type IQueuedSlotOptions, type IServingAccess, type IServingIdentity, type IServingLease, type IServingSlot, type IServingSnapshot } from '../../../node/copilot/localModelBridge/shim/servingAccess.js';

/** A manually advanced clock. Timers fire in order during {@link advance}. */
export class FakeClock implements ILocalModelClock {

	private _now = 1_000_000;
	private readonly _timers: { readonly at: number; readonly callback: () => void; active: boolean }[] = [];

	now(): number {
		return this._now;
	}

	setTimeout(callback: () => void, ms: number): IDisposable {
		const timer = { at: this._now + ms, callback, active: true };
		this._timers.push(timer);
		return { dispose: () => { timer.active = false; } };
	}

	get activeTimers(): number {
		return this._timers.filter(timer => timer.active).length;
	}

	advance(ms: number): void {
		const target = this._now + ms;
		while (true) {
			const next = this._timers.filter(timer => timer.active && timer.at <= target).sort((a, b) => a.at - b.at)[0];
			if (!next) {
				break;
			}
			this._now = next.at;
			next.active = false;
			next.callback();
		}
		this._now = target;
	}
}

export const MAI_IDENTITY: IServingIdentity = {
	familyId: 'mai-code-1.1-flash-local',
	contentId: 'mai-content-1',
	capiId: 'mai-code-1.1-flash-local',
	alias: 'mai-code-1.1-flash',
	servingGeneration: 1,
};

export const EXAMPLE_IDENTITY: IServingIdentity = {
	familyId: 'example-coder-local',
	contentId: 'example-content-1',
	capiId: 'example-coder-local',
	alias: 'example-coder',
	servingGeneration: 2,
};

/** A ready MAI server (`n_ctx` 262144, 1 slot, placeholder tags). */
export function createServingSnapshot(overrides: Partial<IServingSnapshot> = {}): IServingSnapshot {
	return {
		identity: MAI_IDENTITY,
		displayName: 'Example Flash 1.0',
		server: 'ready',
		autoEligible: true,
		swapInProgress: false,
		endpoint: { baseUrl: 'http://127.0.0.1:41000', apiKey: 'local-api-key' },
		props: { nCtx: 262144, totalSlots: 1 },
		limits: { maxContextWindowTokens: 262144, maxPromptTokens: 180224, maxOutputTokens: 81920 },
		...overrides,
	};
}

interface IQueuedSlot {
	readonly lease: IServingLease;
	readonly options: IQueuedSlotOptions;
	readonly resolve: (slot: IServingSlot) => void;
	readonly reject: (error: unknown) => void;
	timer?: IDisposable;
	onAbort?: () => void;
}

/** In-memory {@link IServingAccess} for router tests. */
export class FakeServingAccess implements IServingAccess {

	gates: ILocalModelLiveGates = { enabled: true, accountGate: true, useInAuto: true };
	accountGeneration = 1;
	active: IServingSnapshot | undefined = createServingSnapshot();
	readonly families = new Map<string, IDirectFamilyLookup>();
	/** {@link getHeldServing} per session: what a turn holding a generation sees, also while it drains. */
	readonly held = new Map<string, IServingSnapshot>();
	readonly calls: string[] = [];
	leasesHeld = 0;
	slotsInUse = 0;
	/** Default: resolves with the active snapshot when it serves `familyId`, otherwise rejects `modelNotActive`. */
	ensureStartedImpl: (familyId: string, signal: AbortSignal) => Promise<IServingSnapshot> = async familyId => {
		if (this.active?.identity.familyId === familyId) {
			return this.active;
		}
		throw new LocalModelServingError('modelNotActive', 'not active');
	};

	private readonly _downUntil = new Map<number, number>();
	private readonly _queue: IQueuedSlot[] = [];

	constructor(private readonly _clock: FakeClock) { }

	getGates(): ILocalModelLiveGates {
		return this.gates;
	}

	getAccountGeneration(): number {
		return this.accountGeneration;
	}

	getActiveServing(): IServingSnapshot | undefined {
		return this.active;
	}

	getHeldServing(sessionId: string | undefined): IServingSnapshot | undefined {
		return sessionId === undefined ? undefined : this.held.get(sessionId);
	}

	isEndpointDown(servingGeneration: number): boolean {
		const until = this._downUntil.get(servingGeneration);
		return until !== undefined && this._clock.now() < until;
	}

	markEndpointDown(servingGeneration: number): void {
		this.calls.push(`markEndpointDown:${servingGeneration}`);
		this._downUntil.set(servingGeneration, this._clock.now() + DOWN_MARK_MS);
	}

	acquireServingLease(identity: IServingIdentity, sessionId?: string): IServingLease | undefined {
		const held = this.getHeldServing(sessionId)?.identity.servingGeneration === identity.servingGeneration;
		if (!held && (!this.active || this.active.identity.servingGeneration !== identity.servingGeneration || this.active.swapInProgress)) {
			return undefined;
		}
		this.leasesHeld++;
		let released = false;
		return {
			identity,
			dispose: () => {
				if (!released) {
					released = true;
					this.leasesHeld--;
				}
			},
		};
	}

	tryAcquireSlot(lease: IServingLease): IServingSlot | undefined {
		if (this.slotsInUse >= this._totalSlots || this._queue.length) {
			return undefined;
		}
		return this._createSlot(lease);
	}

	acquireSlot(lease: IServingLease, options: IQueuedSlotOptions): Promise<IServingSlot> {
		if (options.signal.aborted) {
			return Promise.reject(options.signal.reason);
		}
		if (this.slotsInUse < this._totalSlots && !this._queue.length) {
			return Promise.resolve(this._createSlot(lease));
		}
		return new Promise<IServingSlot>((resolve, reject) => {
			const entry: IQueuedSlot = { lease, options, resolve, reject };
			entry.timer = this._clock.setTimeout(() => {
				this._remove(entry);
				reject(new LocalModelServingError('busyTimeout', 'The local model is busy. Try again, or use Auto.'));
			}, QUEUE_TIMEOUT_MS);
			entry.onAbort = () => {
				this._remove(entry);
				reject(options.signal.reason);
			};
			options.signal.addEventListener('abort', entry.onAbort);
			this._queue.push(entry);
			this._notifyPositions();
		});
	}

	ensureStarted(familyId: string, signal: AbortSignal): Promise<IServingSnapshot> {
		this.calls.push(`ensureStarted:${familyId}`);
		return this.ensureStartedImpl(familyId, signal);
	}

	findFamilyByAlias(alias: string): IDirectFamilyLookup | undefined {
		return this.families.get(alias);
	}

	get queueLength(): number {
		return this._queue.length;
	}

	private get _totalSlots(): number {
		return this.active?.props?.totalSlots ?? 1;
	}

	private _createSlot(lease: IServingLease): IServingSlot {
		this.slotsInUse++;
		let released = false;
		return {
			servingGeneration: lease.identity.servingGeneration,
			dispose: () => {
				if (!released) {
					released = true;
					this.slotsInUse--;
					this._grantNext();
				}
			},
		};
	}

	private _remove(entry: IQueuedSlot): void {
		const index = this._queue.indexOf(entry);
		if (index >= 0) {
			this._queue.splice(index, 1);
		}
		entry.timer?.dispose();
		if (entry.onAbort) {
			entry.options.signal.removeEventListener('abort', entry.onAbort);
		}
		this._notifyPositions();
	}

	private _grantNext(): void {
		while (this._queue.length && this.slotsInUse < this._totalSlots) {
			const entry = this._queue[0];
			this._remove(entry);
			entry.resolve(this._createSlot(entry.lease));
		}
	}

	private _notifyPositions(): void {
		this._queue.forEach((entry, index) => entry.options.onQueuePosition?.(index + 1));
	}
}
