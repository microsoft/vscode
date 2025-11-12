/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { normalizeURL } from '../../url/common/trustedDomains.js';
import { testUrlMatchesGlob } from '../../url/common/urlGlob.js';

/**
 * Approval settings for a URL pattern
 */
export interface IUrlApprovalSettings {
	approveRequest?: boolean;
	approveResponse?: boolean;
}

/**
 * Extracts domain patterns from a URL for use in approval actions
 * @param url The URL to extract patterns from
 * @returns An array of patterns in order of specificity (most specific first)
 */
export function extractUrlPatterns(url: URI): string[] {
	const normalizedStr = normalizeURL(url);
	const normalized = URI.parse(normalizedStr);
	const patterns = new Set<string>();

	// Full URL (most specific)
	const fullUrl = normalized.toString(true);
	patterns.add(fullUrl);

	// Domain-only pattern (without trailing slash)
	const domainOnly = normalized.with({ path: '', query: '', fragment: '' }).toString(true);
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
			const wildcardPattern = normalized.with({
				authority: wildcardAuthority,
				path: '',
				query: '',
				fragment: ''
			}).toString(true);
			patterns.add(wildcardPattern);
		}
	}

	// Path patterns (if there's a non-trivial path)
	const pathSegments = normalized.path.split('/').filter((s: string) => s.length > 0);
	if (pathSegments.length > 0) {
		// Add patterns for each path level with wildcard
		for (let i = pathSegments.length - 1; i >= 0; i--) {
			const pathPattern = pathSegments.slice(0, i).join('/');
			const urlWithPathPattern = normalized.with({
				path: (i > 0 ? '/' : '') + pathPattern,
				query: '',
				fragment: ''
			}).toString(true);
			patterns.add(urlWithPathPattern);
		}
	}

	return [...patterns].map(p => p.replace(/\/+$/, ''));
}

/**
 * Generates user-friendly labels for URL patterns to show in quick pick
 * @param url The original URL
 * @param pattern The pattern to generate a label for
 * @returns A user-friendly label describing what the pattern matches (without protocol)
 */
export function getPatternLabel(url: URI, pattern: string): string {
	let displayPattern = pattern;

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
	const normalizedUrlStr = normalizeURL(url);
	const normalizedUrl = URI.parse(normalizedUrlStr);

	for (const [pattern, settings] of Object.entries(approvedUrls)) {
		// Check if URL matches this pattern
		if (testUrlMatchesGlob(normalizedUrl, pattern)) {
			// Handle boolean settings
			if (typeof settings === 'boolean') {
				return settings;
			}

			// Handle granular settings
			if (checkRequest && settings.approveRequest !== undefined) {
				return settings.approveRequest;
			}

			if (!checkRequest && settings.approveResponse !== undefined) {
				return settings.approveResponse;
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
	const normalizedUrlStr = normalizeURL(url);
	const normalizedUrl = URI.parse(normalizedUrlStr);
	const patterns = extractUrlPatterns(url);

	// Check patterns in order of specificity (most specific first)
	for (const pattern of patterns) {
		for (const approvedPattern of Object.keys(approvedUrls)) {
			if (testUrlMatchesGlob(normalizedUrl, approvedPattern) && testUrlMatchesGlob(URI.parse(pattern), approvedPattern)) {
				return approvedPattern;
			}
		}
	}

	return undefined;
}
