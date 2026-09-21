/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';

/**
 * Common file extensions that are unlikely to be network domains.
 * Used to filter false positives when extracting domains from freeform text.
 */
const fileExtensionSuffixes = new Set([
	'7z', 'bz2', 'cjs', 'class', 'cpp', 'cs', 'css', 'csv', 'dll', 'exe', 'gif', 'gz', 'ico', 'jar',
	'env', 'java', 'jpeg', 'jpg', 'js', 'json', 'jsx', 'lock', 'log', 'md', 'mjs', 'pdf', 'php', 'png',
	'py', 'rar', 'rs', 'so', 'sql', 'svg', 'tar', 'tgz', 'toml', 'ts', 'tsx', 'txt', 'wasm', 'webp',
	'xml', 'yaml', 'yml', 'zip'
]);

/**
 * Bare host detection is a heuristic used only to prompt before running commands that appear to access the network.
 * Keep this list intentionally conservative and focused on TLDs commonly used for coding-related hosts and services.
 */
const wellKnownDomainSuffixes = new Set([
	'ai', 'cloud', 'com', 'dev', 'io', 'me', 'net', 'org', 'tech'
]);

/**
 * Normalizes and validates a domain string.
 *
 * Strips user info, port, trailing dots, and trailing punctuation.
 * Accepts bare wildcards (`*`) and wildcard prefixes (`*.example.com`).
 *
 * @param value The raw domain string to normalize.
 * @param fromUrl Whether the value was extracted from a URL context (skips file-extension filtering).
 * @returns The normalized domain string, or `undefined` if the input is invalid.
 */
export function normalizeDomain(value: string | undefined, fromUrl: boolean = false): string | undefined {
	if (!value) {
		return undefined;
	}

	const normalized = value.trim().toLowerCase().replace(/^[^@]+@/, '').replace(/:\d+$/, '').replace(/\.+$/, '');
	if (!normalized || normalized.includes('/') || normalized === '.' || normalized === '..') {
		return undefined;
	}

	// Allow a bare wildcard pattern early, before hostname validation.
	if (normalized === '*') {
		return '*';
	}

	if (!/^\*?\.?[a-z0-9.;,)!?:-]+$/.test(normalized)) {
		return undefined;
	}

	// Strip common trailing punctuation that may follow a domain in text, e.g. "example.com,".
	const stripped = normalized.replace(/[),;:!?]+$/, '');
	if (!stripped) {
		return undefined;
	}

	const domainToValidate = stripped.startsWith('*.') ? stripped.slice(2) : stripped;
	if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?))*$/.test(domainToValidate)) {
		return undefined;
	}

	// Support wildcard domain patterns like "*.example.com".
	const hasWildcardPrefix = stripped.startsWith('*.');
	const host = hasWildcardPrefix ? stripped.slice(2) : stripped;
	if (!host) {
		return undefined;
	}

	// Validate that the host part only contains valid hostname characters.
	if (!/^[a-z0-9.-]+$/.test(host)) {
		return undefined;
	}

	// Disallow patterns that look like file names with common extensions, as these are unlikely
	// to be intended as network domains and may be false positives from the regex.
	if (!fromUrl) {
		const lastLabel = host.slice(host.lastIndexOf('.') + 1);
		if (fileExtensionSuffixes.has(lastLabel)) {
			return undefined;
		}
		if (!wellKnownDomainSuffixes.has(lastLabel)) {
			return undefined;
		}
	}

	return hasWildcardPrefix ? `*.${host}` : host;
}

function normalizeUriAuthority(authority: string | undefined): string | undefined {
	if (!authority || /[/?#\\]/.test(authority)) {
		return undefined;
	}

	let hostname: string;
	try {
		const url = new URL(`http://${authority}`);
		if (hasHostLikeCredentials(url)) {
			return undefined;
		}
		hostname = url.hostname.toLowerCase();
	} catch {
		return undefined;
	}

	if (hostname.startsWith('[')) {
		return hostname.endsWith(']') ? hostname : undefined;
	}

	return normalizeDomain(hostname, true);
}

function hasHostLikeCredentials(url: URL): boolean {
	return [url.username, url.password].some(value => {
		if (!value) {
			return false;
		}

		let decoded: string;
		try {
			decoded = decodeURIComponent(value).toLowerCase();
		} catch {
			return true;
		}

		if (decoded.includes('@')) {
			return false;
		}

		return (decoded.includes('.') && normalizeDomain(decoded, true) !== undefined)
			|| normalizeBareIpv6(decoded) !== undefined;
	});
}

function normalizeBareIpv6(value: string): string | undefined {
	if (!value.includes(':') || /[/?#\\@\[\]]/.test(value)) {
		return undefined;
	}
	return normalizeUriAuthority(`[${value}]`);
}

/**
 * Normalizes an administrator allow/deny pattern to the canonical host form used for matching.
 */
export function normalizeDomainPattern(pattern: string): string | undefined {
	const extractedPattern = extractDomainPattern(pattern);

	if (extractedPattern === '*') {
		return extractedPattern;
	}

	if (extractedPattern.startsWith('*.')) {
		const normalizedPattern = normalizeDomain(extractedPattern, true);
		if (!normalizedPattern) {
			return undefined;
		}
		const suffix = normalizedPattern.slice(2);
		return `*.${normalizeUriAuthority(suffix) ?? suffix}`;
	}

	return normalizeBareIpv6(extractedPattern)
		?? normalizeUriAuthority(extractedPattern)
		?? normalizeDomain(extractedPattern, true);
}

function normalizeEmbeddedIpv4(value: string): string | undefined {
	const mappedMatch = /^\[::ffff:(?<high>[0-9a-f]{1,4}):(?<low>[0-9a-f]{1,4})\]$/.exec(value);
	const compatibleMatch = mappedMatch ? undefined : /^\[::(?:(?<high>[0-9a-f]{1,4}):)?(?<low>[0-9a-f]{1,4})\]$/.exec(value);
	const groups = (mappedMatch ?? compatibleMatch)?.groups;
	if (!groups) {
		return undefined;
	}

	const high = Number.parseInt(groups.high ?? '0', 16);
	const low = Number.parseInt(groups.low, 16);
	if (compatibleMatch && high === 0 && low <= 1) {
		return undefined;
	}

	return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

/**
 * Extracts the domain portion from a pattern string.
 * If the pattern contains `://`, it is parsed as a URI and the authority is returned.
 * Otherwise, the trimmed pattern is returned as-is.
 */
export function extractDomainPattern(pattern: string): string {
	const trimmed = pattern.trim();
	if (trimmed === '*') {
		return trimmed;
	}
	if (!trimmed.includes('://')) {
		return trimmed;
	}
	try {
		return URI.parse(trimmed).authority;
	} catch {
		return trimmed;
	}
}

/**
 * Checks whether a normalized domain matches a given allow/deny pattern.
 * Supports exact matches, bare wildcards (`*`), and wildcard prefixes (`*.example.com`).
 *
 * @param domain A normalized domain (output of {@link normalizeDomain}).
 * @param pattern An allow/deny pattern (may be a bare domain, URL, or wildcard).
 * @returns `true` if the domain matches the pattern.
 */
export function matchesDomainPattern(domain: string, pattern: string): boolean {
	const normalizedPattern = normalizeDomainPattern(pattern);
	if (!normalizedPattern) {
		return false;
	}
	if (normalizedPattern === '*') {
		return true;
	}
	if (normalizedPattern.startsWith('*.')) {
		const suffix = normalizedPattern.slice(2);
		const normalizedDomain = normalizeEmbeddedIpv4(domain) ?? domain;
		return normalizedDomain === suffix || normalizedDomain.endsWith(`.${suffix}`);
	}
	return (normalizeEmbeddedIpv4(domain) ?? domain) === (normalizeEmbeddedIpv4(normalizedPattern) ?? normalizedPattern);
}

/**
 * Extracts and normalizes a domain from a URI.
 * Separates user information and ports, and canonicalizes IPv6 literals.
 *
 * @param uri The URI to extract the domain from.
 * @returns The normalized domain, or `undefined` if no valid domain could be extracted.
 */
export function extractDomainFromUri(uri: URI): string | undefined {
	return normalizeUriAuthority(uri.authority);
}

/**
 * Determines whether a domain is allowed based on allow and deny lists.
 *
 * Rules:
 * - If both lists are empty, the domain is denied (restrictive default).
 * - Denied patterns take precedence: if the domain matches any denied pattern, it is blocked.
 * - If only denied patterns are configured (allowed is empty), any non-denied domain is allowed.
 * - If allowed patterns are configured, the domain must match at least one to be allowed.
 *
 * @param domain A normalized domain string.
 * @param allowedPatterns Array of allowed domain patterns.
 * @param deniedPatterns Array of denied domain patterns.
 * @returns `true` if the domain is allowed, `false` if it is blocked.
 */
export function isDomainAllowed(domain: string, allowedPatterns: string[], deniedPatterns: string[]): boolean {
	// Restrictive default: deny all when both lists are empty.
	if (allowedPatterns.length === 0 && deniedPatterns.length === 0) {
		return false;
	}

	// Denied patterns take precedence.
	if (deniedPatterns.some(pattern => matchesDomainPattern(domain, pattern))) {
		return false;
	}

	// If no allowed patterns are configured, allow anything not denied.
	if (allowedPatterns.length === 0) {
		return true;
	}

	// The domain must match at least one allowed pattern.
	return allowedPatterns.some(pattern => matchesDomainPattern(domain, pattern));
}
