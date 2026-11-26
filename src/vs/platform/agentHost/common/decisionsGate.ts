/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../base/common/async.js';
import type { CancellationToken } from '../../../base/common/cancellation.js';
import { AgentDecisionsUnavailableError, agentDecisionErrorData, type AgentDecisionErrorKind, type IAgentDecisionsRequest, type IAgentDecisionsResult } from './agentDecisions.js';

/** Calls the decisions service once, with no caching or cooldown of its own. */
export type AgentDecisionsCall = (request: IAgentDecisionsRequest) => Promise<IAgentDecisionsResult>;

/** How long a failure keeps the gate shut, by kind. Kinds not listed never shut it. */
export const decisionsGateCooldownMs: Readonly<Partial<Record<AgentDecisionErrorKind, number>>> = {
	/** Without a `Retry-After`; the service's hint wins when it gives one. */
	rateLimited: 30_000,
	/** The account, plan or flag rarely changes within minutes, so stop asking every turn. */
	notEnabled: 5 * 60_000,
	/** Shuts only the decision model that was missing; another may still work. */
	noModel: 5 * 60_000,
	/** A new credential gets a new gate, so this only covers retries with the same one. */
	unauthenticated: 60_000,
	/** The runtime's own queue is full; back off briefly. */
	overloaded: 2_000,
};
/** The longest a `Retry-After` is honored. */
export const maxDecisionsCooldownMs = 60 * 60_000;

interface IShut {
	readonly until: number;
	readonly kind: AgentDecisionErrorKind;
}

/**
 * Pauses one account's decisions calls after a failure, so a rate-limited or non-entitled
 * account doesn't call the service on every turn. The runtime bounds concurrency and deadlines
 * and reports typed errors, but keeps no memory between calls.
 *
 * A failure shuts the gate for a while ({@link decisionsGateCooldownMs}), rejecting at once with
 * an {@link AgentDecisionsUnavailableError} of the same kind. A shut period only ever lengthens;
 * `noModel` shuts only the decision model that was missing. A caller that stops waiting doesn't
 * cancel the call, because the runtime finishes it anyway, and its failure still shuts the gate.
 * Answers are never cached.
 */
export class DecisionsGate {
	private _shut: IShut | undefined;
	private readonly _shutModels = new Map<string, IShut>();

	constructor(
		private readonly _call: AgentDecisionsCall,
		private readonly _now: () => number = Date.now,
	) { }

	ask(request: IAgentDecisionsRequest, token: CancellationToken): Promise<IAgentDecisionsResult> {
		const shut = this._activeShut(request.model);
		if (shut) {
			return Promise.reject(new AgentDecisionsUnavailableError({ kind: shut.kind, retryAfterMs: shut.until - this._now() }));
		}
		const call = this._call(request).catch(error => {
			this._noteFailure(request.model, error);
			throw error;
		});
		// Settles even when the caller has stopped waiting.
		call.catch(() => { });
		return raceCancellationError(call, token);
	}

	private _activeShut(model: string | undefined): IShut | undefined {
		const now = this._now();
		const modelShut = this._shutModels.get(model ?? '');
		return [this._shut, modelShut].find(shut => shut && now < shut.until);
	}

	private _noteFailure(model: string | undefined, error: unknown): void {
		const data = agentDecisionErrorData(error);
		const cooldown = data && decisionsGateCooldownMs[data.kind];
		if (!data || cooldown === undefined) {
			return;
		}
		const ms = Math.min(maxDecisionsCooldownMs, data.kind === 'rateLimited' && data.retryAfterMs !== undefined ? data.retryAfterMs : cooldown);
		const shut: IShut = { until: this._now() + ms, kind: data.kind };
		if (data.kind === 'noModel') {
			if (!(shut.until <= (this._shutModels.get(model ?? '')?.until ?? 0))) {
				this._shutModels.set(model ?? '', shut);
			}
		} else if (!(shut.until <= (this._shut?.until ?? 0))) {
			this._shut = shut;
		}
	}
}
