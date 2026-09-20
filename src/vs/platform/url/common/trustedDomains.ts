/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { normalizeURLPathSeparators, testUrlMatchesGlob } from './urlGlob.js';

/**
 * Check whether a domain like https://www.microsoft.com matches
 * the list of trusted domains.
 *
 * - Schemes must match
 * - There's no subdomain matching. For example https://microsoft.com doesn't match https://www.microsoft.com
 * - Star matches all subdomains. For example https://*.microsoft.com matches https://www.microsoft.com and https://foo.bar.microsoft.com
 */
export function isURLDomainTrusted(url: URI, trustedDomains: string[]): boolean {
	trustedDomains = trustedDomains.map(domain => normalizeURL(domain.replace(/\\/g, '/')));
	if (!isURLSafeForTrust(url) && !trustedDomains.includes('*')) {
		return false;
	}
	url = normalizeURLForTrust(url);

	if (isLocalhostAuthority(url.authority)) {
		return true;
	}

	for (let i = 0; i < trustedDomains.length; i++) {
		if (trustedDomains[i] === '*') {
			return true;
		}

		if (testUrlMatchesGlob(url, trustedDomains[i])) {
			return true;
		}
	}

	return false;
}

/**
 * Returns whether a URL has an authority that can be safely used for trust decisions.
 */
export function isURLSafeForTrust(url: URI): boolean {
	return url.authority.length > 0 && !hasURLUserInformation(url);
}

/**
 * Returns whether a URL authority contains user information.
 */
export function hasURLUserInformation(url: URI): boolean {
	return url.authority.includes('@');
}

/**
 * Normalizes effective HTTP(S) paths and case-insensitive paths, such as GitHub paths.
 */
export function normalizeURL(url: string | URI): string {
	try {
		return normalizeURLForTrust(typeof url === 'string' ? URI.parse(url, true) : url).toString(true);
	} catch { return url.toString(); }
}

/**
 * Normalizes a URL for trust matching without decoding its components again.
 */
export function normalizeURLForTrust(url: URI): URI {
	const parsed = normalizeURLPathSeparators(url);
	const hostOffset = parsed.authority.indexOf('@') + 1;
	const authority = parsed.authority.slice(0, hostOffset) + parsed.authority.slice(hostOffset).toLowerCase();
	return parsed.with({ authority, path: authority === 'github.com' ? parsed.path.toLowerCase() : parsed.path });
}

const rLocalhost = /^(.+\.)?localhost(:\d+)?$/i;
const r127 = /^127\.0\.0\.1(:\d+)?$/;
const rIPv6Localhost = /^(\[::1\]|\[0:0:0:0:0:0:0:1\])(:\d+)?$/;

export function isLocalhostAuthority(authority: string) {
	return rLocalhost.test(authority) || r127.test(authority) || rIPv6Localhost.test(authority);
}

const r0000 = /^0\.0\.0\.0(:\d+)?$/;
const rIPv6AllInterfaces = /^(\[::\]|\[0:0:0:0:0:0:0:0\])(:\d+)?$/;

export function isAllInterfacesAuthority(authority: string) {
	return r0000.test(authority) || rIPv6AllInterfaces.test(authority);
}
