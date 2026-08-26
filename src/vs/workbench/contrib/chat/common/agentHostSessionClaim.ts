/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * One-shot admission of an *already existing* remote Agent Host session into an
 * Agents Window, for an evaluation controller that drives every turn itself.
 *
 * The controller and its bridge own the whole secret lifecycle; VS Code is told
 * only a **commitment** — a SHA-256 over the exact claim it will accept — on a
 * private, unlisted launch argument, so argv carries nothing secret. The bridge
 * later presents the pre-image, which pins the session type, session URI, and
 * bridge identity as well as the nonce.
 *
 * See `src/vs/platform/agentHost/AGENT_SESSION_CLAIM.md`.
 */

/**
 * Private, unlisted Electron launch argument carrying the hex SHA-256
 * commitment. Non-secret by construction: it is a one-way hash of a claim the
 * holder must already know in full.
 */
export const AGENT_SESSION_CLAIM_HASH_ARG = 'agent-session-claim-hash';

/** Hidden (no menu, no `f1`) command the reviewed bridge extension invokes. */
export const AGENT_SESSION_CLAIM_COMMAND_ID = 'workbench.action.agentHost.claimExternalSession';

/** The exact argument the bridge passes. Extra or missing keys are rejected. */
export interface IAgentSessionClaimRequest {
	readonly nonce: string;
	readonly sessionType: string;
	readonly sessionUri: string;
	readonly bridgeExtensionId: string;
	readonly bridgeExtensionVersion: string;
}

const REQUEST_KEYS: readonly (keyof IAgentSessionClaimRequest)[] = [
	'nonce', 'sessionType', 'sessionUri', 'bridgeExtensionId', 'bridgeExtensionVersion',
];

const COMMITMENT_PATTERN = /^[0-9a-f]{64}$/;

/** Returns {@link value} when it is a hex SHA-256 digest. */
export function parseAgentSessionClaimCommitment(value: string | undefined): string | undefined {
	return typeof value === 'string' && COMMITMENT_PATTERN.test(value) ? value : undefined;
}

/**
 * Validates the shape of an untrusted command argument: exactly these fields,
 * each a non-empty string, so nothing can be smuggled past a future reader. The
 * session URI must re-serialize to itself with a lowercase scheme, because the
 * host's registry is keyed by the exact string.
 */
export function parseAgentSessionClaimRequest(raw: unknown): IAgentSessionClaimRequest | undefined {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return undefined;
	}
	const candidate = raw as Record<string, unknown>;
	if (Object.keys(candidate).length !== REQUEST_KEYS.length) {
		return undefined;
	}
	for (const key of REQUEST_KEYS) {
		const value = candidate[key];
		if (typeof value !== 'string' || value.length === 0) {
			return undefined;
		}
	}
	const request = candidate as unknown as IAgentSessionClaimRequest;
	try {
		const parsed = URI.parse(request.sessionUri);
		if (parsed.toString() !== request.sessionUri || parsed.scheme !== parsed.scheme.toLowerCase()) {
			return undefined;
		}
	} catch {
		return undefined;
	}
	return request;
}

/**
 * Hashes the claim into the commitment the launch argument carries. The encoding
 * is netstring-style — each field prefixed with its length and a colon — so no
 * combination of field contents can produce the same bytes as a different one;
 * a plain separator would let a crafted `sessionUri` shift the field split.
 */
export async function computeAgentSessionClaimCommitment(request: IAgentSessionClaimRequest): Promise<string> {
	const canonical = REQUEST_KEYS.map(key => `${request[key].length}:${request[key]}`).join('');
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Joins an existing backend session as an additional active client. Rejects when
 * the session does not exist; never creates one. Disposing ends the claim.
 */
export type AgentSessionClaimTarget = (backendSession: URI, token: CancellationToken) => Promise<IDisposable>;

/** Why a readiness wait ended. A closed vocabulary, safe to log and assert on. */
export const enum AgentSessionClaimReadiness {
	Ready = 'ready',
	/** The caller's token was cancelled — including by its own budget guard. */
	Cancelled = 'cancelled',
}

export type AgentSessionClaimReadinessResult =
	| { readonly outcome: AgentSessionClaimReadiness.Ready; readonly target: AgentSessionClaimTarget }
	| { readonly outcome: AgentSessionClaimReadiness.Cancelled };

/**
 * The programmatic Agent Host session handlers a claim can be served by, keyed
 * by exact session type. A registry rather than a service because it has one
 * writer, one reader, and no state worth injecting.
 */
class AgentSessionClaimTargetRegistry {

	private readonly _targets = new Map<string, AgentSessionClaimTarget>();
	private readonly _onDidRegisterTarget = new Emitter<string>();

	/** Fires with the exact session type each time a handler registers. */
	readonly onDidRegisterTarget: Event<string> = this._onDidRegisterTarget.event;

	register(sessionType: string, target: AgentSessionClaimTarget): IDisposable {
		this._targets.set(sessionType, target);
		this._onDidRegisterTarget.fire(sessionType);
		return toDisposable(() => {
			if (this._targets.get(sessionType) === target) {
				this._targets.delete(sessionType);
			}
		});
	}

	getTarget(sessionType: string): AgentSessionClaimTarget | undefined {
		return this._targets.get(sessionType);
	}

	/**
	 * Resolves as soon as {@link sessionType} has a handler, driven purely by
	 * {@link onDidRegisterTarget}: it schedules nothing and polls nothing, so an
	 * already-registered handler resolves with no clock involved. The caller
	 * supplies whatever deadline it wants through {@link token}.
	 */
	whenTargetReady(sessionType: string, token: CancellationToken): Promise<AgentSessionClaimReadinessResult> {
		const target = this._targets.get(sessionType);
		if (target) {
			return Promise.resolve({ outcome: AgentSessionClaimReadiness.Ready, target });
		}
		if (token.isCancellationRequested) {
			return Promise.resolve({ outcome: AgentSessionClaimReadiness.Cancelled });
		}
		return new Promise(resolve => {
			const store = new DisposableStore();
			const settle = (result: AgentSessionClaimReadinessResult) => {
				store.dispose();
				resolve(result);
			};
			store.add(this.onDidRegisterTarget(registered => {
				const ready = registered === sessionType ? this._targets.get(sessionType) : undefined;
				if (ready) {
					settle({ outcome: AgentSessionClaimReadiness.Ready, target: ready });
				}
			}));
			store.add(token.onCancellationRequested(() => settle({ outcome: AgentSessionClaimReadiness.Cancelled })));
		});
	}
}

export const agentSessionClaimTargets = new AgentSessionClaimTargetRegistry();
