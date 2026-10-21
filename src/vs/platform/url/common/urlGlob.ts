/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchesSomeScheme, Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';

function normalizeURLAuthorityAndPath(url: URI): URI {
	if (!matchesSomeScheme(url, Schemas.http, Schemas.https)) {
		return url;
	}

	if (!/[\\/\t\r\n]/.test(url.authority)) {
		return url;
	}

	const serialized = url.with({ query: null, fragment: null }).toString(true).replace(/[\t\r\n]/g, '');
	const authorityAndPath = serialized.slice(url.scheme.length + 3).replace(/\\/g, '/').replace(/^\/+/, '');
	const separator = authorityAndPath.indexOf('/');
	return url.with({
		authority: separator < 0 ? authorityAndPath : authorityAndPath.slice(0, separator),
		path: separator < 0 ? '' : authorityAndPath.slice(separator),
	});
}

/**
 * Normalizes effective HTTP(S) authority and path separators and dot segments without changing query or fragment contents.
 */
export function normalizeURLPathSeparators(url: URI): URI {
	if (!url.authority || !matchesSomeScheme(url, Schemas.http, Schemas.https)) {
		return url;
	}

	const normalized = normalizeURLAuthorityAndPath(url);
	if (!normalized.authority) {
		return normalized;
	}
	// A fixed authority preserves glob syntax such as wildcard hosts and ports.
	const path = new URL(normalized.with({ authority: 'url.invalid' }).toString(true)).pathname;
	return normalized.with({ path });
}

/**
 * Removes trailing slashes, queries and fragments, optionally resolving HTTP(S) paths.
 */
function normalizeURL(url: string | URI, resolvePath = false): URI {
	const uri = normalizeURLAuthorityAndPath(typeof url === 'string' ? URI.parse(url) : url);
	let path = uri.path;
	if (resolvePath && matchesSomeScheme(uri, Schemas.http, Schemas.https)) {
		// Apply browser preprocessing without reparsing the authority or decoding percent escapes again.
		const pathUrl = new URL(`${Schemas.http}://localhost`);
		pathUrl.pathname = encodeURI(path.toWellFormed().replace(/[\t\n\r]/g, '').replace(/\\/g, '/'));
		path = URI.parse(pathUrl.href).path;
	}

	return uri.with({
		// Remove trailing slashes
		path: path.replace(/\/+$/, ''),
		// Remove query and fragment
		query: null,
		fragment: null,
	});
}

function encodeURLPathForMatching(url: URI): string {
	if (!matchesSomeScheme(url, Schemas.http, Schemas.https)) {
		return url.path;
	}

	// Encode decoded path characters without decoding or double-encoding existing escapes.
	return decodeUnreservedURLPathCharacters(encodeURI(url.path.toWellFormed())
		.replace(/%25/g, '%')
		.replace(/[?#]/g, character => encodeURIComponent(character)));
}

/** Decodes unreserved path characters once, preserving reserved escapes and literal percent signs. */
export function decodeUnreservedURLPathCharacters(path: string): string {
	return path.replace(/%[0-9a-f]{2}/gi, sequence => {
		const character = String.fromCharCode(parseInt(sequence.slice(1), 16));
		return /[A-Za-z0-9._~-]/.test(character) ? character : sequence.toUpperCase();
	});
}

/**
 * Checks a URL against a glob with wildcards (*) and subdomain matching (*.).
 * HTTP(S) paths must match both before and after browser-style dot-segment resolution.
 */
export function testUrlMatchesGlob(uri: string | URI, globUrl: string): boolean {
	const normalizedUrl = normalizeURL(uri);
	let normalizedGlobUrl: URI;

	const globHasScheme = /^[^./:]*:\/\//.test(globUrl);
	// if the glob does not have a scheme we assume the scheme is http or https
	// so if the url doesn't have a scheme of http or https we return false
	if (!globHasScheme) {
		if (normalizedUrl.scheme !== 'http' && normalizedUrl.scheme !== 'https') {
			return false;
		}
		normalizedGlobUrl = normalizeURL(`${normalizedUrl.scheme}://${globUrl}`);
	} else {
		normalizedGlobUrl = normalizeURL(globUrl);
	}

	if (
		!doUrlPartMatch(normalizedUrl.scheme, normalizedGlobUrl.scheme) ||
		// The authority is the only thing that should do port logic.
		!doUrlAuthorityMatch(normalizedUrl.authority, normalizedGlobUrl.authority, matchesSomeScheme(normalizedUrl, Schemas.http, Schemas.https))
	) {
		return false;
	}

	if (normalizedGlobUrl.path === '/') {
		return true;
	}

	const path = encodeURLPathForMatching(normalizedUrl);
	const globPath = encodeURLPathForMatching(normalizedGlobUrl);
	if (!doUrlPartMatch(path, globPath)) {
		return false;
	}

	const resolvedPath = encodeURLPathForMatching(normalizeURL(normalizedUrl, true));
	return resolvedPath === path || doUrlPartMatch(resolvedPath, globPath);
}

function doUrlAuthorityMatch(authority: string, globAuthority: string, decodePercentEncoding: boolean): boolean {
	if (doUrlPartMatch(authority, globAuthority, true)) {
		return true;
	}

	const normalizedAuthority = normalizeAuthorityForMatching(authority, decodePercentEncoding);
	const normalizedGlobAuthority = normalizeAuthorityForMatching(globAuthority, decodePercentEncoding);
	return (normalizedAuthority !== authority || normalizedGlobAuthority !== globAuthority)
		&& doUrlPartMatch(normalizedAuthority, normalizedGlobAuthority, true);
}

/** Canonicalizes literal DNS labels without reinterpreting wildcard labels, ports or user information. */
function normalizeAuthorityForMatching(authority: string, decodePercentEncoding: boolean): string {
	const hostnameStart = authority.lastIndexOf('@') + 1;
	if (authority[hostnameStart] === '[') {
		return authority;
	}

	const portStart = authority.indexOf(':', hostnameStart);
	const hostnameEnd = portStart === -1 ? authority.length : portStart;
	const hostname = authority.slice(hostnameStart, hostnameEnd).split('.').map(label => {
		if (label.includes('*') || /[/\\?#\s]/.test(label) || (!decodePercentEncoding && label.includes('%'))) {
			return label;
		}
		if (/^[\w-]*$/.test(label)) {
			return label.toLowerCase();
		}
		try {
			// A suffix prevents numeric labels from being interpreted as IPv4 addresses.
			const suffix = '.invalid';
			const normalizedHostname = new URL(`${Schemas.http}://${label}${suffix}`).hostname;
			const normalizedLabel = normalizedHostname.slice(0, -suffix.length);
			return normalizedHostname.endsWith(suffix) && !normalizedLabel.includes('*') ? normalizedLabel : label;
		} catch {
			return label;
		}
	}).join('.');

	return authority.slice(0, hostnameStart) + hostname + authority.slice(hostnameEnd);
}

/** Matches URL parts without recursion or an eagerly allocated URL-by-pattern table. */
function doUrlPartMatch(
	urlPart: string,
	globUrlPart: string,
	includePortLogic: boolean = false,
): boolean {
	if (urlPart === globUrlPart) {
		return true;
	}
	if (!globUrlPart.includes('*')) {
		return urlPart.startsWith(`${globUrlPart}/`);
	}

	const pending = new Map<number, Set<number>>();
	const addState = (urlOffset: number, globOffset: number) => {
		let offsets = pending.get(urlOffset);
		if (!offsets) {
			offsets = new Set<number>();
			pending.set(urlOffset, offsets);
		}
		offsets.add(globOffset);
	};
	addState(0, 0);

	for (let urlOffset = 0; urlOffset <= urlPart.length && pending.size > 0; urlOffset++) {
		const globOffsets = pending.get(urlOffset);
		if (!globOffsets) {
			continue;
		}
		for (const globOffset of globOffsets) {
			const anyPort = includePortLogic && globUrlPart[globOffset] === ':' && globUrlPart[globOffset + 1] === '*';
			if (urlOffset === urlPart.length) {
				if (globOffset === globUrlPart.length || (anyPort && globOffset + 2 === globUrlPart.length)) {
					return true;
				}
				continue;
			}
			if (globOffset === globUrlPart.length) {
				if (urlPart[urlOffset] === '/') {
					return true;
				}
				continue;
			}

			if (urlPart[urlOffset] === globUrlPart[globOffset]) {
				addState(urlOffset + 1, globOffset + 1);
			}
			if (globUrlPart[globOffset] === '*') {
				if (globOffset + 1 === globUrlPart.length) {
					return true;
				}
				if (globUrlPart[globOffset + 1] === '.') {
					if (!['/', ':'].includes(urlPart[urlOffset])) {
						addState(urlOffset + 1, globOffset);
					}
					if (urlOffset === 0 || urlPart[urlOffset - 1] === '.') {
						addState(urlOffset, globOffset + 2);
					}
				}
				addState(urlOffset + 1, urlOffset + 1 === urlPart.length ? globOffset + 1 : globOffset);
				addState(urlOffset, globOffset + 1);
			}
			if (anyPort) {
				let endPortIndex = urlOffset;
				if (urlPart[urlOffset] === ':') {
					endPortIndex++;
					do { endPortIndex++; } while (/[0-9]/.test(urlPart[endPortIndex]));
				}
				addState(endPortIndex, globOffset + 2);
			}
		}
		// States never move backwards, so completed URL offsets need not remain in memory.
		pending.delete(urlOffset);
	}
	return false;
}
