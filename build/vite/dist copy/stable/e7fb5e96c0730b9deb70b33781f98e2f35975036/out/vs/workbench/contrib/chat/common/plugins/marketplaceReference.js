/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
export var MarketplaceReferenceKind;
(function (MarketplaceReferenceKind) {
    MarketplaceReferenceKind["GitHubShorthand"] = "githubShorthand";
    MarketplaceReferenceKind["GitUri"] = "gitUri";
    MarketplaceReferenceKind["LocalFileUri"] = "localFileUri";
})(MarketplaceReferenceKind || (MarketplaceReferenceKind = {}));
export function parseMarketplaceReferences(values) {
    const byCanonicalId = new Map();
    for (const value of values) {
        if (typeof value !== 'string') {
            continue;
        }
        const parsed = parseMarketplaceReference(value);
        if (!parsed) {
            continue;
        }
        if (!byCanonicalId.has(parsed.canonicalId)) {
            byCanonicalId.set(parsed.canonicalId, parsed);
        }
    }
    return [...byCanonicalId.values()];
}
/**
 * Merges two sets of marketplace references, deduplicating by canonical ID.
 * The first set takes precedence when IDs collide.
 */
export function deduplicateMarketplaceReferences(primary, secondary) {
    const byCanonicalId = new Map();
    for (const ref of primary) {
        byCanonicalId.set(ref.canonicalId, ref);
    }
    for (const ref of secondary) {
        if (!byCanonicalId.has(ref.canonicalId)) {
            byCanonicalId.set(ref.canonicalId, ref);
        }
    }
    return [...byCanonicalId.values()];
}
export function parseMarketplaceReference(value) {
    const rawValue = value.trim();
    if (!rawValue) {
        return undefined;
    }
    const uriReference = parseUriMarketplaceReference(rawValue);
    if (uriReference) {
        return uriReference;
    }
    const scpReference = parseScpMarketplaceReference(rawValue);
    if (scpReference) {
        return scpReference;
    }
    const shorthandMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(rawValue);
    if (shorthandMatch) {
        const owner = shorthandMatch[1];
        const repo = shorthandMatch[2];
        return {
            rawValue,
            displayLabel: `${owner}/${repo}`,
            cloneUrl: `https://github.com/${owner}/${repo}.git`,
            canonicalId: getGitHubCanonicalId(owner, repo),
            cacheSegments: ['github.com', owner, repo],
            kind: "githubShorthand" /* MarketplaceReferenceKind.GitHubShorthand */,
            githubRepo: `${owner}/${repo}`,
        };
    }
    return undefined;
}
function parseUriMarketplaceReference(rawValue) {
    let uri;
    try {
        uri = URI.parse(rawValue);
    }
    catch {
        return undefined;
    }
    const scheme = uri.scheme.toLowerCase();
    if (scheme === 'file' && /^file:\/\//i.test(rawValue)) {
        const localRepositoryUri = URI.file(uri.fsPath);
        return {
            rawValue,
            displayLabel: localRepositoryUri.fsPath,
            cloneUrl: rawValue,
            canonicalId: `file:${localRepositoryUri.toString().toLowerCase()}`,
            cacheSegments: [],
            kind: "localFileUri" /* MarketplaceReferenceKind.LocalFileUri */,
            localRepositoryUri,
        };
    }
    if (scheme !== 'http' && scheme !== 'https' && scheme !== 'ssh') {
        return undefined;
    }
    if (!uri.authority) {
        return undefined;
    }
    const normalizedPath = normalizeGitRepoPath(uri.path);
    if (!normalizedPath) {
        return undefined;
    }
    const gitSuffix = '.git';
    const sanitizedAuthority = sanitizePathSegment(uri.authority.toLowerCase());
    const pathHasGitSuffix = normalizedPath.toLowerCase().endsWith(gitSuffix);
    const pathWithoutGit = pathHasGitSuffix ? normalizedPath.slice(1, normalizedPath.length - gitSuffix.length) : normalizedPath.slice(1);
    const pathSegments = pathWithoutGit.split('/').map(sanitizePathSegment);
    // Always normalize the canonical path to include .git so that URLs with and without the suffix deduplicate.
    const canonicalPath = pathHasGitSuffix ? normalizedPath.slice(1).toLowerCase() : `${normalizedPath.slice(1).toLowerCase()}${gitSuffix}`;
    // Extract githubRepo for GitHub URLs so the editor can render a clickable link
    const githubRepo = extractGitHubRepo(uri.authority, pathWithoutGit);
    return {
        rawValue,
        displayLabel: rawValue,
        cloneUrl: rawValue,
        canonicalId: `git:${uri.authority.toLowerCase()}/${canonicalPath}`,
        cacheSegments: [sanitizedAuthority, ...pathSegments],
        kind: "gitUri" /* MarketplaceReferenceKind.GitUri */,
        githubRepo,
    };
}
function parseScpMarketplaceReference(rawValue) {
    const match = /^([^@\s]+)@([^:\s]+):(.+\.git)$/i.exec(rawValue);
    if (!match) {
        return undefined;
    }
    const gitSuffix = '.git';
    const authority = match[2];
    const pathWithGit = match[3].replace(/^\/+/, '');
    if (!pathWithGit.toLowerCase().endsWith(gitSuffix)) {
        return undefined;
    }
    const pathWithoutGit = pathWithGit.slice(0, -gitSuffix.length);
    const pathSegments = pathWithoutGit.split('/').map(sanitizePathSegment);
    const githubRepo = extractGitHubRepo(authority, pathWithoutGit);
    return {
        rawValue,
        displayLabel: rawValue,
        cloneUrl: rawValue,
        canonicalId: `git:${authority.toLowerCase()}/${pathWithGit.toLowerCase()}`,
        cacheSegments: [sanitizePathSegment(authority.toLowerCase()), ...pathSegments],
        kind: "gitUri" /* MarketplaceReferenceKind.GitUri */,
        githubRepo,
    };
}
/**
 * Normalizes a Git repository path and validates that it has at least two segments
 * (i.e., at least one owner/repo pair below the root). Accepts paths with or without
 * a `.git` suffix — the suffix is preserved in the returned value so callers can decide
 * how to treat it.
 */
function normalizeGitRepoPath(path) {
    const gitSuffix = '.git';
    const trimmed = path.replace(/\/+/g, '/').replace(/\/+$/g, '');
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    // Strip .git suffix (if present) only for the purposes of validating path depth.
    const pathWithoutGit = withLeadingSlash.toLowerCase().endsWith(gitSuffix)
        ? withLeadingSlash.slice(1, withLeadingSlash.length - gitSuffix.length)
        : withLeadingSlash.slice(1);
    if (!pathWithoutGit || !pathWithoutGit.includes('/')) {
        return undefined;
    }
    return withLeadingSlash;
}
function extractGitHubRepo(authority, pathWithoutGit) {
    if (authority.toLowerCase() !== 'github.com') {
        return undefined;
    }
    const parts = pathWithoutGit.split('/');
    if (parts.length >= 2 && parts[0] && parts[1]) {
        return `${parts[0]}/${parts[1]}`;
    }
    return undefined;
}
function getGitHubCanonicalId(owner, repo) {
    return `github:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}
function sanitizePathSegment(value) {
    return value.replace(/[\\/:*?"<>|]/g, '_');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2V0cGxhY2VSZWZlcmVuY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wbHVnaW5zL21hcmtldHBsYWNlUmVmZXJlbmNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV4RCxNQUFNLENBQU4sSUFBa0Isd0JBSWpCO0FBSkQsV0FBa0Isd0JBQXdCO0lBQ3pDLCtEQUFtQyxDQUFBO0lBQ25DLDZDQUFpQixDQUFBO0lBQ2pCLHlEQUE2QixDQUFBO0FBQzlCLENBQUMsRUFKaUIsd0JBQXdCLEtBQXhCLHdCQUF3QixRQUl6QztBQWFELE1BQU0sVUFBVSwwQkFBMEIsQ0FBQyxNQUEwQjtJQUNwRSxNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsRUFBaUMsQ0FBQztJQUUvRCxLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQzVCLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDL0IsU0FBUztRQUNWLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNoRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixTQUFTO1FBQ1YsQ0FBQztRQUVELElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQzVDLGFBQWEsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMvQyxDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sQ0FBQyxHQUFHLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQ3BDLENBQUM7QUFFRDs7O0dBR0c7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