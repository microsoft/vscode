/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dns from 'node:dns/promises';

/**
 * Shared helpers for `@url` mention resolution and the `fetch_url` builtin
 * tool. We pin a single implementation here so the two paths (LLM-initiated
 * tool call and user-initiated chip) use identical capping, redaction, and
 * HTML-stripping behaviour.
 */

const MAX_URL_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'SonOfAnton/0.1';

const BLOCKED_HOSTNAMES = new Set([
	'localhost',
	'metadata.google.internal',
	'metadata',
]);

/**
 * Returns true if `addr` is a loopback, private, link-local, or known
 * cloud-metadata IP. Blocks SSRF against the AWS / GCP / Azure instance
 * metadata service (169.254.169.254) and prevents the agent from reading
 * services bound to localhost when running in a CI / cloud sandbox.
 */
function isBlockedAddress(addr: string): boolean {
	if (!addr) return true;
	// IPv6
	if (addr.includes(':')) {
		const lower = addr.toLowerCase();
		if (lower === '::1' || lower === '::') return true;
		if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
		if (lower.startsWith('::ffff:')) {
			return isBlockedAddress(lower.slice(7));
		}
		return false;
	}
	const parts = addr.split('.').map(p => Number(p));
	if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true;
	const [a, b] = parts;
	if (a === 127) return true;                                 // 127.0.0.0/8 loopback
	if (a === 10) return true;                                  // 10.0.0.0/8 private
	if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16.0.0/12 private
	if (a === 192 && b === 168) return true;                    // 192.168.0.0/16 private
	if (a === 169 && b === 254) return true;                    // 169.254.0.0/16 link-local + cloud metadata
	if (a === 0) return true;                                   // 0.0.0.0/8
	return false;
}

/** Outcome of a URL fetch + plain-text conversion. */
export interface FetchResult {
	readonly ok: boolean;
	readonly text?: string;
	readonly error?: string;
}

/**
 * Fetch an HTTP/HTTPS URL, strip its HTML to plain text, and cap at
 * {@link MAX_URL_BYTES}. Rejects non-http(s) schemes (file://, data:, etc.)
 * up front so an attacker-controlled prompt can't smuggle a local file read
 * into the tool. Network errors and non-2xx responses are surfaced as
 * `{ ok: false, error }` rather than thrown — callers render the error
 * verbatim into the prompt so the model sees a structured failure marker.
 */
export async function fetchUrlAsText(url: string): Promise<FetchResult> {
	if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
		return { ok: false, error: 'URL must start with http:// or https://' };
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, error: 'Malformed URL' };
	}
	const hostname = parsed.hostname.toLowerCase();
	if (BLOCKED_HOSTNAMES.has(hostname)) {
		return { ok: false, error: 'URL resolves to a blocked private/loopback/metadata address' };
	}
	// Resolve DNS — covers cases where attacker-controlled prompts use a
	// hostname that resolves to a private IP (e.g. `evil.com` → `169.254.169.254`
	// via a DNS rebinding setup).
	try {
		const addrs = await dns.lookup(hostname, { all: true });
		if (addrs.some(a => isBlockedAddress(a.address))) {
			return { ok: false, error: 'URL resolves to a blocked private/loopback/metadata address' };
		}
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `DNS lookup failed: ${reason}` };
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': USER_AGENT },
			signal: controller.signal,
		});
		if (!res.ok) {
			return { ok: false, error: `HTTP ${res.status} ${res.statusText}`.trim() };
		}
		const raw = await res.text();
		const stripped = stripHtml(raw);
		const capped = stripped.length > MAX_URL_BYTES
			? stripped.slice(0, MAX_URL_BYTES) + '\n\n[truncated — content longer than 64KB]'
			: stripped;
		return { ok: true, text: capped };
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		return { ok: false, error: reason };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Best-effort HTML → plain-text stripper. Removes `<script>` / `<style>`
 * bodies (so JS source and CSS rules don't pollute the prompt), then
 * strips remaining tags, decodes the most common entities, and collapses
 * whitespace. Not a sanitizer — a denoiser. Suitable for feeding the
 * resulting text to an LLM but never for re-rendering as HTML.
 */
export function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

/** Maximum bytes a fetched URL contributes to the prompt. Exported for tests. */
export const URL_FETCH_BYTE_CAP = MAX_URL_BYTES;
