/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/**
 * CSRF protection for extension URI handlers.
 *
 * A registered URI handler is reachable from any website via `vscode://publisher.ext/...`, and
 * VS Code cannot tell a browser-initiated deeplink from a locally-initiated one. The only way to
 * *prove* a link came from a local process is to require it to read an on-disk secret that the web
 * cannot access.
 *
 * A legitimate local tool reads the secret and signs the deeplink's query parameters with
 * HMAC-SHA256, carrying the signature in the reserved {@link CSRF_TOKEN_PARAM} parameter. The
 * secret itself never travels in the URL. VS Code recomputes the HMAC over the received parameters
 * and rejects any link whose signature does not match.
 *
 * Properties:
 * - **Web-CSRF safe** — a browser has no filesystem access, so it cannot read the secret or forge a token.
 * - **Secret stays off the wire** — only the HMAC is transmitted, so logged URIs do not leak the secret.
 * - **Tamper-evident** — the token is bound to the exact parameters; changing any one invalidates it.
 *
 * NOT provided by this scheme:
 * - **Replay resistance** — a captured valid link can be replayed *verbatim*; the token carries no
 *   freshness (nonce/timestamp). Adding that would require the signer to include a fresh value and
 *   VS Code to track/expire it. See the proposal doc for the trade-offs.
 */

/**
 * Reserved query parameter carrying the HMAC token. Extensions may not define this parameter; it
 * is excluded from signature computation, stripped before `handleUri`, and redacted from logs.
 */
export const CSRF_TOKEN_PARAM = 'vscode-csrf-token';

interface IQueryParam {
	readonly key: string;
	readonly value: string;
}

/**
 * Parse a raw URI query string (the part after `?`, as found in {@link URI.query}) into decoded
 * key/value pairs. Values are percent-decoded with {@link decodeURIComponent} — the same encoding
 * the shipped signing helper uses. (`+` is NOT treated as a space; signers must percent-encode.)
 */
function parseQuery(query: string): IQueryParam[] {
	const params: IQueryParam[] = [];
	if (!query) {
		return params;
	}
	for (const part of query.split('&')) {
		if (!part) {
			continue;
		}
		const eq = part.indexOf('=');
		const rawKey = eq === -1 ? part : part.slice(0, eq);
		const rawValue = eq === -1 ? '' : part.slice(eq + 1);
		params.push({ key: safeDecode(rawKey), value: safeDecode(rawValue) });
	}
	return params;
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		// Malformed percent-encoding — fall back to the raw value so a broken param can never
		// accidentally collide with the reserved token name or silently match a signature.
		return value;
	}
}

/**
 * Canonical form that both the signer and verifier must agree on, byte for byte:
 *   1. decode the path and params (so transit re-encoding does not matter);
 *   2. drop the reserved {@link CSRF_TOKEN_PARAM};
 *   3. sort the params lexicographically by decoded key then value (so transit reordering does not matter);
 *   4. line 0 is `encodeURIComponent(path)` (binds the token to the route); then one line per param,
 *      `encodeURIComponent(key)=encodeURIComponent(value)`; all `\n`-separated.
 *
 * Encoding **every** component is what makes the serialization injective: an encoded token can never
 * contain a raw `=`, `&`, or `\n`, so no key or value can be crafted to collide with the line/field
 * delimiters or the path line. Together with the sort and the decode, distinct `(path, params)`
 * inputs always map to distinct messages, while pure reordering or re-encoding in transit does not —
 * but changing any actual path, key, or value invalidates the token.
 */
export function canonicalize(path: string, query: string): string {
	const params = parseQuery(query).filter(p => p.key !== CSRF_TOKEN_PARAM);
	params.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : a.value < b.value ? -1 : a.value > b.value ? 1 : 0);
	return [encodeURIComponent(path), ...params.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)].join('\n');
}

/** Extract the claimed token, or `undefined` if the reserved parameter is absent. */
export function extractToken(query: string): string | undefined {
	for (const param of parseQuery(query)) {
		if (param.key === CSRF_TOKEN_PARAM) {
			return param.value;
		}
	}
	return undefined;
}

/** Return a copy of `uri` with the reserved token parameter removed, for handing to `handleUri`. */
export function stripCsrfToken(uri: URI): URI {
	if (!uri.query) {
		return uri;
	}
	const kept = uri.query.split('&').filter(part => {
		if (!part) {
			return false;
		}
		const eq = part.indexOf('=');
		const rawKey = eq === -1 ? part : part.slice(0, eq);
		return safeDecode(rawKey) !== CSRF_TOKEN_PARAM;
	});
	return uri.with({ query: kept.join('&') });
}

function toHex(bytes: Uint8Array): string {
	let out = '';
	for (let i = 0; i < bytes.length; i++) {
		out += bytes[i].toString(16).padStart(2, '0');
	}
	return out;
}

/** Compute the expected hex-encoded HMAC-SHA256 token for a route path, query string, and secret. */
export async function computeToken(secret: Uint8Array, path: string, query: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', secret as unknown as ArrayBufferView<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const message = new TextEncoder().encode(canonicalize(path, query));
	const signature = await crypto.subtle.sign('HMAC', key, message as unknown as ArrayBufferView<ArrayBuffer>);
	return toHex(new Uint8Array(signature));
}

/**
 * Constant-time string comparison. Runs in time proportional to the longer input and does not
 * short-circuit on the first differing byte, so it does not leak match length via timing.
 */
export function timingSafeEqual(a: string, b: string): boolean {
	const aBytes = new TextEncoder().encode(a);
	const bBytes = new TextEncoder().encode(b);
	const len = Math.max(aBytes.length, bBytes.length);
	let diff = aBytes.length ^ bBytes.length;
	for (let i = 0; i < len; i++) {
		diff |= (i < aBytes.length ? aBytes[i] : 0) ^ (i < bBytes.length ? bBytes[i] : 0);
	}
	return diff === 0;
}

export const enum CsrfRejectionReason {
	/** No `vscode-csrf-token` parameter was present. */
	Missing = 'missing',
	/** The secret could not be safely obtained (no local fs, or unsafe file permissions). */
	NoSecret = 'no-secret',
	/** A token was present but did not match the expected HMAC. */
	Mismatch = 'mismatch',
}

export type CsrfVerifyResult = { readonly ok: true } | { readonly ok: false; readonly reason: CsrfRejectionReason };

/**
 * Verify a URI's CSRF token against a secret, binding the signature to the route `path`. `secret` is
 * `undefined` when the secret could not be safely obtained — in which case verification fails closed.
 */
export async function verifyCsrfToken(secret: Uint8Array | undefined, path: string, query: string): Promise<CsrfVerifyResult> {
	const claimed = extractToken(query);
	if (claimed === undefined) {
		return { ok: false, reason: CsrfRejectionReason.Missing };
	}
	if (!secret) {
		return { ok: false, reason: CsrfRejectionReason.NoSecret };
	}
	const expected = await computeToken(secret, path, query);
	return timingSafeEqual(expected, claimed) ? { ok: true } : { ok: false, reason: CsrfRejectionReason.Mismatch };
}
