/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { GitHubAccountHandle, GitHubRequestPriority } from './githubTypes.js';

const priorityOrder: Record<GitHubRequestPriority, number> = {
	mutationReconciliation: 0,
	mutation: 1,
	interactive: 2,
	mergeGate: 3,
	visible: 4,
	background: 5,
	enrichment: 6,
};

interface IQueuedRequest {
	readonly accountKey: string;
	readonly host: string;
	readonly priority: GitHubRequestPriority;
	readonly sequence: number;
	readonly signal: AbortSignal;
	readonly run: () => Promise<void>;
	readonly reject: (reason?: unknown) => void;
}

export class GitHubRequestQueue extends Disposable {

	private readonly _pending: IQueuedRequest[] = [];
	private readonly _activeAccounts = new Set<string>();
	private readonly _activeHosts = new Map<string, number>();
	private _active = 0;
	private _sequence = 0;

	constructor(
		private readonly _maximumConcurrency = 4,
		private readonly _maximumHostConcurrency = 2,
	) {
		super();
	}

	enqueue<T>(account: GitHubAccountHandle, priority: GitHubRequestPriority, signal: AbortSignal, task: () => Promise<T>): Promise<T> {
		if (signal.aborted) {
			return Promise.reject(signal.reason);
		}
		const accountKey = GitHubRequestQueue.accountKey(account);
		return new Promise<T>((resolve, reject) => {
			const request: IQueuedRequest = {
				accountKey,
				host: account.host,
				priority,
				sequence: this._sequence++,
				signal,
				run: async () => {
					try {
						resolve(await task());
					} catch (error) {
						reject(error);
					}
				},
				reject,
			};
			this._pending.push(request);
			signal.addEventListener('abort', () => {
				const index = this._pending.indexOf(request);
				if (index >= 0) {
					this._pending.splice(index, 1);
					reject(signal.reason);
				}
			}, { once: true });
			this._drain();
		});
	}

	cancelAccount(account: GitHubAccountHandle, reason?: unknown): void {
		const accountKey = GitHubRequestQueue.accountKey(account);
		for (let index = this._pending.length - 1; index >= 0; index--) {
			const request = this._pending[index];
			if (request.accountKey === accountKey) {
				this._pending.splice(index, 1);
				request.reject(reason ?? new Error('GitHub credential was invalidated'));
			}
		}
	}

	override dispose(): void {
		for (const request of this._pending.splice(0)) {
			request.reject(new Error('GitHub request queue was disposed'));
		}
		super.dispose();
	}

	private _drain(): void {
		while (this._active < this._maximumConcurrency) {
			const index = this._nextIndex();
			if (index < 0) {
				return;
			}
			const request = this._pending.splice(index, 1)[0];
			if (request.signal.aborted) {
				request.reject(request.signal.reason);
				continue;
			}
			this._active++;
			this._activeAccounts.add(request.accountKey);
			this._activeHosts.set(request.host, (this._activeHosts.get(request.host) ?? 0) + 1);
			void request.run().finally(() => {
				this._active--;
				this._activeAccounts.delete(request.accountKey);
				const hostActive = (this._activeHosts.get(request.host) ?? 1) - 1;
				if (hostActive === 0) {
					this._activeHosts.delete(request.host);
				} else {
					this._activeHosts.set(request.host, hostActive);
				}
				this._drain();
			});
		}
	}

	private _nextIndex(): number {
		let selected = -1;
		for (let index = 0; index < this._pending.length; index++) {
			const candidate = this._pending[index];
			if (this._activeAccounts.has(candidate.accountKey) || (this._activeHosts.get(candidate.host) ?? 0) >= this._maximumHostConcurrency) {
				continue;
			}
			if (selected < 0 || this._compare(candidate, this._pending[selected]) < 0) {
				selected = index;
			}
		}
		return selected;
	}

	private _compare(left: IQueuedRequest, right: IQueuedRequest): number {
		return priorityOrder[left.priority] - priorityOrder[right.priority] || left.sequence - right.sequence;
	}

	static accountKey(account: GitHubAccountHandle): string {
		return `${account.host.toLowerCase()}\x00${account.accountId}`;
	}
}
