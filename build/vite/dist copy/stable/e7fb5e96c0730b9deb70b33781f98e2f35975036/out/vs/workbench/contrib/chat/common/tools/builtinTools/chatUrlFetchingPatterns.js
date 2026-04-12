/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../../base/common/uri.js';
import { normalizeURL } from '../../../../../../platform/url/common/trustedDomains.js';
import { testUrlMatchesGlob } from '../../../../../../platform/url/common/urlGlob.js';
/**
 * Extracts domain patterns from a URL for use in approval actions
 * @param url The URL to extract patterns from
 * @returns An array of patterns in order of specificity (most specific first)
 */
export function extractUrlPatterns(url) {
    const normalizedStr = normalizeURL(url);
    const normalized = URI.parse(normalizedStr);
    const patterns = new Set();
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
    const isIPv4 = domainParts.length === 4 && domainParts.every((segment) => Number.isInteger(+segment));
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
    const pathSegments = normalized.path.split('/').filter((s) => s.length > 0);
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
export function getPatternLabel(url, pattern) {
    let displayPattern = pattern;
    if (displayPattern.startsWith('https://')) {
        displayPattern = displayPattern.substring(8);
    }
    else if (displayPattern.startsWith('http://')) {
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
export function isUrlApproved(url, approvedUrls, checkRequest) {
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
export function getMatchingPattern(url, approvedUrls) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFVybEZldGNoaW5nUGF0dGVybnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvY2hhdFVybEZldGNoaW5nUGF0dGVybnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQVV0Rjs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLGtCQUFrQixDQUFDLEdBQVE7SUFDMUMsTUFBTSxhQUFhLEdBQUcsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3hDLE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDNUMsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztJQUVuQywyQkFBMkI7SUFDM0IsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMxQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBRXRCLCtDQUErQztJQUMvQyxNQUFNLFVBQVUsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN6RixRQUFRLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBRXpCLDZDQUE2QztJQUM3QyxNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDO0lBQ3ZDLE1BQU0sV0FBVyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFFekMsK0VBQStFO0lBQy9FLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFlLEVBQUUsRUFBRSxDQUNoRixNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUM3QixNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztJQUNoRyxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksTUFBTSxDQUFDO0lBRTlCLG9GQUFvRjtJQUNwRixJQUFJLENBQUMsSUFBSSxJQUFJLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDckMsNkRBQTZEO1FBQzdELHVFQUF1RTtRQUN2RSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNqRCxNQUFNLGlCQUFpQixHQUFHLElBQUksR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEUsTUFBTSxlQUFlLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQztnQkFDdkMsU0FBUyxFQUFFLGlCQUFpQjtnQkFDNUIsSUFBSSxFQUFFLEVBQUU7Z0JBQ1IsS0FBSyxFQUFFLEVBQUU7Z0JBQ1QsUUFBUSxFQUFFLEVBQUU7YUFDWixDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xCLFFBQVEsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDL0IsQ0FBQztJQUNGLENBQUM7SUFFRCxnREFBZ0Q7SUFDaEQsTUFBTSxZQUFZLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3BGLElBQUksWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUM3QixpREFBaUQ7UUFDakQsS0FBSyxJQUFJLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDbkQsTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3ZELE1BQU0sa0JBQWtCLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQztnQkFDMUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxXQUFXO2dCQUN0QyxLQUFLLEVBQUUsRUFBRTtnQkFDVCxRQUFRLEVBQUUsRUFBRTthQUNaLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEIsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ2xDLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUN0RCxDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCxNQUFNLFVBQVUsZUFBZSxDQUFDLEdBQVEsRUFBRSxPQUFlO0lBQ3hELElBQUksY0FBYyxHQUFHLE9BQU8sQ0FBQztJQUU3QixJQUFJLGNBQWMsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztRQUMzQyxjQUFjLEdBQUcsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5QyxDQUFDO1NBQU0sSUFBSSxjQUFjLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDakQsY0FBYyxHQUFHLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELE9BQU8sY0FBYyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQywwQkFBMEI7QUFDdEUsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxhQUFhLENBQzVCLEdBQVEsRUFDUixZQUE0RCxFQUM1RCxZQUFxQjtJQUVyQixNQUFNLGdCQUFnQixHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMzQyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFFbEQsS0FBSyxNQUFNLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztRQUNoRSxvQ0FBb0M7UUFDcEMsSUFBSSxrQkFBa0IsQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNoRCwwQkFBMEI7WUFDMUIsSUFBSSxPQUFPLFFBQVEsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxRQUFRLENBQUM7WUFDakIsQ0FBQztZQUVELDJCQUEyQjtZQUMzQixJQUFJLFlBQVksSUFBSSxRQUFRLENBQUMsY0FBYyxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUMzRCxPQUFPLFFBQVEsQ0FBQyxjQUFjLENBQUM7WUFDaEMsQ0FBQztZQUVELElBQUksQ0FBQyxZQUFZLElBQUksUUFBUSxDQUFDLGVBQWUsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDN0QsT0FBTyxRQUFRLENBQUMsZUFBZSxDQUFDO1lBQ2pDLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVEOzs7OztHQUtHO0FBQ0gsTUFBTSxVQUFVLGtCQUFrQixDQUNqQyxHQUFRLEVBQ1IsWUFBNEQ7SUFFNUQsTUFBTSxnQkFBZ0IsR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDM0MsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ2xELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBRXpDLCtEQUErRDtJQUMvRCxLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQ2hDLEtBQUssTUFBTSxlQUFlLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1lBQ3pELElBQUksa0JBQWtCLENBQUMsYUFBYSxFQUFFLGVBQWUsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsZUFBZSxDQUFDLEVBQUUsQ0FBQztnQkFDbkgsT0FBTyxlQUFlLENBQUM7WUFDeEIsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQyJ9