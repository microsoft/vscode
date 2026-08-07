/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Result of matching a presented host key against the entries in the user's
 * `known_hosts` files.
 *
 * `mismatch` is deliberately scoped to entries of the *same* key type: a host
 * that has an `ssh-rsa` entry on file but presents an `ssh-ed25519` key is
 * `unknown` (we simply have never seen that key type for it), not evidence of
 * an attack. Treating that as a mismatch would fire a false alarm for every
 * user with an RSA-only entry, since ssh2 negotiates ed25519 first.
 */
export type KnownHostsMatch =
	/** An entry for this host and key type matches the presented key exactly. */
	| 'match'
	/** An entry for this host and key type exists but holds a *different* key. */
	| 'mismatch'
	/** The presented key is explicitly marked `@revoked`. */
	| 'revoked'
	/**
	 * The only entries for this host are `@cert-authority` lines. ssh2 cannot
	 * validate host certificates (it advertises no `*-cert-v01@openssh.com`
	 * host key algorithms), so we can neither trust nor reject on this basis.
	 * Surfaced distinctly so the UI can say so plainly rather than showing an
	 * ordinary trust-on-first-use prompt for a host that deliberately set up a
	 * CA precisely to avoid one.
	 */
	| 'ca-only'
	/** No entry for this host and key type. */
	| 'unknown';

/**
 * A single parsed `known_hosts` entry.
 */
export interface IKnownHostsEntry {
	/** `@revoked` / `@cert-authority` marker, when present. */
	readonly marker?: 'revoked' | 'cert-authority';
	/**
	 * Comma-separated host patterns, already split. Empty when {@link hashedHost}
	 * is set, since hashed entries encode exactly one host per line.
	 */
	readonly patterns: readonly string[];
	/** Salt and hash for a `|1|<salt>|<hash>` hashed entry. */
	readonly hashedHost?: { readonly salt: Buffer; readonly hash: Buffer };
	/** Key algorithm name, e.g. `ssh-ed25519`. */
	readonly keyType: string;
	/** The raw key blob (base64-decoded). */
	readonly key: Buffer;
}

/**
 * Compute the OpenSSH-style `SHA256:` fingerprint of a raw SSH wire-format
 * public key blob. Matches `ssh-keygen -lf` byte for byte, including the
 * stripped base64 padding, so the value can be compared by eye (or by copy
 * and paste) against what the `ssh` command line displays.
 */
export function computeHostKeyFingerprint(keyBlob: Buffer): string {
	const digest = createHash('sha256').update(keyBlob).digest('base64');
	return `SHA256:${digest.replace(/=+$/, '')}`;
}

/**
 * Read the algorithm name from the head of an SSH wire-format key blob. Every
 * such blob begins with a length-prefixed algorithm string, so this identifies
 * the key type without needing to parse the key material itself.
 *
 * Returns `undefined` when the buffer is too short or the embedded length is
 * not self-consistent, so a malformed blob is rejected rather than producing a
 * garbage type that could be matched against.
 */
export function readHostKeyType(keyBlob: Buffer): string | undefined {
	if (keyBlob.length < 4) {
		return undefined;
	}
	const length = keyBlob.readUInt32BE(0);
	if (length === 0 || length > 64 || 4 + length > keyBlob.length) {
		return undefined;
	}
	return keyBlob.subarray(4, 4 + length).toString('ascii');
}

/**
 * Parse a single line from a `known_hosts` file. Returns `undefined` for blank
 * lines, comments, and anything malformed — a corrupt line should be skipped
 * rather than aborting the whole file, matching OpenSSH's own tolerance.
 */
export function parseKnownHostsLine(line: string): IKnownHostsEntry | undefined {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith('#')) {
		return undefined;
	}

	const fields = trimmed.split(/\s+/);
	let index = 0;

	let marker: 'revoked' | 'cert-authority' | undefined;
	if (fields[index]?.startsWith('@')) {
		const raw = fields[index].substring(1);
		if (raw !== 'revoked' && raw !== 'cert-authority') {
			// An unrecognized marker means we cannot reason about this line at
			// all, so skip it rather than silently treating it as unmarked.
			return undefined;
		}
		marker = raw;
		index++;
	}

	const hostField = fields[index++];
	const keyType = fields[index++];
	const keyBase64 = fields[index++];
	if (!hostField || !keyType || !keyBase64) {
		return undefined;
	}

	let key: Buffer;
	try {
		key = Buffer.from(keyBase64, 'base64');
	} catch {
		return undefined;
	}
	// Guard against base64 that decodes to nothing, and against a blob whose
	// embedded algorithm name disagrees with the line's key type field.
	if (key.length === 0 || readHostKeyType(key) !== keyType) {
		return undefined;
	}

	if (hostField.startsWith('|1|')) {
		const parts = hostField.split('|');
		// Shape is ['', '1', '<salt>', '<hash>'].
		if (parts.length !== 4) {
			return undefined;
		}
		const salt = Buffer.from(parts[2], 'base64');
		const hash = Buffer.from(parts[3], 'base64');
		// HMAC-SHA1 digests are always 20 bytes; anything else is corrupt.
		if (salt.length === 0 || hash.length !== 20) {
			return undefined;
		}
		return { marker, patterns: [], hashedHost: { salt, hash }, keyType, key };
	}

	return { marker, patterns: hostField.split(','), keyType, key };
}

/** Parse the full contents of a `known_hosts` file, skipping malformed lines. */
export function parseKnownHosts(contents: string): IKnownHostsEntry[] {
	const entries: IKnownHostsEntry[] = [];
	for (const line of contents.split('\n')) {
		const entry = parseKnownHostsLine(line);
		if (entry) {
			entries.push(entry);
		}
	}
	return entries;
}

/**
 * Build the host identifiers OpenSSH would look for. A host on the default
 * port is stored bare (`example.com`); any other port uses the bracketed form
 * (`[example.com]:2222`).
 */
function hostCandidates(host: string, port: number): string[] {
	const lower = host.toLowerCase();
	return port === 22 ? [lower] : [`[${lower}]:${port}`];
}

/**
 * Match a host pattern from a `known_hosts` line. Patterns support `*` (any
 * run of characters) and `?` (a single character); everything else is literal.
 */
function matchesPattern(pattern: string, candidate: string): boolean {
	const escaped = pattern.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&');
	const regex = new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
	return regex.test(candidate);
}

/**
 * Whether a non-hashed entry applies to `candidate`. A leading `!` negates a
 * pattern, and a single negation vetoes the whole entry even if another
 * pattern on the same line matches — this mirrors OpenSSH, and getting it
 * backwards would let an explicitly excluded host be silently trusted.
 */
function entryAppliesToCandidate(patterns: readonly string[], candidate: string): boolean {
	let matched = false;
	for (const pattern of patterns) {
		if (pattern.startsWith('!')) {
			if (matchesPattern(pattern.substring(1), candidate)) {
				return false;
			}
		} else if (matchesPattern(pattern, candidate)) {
			matched = true;
		}
	}
	return matched;
}

/**
 * Whether a hashed entry (`|1|<salt>|<hash>`) applies to `candidate`. OpenSSH
 * hashes the host with HMAC-SHA1 keyed by the per-entry salt.
 */
function hashedEntryAppliesToCandidate(hashedHost: { salt: Buffer; hash: Buffer }, candidate: string): boolean {
	const computed = createHmac('sha1', hashedHost.salt).update(candidate).digest();
	return computed.length === hashedHost.hash.length && timingSafeEqual(computed, hashedHost.hash);
}

/** Whether an entry applies to any of the candidate host identifiers. */
function entryApplies(entry: IKnownHostsEntry, candidates: readonly string[]): boolean {
	return candidates.some(candidate => entry.hashedHost
		? hashedEntryAppliesToCandidate(entry.hashedHost, candidate)
		: entryAppliesToCandidate(entry.patterns, candidate));
}

/**
 * Decide what the user's `known_hosts` entries say about a presented host key.
 *
 * Precedence is deliberate and mirrors OpenSSH:
 * 1. `@revoked` wins outright — an explicitly revoked key must never be
 *    trusted, even if an ordinary entry elsewhere also matches it.
 * 2. An exact match on host + key type + key bytes is a `match`.
 * 3. An entry for the same host and key type holding different bytes is a
 *    `mismatch` (the classic host-key-changed warning).
 * 4. Otherwise, if the only applicable entries are `@cert-authority` lines,
 *    report `ca-only` so the caller can explain why it cannot verify.
 */
export function matchKnownHosts(
	entries: readonly IKnownHostsEntry[],
	host: string,
	port: number,
	keyType: string,
	keyBlob: Buffer,
): KnownHostsMatch {
	const candidates = hostCandidates(host, port);
	const applicable = entries.filter(entry => entryApplies(entry, candidates));

	// Revocation is resolved in its own pass, before anything can return a
	// positive result. Folding it into the main loop would make the outcome
	// depend on line order — a revoked key listed after a stale trusted entry
	// for the same host would be accepted.
	if (applicable.some(entry => entry.marker === 'revoked' && entry.key.equals(keyBlob))) {
		return 'revoked';
	}

	let sawSameTypeEntry = false;
	let sawCertAuthority = false;

	for (const entry of applicable) {
		if (entry.marker === 'revoked') {
			continue;
		}

		if (entry.marker === 'cert-authority') {
			sawCertAuthority = true;
			continue;
		}

		if (entry.keyType !== keyType) {
			continue;
		}
		if (entry.key.equals(keyBlob)) {
			return 'match';
		}
		sawSameTypeEntry = true;
	}

	if (sawSameTypeEntry) {
		return 'mismatch';
	}
	return sawCertAuthority ? 'ca-only' : 'unknown';
}
