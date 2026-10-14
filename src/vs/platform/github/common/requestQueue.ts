/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { RequestAccount, RequestContext, RequestPriority, RequestOutcome, requestOutcome, IRequestTiming, RequestError, RequestTimeoutError, IRequestQueueTelemetry } from './types.js';
import { IRequestScheduler, systemRequestScheduler } from './scheduler.js';

const priorityOrder: Record<RequestPriority, number> = {
	mutationReconciliation: 0,
	mutation: 1,
	interactive: 2,
	mergeGate: 3,
	visible: 4,
	background: 5,
	enrichment: 6,
};

/** Hard admission/concurrency limits and reserved capacity for interactive callers. */
export interface RequestQueueOptions {
	/** Maximum active requests across the queue; excludes queued and cooldown-waiting requests. */
	readonly maximumConcurrency: number;
	/** Maximum active requests for one case-insensitive host, across accounts and callers. */
	readonly maximumHostConcurrency: number;
	/** Maximum active requests for one caller, across hosts and accounts. */
	readonly maximumCallerConcurrency: number;
	/** Maximum retained requests across the queue, including active, queued, and cooldown-waiting requests. */
	readonly maximumRequests: number;
	/** Maximum active, queued, and cooldown-waiting requests for one host/account pair. */
	readonly maximumAccountRequests: number;
	/** Maximum active, queued, and cooldown-waiting requests for one caller, across hosts and accounts. */
	readonly maximumCallerRequests: number;
	/** Slots reserved for interactive, mutation, and mutation-reconciliation work in each retained-request limit, capped at one quarter of that limit. */
	readonly reservedInteractiveRequests: number;
}

const defaultOptions: RequestQueueOptions = {
	maximumConcurrency: 4,
	maximumHostConcurrency: 2,
	maximumCallerConcurrency: 2,
	maximumRequests: 256,
	maximumAccountRequests: 64,
	maximumCallerRequests: 64,
	reservedInteractiveRequests: 8,
};

/** Retained admission state and completion callbacks for one pending or active operation. */
interface IQueuedRequest {
	readonly context: RequestContext;
	readonly accountKey: string;
	readonly host: string;
	readonly sequence: number;
	readonly timing: IRequestTiming | undefined;
	priority: RequestPriority;
	readonly run: () => void;
	readonly cancel: (reason: unknown) => void;
	readonly expire: () => void;
}

/** Fair bounded admission with domain-provided quota delays and optional timing diagnostics. */
export class RequestQueue extends Disposable {

	private readonly _pending: IQueuedRequest[] = [];
	private readonly _active = new Set<IQueuedRequest>();
	private readonly _lastServed = new Map<string, number>();
	private readonly _wake = this._register(new MutableDisposable());
	private readonly _options: RequestQueueOptions;
	private _sequence = 0;
	private _dispatchSequence = 0;
	private _draining = false;

	constructor(
		private readonly _scheduler: IRequestScheduler = systemRequestScheduler,
		private readonly _getDelay: (context: RequestContext) => number = () => 0,
		options: Partial<RequestQueueOptions> = {},
		private readonly _telemetry?: IRequestQueueTelemetry,
	) {
		super();
		this._options = { ...defaultOptions, ...options };
		for (const [key, value] of Object.entries(this._options)) {
			if (!Number.isSafeInteger(value) || value < (key === 'reservedInteractiveRequests' ? 0 : 1)) {
				throw new RequestError(`Invalid request queue option: ${key}`, 'validation');
			}
		}
	}

	/** Calls onAdmitted synchronously only after retaining a request slot. */
	enqueue<T>(context: RequestContext, task: (signal: AbortSignal, onDispatch: () => void) => Promise<T>, onAdmitted?: () => void): Promise<T> {
		if (context.signal.aborted) {
			return Promise.reject(context.signal.reason);
		}
		if (this._store.isDisposed) {
			return Promise.reject(new RequestError('Request queue was disposed', 'unknown'));
		}
		if (!context.caller || !Number.isFinite(context.deadline)) {
			return Promise.reject(new RequestError('Invalid Request context', 'validation'));
		}
		if (context.deadline <= this._scheduler.now()) {
			return Promise.reject(new RequestTimeoutError());
		}
		this._drain();
		const accountKey = RequestQueue.accountKey(context.account);
		const requests = [...this._pending, ...this._active];
		const limit = (maximum: number) => maximum - (priorityOrder[context.priority] <= priorityOrder.interactive
			? 0 : Math.min(this._options.reservedInteractiveRequests, Math.floor(maximum / 4)));
		const rejection = requests.length >= limit(this._options.maximumRequests) ? 'engine'
			: requests.filter(request => request.accountKey === accountKey).length >= limit(this._options.maximumAccountRequests) ? 'account'
				: requests.filter(request => request.context.caller === context.caller).length >= limit(this._options.maximumCallerRequests) ? 'caller'
					: undefined;
		if (rejection) {
			this._telemetry?.recordRejection(rejection);
			return Promise.reject(new RequestError('Request capacity exceeded', 'overloaded'));
		}

		return new Promise<T>((resolve, reject) => {
			const store = new DisposableStore();
			const controller = new AbortController();
			const timing = this._telemetry?.startQueue(context);
			let settled = false;
			let dispatched = false;
			const finish = (complete: () => void, outcome: RequestOutcome) => {
				if (settled) {
					return;
				}
				settled = true;
				timing?.finish(outcome);
				store.dispose();
				const index = this._pending.indexOf(request);
				if (index >= 0) {
					this._pending.splice(index, 1);
				}
				this._active.delete(request);
				if (![...this._pending, ...this._active].some(other => other.context.caller === context.caller)) {
					this._lastServed.delete(context.caller);
				}
				complete();
				this._drain();
			};
			const checkDeadline = () => {
				if (!settled && context.deadline <= this._scheduler.now()) {
					request.expire();
				}
			};
			const request: IQueuedRequest = {
				context,
				accountKey,
				host: context.account.host.toLowerCase(),
				priority: context.priority,
				sequence: this._sequence++,
				timing,
				run: () => {
					void Promise.resolve().then(() => {
						checkDeadline();
						controller.signal.throwIfAborted();
						return task(controller.signal, () => {
							checkDeadline();
							controller.signal.throwIfAborted();
							dispatched = true;
						});
					}).then(
						value => {
							checkDeadline();
							finish(() => resolve(value), 'success');
						},
						error => {
							checkDeadline();
							finish(() => reject(error), requestOutcome(error, controller.signal.aborted));
						},
					);
				},
				cancel: reason => {
					controller.abort(reason);
					finish(() => reject(reason), requestOutcome(reason, true));
				},
				expire: () => request.cancel(new RequestTimeoutError(dispatched)),
			};
			const onAbort = () => request.cancel(context.signal.reason);
			store.add(toDisposable(() => context.signal.removeEventListener('abort', onAbort)));
			context.signal.addEventListener('abort', onAbort, { once: true });
			store.add(this._scheduler.schedule(
				request.expire,
				context.deadline - this._scheduler.now(),
			));
			this._pending.push(request);
			onAdmitted?.();
			this._telemetry?.recordQueueSize(this._active.size, this._pending.length);
			this._drain();
		});
	}

	promote(signal: AbortSignal, priority: RequestPriority): void {
		for (const request of this._pending) {
			if (request.context.signal === signal && priorityOrder[priority] < priorityOrder[request.priority]) {
				request.priority = priority;
			}
		}
		this._drain();
	}

	isPending(signal: AbortSignal): boolean {
		return this._pending.some(request => request.context.signal === signal);
	}

	cancelAccount(account: RequestAccount, reason: unknown = new RequestError('Request credential was invalidated', 'authentication'), owner?: object): void {
		const accountKey = RequestQueue.accountKey(account);
		for (const request of [...this._pending, ...this._active]) {
			if (request.accountKey === accountKey && (owner === undefined || request.context.owner === owner)) {
				request.cancel(reason);
			}
		}
	}

	cancelOwner(owner: object): void {
		for (const request of [...this._pending, ...this._active]) {
			if (request.context.owner === owner) {
				request.cancel(new RequestError('Request client was disposed', 'unknown'));
			}
		}
	}

	clear(): void {
		for (const request of [...this._pending, ...this._active]) {
			request.cancel(new RequestError('Request queue was cleared', 'unknown'));
		}
		this._wake.clear();
	}

	override dispose(): void {
		super.dispose();
		this.clear();
	}

	private _drain(): void {
		if (this._store.isDisposed || this._draining) {
			return;
		}
		this._draining = true;
		try {
			this._wake.clear();
			// Wall-clock deadlines can expire before their timers fire after suspend or a clock adjustment.
			for (const request of [...this._pending, ...this._active]) {
				if (request.context.deadline <= this._scheduler.now()) {
					request.expire();
				}
			}
			// Selection and wake-up scheduling must use the same cooldown sample.
			const cooldowns = new Map<IQueuedRequest, number>();
			const getDelay = (request: IQueuedRequest): number => {
				let delay = cooldowns.get(request);
				if (delay === undefined) {
					delay = this._getDelay(request.context);
					cooldowns.set(request, delay);
					request.timing?.updateCooldown(delay);
				}
				return delay;
			};
			while (this._active.size < this._options.maximumConcurrency) {
				const index = this._nextIndex(getDelay);
				if (index < 0) {
					break;
				}
				const request = this._pending.splice(index, 1)[0];
				this._active.add(request);
				this._lastServed.set(request.context.caller, this._dispatchSequence++);
				request.timing?.start(request.priority);
				request.run();
			}
			this._telemetry?.recordQueueSize(this._active.size, this._pending.length);
			let delay = Infinity;
			for (const request of this._pending) {
				const remaining = getDelay(request);
				if (remaining > 0) {
					delay = Math.min(delay, remaining);
				}
			}
			if (Number.isFinite(delay)) {
				this._wake.value = this._scheduler.schedule(() => this._drain(), delay);
			}
		} finally {
			this._draining = false;
		}
	}

	private _nextIndex(getDelay: (request: IQueuedRequest) => number): number {
		let selected = -1;
		for (let index = 0; index < this._pending.length; index++) {
			const candidate = this._pending[index];
			if (candidate.context.deadline <= this._scheduler.now()) {
				candidate.expire();
				index--;
				continue;
			}
			const active = [...this._active];
			const delay = getDelay(candidate);
			if (delay > 0
				|| active.some(request => request.accountKey === candidate.accountKey)
				|| active.filter(request => request.host === candidate.host).length >= this._options.maximumHostConcurrency
				|| active.filter(request => request.context.caller === candidate.context.caller).length >= this._options.maximumCallerConcurrency) {
				continue;
			}
			if (selected < 0 || this._compare(candidate, this._pending[selected]) < 0) {
				selected = index;
			}
		}
		return selected;
	}

	private _compare(left: IQueuedRequest, right: IQueuedRequest): number {
		return priorityOrder[left.priority] - priorityOrder[right.priority]
			|| (this._lastServed.get(left.context.caller) ?? -1) - (this._lastServed.get(right.context.caller) ?? -1)
			|| left.sequence - right.sequence;
	}

	static accountKey(account: RequestAccount): string {
		if (account.kind === 'anonymous') {
			return `anonymous\x00${account.origin}`;
		}
		if (account.kind === 'bootstrap' && account.accountId === undefined) {
			return `bootstrap\x00${account.origin}`;
		}
		return `${account.host.toLowerCase()}\x00${account.accountId}`;
	}
}
