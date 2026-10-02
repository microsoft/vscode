/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { CooldownState } from './cooldownState.js';
import { RequestQueue } from './requestQueue.js';
import { IRequestScheduler, schedulerDelay, systemRequestScheduler } from './scheduler.js';
import { RequestAccount, RequestError, RequestRateLimitError, RequestTimeoutError } from './types.js';
import { ILogService } from '../../log/common/log.js';
import { cancelResponseBody, readBoundedResponse } from './responseReader.js';
import { IInFlightOperation, OperationWaiters } from './operationWaiters.js';

/** Bounded HTTP response retained until each caller parses its own domain result. */
export interface IControlResponse {
	readonly status: number;
	readonly statusText: string;
	readonly body: string;
}

/** Domain-selected bounds and HTTP feedback interpretation for buffered control reads. */
export interface IControlTransportPolicy {
	readonly caller: string;
	readonly resource: string;
	readonly requestTimeout: number;
	readonly maximumResponseBytes: number;
	readonly maximumSharedWaiters: number;
	getResponseCooldown(response: Response, now: number): number;
}

/** Coalesces bounded retryable reads without coupling execution to a service's wire schema. */
export class ControlTransport extends Disposable {
	private readonly _rateLimits: CooldownState;
	private readonly _queue: RequestQueue;
	private readonly _inFlight = new Map<string, IInFlightOperation<IControlResponse>>();

	constructor(
		private readonly _policy: IControlTransportPolicy,
		private readonly _logService: ILogService,
		private readonly _scheduler: IRequestScheduler = systemRequestScheduler,
	) {
		super();
		if (!_policy.caller || !_policy.resource || [_policy.requestTimeout, _policy.maximumResponseBytes, _policy.maximumSharedWaiters].some(value => !Number.isSafeInteger(value) || value <= 0)) {
			throw new RequestError('Invalid control transport policy', 'validation');
		}
		this._rateLimits = this._register(new CooldownState(_scheduler));
		this._queue = this._register(new RequestQueue(_scheduler, context => this._rateLimits.getDelay(context.account, _policy.resource)));
	}

	async get(
		key: string,
		account: RequestAccount,
		signal: AbortSignal,
		deadline: number,
		fetch: (signal: AbortSignal) => Promise<Response>,
	): Promise<IControlResponse> {
		signal.throwIfAborted();
		if (this._store.isDisposed) {
			throw new RequestError('Control transport was disposed', 'unknown');
		}
		if (!Number.isFinite(deadline) || deadline <= this._scheduler.now()) {
			throw new RequestTimeoutError();
		}
		let shared = this._inFlight.get(key);
		if (shared && shared.deadline <= this._scheduler.now()) {
			this._inFlight.delete(key);
			shared.controller.abort(new RequestTimeoutError());
			shared = undefined;
		}
		if (!shared) {
			const controller = new AbortController();
			const requestDeadline = this._scheduler.now() + this._policy.requestTimeout;
			let admitted = false;
			const pending = this._queue.enqueue({
				kind: 'rest', account, caller: this._policy.caller, resource: this._policy.resource,
				priority: 'interactive', deadline: requestDeadline, signal: controller.signal, owner: this,
			}, (signal, onDispatch) => this._fetch(account, signal, onDispatch, fetch), () => {
				admitted = true;
				this._rateLimits.retainAccount(account, controller);
			}).finally(() => {
				if (admitted) {
					this._rateLimits.releaseAccount(account, controller);
				}
			});
			if (!admitted) {
				return pending;
			}
			const created: IInFlightOperation<IControlResponse> = { controller, deadline: requestDeadline, waiters: new OperationWaiters() };
			shared = created;
			this._inFlight.set(key, created);
			const updateCooldown = () => created.waiters.setBlockedUntil(this._queue.isPending(controller.signal)
				? this._scheduler.now() + this._rateLimits.getDelay(account, this._policy.resource) : 0);
			const cooldownListener = this._rateLimits.onDidChange(updateCooldown);
			updateCooldown();
			void pending.then(value => {
				cooldownListener.dispose();
				if (this._inFlight.get(key) === created) {
					this._inFlight.delete(key);
				}
				created.waiters.resolve(value);
			}, error => {
				cooldownListener.dispose();
				if (this._inFlight.get(key) === created) {
					this._inFlight.delete(key);
				}
				created.waiters.reject(error);
			});
		}
		if (shared.waiters.size >= this._policy.maximumSharedWaiters) {
			throw new RequestError('Control waiter capacity exceeded', 'overloaded');
		}
		try {
			return await shared.waiters.wait(signal, deadline, this._scheduler, () => new RequestTimeoutError(), {
				error: delay => new RequestRateLimitError(delay),
			});
		} finally {
			if (shared.waiters.size === 0 && this._inFlight.get(key) === shared) {
				this._inFlight.delete(key);
				shared.controller.abort(new Error('All Control request waiters cancelled'));
			}
		}
	}

	override dispose(): void {
		for (const request of this._inFlight.values()) {
			request.controller.abort(new Error('Control transport was disposed'));
		}
		this._inFlight.clear();
		super.dispose();
	}

	private async _fetch(account: RequestAccount, signal: AbortSignal, onDispatch: () => void, fetch: (signal: AbortSignal) => Promise<Response>): Promise<IControlResponse> {
		for (let attempt = 0; ; attempt++) {
			signal.throwIfAborted();
			const cooldown = this._rateLimits.getDelay(account, this._policy.resource);
			if (cooldown > 0) {
				throw new RequestRateLimitError(cooldown);
			}
			let response: Response;
			try {
				onDispatch();
				response = await fetch(signal);
			} catch (error) {
				signal.throwIfAborted();
				if (attempt !== 0) {
					throw error;
				}
				this._logService.debug('[ControlTransport] Retrying control read after a network failure');
				await schedulerDelay(this._scheduler, 100 + this._scheduler.jitter(200), signal);
				continue;
			}
			if (signal.aborted) {
				if (response.body) {
					cancelResponseBody(response.body, this._logService);
				}
				throw signal.reason;
			}
			this._rateLimits.updateCooldown(account, this._policy.resource, this._policy.getResponseCooldown(response, this._scheduler.now()));
			if (attempt === 0 && response.status >= 500 && this._rateLimits.getDelay(account, this._policy.resource) === 0) {
				if (response.body) {
					cancelResponseBody(response.body, this._logService);
				}
				await schedulerDelay(this._scheduler, 100 + this._scheduler.jitter(200), signal);
				continue;
			}
			const body = await readBoundedResponse(response, this._policy.maximumResponseBytes, signal, this._logService);
			signal.throwIfAborted();
			if (body.truncated) {
				throw new RequestError('Control response exceeded its byte limit', 'responseTooLarge', response.status);
			}
			return { status: response.status, statusText: response.statusText, body: new TextDecoder().decode(body.bytes) };
		}
	}
}
