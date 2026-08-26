/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * One-shot admission of an *already existing* remote Agent Host session into an
 * Agents Window, for an evaluation controller that owns the session and drives
 * every turn itself.
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
 * Hashes the claim into the commitment the launch argument carries.
 *
 * The encoding is netstring-style — each field is prefixed with its UTF-16
 * length and a colon — so no combination of field contents can produce the same
 * byte sequence as a different combination. A plain separator would let a
 * crafted `sessionUri` impersonate a different `nonce`/`sessionType` split.
 */
export async function computeAgentSessionClaimCommitment(request: IAgentSessionClaimRequest): Promise<string> {
	const canonical = REQUEST_KEYS.map(key => `${request[key].length}:${request[key]}`).join('');
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Joins an existing backend session as an additional active client. Rejects
 * when the session does not exist; never creates one. The returned disposable
 * ends the claim.
 */
export type AgentSessionClaimTarget = (backendSession: URI, token: CancellationToken) => Promise<IDisposable>;

/**
 * The programmatic Agent Host session handlers a claim can be served by, keyed
 * by exact session type. A registry rather than a service because it has one
 * writer, one reader, and no state worth injecting.
 */
class AgentSessionClaimTargetRegistry {

	private readonly _targets = new Map<string, AgentSessionClaimTarget>();
	private readonly _onDidRegister = new Emitter<string>();

	register(sessionType: string, target: AgentSessionClaimTarget): IDisposable {
		this._targets.set(sessionType, target);
		this._onDidRegister.fire(sessionType);
		return toDisposable(() => {
			if (this._targets.get(sessionType) === target) {
				this._targets.delete(sessionType);
			}
		});
	}

	get(sessionType: string): AgentSessionClaimTarget | undefined {
		return this._targets.get(sessionType);
	}

	/**
	 * Resolves once {@link sessionType} has a handler, or `undefined` on timeout
	 * or cancellation. The bridge can invoke the command before
	 * `RemoteAgentHostContribution` has registered its handlers, so the command
	 * waits rather than failing on a race it cannot control.
	 */
	waitFor(sessionType: string, timeoutMs: number, token: CancellationToken): Promise<AgentSessionClaimTarget | undefined> {
		const existing = this._targets.get(sessionType);
		if (existing || token.isCancellationRequested) {
			return Promise.resolve(existing);
		}
		return new Promise(resolve => {
			const store = new DisposableStore();
			const settle = (target: AgentSessionClaimTarget | undefined) => {
				store.dispose();
				resolve(target);
			};
			store.add(this._onDidRegister.event(type => {
				if (type === sessionType) {
					settle(this._targets.get(sessionType));
				}
			}));
			store.add(disposableTimeout(() => settle(undefined), timeoutMs));
			store.add(token.onCancellationRequested(() => settle(undefined)));
		});
	}
}

export const agentSessionClaimTargets = new AgentSessionClaimTargetRegistry();
