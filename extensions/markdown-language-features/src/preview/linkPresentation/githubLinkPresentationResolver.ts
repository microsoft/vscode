/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LinkPresentationStatus } from '@vscode/markdown-editor';
import type { IObservable } from '@vscode/observables';
import * as vscode from 'vscode';
import { buildGitHubFilePresentation, buildGitHubIssuePresentation, buildGitHubLookupFailurePresentation, buildGitHubPullRequestPresentation, buildGitHubRepositoryPresentation, buildLoadingLinkPresentation, type GitHubChecksStatus, type GitHubIssueStatus, type GitHubPullRequestStatus } from './linkPresentationBuilders';
import { createAsyncLinkPresentation, decodeUrlPathSegments, LinkPresentationCache, type LinkPresentation, type LinkPresentationResolver, type LinkPresentationResolverContext } from './linkPresentationResolver';

const githubRepositoryScope = 'repo';

export class GitHubLinkPresentationResolver implements LinkPresentationResolver {
	readonly refreshOnInterval = true;
	readonly #cache: LinkPresentationCache;
	readonly #onDidChangeAuthentication = new vscode.EventEmitter<void>();
	readonly #authenticationSubscription: vscode.Disposable;
	#accessToken: Promise<string> | undefined;

	constructor(cache: LinkPresentationCache) {
		this.#cache = cache;
		this.#authenticationSubscription = vscode.authentication.onDidChangeSessions(event => {
			if (event.provider.id === 'github') {
				this.#accessToken = undefined;
				this.#cache.clear();
				this.#onDidChangeAuthentication.fire();
			}
		});
	}

	resolve(href: string, context: LinkPresentationResolverContext): IObservable<LinkPresentation> | undefined {
		const target = parseGitHubTarget(href);
		if (!target) {
			return undefined;
		}
		const persisted = this.#cache.getPersisted(href);
		const loadingPresentation = buildLoadingLinkPresentation(target.kind === 'tree' ? 'resource' : target.kind);
		return createAsyncLinkPresentation(
			href,
			persisted ?? loadingPresentation,
			context,
			() => this.#cache.get(href, () => this.#resolve(target)),
			error => getGitHubLookupFailurePresentationForTarget(target, error),
			[context.onDidRequestRefresh],
			{ event: this.#onDidChangeAuthentication.event, presentation: loadingPresentation },
		);
	}

	dispose(): void {
		this.#authenticationSubscription.dispose();
		this.#onDidChangeAuthentication.dispose();
	}

	async #resolve(target: GitHubTarget): Promise<LinkPresentation> {
		const request = new GitHubRequest(await this.#getAccessToken());
		switch (target.kind) {
			case 'issue': {
				const issue = await request.get(`/repos/${target.owner}/${target.repository}/issues/${target.number}`, readIssue);
				const state = getGitHubIssueStatus(issue.state, issue.stateReason);
				return buildGitHubIssuePresentation({
					owner: target.owner,
					repository: target.repository,
					number: target.number,
					title: issue.title,
					status: state,
				});
			}
			case 'pullRequest': {
				const pullRequest = await request.get(`/repos/${target.owner}/${target.repository}/pulls/${target.number}`, readPullRequest);
				const state = getGitHubPullRequestStatus(pullRequest.state, pullRequest.draft, pullRequest.merged);
				const checksStatus = shouldShowGitHubPullRequestChecks(state)
					? checkRunStatus(await request.getAll(
						`/repos/${target.owner}/${target.repository}/commits/${encodeURIComponent(pullRequest.headSha)}/check-runs`,
						readCheckRuns,
					))
					: undefined;
				const presentationData = {
					owner: target.owner,
					repository: target.repository,
					number: target.number,
					title: pullRequest.title,
					status: state,
				};
				return state.kind === 'open' || state.kind === 'draft'
					? buildGitHubPullRequestPresentation({ ...presentationData, status: state, checksStatus })
					: buildGitHubPullRequestPresentation({ ...presentationData, status: state });
			}
			case 'repository': {
				const repository = await request.get(`/repos/${target.owner}/${target.repository}`, readRepository);
				return buildGitHubRepositoryPresentation({
					owner: target.owner,
					repository: target.repository,
					language: repository.language,
					stars: repository.stars,
				});
			}
			case 'tree': {
				const refs = await request.get(
					`/repos/${target.owner}/${target.repository}/git/matching-refs/heads/${encodeURIComponent(target.segments[0])}`,
					readGitRefs,
				);
				const tree = resolveGitHubTreePath(target.segments, refs);
				if (!tree) {
					throw new GitHubLookupError('notFound', `GitHub did not find branch ${target.segments.join('/')}.`);
				}
				const label = tree.path || tree.branch;
				return {
					kind: 'resource',
					detail: `${target.owner}/${target.repository} · ${label}`,
					tooltip: target.href,
					ariaLabel: `GitHub tree ${label} in ${target.owner} slash ${target.repository}`,
				};
			}
			case 'file':
				return buildGitHubFilePresentation({
					owner: target.owner,
					repository: target.repository,
					path: target.path,
					href: target.href,
				});
		}
	}

	#getAccessToken(): Promise<string> {
		if (this.#accessToken) {
			return this.#accessToken;
		}
		const value = this.#readAccessToken().catch(error => {
			if (
				this.#accessToken === value
				&& !(error instanceof GitHubLookupError && error.kind === 'authenticationRequired')
			) {
				this.#accessToken = undefined;
			}
			throw error;
		});
		this.#accessToken = value;
		return value;
	}

	async #readAccessToken(): Promise<string> {
		try {
			const accounts = await vscode.authentication.getAccounts('github');
			for (const account of accounts) {
				const session = await vscode.authentication.getSession('github', [], { silent: true, account });
				if (session?.scopes.includes(githubRepositoryScope)) {
					return session.accessToken;
				}
			}
			const session = await vscode.authentication.getSession('github', [githubRepositoryScope], {
				createIfNone: {
					detail: 'The Markdown editor needs repository access to show issue, pull request, and CI status.',
				},
				...(accounts.length === 1 ? { account: accounts[0] } : {}),
			});
			return session.accessToken;
		} catch (error) {
			throw new GitHubLookupError(
				'authenticationRequired',
				`GitHub repository access was not authorized.${error instanceof Error ? ` ${error.message}` : ''}`,
			);
		}
	}
}

class GitHubRequest {
	readonly #accessToken: string;

	constructor(accessToken: string) {
		this.#accessToken = accessToken;
	}

	async get<T>(apiPath: string, read: (value: unknown) => T | undefined): Promise<T> {
		const response = await fetch(`https://api.github.com${apiPath}`, {
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${this.#accessToken}`,
			},
		});
		if (!response.ok) {
			throw GitHubLookupError.fromResponse(apiPath, response);
		}
		const value = read(await response.json());
		if (!value) {
			throw new GitHubLookupError(
				'invalidResponse',
				`GitHub request ${apiPath} returned an unexpected response.`,
			);
		}
		return value;
	}

	async getAll<T>(apiPath: string, read: (value: unknown) => readonly T[] | undefined): Promise<readonly T[]> {
		const values: T[] = [];
		const pageSize = 100;
		for (let page = 1; ; page++) {
			const separator = apiPath.includes('?') ? '&' : '?';
			const pageValues = await this.get(`${apiPath}${separator}per_page=${pageSize}&page=${page}`, read);
			values.push(...pageValues);
			if (pageValues.length < pageSize) {
				return values;
			}
		}
	}
}

type GitHubLookupFailureKind =
	| 'authenticationRequired'
	| 'authenticationFailed'
	| 'accessDenied'
	| 'rateLimited'
	| 'notFound'
	| 'invalidResponse'
	| 'requestFailed';

export class GitHubLookupError extends Error {
	readonly kind: GitHubLookupFailureKind;

	constructor(kind: GitHubLookupFailureKind, message: string) {
		super(message);
		this.name = 'GitHubLookupError';
		this.kind = kind;
	}

	static fromResponse(apiPath: string, response: Response): GitHubLookupError {
		const message = `GitHub request ${apiPath} failed: ${response.status} ${response.statusText}`;
		if (response.status === 401) {
			return new GitHubLookupError('authenticationFailed', message);
		}
		if (response.status === 403) {
			return new GitHubLookupError(
				response.headers.get('x-ratelimit-remaining') === '0' ? 'rateLimited' : 'accessDenied',
				message,
			);
		}
		if (response.status === 404) {
			return new GitHubLookupError('notFound', message);
		}
		return new GitHubLookupError('requestFailed', message);
	}
}

type GitHubTarget =
	| { readonly kind: 'issue'; readonly href: string; readonly owner: string; readonly repository: string; readonly number: number }
	| { readonly kind: 'pullRequest'; readonly href: string; readonly owner: string; readonly repository: string; readonly number: number }
	| { readonly kind: 'repository'; readonly href: string; readonly owner: string; readonly repository: string }
	| { readonly kind: 'tree'; readonly href: string; readonly owner: string; readonly repository: string; readonly segments: readonly [string, ...string[]] }
	| { readonly kind: 'file'; readonly href: string; readonly owner: string; readonly repository: string; readonly path: string };

function parseGitHubTarget(href: string): GitHubTarget | undefined {
	let uri: URL;
	try {
		uri = new URL(href);
	} catch {
		return undefined;
	}
	if (uri.protocol !== 'https:' || uri.hostname.toLowerCase() !== 'github.com') {
		return undefined;
	}
	const segments = decodeUrlPathSegments(uri);
	if (!segments) {
		return undefined;
	}
	const [owner, repository, category, identifier, ...rest] = segments;
	if (!owner || !repository) {
		return undefined;
	}
	if (!category) {
		return { kind: 'repository', href, owner, repository };
	}
	if (category === 'issues' || category === 'pull') {
		const number = Number(identifier);
		return Number.isInteger(number) && number > 0
			? { kind: category === 'issues' ? 'issue' : 'pullRequest', href, owner, repository, number }
			: undefined;
	}
	if (category === 'tree' && identifier) {
		return { kind: 'tree', href, owner, repository, segments: [identifier, ...rest] };
	}
	if (category === 'blob' && identifier && rest.length) {
		return { kind: 'file', href, owner, repository, path: rest.join('/') };
	}
	return undefined;
}

export function getGitHubLookupFailurePresentation(
	href: string,
	error: unknown,
): LinkPresentation | undefined {
	const target = parseGitHubTarget(href);
	if (!target) {
		return undefined;
	}
	return getGitHubLookupFailurePresentationForTarget(target, error);
}

function getGitHubLookupFailurePresentationForTarget(
	target: GitHubTarget,
	error: unknown,
): LinkPresentation {
	const failure = error instanceof GitHubLookupError
		? githubLookupFailureDescription(error.kind)
		: { label: 'Lookup failed', detail: 'The GitHub request could not be completed.' };
	const kind = target.kind === 'tree' ? 'resource' : target.kind;
	return buildGitHubLookupFailurePresentation({
		kind,
		label: failure.label,
		detail: failure.detail,
		errorMessage: error instanceof Error ? error.message : undefined,
	});
}

function githubLookupFailureDescription(kind: GitHubLookupFailureKind): {
	readonly label: string;
	readonly detail: string;
} {
	switch (kind) {
		case 'authenticationRequired':
			return {
				label: 'Authorization required',
				detail: 'Authorize GitHub repository access in VS Code to load this link.',
			};
		case 'authenticationFailed':
			return {
				label: 'Authentication failed',
				detail: 'GitHub rejected the current VS Code authentication session.',
			};
		case 'accessDenied':
			return {
				label: 'Access denied',
				detail: 'The current GitHub account cannot access this resource.',
			};
		case 'rateLimited':
			return {
				label: 'Rate limited',
				detail: 'GitHub API rate limiting prevented this lookup.',
			};
		case 'notFound':
			return {
				label: 'Not found',
				detail: 'GitHub did not find this resource, or the current account cannot access it.',
			};
		case 'invalidResponse':
			return {
				label: 'Invalid response',
				detail: 'GitHub returned data the Markdown editor could not read.',
			};
		case 'requestFailed':
			return {
				label: 'Lookup failed',
				detail: 'GitHub returned an unsuccessful response.',
			};
	}
}

interface GitRefData {
	readonly ref: string;
}

function readGitRefs(value: unknown): readonly GitRefData[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const refs: GitRefData[] = [];
	for (const item of value) {
		if (!isRecord(item) || typeof item.ref !== 'string') {
			return undefined;
		}
		refs.push({ ref: item.ref });
	}
	return refs;
}

export function resolveGitHubTreePath(
	segments: readonly string[],
	refs: readonly GitRefData[],
): { readonly branch: string; readonly path?: string } | undefined {
	const target = segments.join('/');
	const branch = refs
		.map(ref => ref.ref.startsWith('refs/heads/') ? ref.ref.slice('refs/heads/'.length) : undefined)
		.filter((candidate): candidate is string => !!candidate && (target === candidate || target.startsWith(`${candidate}/`)))
		.sort((a, b) => b.length - a.length)[0];
	if (!branch) {
		return undefined;
	}
	const path = target === branch ? undefined : target.slice(branch.length + 1);
	return { branch, ...(path ? { path } : {}) };
}

interface IssueData {
	readonly title: string;
	readonly state: 'open' | 'closed';
	readonly stateReason?: 'completed' | 'not_planned' | 'reopened';
}

function readIssue(value: unknown): IssueData | undefined {
	if (!isRecord(value) || typeof value.title !== 'string' || (value.state !== 'open' && value.state !== 'closed')) {
		return undefined;
	}
	const stateReason = value.state_reason === 'completed' || value.state_reason === 'not_planned' || value.state_reason === 'reopened'
		? value.state_reason
		: undefined;
	return { title: value.title, state: value.state, ...(stateReason ? { stateReason } : {}) };
}

interface PullRequestData extends IssueData {
	readonly draft: boolean;
	readonly merged: boolean;
	readonly headSha: string;
}

function readPullRequest(value: unknown): PullRequestData | undefined {
	if (!isRecord(value) || !isRecord(value.head)) {
		return undefined;
	}
	const issue = readIssue(value);
	return issue
		&& typeof value.draft === 'boolean'
		&& typeof value.merged === 'boolean'
		&& typeof value.head.sha === 'string'
		? { ...issue, draft: value.draft, merged: value.merged, headSha: value.head.sha }
		: undefined;
}

interface CheckRunData {
	readonly status: string;
	readonly conclusion: string | null;
}

function readCheckRuns(value: unknown): readonly CheckRunData[] | undefined {
	if (!isRecord(value) || !Array.isArray(value.check_runs)) {
		return undefined;
	}
	const runs: CheckRunData[] = [];
	for (const run of value.check_runs) {
		if (!isRecord(run) || typeof run.status !== 'string' || (run.conclusion !== null && typeof run.conclusion !== 'string')) {
			return undefined;
		}
		runs.push({ status: run.status, conclusion: run.conclusion });
	}
	return runs;
}

export function getGitHubIssueStatus(
	state: IssueData['state'],
	stateReason: IssueData['stateReason'],
): GitHubIssueStatus {
	if (state === 'open') {
		return { kind: 'open', label: 'Open' };
	}
	return stateReason === 'not_planned'
		? { kind: 'notPlanned', label: 'Not planned' }
		: { kind: 'closed', label: 'Closed' };
}

export function getGitHubPullRequestStatus(
	state: PullRequestData['state'],
	draft: boolean,
	merged: boolean,
): GitHubPullRequestStatus {
	if (merged) {
		return { kind: 'merged', label: 'Merged' };
	}
	if (draft) {
		return { kind: 'draft', label: 'Draft' };
	}
	return state === 'closed'
		? { kind: 'closed', label: 'Closed' }
		: { kind: 'open', label: 'Open' };
}

export function shouldShowGitHubPullRequestChecks(status: LinkPresentationStatus): boolean {
	return status.kind === 'open' || status.kind === 'draft';
}

function checkRunStatus(checks: readonly CheckRunData[] | undefined): GitHubChecksStatus | undefined {
	if (!checks?.length) {
		return undefined;
	}
	if (checks.some(check => check.status !== 'completed')) {
		return { kind: 'pending', label: 'Checks running' };
	}
	if (checks.some(check => check.conclusion === 'failure'
		|| check.conclusion === 'timed_out'
		|| check.conclusion === 'cancelled'
		|| check.conclusion === 'action_required')) {
		return { kind: 'error', label: 'Checks failed' };
	}
	return { kind: 'success', label: 'Checks passed' };
}

interface RepositoryData {
	readonly language?: string;
	readonly stars?: number;
}

function readRepository(value: unknown): RepositoryData | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	return {
		...(typeof value.language === 'string' ? { language: value.language } : {}),
		...(typeof value.stargazers_count === 'number' ? { stars: value.stargazers_count } : {}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
