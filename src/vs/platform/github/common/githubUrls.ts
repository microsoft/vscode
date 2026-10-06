/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { deriveGitHubEndpoints } from './githubEndpoints.js';

/** Encodes a repository path while preserving directory separators. */
export function encodePathSegments(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}

/** Normalized key for comparing pull request URLs irrespective of case and trailing slashes. */
export function getPullRequestUrlKey(url: string): string {
	return url.trim().replace(/\/+$/, '').toLowerCase();
}

/** A GitHub issue, identified by the repository that owns it and its number. */
export interface IGitHubIssueReference {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

/** Matches public issue URLs, including links with trailing paths, queries or comment fragments. */
const ISSUE_URL_PATTERN = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\b/i;
const PULL_REQUEST_URL_PATTERN = /^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)\/?$/;
const PULL_REQUEST_PATH_PATTERN = /^\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)\/?$/;
const COMMIT_PATH_PATTERN = /^\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/commit\/(?<sha>[^/]+)(?:\/|$)/;

/** Parses a public GitHub issue URL into its parts, or `undefined` when it is not one. */
export function parseGitHubIssueUrl(url: string): IGitHubIssueReference | undefined {
	const match = ISSUE_URL_PATTERN.exec(url);
	if (!match) {
		return undefined;
	}
	const number = Number(match[3]);
	return Number.isSafeInteger(number) && number > 0 ? { owner: match[1], repo: match[2], number } : undefined;
}

/** Parses a canonical `https://github.com` pull request URL, without a query or fragment. */
export function parseGitHubPullRequestUrl(url: string): { readonly owner: string; readonly repo: string; readonly number: number } | undefined {
	const match = PULL_REQUEST_URL_PATTERN.exec(url);
	const groups = match?.groups;
	return groups ? { owner: groups.owner, repo: groups.repo, number: Number(groups.number) } : undefined;
}

export interface IParsedPullRequestUrl {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	/** REST API host the credential account must match (`api.github.com` for github.com). */
	readonly apiHost: string;
}

/** Parses a pull request URL and derives its API host; callers determine which hosts are allowed. */
export function parsePullRequestUrl(value: string): IParsedPullRequestUrl | undefined {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	const match = PULL_REQUEST_PATH_PATTERN.exec(url.pathname);
	const number = Number(match?.groups?.number);
	if (!match?.groups || !Number.isSafeInteger(number) || number <= 0) {
		return undefined;
	}
	const host = url.host.toLowerCase();
	return {
		owner: match.groups.owner,
		repo: match.groups.repo,
		number,
		// Enterprise Cloud credentials report the API subdomain rather than the web host.
		apiHost: new URL(deriveGitHubEndpoints(`${url.protocol}//${host}`).apiBaseUri).host.toLowerCase(),
	};
}

export interface IGitHubCommitTarget {
	readonly owner: string;
	readonly repo: string;
	readonly sha: string;
	readonly resource: URI;
}

/** Parses a github.com commit link, retaining the original resource and any trailing path. */
export function parseGitHubCommitTarget(resource: URI): IGitHubCommitTarget | undefined {
	if (resource.authority.toLowerCase() !== 'github.com') {
		return undefined;
	}
	const match = COMMIT_PATH_PATTERN.exec(resource.path);
	const owner = match?.groups?.owner;
	const repo = match?.groups?.repo;
	const sha = match?.groups?.sha;
	return owner && repo && sha ? { owner, repo, sha, resource } : undefined;
}

export type GitHubLinkTarget =
	| { readonly kind: 'repository'; readonly owner: string; readonly repo: string }
	| { readonly kind: 'issue'; readonly owner: string; readonly repo: string; readonly number: number }
	| { readonly kind: 'pullRequest'; readonly owner: string; readonly repo: string; readonly number: number };

/** Parses HTTPS repository, issue and pull request paths after the caller has selected the host. */
export function parseGitHubLinkTarget(resource: URI): GitHubLinkTarget | undefined {
	if (resource.scheme !== 'https') {
		return undefined;
	}
	const segments = resource.path.split('/').filter(Boolean);
	if (segments.length === 2) {
		return { kind: 'repository', owner: segments[0], repo: segments[1] };
	}
	if (segments.length !== 4) {
		return undefined;
	}
	const number = Number(segments[3]);
	if (!Number.isSafeInteger(number) || number <= 0) {
		return undefined;
	}
	if (segments[2] === 'issues') {
		return { kind: 'issue', owner: segments[0], repo: segments[1], number };
	}
	if (segments[2] === 'pull') {
		return { kind: 'pullRequest', owner: segments[0], repo: segments[1], number };
	}
	return undefined;
}
