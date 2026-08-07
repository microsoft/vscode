/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ISSHHostKeyVerificationRequest } from './sshRemoteAgentHost.js';
import type { ISSHTrustedHostKey } from './sshHostKeyTrust.js';

/**
 * Refuse without offering a way through. Used for a changed or revoked key: an
 * explicit "forget this host" step is required to recover, so a possible
 * impersonation can never be waved away with one reflexive click.
 *
 * For a mismatch, `source` records where the disagreement came from, because
 * it decides whether forgetting our stored key can actually unblock the user —
 * a `known_hosts` verdict is not ours to clear.
 */
export type SSHHostKeyDenial =
	| { readonly kind: 'deny'; readonly reason: 'mismatch'; readonly source: 'stored' | 'known-hosts' }
	| { readonly kind: 'deny'; readonly reason: 'revoked' | 'strict-yes' | 'not-user-initiated' };

/**
 * What should happen with a presented host key, once the trust store and the
 * user's `known_hosts` files have both been consulted.
 */
export type SSHHostKeyDecision =
	/** Trust silently. No UI. */
	| { readonly kind: 'trust'; readonly persist: boolean; readonly reason: 'stored' | 'known-hosts' | 'strict-accept-new' | 'strict-disabled' }
	| SSHHostKeyDenial
	/** Ask the user, then persist if they accept. */
	| { readonly kind: 'prompt'; readonly reason: 'unknown' | 'ca-only' };

/**
 * Apply the host key trust policy.
 *
 * Pure so the whole matrix can be tested directly; the caller owns the UI and
 * the storage writes. Ordering matters and is deliberate:
 *
 * 1. Revocation beats every other signal, including a stored trust entry and
 *    the `StrictHostKeyChecking` opt-out.
 * 2. `StrictHostKeyChecking no`/`off` then accepts *unknown* keys, because the
 *    user has explicitly opted out of verification in their SSH config. We
 *    honor that but never persist, so turning it back on restores prompting.
 *    It does not extend to a key that contradicts one we already trust — see
 *    the note on that branch.
 * 3. A key that disagrees with one we already trust is a mismatch even if
 *    `known_hosts` happens to agree with the server, since our store is the
 *    authority for hosts we have connected to before.
 */
export function decideHostKeyTrust(
	request: ISSHHostKeyVerificationRequest,
	trustedKeys: readonly ISSHTrustedHostKey[],
): SSHHostKeyDecision {
	const strict = request.strictHostKeyChecking;

	// Revocation is checked before everything, including the
	// `StrictHostKeyChecking` opt-out. Verified against OpenSSH 9.9: with
	// `StrictHostKeyChecking=no` it still reports "REVOKED HOST KEY DETECTED"
	// and disables password auth, keyboard-interactive auth and agent
	// forwarding. Disabling host key checking means "I accept unknown keys",
	// never "I accept keys I have explicitly revoked".
	if (request.knownHostsMatch === 'revoked') {
		return { kind: 'deny', reason: 'revoked' };
	}

	if (strict === 'no' || strict === 'off') {
		// The opt-out covers *unknown* keys, not a key that disagrees with one
		// we already trust. Verified against OpenSSH 9.9: with
		// `StrictHostKeyChecking=no` and a changed host key it still prints
		// "REMOTE HOST IDENTIFICATION HAS CHANGED!" and then disables password
		// authentication, keyboard-interactive authentication and agent
		// forwarding — precisely the paths that would hand credentials or agent
		// access to a possible impostor.
		//
		// We refuse outright instead of connecting under those restrictions.
		// That is stricter than OpenSSH, which still permits a signature-based
		// (public key) login, but it matches the hard-fail contract a changed
		// key gets everywhere else here, and recovery is the same explicit
		// "forget this host" step.
		const storedUnderOptOut = trustedKeys.find(key => key.keyType === request.keyType);
		if (storedUnderOptOut && storedUnderOptOut.fingerprint !== request.fingerprint) {
			return { kind: 'deny', reason: 'mismatch', source: 'stored' };
		}
		if (request.knownHostsMatch === 'mismatch') {
			return { kind: 'deny', reason: 'mismatch', source: 'known-hosts' };
		}
		return { kind: 'trust', persist: false, reason: 'strict-disabled' };
	}

	const storedForKeyType = trustedKeys.find(key => key.keyType === request.keyType);
	if (storedForKeyType) {
		return storedForKeyType.fingerprint === request.fingerprint
			? { kind: 'trust', persist: false, reason: 'stored' }
			: { kind: 'deny', reason: 'mismatch', source: 'stored' };
	}

	if (request.knownHostsMatch === 'mismatch') {
		return { kind: 'deny', reason: 'mismatch', source: 'known-hosts' };
	}

	if (request.knownHostsMatch === 'match') {
		// Copy into our own store so subsequent decisions do not depend on
		// re-reading the user's files.
		return { kind: 'trust', persist: true, reason: 'known-hosts' };
	}

	// Unknown (or CA-only, which we cannot validate — see below).
	if (strict === 'yes') {
		return { kind: 'deny', reason: 'strict-yes' };
	}
	if (strict === 'accept-new') {
		return { kind: 'trust', persist: true, reason: 'strict-accept-new' };
	}
	if (!request.userInitiated) {
		// A background reconnect must never raise a modal the user did not ask
		// for, and silently trusting an unknown key would defeat the point.
		return { kind: 'deny', reason: 'not-user-initiated' };
	}
	return { kind: 'prompt', reason: request.knownHostsMatch === 'ca-only' ? 'ca-only' : 'unknown' };
}
