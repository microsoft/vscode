/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isIP } from 'net';
import type { ICookieImportRawRow } from './browserCookieImportReaders.js';

/**
 * Import planning module — decides every cookie's fate BEFORE any jar mutation.
 *
 * This is the STA-4300 two-pass algorithm ported from Orca:
 *   Pass 1: classify each cookie, collect skipped families
 *   Pass 2: re-filter — readable cookies whose family was skipped are suppressed
 *
 * Pure functions only — no I/O, no side effects. The caller uses the plan to
 * drive both the removal scope and the write set from one value, preventing
 * the divergence bugs that caused Orca STA-4090 and STA-4170.
 */

// ---------------------------------------------------------------------------
// Domain normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a cookie domain to a safe lowercase hostname. Returns `null` for
 * domains containing path separators, credentials, ports, or other unsafe
 * characters that could escape the cookie jar's domain scoping.
 *
 * Does NOT depend on the `psl` package — uses `node:net` isIP and the URL
 * parser for validation, which is sufficient for the import use case where
 * we only need to reject clearly unsafe inputs, not resolve public suffixes.
 */
export function normalizeCookieDomain(domain: string): string | null {
	const candidate = domain.trim().replace(/^\.+/, '');
	const isBracketedIpv6 = candidate.startsWith('[') && candidate.endsWith(']');
	if (!candidate || /[/\\@?#%]/.test(candidate) || (!isBracketedIpv6 && candidate.includes(':'))) {
		return null;
	}
	try {
		const parsed = new URL(`https://${candidate}/`);
		const normalized = parsed.hostname.toLowerCase();
		if (
			parsed.username ||
			parsed.password ||
			parsed.port ||
			parsed.pathname !== '/' ||
			parsed.search ||
			parsed.hash ||
			normalized.endsWith('.') ||
			normalized.includes('..')
		) {
			return null;
		}
		return normalized;
	} catch {
		return null;
	}
}

/**
 * Validates a domain for import eligibility. Stricter than `normalizeCookieDomain`:
 * rejects bare public suffixes (e.g. `com`, `co.uk`) that would scope cookies
 * too broadly. Without `psl`, we use a heuristic: domains with <=1 dot after
 * normalization are treated as potential public suffixes and rejected unless
 * they're IP addresses.
 */
export function normalizeCookieImportDomain(domain: string): string | null {
	const normalized = normalizeCookieDomain(domain);
	if (!normalized) {
		return null;
	}
	// IP addresses are always valid import domains.
	if (isIP(normalized)) {
		return normalized;
	}
	// Bracketed IPv6.
	if (normalized.startsWith('[') && normalized.endsWith(']') && isIP(normalized.slice(1, -1)) === 6) {
		return normalized;
	}
	// Reject single-label domains (e.g. "localhost" is fine but "com" is not).
	// Heuristic: require at least one dot for non-IP domains.
	if (!normalized.includes('.')) {
		// Allow "localhost" explicitly.
		return normalized === 'localhost' ? normalized : null;
	}
	return normalized;
}

// ---------------------------------------------------------------------------
// Registrable family
// ---------------------------------------------------------------------------

/**
 * Computes the registrable domain family for a cookie domain. Used by the
 * family-atomic skip algorithm: when one cookie in a family has an unreadable
 * partition, the entire family is skipped to prevent partial removal.
 *
 * Without `psl`, this returns the last two labels for multi-label domains
 * (a reasonable approximation for most TLDs) or the full hostname for IPs
 * and single-label domains. This is intentionally conservative — it may
 * group subdomains more aggressively than `psl` would, which means MORE
 * cookies get skipped (safer) rather than fewer.
 */
export function registrableFamily(domain: string): string | null {
	const host = normalizeCookieDomain(domain);
	if (!host) {
		return null;
	}
	if (isIP(host)) {
		return host;
	}
	if (host.startsWith('[') && host.endsWith(']') && isIP(host.slice(1, -1)) === 6) {
		return host;
	}
	const labels = host.split('.');
	if (labels.length <= 2) {
		// Single-label or two-label domain — the whole thing is the family.
		// For "example.com" this returns "example.com".
		// For "com" this returns "com" — but normalizeCookieImportDomain
		// already rejected bare public suffixes upstream.
		return host;
	}
	// Multi-label: return last two labels as the registrable domain.
	// "sub.example.com" → "example.com"
	// "sub.example.co.uk" → "co.uk" (conservative — groups more aggressively)
	return labels.slice(-2).join('.');
}

// ---------------------------------------------------------------------------
// Non-transplantable domains
// ---------------------------------------------------------------------------

/**
 * Domains whose sessions are device-bound server-side. Transplanted cookies
 * are rejected (or expired within ~1h) regardless of how faithfully they're
 * copied. Importing these replaces a working sign-in with a broken one.
 *
 * YouTube is deliberately NOT listed — it accepts transplanted sessions.
 */
const NON_TRANSPLANTABLE_DOMAINS = ['google.com'] as const;

export function isNonTransplantableCookieDomain(domain: string): boolean {
	const normalized = normalizeCookieDomain(domain);
	if (!normalized) {
		return false;
	}
	return NON_TRANSPLANTABLE_DOMAINS.some(
		(root) => normalized === root || normalized.endsWith(`.${root}`)
	);
}

/**
 * Google source-bound cookies that rotate per-session and are bound to the
 * originating browser. Always skipped even when google.com isn't excluded.
 */
const GOOGLE_SOURCE_BOUND_COOKIE_NAMES = new Set([
	'SIDCC',
	'__Secure-1PSIDCC',
	'__Secure-3PSIDCC',
	'__Secure-STRP',
	'AEC'
]);

export function isGoogleSourceBoundCookie(name: string, domain: string): boolean {
	if (!GOOGLE_SOURCE_BOUND_COOKIE_NAMES.has(name)) {
		return false;
	}
	const normalized = normalizeCookieDomain(domain);
	return normalized === 'google.com' || normalized?.endsWith('.google.com') === true;
}

// ---------------------------------------------------------------------------
// Partition fidelity
// ---------------------------------------------------------------------------

/**
 * Partition identity read from a source cookie row. The planner uses this to
 * decide whether a cookie can be written faithfully.
 */
export type SourcePartitionRead =
	| { readonly status: 'unpartitioned' }
	| { readonly status: 'partitioned'; readonly topLevelSite: string; readonly hasCrossSiteAncestor: boolean }
	| { readonly status: 'unreadable'; readonly reason: string };

/**
 * Reads a Chromium cookie row's partition identity from the raw fields
 * produced by the reader module.
 */
export function readChromiumPartition(row: ICookieImportRawRow): SourcePartitionRead {
	if (!row.partitionSite) {
		return { status: 'unpartitioned' };
	}
	try {
		const site = new URL(row.partitionSite);
		if (
			(site.protocol !== 'http:' && site.protocol !== 'https:') ||
			!site.hostname ||
			site.username || site.password || site.port ||
			site.pathname !== '/' || site.search || site.hash
		) {
			return { status: 'unreadable', reason: 'partition site was not a valid schemeful site' };
		}
	} catch {
		return { status: 'unreadable', reason: 'partition site was not a valid URL' };
	}
	if (row.hasCrossSiteAncestor === null) {
		return { status: 'unreadable', reason: 'source schema has no cross-site-ancestor column for a partitioned cookie' };
	}
	return {
		status: 'partitioned',
		topLevelSite: row.partitionSite,
		hasCrossSiteAncestor: row.hasCrossSiteAncestor
	};
}

/**
 * Reads a Firefox cookie row's partition identity. Firefox's
 * `isPartitionedAttributeSet` signals the server-declared CHIPS attribute
 * but lacks the cross-site ancestor bit, making faithful import impossible.
 */
export function readFirefoxPartition(row: ICookieImportRawRow): SourcePartitionRead {
	if (row.firefoxPartitionedAttribute === null || row.firefoxPartitionedAttribute === false) {
		return { status: 'unpartitioned' };
	}
	return { status: 'unreadable', reason: 'Firefox partitioned-attribute cookie has no cross-site-ancestor bit to read' };
}

// ---------------------------------------------------------------------------
// Two-pass import planner
// ---------------------------------------------------------------------------

export interface IImportWritePlanItem {
	readonly row: ICookieImportRawRow;
	readonly partition: SourcePartitionRead;
}

export interface IImportSkipItem {
	readonly row: ICookieImportRawRow;
	readonly reason: string;
}

export interface IImportWritePlan {
	readonly writes: readonly IImportWritePlanItem[];
	readonly skips: readonly IImportSkipItem[];
	readonly skippedFamilies: ReadonlySet<string>;
	/** True when a skipped cookie's family cannot be named — the caller MUST refuse the import. */
	readonly hasUnrepresentableSkip: boolean;
}

/**
 * Decides every source cookie's fate before any jar mutation.
 *
 * Two passes:
 *   1. Classify each cookie. Unreadable partitions → collect skipped families.
 *   2. Re-filter provisional writes. A readable cookie whose family was
 *      skipped is also suppressed — otherwise the removal scope would widen
 *      past the write set.
 *
 * Pure — no I/O. The caller cannot mutate anything before the plan exists.
 */
export function planImportWrites(rows: readonly ICookieImportRawRow[]): IImportWritePlan {
	const provisional: IImportWritePlanItem[] = [];
	const skips: IImportSkipItem[] = [];
	const skippedFamilies = new Set<string>();
	let hasUnrepresentableSkip = false;

	// Pass 1: classify and collect skipped families.
	for (const row of rows) {
		// Filter out non-transplantable and source-bound cookies early.
		if (isGoogleSourceBoundCookie(row.name, row.domain)) {
			skips.push({ row, reason: 'google-source-bound' });
			continue;
		}
		if (isNonTransplantableCookieDomain(row.domain)) {
			skips.push({ row, reason: 'non-transplantable-domain' });
			continue;
		}
		// Validate domain.
		if (!normalizeCookieImportDomain(row.domain)) {
			skips.push({ row, reason: 'unsafe-domain' });
			continue;
		}
		// Skip cookies that failed decryption.
		if (row.decryptOutcome !== 'ok') {
			skips.push({ row, reason: `decrypt-${row.decryptOutcome}` });
			continue;
		}

		const partition = readChromiumPartition(row);
		if (partition.status === 'unreadable') {
			const family = registrableFamily(row.domain);
			if (family === null) {
				hasUnrepresentableSkip = true;
			} else {
				skippedFamilies.add(family);
			}
			skips.push({ row, reason: partition.reason });
			continue;
		}

		provisional.push({ row, partition });
	}

	// Pass 2: suppress readable cookies whose family was skipped.
	const writes: IImportWritePlanItem[] = [];
	for (const item of provisional) {
		const family = registrableFamily(item.row.domain);
		if (family !== null && skippedFamilies.has(family)) {
			skips.push({ row: item.row, reason: 'family-partition-unreadable' });
			continue;
		}
		writes.push(item);
	}

	return { writes, skips, skippedFamilies, hasUnrepresentableSkip };
}
