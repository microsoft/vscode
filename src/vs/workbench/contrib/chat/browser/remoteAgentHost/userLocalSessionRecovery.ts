/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IActiveSubscriptionInfo } from '../../../../../platform/agentHost/common/state/agentSubscription.js';

export type ReadSessionSubscriptions = () => ReadonlyMap<string, IActiveSubscriptionInfo['status']>;
export type SessionRecoverySignal = 'wake' | 'online';
export type SessionRecoveryOutcome = 'restored' | 'unavailable' | 'released' | 'failed' | 'cancelled' | 'unobserved';

/** Observes one outage of a connection with previously available session state. Never subscribes or retains a snapshot. */
export class UserLocalSessionRecovery {
	private _returnSignal: { kind: SessionRecoverySignal; at: number } | undefined;

	static start(read: ReadSessionSubscriptions | undefined): UserLocalSessionRecovery | undefined {
		if (!read) {
			return undefined;
		}
		const interrupted = new Set<string>();
		for (const [resource, status] of read()) {
			if (status === 'snapshot') {
				interrupted.add(resource);
			}
		}
		return interrupted.size ? new UserLocalSessionRecovery(interrupted, new WeakRef(read)) : undefined;
	}

	private constructor(
		private readonly _interrupted: ReadonlySet<string>,
		private readonly _source: WeakRef<ReadSessionSubscriptions>,
	) { }

	observeReturn(kind: SessionRecoverySignal, now: number): void {
		// Prefer a network return after wake; duplicate notifications must not shorten the measured wait.
		if (!this._returnSignal || (this._returnSignal.kind === 'wake' && kind === 'online')) {
			this._returnSignal = { kind, at: now };
		}
	}

	invalidateReturn(): void {
		this._returnSignal = undefined;
	}

	complete(outcome: 'success' | 'failure' | 'cancelled', read: ReadSessionSubscriptions | undefined, now: number) {
		const sessionRecoveryOutcome: SessionRecoveryOutcome = outcome === 'success' ? this._restorationOutcome(read) : outcome === 'failure' ? 'failed' : 'cancelled';
		return {
			sessionRecoveryOutcome,
			...(this._returnSignal && {
				sessionRecoverySignal: this._returnSignal.kind,
				sessionRecoveryAfterReturnMs: Math.max(0, now - this._returnSignal.at),
			}),
		};
	}

	private _restorationOutcome(read: ReadSessionSubscriptions | undefined): SessionRecoveryOutcome {
		if (!read || read !== this._source.deref()) {
			return 'unobserved';
		}
		const current = read();
		let retained = false;
		for (const resource of this._interrupted) {
			const status = current.get(resource);
			if (status !== undefined) {
				if (status !== 'snapshot') {
					return 'unavailable';
				}
				retained = true;
			}
		}
		return retained ? 'restored' : 'released';
	}
}
