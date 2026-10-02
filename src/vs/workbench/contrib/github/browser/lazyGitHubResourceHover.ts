/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import type { IManagedHoverTooltipHTMLElement } from '../../../../base/browser/ui/hover/hover.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { GitHubIssue, GitHubIssueRef } from '../../../../platform/github/common/githubQueryService.js';
import { PullRequestCheck, PullRequestCore, PullRequestRef, PullRequestSnapshot } from '../../../../platform/github/common/githubPullRequestService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchGitHubService } from '../../../services/github/common/githubService.js';
import type { IActionListItemHover } from '../../../../platform/actionWidget/browser/actionList.js';
import { createIssueResourceHover, createPullRequestResourceHover, type GitHubChecksStatus, type IGitHubIssueHoverModel, type IGitHubPullRequestHoverModel, type IGitHubResourceHover } from './githubResourceHover.js';

export type GitHubReferenceKind = 'pullRequest' | 'issue';

export interface IGitHubReferenceTarget {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

export interface IPullRequestHoverDetails {
	readonly pullRequest: IGitHubPullRequestHoverModel;
	readonly checksStatus: GitHubChecksStatus | undefined;
}

export type LazyGitHubResourceState<T> =
	| { readonly status: 'idle' | 'loading' | 'failed' }
	| { readonly status: 'resolved'; readonly value: T };

interface ILazyGitHubResourceEntry<T> {
	readonly state: ReturnType<typeof observableValue<LazyGitHubResourceState<T>>>;
	promise: Promise<T | undefined> | undefined;
	complete: boolean;
}

export class LazyGitHubResourceResolver extends Disposable {

	private readonly _lifetime = new AbortController();
	private readonly _issues = new Map<string, ILazyGitHubResourceEntry<IGitHubIssueHoverModel>>();
	private readonly _pullRequests = new Map<string, ILazyGitHubResourceEntry<IPullRequestHoverDetails>>();
	private _hovers = new WeakMap<object, ILazyGitHubResourceHover>();

	constructor(
		@IWorkbenchGitHubService private readonly _gitHubService: IWorkbenchGitHubService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._gitHubService.onDidChangeDefaultClient(() => {
			this._hovers = new WeakMap();
			const entries = [...this._issues.values(), ...this._pullRequests.values()];
			this._issues.clear();
			this._pullRequests.clear();
			for (const entry of entries) {
				entry.state.set({ status: 'idle' }, undefined);
			}
		}));
	}

	createHover(identity: object, options: Omit<ILazyGitHubResourceHoverOptions, 'resolver'>): ILazyGitHubResourceHover {
		let hover = this._hovers.get(identity);
		if (!hover) {
			hover = createLazyGitHubResourceHover({ ...options, resolver: this });
			this._hovers.set(identity, hover);
		}
		return hover;
	}

	getIssueState(target: IGitHubReferenceTarget): IObservable<LazyGitHubResourceState<IGitHubIssueHoverModel>> {
		return this._getEntry(this._issues, target).state;
	}

	getPullRequestState(target: IGitHubReferenceTarget): IObservable<LazyGitHubResourceState<IPullRequestHoverDetails>> {
		return this._getEntry(this._pullRequests, target).state;
	}

	resolveIssue(target: IGitHubReferenceTarget): Promise<IGitHubIssueHoverModel | undefined> {
		return this._resolve(this._issues, target, true, () => this._resolveIssue(target), 'issue');
	}

	resolvePullRequest(target: IGitHubReferenceTarget): Promise<IPullRequestHoverDetails | undefined> {
		return this._resolve(this._pullRequests, target, true, () => this._resolvePullRequest(target, true), 'pull request');
	}

	prefetchPullRequest(target: IGitHubReferenceTarget): Promise<IPullRequestHoverDetails | undefined> {
		return this._resolve(this._pullRequests, target, false, () => this._resolvePullRequest(target, false), 'pull request');
	}

	private _getEntry<T>(cache: Map<string, ILazyGitHubResourceEntry<T>>, target: IGitHubReferenceTarget): ILazyGitHubResourceEntry<T> {
		const key = githubTargetKey(target);
		let entry = cache.get(key);
		if (!entry) {
			entry = { state: observableValue(this, { status: 'idle' }), promise: undefined, complete: false };
			cache.set(key, entry);
		}
		return entry;
	}

	private _resolve<T>(cache: Map<string, ILazyGitHubResourceEntry<T>>, target: IGitHubReferenceTarget, requireComplete: boolean, resolve: () => Promise<T | undefined>, kind: string): Promise<T | undefined> {
		const entry = this._getEntry(cache, target);
		const state = entry.state.get();
		if (state.status === 'resolved' && (!requireComplete || entry.complete)) {
			return Promise.resolve(state.value);
		}
		if (entry.promise) {
			return requireComplete
				? entry.promise.then(result => result ? this._resolve(cache, target, true, resolve, kind) : undefined)
				: entry.promise;
		}
		if (!entry.promise) {
			entry.state.set({ status: 'loading' }, undefined);
			entry.promise = resolve().then(result => {
				entry.state.set(result ? { status: 'resolved', value: result } : { status: 'failed' }, undefined);
				entry.complete = !!result && requireComplete;
				return result;
			}, error => {
				entry.state.set({ status: 'failed' }, undefined);
				if (!this._lifetime.signal.aborted) {
					this._logService.warn(`[LazyGitHubResourceResolver] Failed to resolve GitHub ${kind}`, error);
				}
				return undefined;
			}).finally(() => {
				entry.promise = undefined;
			});
		}
		return entry.promise;
	}

	private async _resolveIssue(target: IGitHubReferenceTarget): Promise<IGitHubIssueHoverModel | undefined> {
		const clientReference = await this._gitHubService.acquireDefaultAccountClient(this._lifetime.signal);
		try {
			const client = clientReference.object;
			const credential = await client.credentials.getCredential(this._lifetime.signal);
			const ref: GitHubIssueRef = { ...credential.account, ...target };
			const subscription = client.query.subscribeIssue(ref, { priority: 'interactive' });
			try {
				await subscription.refresh();
				const issue = subscription.resource.state.get().value;
				return issue ? toIssueHoverModel(issue) : undefined;
			} finally {
				subscription.dispose();
			}
		} finally {
			clientReference.dispose();
		}
	}

	private async _resolvePullRequest(target: IGitHubReferenceTarget, includeChecks: boolean): Promise<IPullRequestHoverDetails | undefined> {
		const clientReference = await this._gitHubService.acquireDefaultAccountClient(this._lifetime.signal);
		try {
			const client = clientReference.object;
			const credential = await client.credentials.getCredential(this._lifetime.signal);
			const ref: PullRequestRef = { ...credential.account, ...target };
			const subscription = client.pullRequests.subscribePullRequest(ref, {
				priority: 'interactive',
				core: true,
				...(includeChecks ? { checks: { includeOptional: true } } : {}),
			});
			try {
				await Promise.all([
					subscription.refresh('core'),
					...(includeChecks ? [subscription.refresh('checks')] : []),
				]);
				const snapshot = subscription.resource.snapshot.get();
				return snapshot.core.value ? {
					pullRequest: toPullRequestHoverModel(snapshot.core.value),
					checksStatus: getChecksStatus(snapshot),
				} : undefined;
			} finally {
				subscription.dispose();
			}
		} finally {
			clientReference.dispose();
		}
	}

	override dispose(): void {
		this._lifetime.abort();
		super.dispose();
	}
}

export interface ILazyGitHubResourceHoverOptions {
	readonly kind: GitHubReferenceKind;
	readonly target: IGitHubReferenceTarget;
	readonly resource: URI;
	readonly resolver: LazyGitHubResourceResolver;
	readonly onDidClickRepository: () => void;
	readonly onDidClickReference: () => void;
	readonly onDidClickBaseBranch: (branch: string) => void;
	readonly onDidClickHeadBranch: (branch: string) => void;
}

export interface ILazyGitHubResourceHover {
	readonly hover: IActionListItemHover;
	readonly pillHover: IManagedHoverTooltipHTMLElement;
	readonly prefetch: () => void;
}

export function createLazyGitHubResourceHover(options: ILazyGitHubResourceHoverOptions): ILazyGitHubResourceHover {
	const views = new Map<'default' | 'compact', { readonly element: HTMLElement; tabbableElements: readonly HTMLElement[]; resolution?: Promise<void>; resolved: boolean }>();

	const render = (density: 'default' | 'compact') => {
		let view = views.get(density);
		if (!view) {
			const element = $(`.${options.kind === 'pullRequest' ? 'sessions-pr-hover' : 'sessions-issue-hover'}`);
			element.classList.toggle('compact', density === 'compact');
			element.setAttribute('aria-busy', 'true');
			append(element, $('span', undefined, getLoadingLabel(options.kind, options.target.number)));
			view = { element, tabbableElements: [], resolved: false };
			views.set(density, view);
		}
		if (!view.resolved && !view.resolution) {
			const renderedView = view;
			renderedView.element.setAttribute('aria-busy', 'true');
			renderedView.element.replaceChildren($('span', undefined, getLoadingLabel(options.kind, options.target.number)));
			renderedView.resolution = Promise.resolve().then(() => resolveHover(options, density)).then(result => {
				renderedView.element.setAttribute('aria-busy', 'false');
				if (result) {
					renderedView.element.className = result.element.className;
					renderedView.element.replaceChildren(...result.element.childNodes);
					renderedView.tabbableElements = result.tabbableElements;
					renderedView.resolved = true;
				} else {
					renderedView.element.replaceChildren($('span', undefined, options.resource.toString(true)));
				}
				renderedView.resolution = undefined;
			});
		}
		return view.element;
	};

	return {
		hover: {
			content: () => render('compact'),
			expandable: true,
			showIndicator: false,
			tabThroughPanel: true,
			getTabbableElements: () => views.get('compact')?.tabbableElements ?? [],
			contentOwnsPadding: true,
		},
		pillHover: {
			element: () => render('default'),
			contentOwnsPadding: true,
		},
		prefetch: () => {
			if (options.kind === 'issue') {
				void options.resolver.resolveIssue(options.target);
			} else {
				void options.resolver.prefetchPullRequest(options.target);
			}
		},
	};
}

export function getLazyGitHubResourcePresentation<T>(kind: GitHubReferenceKind, target: IGitHubReferenceTarget, state: LazyGitHubResourceState<T>, fallbackLabel: string, getTitle: (value: T) => string): { readonly label: string; readonly badge?: string; readonly className?: string } {
	switch (state.status) {
		case 'idle':
			return { label: getCanonicalLabel(kind, target.number) };
		case 'loading':
			return { label: getLoadingLabel(kind, target.number) };
		case 'failed':
			return { label: fallbackLabel };
		case 'resolved':
			return {
				label: getTitle(state.value) || getCanonicalLabel(kind, target.number),
				badge: `#${target.number}`,
				className: 'chat-pill-github-reference',
			};
	}
}

async function resolveHover(options: ILazyGitHubResourceHoverOptions, density: 'default' | 'compact'): Promise<IGitHubResourceHover | undefined> {
	const common = {
		...options.target,
		repositoryHref: `https://github.com/${options.target.owner}/${options.target.repo}`,
		referenceHref: options.resource.toString(true),
		density,
		onDidClickRepository: options.onDidClickRepository,
		onDidClickReference: options.onDidClickReference,
	};
	if (options.kind === 'issue') {
		const issue = await options.resolver.resolveIssue(options.target);
		return issue ? createIssueResourceHover({ ...common, issue }) : undefined;
	}
	const details = await options.resolver.resolvePullRequest(options.target);
	return details ? createPullRequestResourceHover({
		...common,
		pullRequest: details.pullRequest,
		checksStatus: details.checksStatus,
		onDidClickBaseBranch: () => options.onDidClickBaseBranch(details.pullRequest.baseRef),
		onDidClickHeadBranch: () => options.onDidClickHeadBranch(details.pullRequest.headRef),
	}) : undefined;
}

export function parseGitHubReferenceTarget(resource: URI, kind: GitHubReferenceKind): IGitHubReferenceTarget | undefined {
	const segments = resource.path.split('/').filter(Boolean);
	const expectedKind = kind === 'pullRequest' ? 'pull' : 'issues';
	const number = Number(segments[3]);
	return resource.scheme === 'https'
		&& resource.authority.toLowerCase() === 'github.com'
		&& segments.length === 4
		&& segments[2] === expectedKind
		&& Number.isInteger(number)
		&& number > 0
		? { owner: segments[0], repo: segments[1], number }
		: undefined;
}

function githubTargetKey(target: IGitHubReferenceTarget): string {
	return `${target.owner.toLowerCase()}/${target.repo.toLowerCase()}#${target.number}`;
}

function getCanonicalLabel(kind: GitHubReferenceKind, number: number): string {
	return kind === 'pullRequest'
		? localize('githubReference.pullRequestLabel', "Pull Request #{0}", number)
		: localize('githubReference.issueLabel', "Issue #{0}", number);
}

function getLoadingLabel(kind: GitHubReferenceKind, number: number): string {
	return kind === 'pullRequest'
		? localize('githubReference.loadingPullRequest', "Loading pull request #{0}…", number)
		: localize('githubReference.loadingIssue', "Loading issue #{0}…", number);
}

function toIssueHoverModel(issue: GitHubIssue): IGitHubIssueHoverModel {
	return {
		title: issue.title,
		body: issue.body,
		state: issue.state,
		stateReason: issue.stateReason,
		author: issue.author,
		createdAt: issue.createdAt,
	};
}

function toPullRequestHoverModel(pullRequest: PullRequestCore): IGitHubPullRequestHoverModel {
	return {
		title: pullRequest.title,
		body: pullRequest.body ?? '',
		state: pullRequest.state,
		author: pullRequest.author ?? { login: 'unknown' },
		headRef: pullRequest.headRef,
		baseRef: pullRequest.baseRef,
		isDraft: pullRequest.draft,
		createdAt: pullRequest.createdAt,
	};
}

function getChecksStatus(snapshot: PullRequestSnapshot): GitHubChecksStatus | undefined {
	const checksValue = snapshot.checks.value;
	if (!checksValue || checksValue.headSha !== snapshot.core.value?.headSha) {
		return undefined;
	}
	const checks = checksValue.checks;
	if (!checks.length) {
		return undefined;
	}
	if (checks.some(isPendingCheck)) {
		return 'pending';
	}
	return checks.some(isFailingCheck) ? 'failure' : 'success';
}

function isPendingCheck(check: PullRequestCheck): boolean {
	return check.type === 'checkRun'
		? check.status !== 'COMPLETED'
		: check.status === 'PENDING' || check.status === 'EXPECTED';
}

function isFailingCheck(check: PullRequestCheck): boolean {
	return check.type === 'checkRun'
		? check.conclusion === 'FAILURE'
		|| check.conclusion === 'TIMED_OUT'
		|| check.conclusion === 'CANCELLED'
		|| check.conclusion === 'ACTION_REQUIRED'
		|| check.conclusion === 'STARTUP_FAILURE'
		: check.status === 'FAILURE' || check.status === 'ERROR';
}
