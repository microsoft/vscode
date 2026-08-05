/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ISSHHostKeyVerificationRequest } from './sshRemoteAgentHost.js';
import type { ISSHTrustedHostKey } from './sshHostKeyTrust.js';

/**
 * What should happen with a presented host key, once the trust store and the
 * user's `known_hosts` files have both been consulted.
 */
export type SSHHostKeyDecision =
	/** Trust silently. No UI. */
	| { readonly kind: 'trust'; readonly persist: boolean; readonly reason: 'stored' | 'known-hosts' | 'strict-accept-new' | 'strict-disabled' }
	/**
	 * Refuse without offering a way through. Used for a changed or revoked
	 * key: an explicit "forget this host" step is required to recover, so a
	 * possible impersonation can never be waved away with one reflexive click.
	 */
	| { readonly kind: 'deny'; readonly reason: 'mismatch' | 'revoked' | 'strict-yes' | 'not-user-initiated' }
	/** Ask the user, then persist if they accept. */
	| { readonly kind: 'prompt'; readonly reason: 'unknown' | 'ca-only' };

/**
 * Apply the host key trust policy.
 *
 * Pure so the whole matrix can be tested directly; the caller owns the UI and
 * the storage writes. Ordering matters and is deliberate:
 *
 * 1. `StrictHostKeyChecking no`/`off` short-circuits everything, because the
 *    user has explicitly opted out of verification in their SSH config. We
 *    honor that but never persist, so turning it back on restores prompting.
 * 2. Revocation beats every other signal, including a stored trust entry.
 * 3. A key that disagrees with one we already trust is a mismatch even if
 *    `known_hosts` happens to agree with the server, since our store is the
 *    authority for hosts we have connected to before.
 */
export function decideHostKeyTrust(
	request: ISSHHostKeyVerificationRequest,
	trustedKeys: readonly ISSHTrustedHostKey[],
): SSHHostKeyDecision {
	const strict = request.strictHostKeyChecking;

	if (strict === 'no' || strict === 'off') {
		return { kind: 'trust', persist: false, reason: 'strict-disabled' };
	}

	if (request.knownHostsMatch === 'revoked') {
		return { kind: 'deny', reason: 'revoked' };
	}

	const storedForKeyType = trustedKeys.find(key => key.keyType === request.keyType);
	if (storedForKeyType) {
		return storedForKeyType.fingerprint === request.fingerprint
			? { kind: 'trust', persist: false, reason: 'stored' }
			: { kind: 'deny', reason: 'mismatch' };
	}

	if (request.knownHostsMatch === 'mismatch') {
		return { kind: 'deny', reason: 'mismatch' };
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
