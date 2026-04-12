/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'monaco-editor';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Event } from '../../../util/vs/base/common/event';
import { IObservable } from '../../../util/vs/base/common/observableInternal';
import { equalsIgnoreCase } from '../../../util/vs/base/common/strings';
import { URI } from '../../../util/vs/base/common/uri';
import { Branch, Change, Commit, CommitOptions, CommitShortStat, DiffChange, LogOptions, Ref, RefQuery, Repository, RepositoryAccessDetails, RepositoryKind, Worktree } from '../vscode/git';

export interface RepoContext {
	readonly rootUri: URI;
	readonly kind: RepositoryKind;
	readonly headIncomingChanges: number | undefined;
	readonly headOutgoingChanges: number | undefined;
	readonly headBranchName: string | undefined;
	readonly headCommitHash: string | undefined;
	readonly upstreamBranchName: string | undefined;
	readonly upstreamRemote: string | undefined;
	readonly isRebasing: boolean;
	// TODO: merge these into one object. The only reason they're separate is to not have
	// to change every test.
	readonly remoteFetchUrls?: Array<string | undefined>;
	readonly remotes: string[];
	readonly worktrees: Worktree[];
	readonly changes: { mergeChanges: Change[]; indexChanges: Change[]; workingTree: Change[]; untrackedChanges: Change[] } | undefined;

	readonly headBranchNameObs: IObservable<string | undefined>;
	readonly headCommitHashObs: IObservable<string | undefined>;
	readonly upstreamBranchNameObs: IObservable<string | undefined>;
	readonly upstreamRemoteObs: IObservable<string | undefined>;
	readonly isRebasingObs: IObservable<boolean>;

	isIgnored(uri: URI): Promise<boolean>;
}

export const IGitService = createServiceIdentifier<IGitService>('IGitService');

export interface IGitService extends IDisposable {

	readonly _serviceBrand: undefined;

	readonly onDidOpenRepository: Event<RepoContext>;
	readonly onDidCloseRepository: Event<RepoContext>;
	readonly onDidFinishInitialization: Event<void>;

	readonly activeRepository: IObservable<RepoContext | undefined>;

	readonly repositories: Array<RepoContext>;
	readonly isInitialized: boolean;

	initRepository(uri: URI): Promise<Repository | undefined>;
	getRecentRepositories(): Iterable<RepositoryAccessDetails>;
	getRepository(uri: URI, forceOpen?: boolean): Promise<RepoContext | undefined>;
	getRepository2(uri: URI): Promise<Repository | undefined>;
	openRepository(uri: URI): Promise<Repository | undefined>;
	getRepositoryFetchUrls(uri: URI): Promise<Pick<RepoContext, 'rootUri' | 'remoteFetchUrls'> | undefined>;
	initialize(): Promise<void>;
	add(uri: URI, paths: string[]): Promise<void>;
	log(uri: URI, options?: LogOptions): Promise<Commit[] | undefined>;
	diffBetween(uri: URI, ref1: string, ref2: string): Promise<Change[] | undefined>;
	diffBetweenPatch(uri: URI, ref1: string, ref2: string, path?: string): Promise<string | undefined>;
	diffBetweenWithStats(uri: URI, ref1: string, ref2: string, path?: string): Promise<DiffChange[] | undefined>;
	diffBetweenWithStats2(uri: URI, ref: string, path?: string): Promise<DiffChange[] | undefined>;
	diffWith(uri: URI, ref: string): Promise<Change[] | undefined>;
	diffIndexWithHEADShortStats(uri: URI): Promise<CommitShortStat | undefined>;
	fetch(uri: URI, remote?: string, ref?: string, depth?: number): Promise<void>;
	getMergeBase(uri: URI, ref1: string, ref2: string): Promise<string | undefined>;
	restore(uri: URI, paths: string[], options?: { staged?: boolean; ref?: string }): Promise<void>;

	createWorktree(uri: URI, options?: { path?: string; commitish?: string; branch?: string; noTrack?: boolean }): Promise<string | undefined>;
	deleteWorktree(uri: URI, path: string, options?: { force?: boolean }): Promise<void>;

	migrateChanges(uri: URI, sourceRepositoryUri: URI, options?: { confirmation?: boolean; deleteFromSource?: boolean; untracked?: boolean }): Promise<void>;

	applyPatch(uri: URI, patch: string): Promise<void>;
	commit(uri: URI, message: string | undefined, opts?: CommitOptions): Promise<void>;

	checkout(uri: URI, treeish: string): Promise<void>;
	merge(uri: URI, ref: string): Promise<void>;
	push(uri: URI): Promise<void>;
	rebase(uri: URI, branch: string): Promise<void>;

	getBranch(uri: URI, name: string): Promise<Branch | undefined>;
	getBranchBase(uri: URI, name: string): Promise<Branch | undefined>;
	getRefs(uri: URI, query: RefQuery, cancellationToken?: CancellationToken): Promise<Ref[]>;
	isBranchProtected(uri: URI, branch?: string | Branch): Promise<boolean | undefined>;

	generateRandomBranchName(uri: URI): Promise<string | undefined>;

	exec(uri: URI, args: string[], env?: Record<string, string>): Promise<string>;
}

/**
 * Gets the best repo github repo id from the repo context.
 */
export function getGitHubRepoInfoFromContext(repoContext: RepoContext): { id: GithubRepoId; remoteUrl: string } | undefined {
	for (const remoteUrl of getOrderedRemoteUrlsFromContext(repoContext)) {
		if (remoteUrl) {
			const id = getGithubRepoIdFromFetchUrl(remoteUrl);
			if (id) {
				return { id, remoteUrl };
			}
		}
	}
	return undefined;
}

export interface ResolvedRepoRemoteInfo {
	readonly fetchUrl: string | undefined;
	readonly repoId: ResolvedRepoId;
}

export type ResolvedRepoId = GithubRepoId | AdoRepoId;

/**
 * Gets the repo info for any type of repo from the repo context.
 */
export function* getOrderedRepoInfosFromContext(repoContext: RepoContext): Iterable<ResolvedRepoRemoteInfo> {
	for (const remoteUrl of getOrderedRemoteUrlsFromContext(repoContext)) {
		const repoId = getGithubRepoIdFromFetchUrl(remoteUrl) ?? getAdoRepoIdFromFetchUrl(remoteUrl);
		if (repoId) {
			yield { repoId, fetchUrl: remoteUrl };
		}
	}
}

/**
 * Returns the remote URLs from repo context, starting with the best first.
 */
export function getOrderedRemoteUrlsFromContext(repoContext: RepoContext): Iterable<string> {
	const out = new Set<string>();

	// Strategy 1: If there's only one remote, use that
	if (repoContext.remoteFetchUrls?.length === 1) {
		out.add(repoContext.remoteFetchUrls[0]!);
		return out;
	}


	// Strategy 2: If there's an upstream remote, use that
	const remoteIndex = repoContext.remotes.findIndex(r => r === repoContext.upstreamRemote);
	if (remoteIndex !== -1) {
		const fetchUrl = repoContext.remoteFetchUrls?.[remoteIndex];
		if (fetchUrl) {
			out.add(fetchUrl);
		}
	}

	// Strategy 3: If there's a remote named "origin", use that
	const originIndex = repoContext.remotes.findIndex(r => r === 'origin');
	if (originIndex !== -1) {
		const fetchUrl = repoContext.remoteFetchUrls?.[originIndex];
		if (fetchUrl) {
			out.add(fetchUrl);
		}
	}

	// Return everything else
	for (const remote of repoContext.remoteFetchUrls ?? []) {
		if (remote) {
			out.add(remote);
		}
	}

	return out;
}

export function parseRemoteUrl(fetchUrl: string): { host: string; rawHost: string; path: string } | undefined {
	fetchUrl = fetchUrl.trim();
	try {
		// Normalize git shorthand syntax (git@github.com:user/repo.git) into an explicit ssh:// url
		// See https://git-scm.com/docs/git-clone/2.35.0#_git_urls
		if (/^[\w\d\-]+@/i.test(fetchUrl)) {
			const parts = fetchUrl.split(':');
			if (parts.length !== 2) {
				return undefined;
			}
			fetchUrl = 'ssh://' + parts[0] + '/' + parts[1];
		}

		const repoUrl = URI.parse(fetchUrl);
		const authority = repoUrl.authority;
		const path = repoUrl.path;
		if (!(equalsIgnoreCase(repoUrl.scheme, 'ssh') || equalsIgnoreCase(repoUrl.scheme, 'https') || equalsIgnoreCase(repoUrl.scheme, 'http'))) {
			return;
		}

		const splitAuthority = authority.split('@');
		if (splitAuthority.length > 2) { // Invalid, too many @ symbols
			return undefined;
		}

		const extractedHost = splitAuthority.at(-1);
		if (!extractedHost) {
			return;
		}

		const rawHost = extractedHost
			.toLowerCase()
			.replace(/:\d+$/, ''); // Remove optional port

		const normalizedHost = rawHost
			.replace(/^[\w\-]+-/, '') // Remove common ssh syntax: abc-github.com
			.replace(/-[\w\-]+$/, '');// Remove common ssh syntax: github.com-abc

		return { host: normalizedHost, rawHost, path: path };
	} catch (err) {
		return undefined;
	}
}

export class GithubRepoId {
	readonly type = 'github';

	static parse(nwo: string): GithubRepoId | undefined {
		const parts = nwo.split('/');
		if (parts.length !== 2) {
			return undefined;
		}
		return new GithubRepoId(parts[0], parts[1]);
	}

	constructor(
		public readonly org: string,
		public readonly repo: string,
		public readonly host: string = 'github.com',
	) { }

	toString(): string {
		return toGithubNwo(this);
	}
}

export function toGithubNwo(id: GithubRepoId): string {
	return `${id.org}/${id.repo}`.toLowerCase();
}

export function toGithubWebUrl(id: GithubRepoId): string {
	return `https://${id.host}/${id.org}/${id.repo}`;
}

/**
 * Extracts the GitHub repository name from a git fetch URL.
 * @param fetchUrl The git fetch URL to extract the repository name from.
 * @returns The repository name if the fetch URL is a valid GitHub URL, otherwise undefined.
 */
export function getGithubRepoIdFromFetchUrl(fetchUrl: string): GithubRepoId | undefined {
	const parsed = parseRemoteUrl(fetchUrl);
	if (!parsed) {
		return undefined;
	}

	const topLevelUrls = ['github.com', 'ghe.com'];
	const matchedHost = topLevelUrls.find(topLevelUrl => parsed.host === topLevelUrl || parsed.host.endsWith('.' + topLevelUrl));
	if (!matchedHost) {
		return;
	}

	// Determine the actual web-accessible hostname
	// For ghe.com subdomains, use the raw host (e.g., 'myco.ghe.com')
	// For github.com, always use 'github.com' (SSH aliases like 'alias-github.com' should map to github.com)
	const webHost = matchedHost === 'ghe.com'
		? parsed.rawHost
		: 'github.com';

	const pathMatch = parsed.path.match(/^\/?([^/]+)\/([^/]+?)(\/|\.git\/?)?$/i);
	return pathMatch ? new GithubRepoId(pathMatch[1], pathMatch[2], webHost) : undefined;
}

export class AdoRepoId {

	readonly type = 'ado';

	constructor(
		public readonly org: string,
		public readonly project: string,
		public readonly repo: string,
	) { }

	toString(): string {
		return `${this.org}/${this.project}/${this.repo}`.toLowerCase();
	}
}

/**
 * Extracts the ADO repository name from a git fetch URL.
 * @param fetchUrl The Git fetch URL to extract the repository name from.
 * @returns The repository name if the fetch URL is a valid ADO URL, otherwise undefined.
 */
export function getAdoRepoIdFromFetchUrl(fetchUrl: string): AdoRepoId | undefined {
	const parsed = parseRemoteUrl(fetchUrl);
	if (!parsed) {
		return undefined;
	}

	// Http: https://dev.azure.com/organization/project/_git/repository
	// Http: https://dev.azure.com/organization/project/_git/_optimized/repository
	// Http: https://dev.azure.com/organization/project/_git/_full/repository
	if (parsed.host === 'dev.azure.com') {
		const partsMatch = parsed.path.match(/^\/?(?<org>[^/]+)\/(?<project>[^/]+?)\/_git\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(\.git|\/)?$/i);
		if (partsMatch?.groups) {
			return new AdoRepoId(partsMatch.groups.org, partsMatch.groups.project, partsMatch.groups.repo);
		}
		return undefined;
	}

	// Ssh: git@ssh.dev.azure.com:v3/organization/project/repository
	// Ssh: git@ssh.dev.azure.com:v3/organization/project/_optimized/repository
	// Ssh: git@ssh.dev.azure.com:v3/organization/project/_full/repository
	if (parsed.host === 'ssh.dev.azure.com') {
		const partsMatch = parsed.path.match(/^\/?v3\/(?<org>[^/]+)\/(?<project>[^/]+?)\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(\.git|\/)?$/i);
		if (partsMatch?.groups) {
			return new AdoRepoId(partsMatch.groups.org, partsMatch.groups.project, partsMatch.groups.repo);
		}
		return undefined;
	}

	// legacy https: https://organization.visualstudio.com/project/_git/repository
	// Legacy ssh: git@organization.visualstudio.com:v3/organization/project/repository
	if (parsed.host.endsWith('.visualstudio.com')) {
		const hostMatch = parsed.host.match(/^(?<org>[^\.]+)\.visualstudio\.com$/i);
		if (!hostMatch?.groups) {
			return undefined;
		}

		const partsMatch =
			// Legacy ssh:  git@organization.visualstudio.com:v3/organization/project/repository
			// Legacy ssh:  git@organization.visualstudio.com:v3/organization/project/_optimized/repository
			// Legacy ssh:  git@organization.visualstudio.com:v3/organization/project/_full/repository
			parsed.path.match(/^\/(v3\/)(?<org>[^/]+?)\/(?<project>[^/]+?)\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(\.git|\/)?$/i)

			// legacy https: https://organization.visualstudio.com/project/_git/repository
			// legacy https: https://organization.visualstudio.com/project/_git/_optimized/repository
			// legacy https: https://organization.visualstudio.com/project/_git/_full/repository
			// or legacy https: https://organization.visualstudio.com/collection/project/_git/repository
			// or legacy https: https://organization.visualstudio.com/collection/project/_git/_optimized/repository
			// or legacy https: https://organization.visualstudio.com/collection/project/_git/_full/repository
			?? parsed.path.match(/^\/?((?<collection>[^/]+?)\/)?(?<project>[^/]+?)\/_git\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(\.git|\/)?$/i);
		if (partsMatch?.groups) {
			return new AdoRepoId(hostMatch.groups.org, partsMatch.groups.project, partsMatch.groups.repo);
		}

		return undefined;
	}

	return undefined;
}

/**
 * Normalizes a remote repo fetch url into a standardized format
 * @param fetchUrl A remote repo fetch url in the form of http, https, or ssh.
 * @returns The normalized fetch url. Sanitized of any credentials, stripped of query params, and using https
 */
export function normalizeFetchUrl(fetchUrl: string): string {
	// Handle SSH shorthand (git@host:project/repo.git)
	if (/^[\w\d\-]+@[\w\d\.\-]+:/.test(fetchUrl)) {
		fetchUrl = fetchUrl.replace(/([\w\d\-]+)@([\w\d\.\-]+):(.+)/, 'https://$2/$3');
		return fetchUrl;
	}

	let url: URL;
	try {
		url = new URL(fetchUrl);
	} catch {
		return fetchUrl;
	}

	// Special handling for the scm/scm.git case
	const scmScmMatch = url.pathname.match(/^\/scm\/scm\.git/);

	// Create new URL with HTTPS protocol
	const newUrl = new URL('https://' + url.hostname + url.pathname);

	// Only remove /scm/ if it is followed by another segment (not if repo is named 'scm')
	if (!scmScmMatch && /^\/scm\/[^/]/.test(newUrl.pathname)) {
		newUrl.pathname = newUrl.pathname.replace(/^\/scm\//, '/');
	}

	return newUrl.toString();
}
