/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchesSomeScheme, Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { decodeUnreservedURLPathCharacters, normalizeURLPathSeparators, testUrlMatchesGlob } from './urlGlob.js';

/**
 * Check whether a domain like https://www.microsoft.com matches
 * the list of trusted domains.
 *
 * - Schemes must match
 * - There's no subdomain matching. For example https://microsoft.com doesn't match https://www.microsoft.com
 * - Star matches all subdomains. For example https://*.microsoft.com matches https://www.microsoft.com and https://foo.bar.microsoft.com
 */
export function isURLDomainTrusted(url: URI, trustedDomains: string[]): boolean {
	if (trustedDomains.includes('*')) {
		return true;
	}
	if (!isURLSafeForTrust(url)) {
		return false;
	}
	url = normalizeURLForTrust(url);
	if (!isURLSafeForTrust(url)) {
		return false;
	}

	if (isLocalhostAuthority(url.authority)) {
		return true;
	}

	for (let i = 0; i < trustedDomains.length; i++) {
		if (testUrlMatchesGlob(url, normalizeURLPattern(trustedDomains[i].replace(/\\/g, '/')))) {
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
 * Normalizes a URL for trust comparisons without decoding reserved path escapes.
 */
export function normalizeURLForTrust(url: URI): URI {
	const parsed = normalizeURLPathSeparators(url);
	const hostOffset = parsed.authority.indexOf('@') + 1;
	const authority = parsed.authority.slice(0, hostOffset) + parsed.authority.slice(hostOffset).toLowerCase();
	let path = parsed.path;
	if (authority === 'github.com') {
		path = matchesSomeScheme(parsed, Schemas.http, Schemas.https) ? lowercaseURLPath(path) : path.toLowerCase();
	}
	return parsed.with({ authority, path });
}

function lowercaseURLPath(path: string): string {
	const unreserved = decodeUnreservedURLPathCharacters(path);
	if (!/%[89a-f][0-9a-f]/i.test(unreserved)) {
		return unreserved.toLowerCase();
	}
	// Decode Unicode through URI's graceful decoder without reinterpreting ASCII escape sequences.
	const protectedPath = unreserved.replace(/%[0-7][0-9a-f]/gi, sequence => `%25${sequence.slice(1)}`);
	return URI.parse(`${Schemas.https}://url.invalid${protectedPath}`).path.toLowerCase();
}

/** Serializes a normalized pattern without losing literal escapes when the matcher parses it again. */
export function serializeURLPattern(url: URI): string {
	return url.with({
		authority: url.authority.replace(/%/g, '%25'),
		path: url.path.replace(/%/g, '%25'),
	}).toString(true);
}

/** Normalizes configured patterns while preserving scheme-less glob applicability. */
export function normalizeURLPattern(pattern: string): string {
	const hasScheme = /^[^./:]*:\/\//.test(pattern);
	const prefix = `${Schemas.https}://`;
	const normalized = serializeURLPattern(normalizeURLForTrust(URI.parse(hasScheme ? pattern : prefix + pattern)));
	return hasScheme ? normalized : normalized.slice(prefix.length);
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
