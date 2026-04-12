/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
/**
 * Normalizes a URL by removing trailing slashes and query/fragment components.
 * @param url The URL to normalize.
 * @returns URI - The normalized URI object.
 */
function normalizeURL(url) {
    const uri = typeof url === 'string' ? URI.parse(url) : url;
    return uri.with({
        // Remove trailing slashes
        path: uri.path.replace(/\/+$/, ''),
        // Remove query and fragment
        query: null,
        fragment: null,
    });
}
/**
 * Checks if a given URL matches a glob URL pattern.
 * The glob URL pattern can contain wildcards (*) and subdomain matching (*.)
 * @param uri The URL to check.
 * @param globUrl The glob URL pattern to match against.
 * @returns boolean - True if the URL matches the glob URL pattern, false otherwise.
 */
export function testUrlMatchesGlob(uri, globUrl) {
    const normalizedUrl = normalizeURL(uri);
    let normalizedGlobUrl;
    const globHasScheme = /^[^./:]*:\/\//.test(globUrl);
    // if the glob does not have a scheme we assume the scheme is http or https
    // so if the url doesn't have a scheme of http or https we return false
    if (!globHasScheme) {
        if (normalizedUrl.scheme !== 'http' && normalizedUrl.scheme !== 'https') {
            return false;
        }
        normalizedGlobUrl = normalizeURL(`${normalizedUrl.scheme}://${globUrl}`);
    }
    else {
        normalizedGlobUrl = normalizeURL(globUrl);
    }
    return (doMemoUrlMatch(normalizedUrl.scheme, normalizedGlobUrl.scheme) &&
        // The authority is the only thing that should do port logic.
        doMemoUrlMatch(normalizedUrl.authority, normalizedGlobUrl.authority, true) &&
        (
        //
        normalizedGlobUrl.path === '/' ||
            doMemoUrlMatch(normalizedUrl.path, normalizedGlobUrl.path)));
}
/**
 * @param normalizedUrlPart The normalized URL part to match.
 * @param normalizedGlobUrlPart The normalized glob URL part to match against.
 * @param includePortLogic Whether to include port logic in the matching process.
 * @returns boolean - True if the URL part matches the glob URL part, false otherwise.
 */
function doMemoUrlMatch(normalizedUrlPart, normalizedGlobUrlPart, includePortLogic = false) {
    const memo = Array.from({ length: normalizedUrlPart.length + 1 }).map(() => Array.from({ length: normalizedGlobUrlPart.length + 1 }).map(() => undefined));
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
function doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, urlOffset, globUrlOffset) {
    if (memo[urlOffset]?.[globUrlOffset] !== undefined) {
        return memo[urlOffset][globUrlOffset];
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
        }
        else {
            options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, urlOffset + 1, globUrlOffset));
        }
        options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, urlOffset, globUrlOffset + 1));
    }
    if (includePortLogic && globUrlPart[globUrlOffset] + globUrlPart[globUrlOffset + 1] === ':*') {
        // any port match. Consume a port if it exists otherwise nothing. Always consume the base.
        if (urlPart[urlOffset] === ':') {
            let endPortIndex = urlOffset + 1;
            do {
                endPortIndex++;
            } while (/[0-9]/.test(urlPart[endPortIndex]));
            options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, endPortIndex, globUrlOffset + 2));
        }
        else {
            options.push(doUrlPartMatch(memo, includePortLogic, urlPart, globUrlPart, urlOffset, globUrlOffset + 2));
        }
    }
    return (memo[urlOffset][globUrlOffset] = options.some(a => a === true));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJsR2xvYi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VybC9jb21tb24vdXJsR2xvYi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFbEQ7Ozs7R0FJRztBQUNILFNBQVMsWUFBWSxDQUFDLEdBQWlCO0lBQ3RDLE1BQU0sR0FBRyxHQUFHLE9BQU8sR0FBRyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO0lBQzNELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQztRQUNmLDBCQUEwQjtRQUMxQixJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztRQUNsQyw0QkFBNEI7UUFDNUIsS0FBSyxFQUFFLElBQUk7UUFDWCxRQUFRLEVBQUUsSUFBSTtLQUNkLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRDs7Ozs7O0dBTUc7QUFDSCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsR0FBaUIsRUFBRSxPQUFlO0lBQ3BFLE1BQU0sYUFBYSxHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN4QyxJQUFJLGlCQUFzQixDQUFDO0lBRTNCLE1BQU0sYUFBYSxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDcEQsMkVBQTJFO0lBQzNFLHVFQUF1RTtJQUN2RSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDcEIsSUFBSSxhQUFhLENBQUMsTUFBTSxLQUFLLE1BQU0sSUFBSSxhQUFhLENBQUMsTUFBTSxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQ3pFLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FB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