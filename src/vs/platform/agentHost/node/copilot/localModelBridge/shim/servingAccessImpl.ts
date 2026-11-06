/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { DOWN_MARK_MS, LOAD_TIMEOUT_MS, QUEUE_TIMEOUT_MS } from './constants.js';
import { LocalModelServingError, type IDirectFamilyLookup, type ILocalModelClock, type ILocalModelLiveGates, type IQueuedSlotOptions, type IServingAccess, type IServingIdentity, type IServingLease, type IServingSlot, type IServingSnapshot } from './servingAccess.js';

/** What {@link ServingAccess} needs: the provider owns the active model, swaps and live settings; the supervisor owns leases. */
export interface IServingAccessHost {
	getGates(): ILocalModelLiveGates;
	getAccountGeneration(): number;
	getActiveServing(): IServingSnapshot | undefined;
	/** See {@link IServingAccess.getHeldServing}. */
	getHeldServing(sessionId: string | undefined): IServingSnapshot | undefined;
	/** The supervisor's lease on `identity`'s generation; see {@link IServingAccess.acquireServingLease}. */
	acquireLease(identity: IServingIdentity, sessionId: string | undefined): IServingLease | undefined;
	/** Whether `servingGeneration` drains but still serves the turns that hold it. */
	servesHeldTurns(servingGeneration: number): boolean;
	/** A swap in progress to `familyId`; `settled` resolves when it ends (either way). */
	getIncomingSwap(): { readonly familyId: string; readonly settled: Promise<void> } | undefined;
	/** For a direct request: loads the unloaded active family `familyId`, sharing a start in progress; rejects with a {@link LocalModelServingError}. Never swaps. */
	startActive(familyId: string): Promise<void>;
	findFamilyByAlias(alias: string): IDirectFamilyLookup | undefined;
	/** Display name of an installed family, for messages. */
	getFamilyDisplayName(familyId: string): string | undefined;
}

interface IQueuedSlot {
	readonly generation: number;
	readonly options: IQueuedSlotOptions;
	readonly resolve: (slot: IServingSlot) => void;
	readonly reject: (error: unknown) => void;
	timer?: IDisposable;
	onAbort?: () => void;
}

function busyTimeoutError(): LocalModelServingError {
	return new LocalModelServingError('busyTimeout', localize('localModel.busyTimeout', "The local model is busy. Try again, or use Auto."));
}

function notActiveError(displayName: string | undefined): LocalModelServingError {
	return new LocalModelServingError('modelNotActive', displayName
		? localize('localModel.serving.notActive', "{0} isn't loaded.", displayName)
		: localize('localModel.serving.notActiveGeneric', "The on-device model isn't loaded."));
}

function loadTimeoutError(displayName: string | undefined): LocalModelServingError {
	return new LocalModelServingError('startFailed', displayName
		? localize('localModel.serving.loadTimeout', "{0} took too long to load. Try again, or use Auto.", displayName)
		: localize('localModel.serving.loadTimeoutGeneric', "The on-device model took too long to load. Try again, or use Auto."));
}

/** The shim's {@link IServingAccess}: generation-bound leases, slots (non-blocking for Auto, FIFO with a timeout for direct requests), endpoint down marks and `ensureStarted`. */
export class ServingAccess implements IServingAccess, IDisposable {

	private readonly _slotsInUse = new Map<number, number>();
	private readonly _queue: IQueuedSlot[] = [];
	private readonly _downUntil = new Map<number, number>();
	private _disposed = false;

	constructor(
		private readonly _host: IServingAccessHost,
		private readonly _clock: ILocalModelClock,
	) { }

	getGates(): ILocalModelLiveGates {
		return this._host.getGates();
	}

	getAccountGeneration(): number {
		return this._host.getAccountGeneration();
	}

	getActiveServing(): IServingSnapshot | undefined {
		return this._host.getActiveServing();
	}

	getHeldServing(sessionId: string | undefined): IServingSnapshot | undefined {
		return this._disposed ? undefined : this._host.getHeldServing(sessionId);
	}

	findFamilyByAlias(alias: string): IDirectFamilyLookup | undefined {
		return this._host.findFamilyByAlias(alias);
	}

	isEndpointDown(servingGeneration: number): boolean {
		const until = this._downUntil.get(servingGeneration);
		if (until === undefined) {
			return false;
		}
		if (this._clock.now() >= until) {
			this._downUntil.delete(servingGeneration);
			return false;
		}
		return true;
	}

	markEndpointDown(servingGeneration: number): void {
		this._downUntil.set(servingGeneration, this._clock.now() + DOWN_MARK_MS);
	}

	acquireServingLease(identity: IServingIdentity, sessionId?: string): IServingLease | undefined {
		if (this._disposed) {
			return undefined;
		}
		const held = this._host.getHeldServing(sessionId);
		if (held?.identity.servingGeneration !== identity.servingGeneration || held.identity.familyId !== identity.familyId) {
			const active = this._host.getActiveServing();
			if (!active || active.swapInProgress || active.identity.servingGeneration !== identity.servingGeneration || active.identity.familyId !== identity.familyId) {
				return undefined;
			}
		}
		return this._host.acquireLease(identity, sessionId);
	}

	tryAcquireSlot(lease: IServingLease): IServingSlot | undefined {
		const generation = lease.identity.servingGeneration;
		if (!this._isCurrent(generation) || this._inUse(generation) >= this._totalSlots(generation) || this._queue.some(entry => entry.generation === generation)) {
			return undefined;
		}
		return this._createSlot(generation);
	}

	acquireSlot(lease: IServingLease, options: IQueuedSlotOptions): Promise<IServingSlot> {
		if (options.signal.aborted) {
			return Promise.reject(options.signal.reason);
		}
		const generation = lease.identity.servingGeneration;
		if (!this._isCurrent(generation)) {
			return Promise.reject(notActiveError(this._host.getActiveServing()?.displayName));
		}
		if (this._inUse(generation) < this._totalSlots(generation) && !this._queue.some(entry => entry.generation === generation)) {
			return Promise.resolve(this._createSlot(generation));
		}
		return new Promise<IServingSlot>((resolve, reject) => {
			const entry: IQueuedSlot = { generation, options, resolve, reject };
			entry.timer = this._clock.setTimeout(() => {
				this._remove(entry);
				reject(busyTimeoutError());
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

	async ensureStarted(familyId: string, signal: AbortSignal): Promise<IServingSnapshot> {
		const deadline = this._clock.now() + LOAD_TIMEOUT_MS;
		let starts = 0;
		while (true) {
			signal.throwIfAborted();
			if (this._disposed) {
				throw notActiveError(undefined);
			}
			const swap = this._host.getIncomingSwap();
			if (swap?.familyId === familyId) {
				// Direct requests for the incoming model wait for the swap.
				await this._wait(swap.settled, signal, deadline, familyId);
				continue;
			}
			const active = this._host.getActiveServing();
			if (!active || active.identity.familyId !== familyId) {
				throw notActiveError(this._host.getFamilyDisplayName(familyId) ?? active?.displayName);
			}
			if (active.server === 'ready' && active.endpoint && !active.swapInProgress) {
				return active;
			}
			if (starts >= 3) {
				throw loadTimeoutError(active.displayName);
			}
			starts++;
			await this._wait(this._host.startActive(familyId), signal, deadline, familyId);
		}
	}

	/** Rejects queued direct requests bound to a generation that is no longer served. */
	onServingChanged(): void {
		for (const entry of [...this._queue]) {
			if (!this._isCurrent(entry.generation)) {
				this._remove(entry);
				entry.reject(notActiveError(this._host.getActiveServing()?.displayName));
			}
		}
		for (const generation of [...this._slotsInUse.keys()]) {
			if (!this._isCurrent(generation) && !this._inUse(generation)) {
				this._slotsInUse.delete(generation);
			}
		}
	}

	/** Queued requests, for tests and diagnostics. */
	get queueLength(): number {
		return this._queue.length;
	}

	dispose(): void {
		this._disposed = true;
		for (const entry of [...this._queue]) {
			this._remove(entry);
			entry.reject(notActiveError(undefined));
		}
	}

	private _isCurrent(generation: number): boolean {
		const active = this._host.getActiveServing();
		return !this._disposed && !!active && active.identity.servingGeneration === generation && (active.server === 'ready' || this._host.servesHeldTurns(generation));
	}

	private _totalSlots(generation: number): number {
		const active = this._host.getActiveServing();
		return active?.identity.servingGeneration === generation ? Math.max(1, active.props?.totalSlots ?? 1) : 0;
	}

	private _inUse(generation: number): number {
		return this._slotsInUse.get(generation) ?? 0;
	}

	private _createSlot(generation: number): IServingSlot {
		this._slotsInUse.set(generation, this._inUse(generation) + 1);
		let released = false;
		return {
			servingGeneration: generation,
			dispose: () => {
				if (released) {
					return;
				}
				released = true;
				const remaining = Math.max(0, this._inUse(generation) - 1);
				if (remaining) {
					this._slotsInUse.set(generation, remaining);
				} else {
					this._slotsInUse.delete(generation);
				}
				this._grantNext(generation);
			},
		};
	}

	private _grantNext(generation: number): void {
		while (this._isCurrent(generation) && this._inUse(generation) < this._totalSlots(generation)) {
			const entry = this._queue.find(candidate => candidate.generation === generation);
			if (!entry) {
				return;
			}
			this._remove(entry);
			entry.resolve(this._createSlot(generation));
		}
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

	private _notifyPositions(): void {
		const positions = new Map<number, number>();
		for (const entry of this._queue) {
			const position = (positions.get(entry.generation) ?? 0) + 1;
			positions.set(entry.generation, position);
			try {
				entry.options.onQueuePosition?.(position);
			} catch {
				// Observers must not break the queue.
			}
		}
	}

	private _wait(promise: Promise<void>, signal: AbortSignal, deadline: number, familyId: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const finish = (error?: unknown) => {
				if (settled) {
					return;
				}
				settled = true;
				timer.dispose();
				signal.removeEventListener('abort', onAbort);
				if (error === undefined) {
					resolve();
				} else {
					reject(error);
				}
			};
			const onAbort = () => finish(signal.reason ?? new Error('Aborted'));
			const timer = this._clock.setTimeout(() => finish(loadTimeoutError(this._host.getFamilyDisplayName(familyId) ?? this._host.getActiveServing()?.displayName)), Math.max(0, deadline - this._clock.now()));
			signal.addEventListener('abort', onAbort);
			promise.then(() => finish(), error => finish(error ?? new Error('Start failed')));
		});
	}
}
