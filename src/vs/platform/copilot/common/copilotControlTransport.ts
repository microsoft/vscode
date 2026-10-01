/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { GitHubRateLimitCoordinator } from '../../github/common/githubRateLimitCoordinator.js';
import { GitHubRequestQueue } from '../../github/common/githubRequestQueue.js';
import { IGitHubScheduler, schedulerDelay, systemGitHubScheduler } from '../../github/common/githubScheduler.js';
import { GitHubBootstrapAccount, GitHubRequestError, GitHubRequestRateLimitError, GitHubRequestTimeoutError } from '../../github/common/githubTypes.js';
import { ILogService } from '../../log/common/log.js';
import { cancelResponseBody, readBoundedResponse } from '../../request/common/responseReader.js';
import { ISharedRequest, updateSharedRequestCooldown, waitForSharedRequest } from '../../request/common/sharedRequest.js';

export interface ICopilotControlResponse {
	readonly status: number;
	readonly statusText: string;
	readonly body: string;
}

export const copilotControlTimeout = 30_000;
const maximumResponseBytes = 16 * 1024 * 1024;
const maximumSharedWaiters = 64;
const unhintedCooldown = 60_000;
const controlResource = 'copilot.models';

export class CopilotControlTransport extends Disposable {
	private readonly _rateLimits: GitHubRateLimitCoordinator;
	private readonly _queue: GitHubRequestQueue;
	private readonly _inFlight = new Map<string, ISharedRequest<ICopilotControlResponse>>();

	constructor(
		private readonly _logService: ILogService,
		private readonly _scheduler: IGitHubScheduler = systemGitHubScheduler,
	) {
		super();
		this._rateLimits = this._register(new GitHubRateLimitCoordinator(_scheduler));
		this._queue = this._register(new GitHubRequestQueue(_scheduler, context => this._rateLimits.getDelay(context.account, controlResource)));
	}

	async get(
		key: string,
		account: GitHubBootstrapAccount,
		signal: AbortSignal,
		deadline: number,
		fetch: (signal: AbortSignal) => Promise<Response>,
	): Promise<ICopilotControlResponse> {
		signal.throwIfAborted();
		if (this._store.isDisposed) {
			throw new GitHubRequestError('Copilot control transport was disposed', 'unknown');
		}
		if (!Number.isFinite(deadline) || deadline <= this._scheduler.now()) {
			throw new GitHubRequestTimeoutError();
		}
		let shared = this._inFlight.get(key);
		if (shared && shared.deadline <= this._scheduler.now()) {
			this._inFlight.delete(key);
			shared.controller.abort(new GitHubRequestTimeoutError());
			shared = undefined;
		}
		if (!shared) {
			const controller = new AbortController();
			const requestDeadline = this._scheduler.now() + copilotControlTimeout;
			let admitted = false;
			const pending = this._queue.enqueue({
				kind: 'rest', account, caller: controlResource, resource: controlResource,
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
			const created: ISharedRequest<ICopilotControlResponse> = { controller, deadline: requestDeadline, waiters: new Set() };
			shared = created;
			this._inFlight.set(key, created);
			const updateCooldown = () => updateSharedRequestCooldown(created, this._queue.isPending(controller.signal)
				? this._scheduler.now() + this._rateLimits.getDelay(account, controlResource) : 0);
			const cooldownListener = this._rateLimits.onDidChange(updateCooldown);
			updateCooldown();
			void pending.then(value => {
				cooldownListener.dispose();
				if (this._inFlight.get(key) === created) {
					this._inFlight.delete(key);
				}
				for (const waiter of created.waiters) {
					waiter.resolve(value);
				}
			}, error => {
				cooldownListener.dispose();
				if (this._inFlight.get(key) === created) {
					this._inFlight.delete(key);
				}
				for (const waiter of created.waiters) {
					waiter.reject(error);
				}
			});
		}
		if (shared.waiters.size >= maximumSharedWaiters) {
			throw new GitHubRequestError('Copilot control waiter capacity exceeded', 'overloaded');
		}
		try {
			return await waitForSharedRequest(shared, signal, deadline, this._scheduler, () => new GitHubRequestTimeoutError(), {
				error: delay => new GitHubRequestRateLimitError(delay),
			});
		} finally {
			if (shared.waiters.size === 0 && this._inFlight.get(key) === shared) {
				this._inFlight.delete(key);
				shared.controller.abort(new Error('All Copilot control request waiters cancelled'));
			}
		}
	}

	override dispose(): void {
		for (const request of this._inFlight.values()) {
			request.controller.abort(new Error('Copilot control transport was disposed'));
		}
		this._inFlight.clear();
		super.dispose();
	}

	private async _fetch(account: GitHubBootstrapAccount, signal: AbortSignal, onDispatch: () => void, fetch: (signal: AbortSignal) => Promise<Response>): Promise<ICopilotControlResponse> {
		for (let attempt = 0; ; attempt++) {
			signal.throwIfAborted();
			const cooldown = this._rateLimits.getDelay(account, controlResource);
			if (cooldown > 0) {
				throw new GitHubRequestRateLimitError(cooldown);
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
				this._logService.debug('[CopilotApiService] Retrying model discovery after a network failure');
				await schedulerDelay(this._scheduler, 100 + this._scheduler.jitter(200), signal);
				continue;
			}
			if (signal.aborted) {
				if (response.body) {
					cancelResponseBody(response.body, this._logService);
				}
				throw signal.reason;
			}
			this._rateLimits.updateRetryAfter(account, controlResource, response.headers.get('retry-after'), response.status === 429 || response.status === 529 ? unhintedCooldown : 0);
			if (attempt === 0 && response.status >= 500 && this._rateLimits.getDelay(account, controlResource) === 0) {
				if (response.body) {
					cancelResponseBody(response.body, this._logService);
				}
				await schedulerDelay(this._scheduler, 100 + this._scheduler.jitter(200), signal);
				continue;
			}
			const body = await readBoundedResponse(response, maximumResponseBytes, signal, this._logService);
			signal.throwIfAborted();
			if (body.truncated) {
				throw new GitHubRequestError('Copilot control response exceeded its byte limit', 'responseTooLarge', response.status);
			}
			return { status: response.status, statusText: response.statusText, body: new TextDecoder().decode(body.bytes) };
		}
	}
}
