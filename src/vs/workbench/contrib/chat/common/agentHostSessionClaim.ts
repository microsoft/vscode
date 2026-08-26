/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * One-shot admission of an *already existing* remote Agent Host session into an
 * Agents Window, for an evaluation controller that owns the session and drives
 * every turn itself.
 *
 * The controller and its reviewed bridge extension own the whole secret
 * lifecycle: they mint the nonce, keep it in private `0600` state, and hand it
 * to the bridge over their own channel. VS Code is told only a **commitment** —
 * a SHA-256 over the exact claim it will accept — on a private, unlisted launch
 * argument. Argv therefore carries nothing secret, and the product needs no
 * descriptor schema, credential store, or authentication changes of its own.
 *
 * The bridge later presents the pre-image. If it hashes to the commitment, the
 * window joins that one session as an additional active client; nothing else is
 * reachable, because the commitment fixes the session type, the session URI,
 * and the bridge identity as well as the nonce.
 *
 * Nothing here is reachable from settings, menus, the Command Palette, a
 * keybinding, a command URI, a URL handler, or extension API: without the launch
 * argument the command is never registered at all.
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
 * Whether {@link value} is the canonical serialization of an absolute session
 * URI: re-serializing the parse yields exactly the same string, the scheme is
 * lowercase (`URI.parse` preserves case, so `COPILOT:/x` would otherwise round
 * trip while addressing nothing), and the path carries no `..` segment. The
 * claim is pinned to one session, and the host's registry is keyed by the exact
 * string, so an equivalent-but-differently-spelled URI must not be accepted.
 */
export function isCanonicalAgentSessionUri(value: string): boolean {
	let parsed: URI;
	try {
		parsed = URI.parse(value);
	} catch {
		return false;
	}
	return !!parsed.scheme
		&& parsed.scheme === parsed.scheme.toLowerCase()
		&& !!parsed.path && parsed.path !== '/'
		&& !parsed.query && !parsed.fragment
		&& !parsed.path.split('/').includes('..')
		&& parsed.toString() === value;
}

/**
 * Validates the shape of an untrusted command argument. Every field must be a
 * non-empty string, no field may be missing, and no unrecognized field may be
 * present — a caller must not be able to smuggle anything past a future reader.
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
	return isCanonicalAgentSessionUri(request.sessionUri) ? request : undefined;
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
 * Length-independent comparison, so the commitment cannot be recovered by
 * timing the command. Written to touch every character of both inputs and to
 * avoid any early return.
 */
export function equalsConstantTime(a: string, b: string): boolean {
	let difference = a.length ^ b.length;
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		// `charCodeAt` past the end yields NaN, whose `| 0` is 0 — a stable
		// stand-in that keeps the loop length independent of where inputs differ.
		difference |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
	}
	return difference === 0;
}

/**
 * Joins an existing backend session as an additional active client. Rejects
 * when the session does not exist; never creates one. The returned disposable
 * ends the claim.
 */
export type AgentSessionClaimTarget = (backendSession: URI) => Promise<IDisposable>;

/**
 * The programmatic Agent Host session handlers a claim can be served by, keyed
 * by exact session type. A registry rather than a service because it has one
 * writer, one reader, and no state worth injecting.
 */
class AgentSessionClaimTargetRegistry {

	private readonly _targets = new Map<string, AgentSessionClaimTarget>();

	register(sessionType: string, target: AgentSessionClaimTarget): IDisposable {
		this._targets.set(sessionType, target);
		return toDisposable(() => {
			if (this._targets.get(sessionType) === target) {
				this._targets.delete(sessionType);
			}
		});
	}

	get(sessionType: string): AgentSessionClaimTarget | undefined {
		return this._targets.get(sessionType);
	}
}

export const agentSessionClaimTargets = new AgentSessionClaimTargetRegistry();
