"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchesUrlPattern = matchesUrlPattern;
const vscode_1 = require("vscode");
/**
 * Check whether a URL matches the list of trusted domains or URIs.
 *
 * trustedDomains is an object where:
 * - Keys are full domains (https://www.microsoft.com) or full URIs (https://www.test.com/schemas/mySchema.json)
 * - Keys can include wildcards (https://*.microsoft.com) or glob patterns
 * - Values are booleans indicating if the domain/URI is trusted (true) or blocked (false)
 *
 * @param url The URL to check
 * @param trustedDomains Object mapping domain patterns to boolean trust values
 */
function matchesUrlPattern(url, trustedDomains) {
    // Check localhost
    if (isLocalhostAuthority(url.authority)) {
        return true;
    }
    for (const [pattern, isTrusted] of Object.entries(trustedDomains)) {
        if (typeof pattern !== 'string' || pattern.trim() === '') {
            continue;
        }
        // Wildcard matches everything
        if (pattern === '*') {
            return isTrusted;
        }
        try {
            const patternUri = vscode_1.Uri.parse(pattern);
            // Scheme must match
            if (url.scheme !== patternUri.scheme) {
                continue;
            }
            // Check authority (host:port)
            if (!matchesAuthority(url.authority, patternUri.authority)) {
                continue;
            }
            // Check path
            if (!matchesPath(url.path, patternUri.path)) {
                continue;
            }
            return isTrusted;
        }
        catch {
            // Invalid pattern, skip
            continue;
        }
    }
    return false;
}
function matchesAuthority(urlAuthority, patternAuthority) {
    urlAuthority = urlAuthority.toLowerCase();
    patternAuthority = patternAuthority.toLowerCase();
    if (patternAuthority === urlAuthority) {
        return true;
    }
    // Handle wildcard subdomains (e.g., *.github.com)
    if (patternAuthority.startsWith('*.')) {
        const patternDomain = patternAuthority.substring(2);
        // Exact match or subdomain match
        return urlAuthority === patternDomain || urlAuthority.endsWith('.' + patternDomain);
    }
    return false;
}
function matchesPath(urlPath, patternPath) {
    // Empty pattern path or just "/" matches any path
    if (!patternPath || patternPath === '/') {
        return true;
    }
    // Exact match
    if (urlPath === patternPath) {
        return true;
    }
    // If pattern ends with '/', it matches any path starting with it
    if (patternPath.endsWith('/')) {
        return urlPath.startsWith(patternPath);
    }
    // Otherwise, pattern must be a prefix
    return urlPath.startsWith(patternPath + '/') || urlPath === patternPath;
}
const rLocalhost = /^(.+\.)?localhost(:\d+)?$/i;
const r127 = /^127\.0\.0\.1(:\d+)?$/;
const rIPv6Localhost = /^\[::1\](:\d+)?$/;
function isLocalhostAuthority(authority) {
    return rLocalhost.test(authority) || r127.test(authority) || rIPv6Localhost.test(authority);
}
//# sourceMappingURL=urlMatch.js.map