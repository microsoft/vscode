/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { isURLSafeForTrust, normalizeURLForTrust, normalizeURLPattern, serializeURLPattern } from '../../../../../../platform/url/common/trustedDomains.js';
import { testUrlMatchesGlob } from '../../../../../../platform/url/common/urlGlob.js';

/**
 * Approval settings for a URL pattern
 */
export interface IUrlApprovalSettings {
	approveRequest?: boolean;
	approveResponse?: boolean;
}

function getUrlApprovalValue(settings: boolean | IUrlApprovalSettings, checkRequest: boolean): boolean | undefined {
	if (typeof settings === 'boolean') {
		return settings;
	}
	return checkRequest ? settings.approveRequest : settings.approveResponse;
}

function normalizeSafeURL(url: URI): URI | undefined {
	if (!isURLSafeForTrust(url)) {
		return undefined;
	}
	const normalized = normalizeURLForTrust(url);
	return isURLSafeForTrust(normalized) ? normalized : undefined;
}

/**
 * Extracts domain patterns from a URL for use in approval actions
 * @param url The URL to extract patterns from
 * @returns An array of patterns in order of specificity (most specific first)
 */
export function extractUrlPatterns(url: URI): string[] {
	const normalized = normalizeSafeURL(url);
	if (!normalized) {
		return [];
	}

	const patterns = new Set<string>();

	// Full URL (most specific)
	const fullUrl = serializeURLPattern(normalized);
	patterns.add(fullUrl);

	// Domain-only pattern (without trailing slash)
	const domainOnly = serializeURLPattern(normalized.with({ path: '', query: '', fragment: '' }));
	patterns.add(domainOnly);

	// Wildcard subdomain pattern (*.example.com)
	const authority = normalized.authority;
	const domainParts = authority.split('.');

	// Only add wildcard subdomain if there are at least 2 parts and it's not an IP
	const isIPv4 = domainParts.length === 4 && domainParts.every((segment: string) =>
		Number.isInteger(+segment));
	const isIPv6 = authority.includes(':') && authority.match(/^(\[)?[0-9a-fA-F:]+(\])?(?::\d+)?$/);
	const isIP = isIPv4 || isIPv6;

	// Only emit subdomain patterns if there are actually subdomains (more than 2 parts)
	if (!isIP && domainParts.length > 2) {
		// Create patterns by replacing each subdomain segment with *
		// For example, foo.bar.example.com -> *.bar.example.com, *.example.com
		for (let i = 0; i < domainParts.length - 2; i++) {
			const wildcardAuthority = '*.' + domainParts.slice(i + 1).join('.');
			const wildcardPattern = serializeURLPattern(normalized.with({
				authority: wildcardAuthority,
				path: '',
				query: '',
				fragment: ''
			}));
			patterns.add(wildcardPattern);
		}
	}

	// Path patterns (if there's a non-trivial path)
	const pathSegments = normalized.path.split('/').filter((s: string) => s.length > 0);
	if (pathSegments.length > 0) {
		// Add patterns for each path level with wildcard
		for (let i = pathSegments.length - 1; i >= 0; i--) {
			const pathPattern = pathSegments.slice(0, i).join('/');
			const urlWithPathPattern = serializeURLPattern(normalized.with({
				path: (i > 0 ? '/' : '') + pathPattern,
				query: '',
				fragment: ''
			}));
			patterns.add(urlWithPathPattern);
		}
	}

	return [...patterns].map(p => p.replace(/\/+$/, ''));
}

/**
 * Generates user-friendly labels for URL patterns to show in quick pick
 * @param url The original URL
 * @param pattern The serialized URI pattern to generate a label for
 * @returns A user-friendly label describing what the pattern matches (without protocol)
 */
export function getPatternLabel(url: URI, pattern: string): string {
	let displayPattern = URI.parse(pattern).toString(true);

	if (displayPattern.startsWith('https://')) {
		displayPattern = displayPattern.substring(8);
	} else if (displayPattern.startsWith('http://')) {
		displayPattern = displayPattern.substring(7);
	}

	return displayPattern.replace(/\/+$/, ''); // Remove trailing slashes
}

/**
 * Checks if a URL matches any approved pattern
 * @param url The URL to check
 * @param approvedUrls Map of approved URL patterns to their settings
 * @param checkRequest Whether to check request approval (true) or response approval (false)
 * @returns true if the URL is approved for the specified action
 */
export function isUrlApproved(
	url: URI,
	approvedUrls: Record<string, boolean | IUrlApprovalSettings>,
	checkRequest: boolean
): boolean {
	const normalizedUrl = normalizeSafeURL(url);
	if (!normalizedUrl) {
		const settings = approvedUrls['*'];
		return settings === undefined ? false : getUrlApprovalValue(settings, checkRequest) ?? false;
	}

	for (const [pattern, settings] of Object.entries(approvedUrls)) {
		// Check if URL matches this pattern
		if (testUrlMatchesGlob(normalizedUrl, normalizeURLPattern(pattern))) {
			const value = getUrlApprovalValue(settings, checkRequest);
			if (value !== undefined) {
				return value;
			}
		}
	}

	return false;
}

/**
 * Gets the most specific matching pattern for a URL
 * @param url The URL to find a matching pattern for
 * @param approvedUrls Map of approved URL patterns
 * @returns The most specific matching pattern, or undefined if none match
 */
export function getMatchingPattern(
	url: URI,
	approvedUrls: Record<string, boolean | IUrlApprovalSettings>
): string | undefined {
	const normalizedUrl = normalizeSafeURL(url);
	if (!normalizedUrl) {
		return Object.keys(approvedUrls).includes('*') ? '*' : undefined;
	}

	const patterns = extractUrlPatterns(url);

	// Check patterns in order of specificity (most specific first)
	for (const pattern of patterns) {
		for (const approvedPattern of Object.keys(approvedUrls)) {
			const normalizedPattern = normalizeURLPattern(approvedPattern);
			if (testUrlMatchesGlob(normalizedUrl, normalizedPattern) && testUrlMatchesGlob(URI.parse(pattern), normalizedPattern)) {
				return approvedPattern;
			}
		}
	}

	return undefined;
}
