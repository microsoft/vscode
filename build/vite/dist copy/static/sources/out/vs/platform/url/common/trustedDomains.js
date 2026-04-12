/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
import { testUrlMatchesGlob } from './urlGlob.js';
/**
 * Check whether a domain like https://www.microsoft.com matches
 * the list of trusted domains.
 *
 * - Schemes must match
 * - There's no subdomain matching. For example https://microsoft.com doesn't match https://www.microsoft.com
 * - Star matches all subdomains. For example https://*.microsoft.com matches https://www.microsoft.com and https://foo.bar.microsoft.com
 */
export function isURLDomainTrusted(url, trustedDomains) {
    url = URI.parse(normalizeURL(url));
    trustedDomains = trustedDomains.map(normalizeURL);
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
 * Case-normalize some case-insensitive URLs, such as github.
 */
export function normalizeURL(url) {
    const caseInsensitiveAuthorities = ['github.com'];
    try {
        const parsed = typeof url === 'string' ? URI.parse(url, true) : url;
        if (caseInsensitiveAuthorities.includes(parsed.authority)) {
            return parsed.with({ path: parsed.path.toLowerCase() }).toString(true);
        }
        else {
            return parsed.toString(true);
        }
    }
    catch {
        return url.toString();
    }
}
const rLocalhost = /^(.+\.)?localhost(:\d+)?$/i;
const r127 = /^127.0.0.1(:\d+)?$/;
const rIPv6Localhost = /^\[::1\](:\d+)?$/;
export function isLocalhostAuthority(authority) {
    return rLocalhost.test(authority) || r127.test(authority) || rIPv6Localhost.test(authority);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3RlZERvbWFpbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91cmwvY29tbW9uL3RydXN0ZWREb21haW5zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFFbEQ7Ozs7Ozs7R0FPRztBQUNILE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxHQUFRLEVBQUUsY0FBd0I7SUFDcEUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDbkMsY0FBYyxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7SUFFbEQsSUFBSSxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUN6QyxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ2hELElBQUksY0FBYyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQy9CLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELElBQUksa0JBQWtCLENBQUMsR0FBRyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDaEQsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLFlBQVksQ0FBQyxHQUFpQjtJQUM3QyxNQUFNLDBCQUEwQixHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDbEQsSUFBSSxDQUFDO1FBQ0osTUFBTSxNQUFNLEdBQUcsT0FBTyxHQUFHLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ3BFLElBQUksMEJBQTBCLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQzNELE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEUsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDOUIsQ0FBQztJQUNGLENBQUM7SUFBQyxNQUFNLENBQUM7UUFBQyxPQUFPLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUFDLENBQUM7QUFDbkMsQ0FBQztBQUVELE1BQU0sVUFBVSxHQUFHLDRCQUE0QixDQUFDO0FBQ2hELE1BQU0sSUFBSSxHQUFHLG9CQUFvQixDQUFDO0FBQ2xDLE1BQU0sY0FBYyxHQUFHLGtCQUFrQixDQUFDO0FBRTFDLE1BQU0sVUFBVSxvQkFBb0IsQ0FBQyxTQUFpQjtJQUNyRCxPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzdGLENBQUMifQ==