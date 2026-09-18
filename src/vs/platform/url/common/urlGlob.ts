/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchesSomeScheme, Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';

/**
 * Removes trailing slashes, queries and fragments, optionally resolving HTTP(S) paths.
 */
function normalizeURL(url: string | URI, resolvePath = false): URI {
	const uri = typeof url === 'string' ? URI.parse(url) : url;
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
		!doMemoUrlMatch(normalizedUrl.scheme, normalizedGlobUrl.scheme) ||
		// The authority is the only thing that should do port logic.
		!doMemoUrlMatch(normalizedUrl.authority, normalizedGlobUrl.authority, true)
	) {
		return false;
	}

	if (normalizedGlobUrl.path === '/') {
		return true;
	}

	if (!doMemoUrlMatch(normalizedUrl.path, normalizedGlobUrl.path)) {
		return false;
	}

	const resolvedPath = normalizeURL(normalizedUrl, true).path;
	return resolvedPath === normalizedUrl.path || doMemoUrlMatch(resolvedPath, normalizedGlobUrl.path);
}

/**
 * @param normalizedUrlPart The normalized URL part to match.
 * @param normalizedGlobUrlPart The normalized glob URL part to match against.
 * @param includePortLogic Whether to include port logic in the matching process.
 * @returns boolean - True if the URL part matches the glob URL part, false otherwise.
 */
function doMemoUrlMatch(
	normalizedUrlPart: string,
	normalizedGlobUrlPart: string,
	includePortLogic: boolean = false,
) {
	const memo = Array.from({ length: normalizedUrlPart.length + 1 }).map(() =>
		Array.from({ length: normalizedGlobUrlPart.length + 1 }).map(() => undefined),
	);

	return doUrlPartMatch(memo, includePortLogic, normalizedUrlPart, normalizedGlobUrlPart, 0, 0);
}

/**
 * Recursively checks if a URL part matches a glob URL part.
 * This function uses memoization to avoid recomputing results for the same inputs.
 * It handles various cases such as exact matches, wildcard matches, and port logic.
 * @param memo A memoization table to avoid recomputing results for the same inputs.
 * @param includePortLogic Whether to include port logic in the matching process.
 * @param urlPart The URL part to match with.
 * @param globUrlPart The glob URL part to match against.
 * @param urlOffset The current offset in the URL part.
 * @param globUrlOffset The current offset in the glob URL part.
 * @returns boolean - True if the URL part matches the glob URL part, false otherwise.
 */
function doUrlPartMatch(
	memo: (boolean | undefined)[][],
	includePortLogic: boolean,
	urlPart: string,
	globUrlPart: string,
	urlOffset: number,
	globUrlOffset: number
): boolean {
	if (memo[urlOffset]?.[globUrlOffset] !== undefined) {
		return memo[urlOffset][globUrlOffset]!;
	}

	const options = [];

	// We've reached the end of the url.
	if (urlOffset === urlPart.length) {
		// We're also at the end of the glob url as well so we have an exact match.
		if (globUrlOffset === globUrlPart.length) {
			return true;
		}

		if (includePortLogic && globUrlPart[globUrlOffset] + globUrlPart[globUrlOffset + 1] === ':*') {
			// any port match. Consume a port if it exists otherwise nothing. Always consume the base.
			return globUrlOffset + 2 === globUrlPart.length;
		}

		return false;
	}

	// Some path remaining in url
	if (globUrlOffset === globUrlPart.length) {
		const remaining = urlPart.slice(urlOffset);
		return remaining[0] === '/';
	}

	if (urlPart[urlOffset] === globUrlPart[globUrlOffset]) {
		// Exact match.
		options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, urlOffset + 1, globUrlOffset + 1));
	}

	if (globUrlPart[globUrlOffset] + globUrlPart[globUrlOffset + 1] === '*.') {
		// Any subdomain match. Either consume one thing that's not a / or : and don't advance base or consume nothing and do.
		if (!['/', ':'].includes(urlPart[urlOffset])) {
			options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, urlOffset + 1, globUrlOffset));
		}
		// Only skip *. if we're at the start (bare domain) or at a dot boundary
		if (urlOffset === 0 || urlPart[urlOffset - 1] === '.') {
			options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, urlOffset, globUrlOffset + 2));
		}
	}

	if (globUrlPart[globUrlOffset] === '*') {
		// Any match. Either consume one thing and don't advance base or consume nothing and do.
		if (urlOffset + 1 === urlPart.length) {
			// If we're at the end of the input url consume one from both.
			options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, urlOffset + 1, globUrlOffset + 1));
		} else {
			options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, urlOffset + 1, globUrlOffset));
		}
		options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, urlOffset, globUrlOffset + 1));
	}

	if (includePortLogic && globUrlPart[globUrlOffset] + globUrlPart[globUrlOffset + 1] === ':*') {
		// any port match. Consume a port if it exists otherwise nothing. Always consume the base.
		if (urlPart[urlOffset] === ':') {
			let endPortIndex = urlOffset + 1;
			do { endPortIndex++; } while (/[0-9]/.test(urlPart[endPortIndex]));
			options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, endPortIndex, globUrlOffset + 2));
		} else {
			options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, urlOffset, globUrlOffset + 2));
		}
	}

	return (memo[urlOffset][globUrlOffset] = options.some(a => a === true));
}
