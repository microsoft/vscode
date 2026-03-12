/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';

export const enum MarketplaceReferenceKind {
	GitHubShorthand = 'githubShorthand',
	GitUri = 'gitUri',
	LocalFileUri = 'localFileUri',
}

export interface IMarketplaceReference {
	readonly rawValue: string;
	readonly displayLabel: string;
	readonly cloneUrl: string;
	readonly canonicalId: string;
	readonly cacheSegments: readonly string[];
	readonly kind: MarketplaceReferenceKind;
	readonly githubRepo?: string;
	readonly localRepositoryUri?: URI;
}

export function parseMarketplaceReferences(values: readonly unknown[]): IMarketplaceReference[] {
	const byCanonicalId = new Map<string, IMarketplaceReference>();

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
export function deduplicateMarketplaceReferences(primary: readonly IMarketplaceReference[], secondary: readonly IMarketplaceReference[]): IMarketplaceReference[] {
	const byCanonicalId = new Map<string, IMarketplaceReference>();
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

export function parseMarketplaceReference(value: string): IMarketplaceReference | undefined {
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
			kind: MarketplaceReferenceKind.GitHubShorthand,
			githubRepo: `${owner}/${repo}`,
		};
	}

	return undefined;
}

function parseUriMarketplaceReference(rawValue: string): IMarketplaceReference | undefined {
	let uri: URI;
	try {
		uri = URI.parse(rawValue);
	} catch {
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
			kind: MarketplaceReferenceKind.LocalFileUri,
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
	return {
		rawValue,
		displayLabel: rawValue,
		cloneUrl: rawValue,
		canonicalId: `git:${uri.authority.toLowerCase()}/${canonicalPath}`,
		cacheSegments: [sanitizedAuthority, ...pathSegments],
		kind: MarketplaceReferenceKind.GitUri,
	};
}

function parseScpMarketplaceReference(rawValue: string): IMarketplaceReference | undefined {
	const match = /^([^@\s]+)@([^:\s]+):(.+\.git)$/i.exec(rawValue);
	if (!match) {
		return undefined;
	}

	const authority = match[2];
	const pathWithGit = match[3].replace(/^\/+/, '');
	if (!pathWithGit.toLowerCase().endsWith('.git')) {
		return undefined;
	}

	const pathSegments = pathWithGit.slice(0, -4).split('/').map(sanitizePathSegment);
	return {
		rawValue,
		displayLabel: rawValue,
		cloneUrl: rawValue,
		canonicalId: `git:${authority.toLowerCase()}/${pathWithGit.toLowerCase()}`,
		cacheSegments: [sanitizePathSegment(authority.toLowerCase()), ...pathSegments],
		kind: MarketplaceReferenceKind.GitUri,
	};
}

/**
 * Normalizes a Git repository path and validates that it has at least two segments
 * (i.e., at least one owner/repo pair below the root). Accepts paths with or without
 * a `.git` suffix — the suffix is preserved in the returned value so callers can decide
 * how to treat it.
 */
function normalizeGitRepoPath(path: string): string | undefined {
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

function getGitHubCanonicalId(owner: string, repo: string): string {
	return `github:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function sanitizePathSegment(value: string): string {
	return value.replace(/[\\/:*?"<>|]/g, '_');
}
