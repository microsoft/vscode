/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IManagedHoverTooltipHTMLElement } from '../../../../base/browser/ui/hover/hover.js';
import { DeferredPromise, Limiter, raceCancellationError } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { GitHubIssue, GitHubIssueRef } from '../../../../platform/github/common/githubQueryService.js';
import { PullRequestCheck, PullRequestCore, PullRequestRef, PullRequestSnapshot } from '../../../../platform/github/common/githubPullRequestService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchGitHubService } from '../../../services/github/common/githubService.js';
import type { IActionListItemHover } from '../../../../platform/actionWidget/browser/actionList.js';
import { createChatPillHover } from '../../../browser/chatPillHover.js';
import { getChatReferencePillPresentation, type ChatReferenceKind } from '../../../browser/chatPills.js';
import { createIssueResourceHover, createPullRequestResourceHover, getPullRequestResourceStatus, type GitHubChecksStatus, type IGitHubIssueHoverModel, type IGitHubPullRequestHoverModel, type IGitHubResourceHover } from './githubResourceHover.js';
import { computeIssueIcon } from '../../../common/chatIssue.js';
import { computePullRequestIcon } from '../../../common/chatPullRequest.js';

type GitHubReferenceKind = ChatReferenceKind;

export interface IGitHubReferenceTarget {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

export interface IPullRequestHoverDetails {
	readonly pullRequest: IGitHubPullRequestHoverModel;
	readonly checksStatus: GitHubChecksStatus | undefined;
	readonly checksUnavailable?: boolean;
}

export type LazyGitHubResourceState<T> =
	| { readonly status: 'idle' | 'loading' | 'failed' }
	| { readonly status: 'resolved'; readonly value: T; readonly stale?: boolean };

interface IGitHubResourceRequest {
	readonly signal: AbortSignal;
	interactive: boolean;
	complete: boolean;
	promote?: () => void;
}

interface ILazyGitHubResourceEntry<T> {
	readonly state: ReturnType<typeof observableValue<LazyGitHubResourceState<T>>>;
	promise: Promise<T | undefined> | undefined;
	controller: AbortController | undefined;
	promote?: (resolve: (request: IGitHubResourceRequest) => Promise<T | undefined>, requireComplete: boolean) => void;
	request?: IGitHubResourceRequest;
	complete: boolean;
	resolvedAt: number | undefined;
}

const PREFETCH_MAX_AGE = 15 * 60_000;
const ISSUE_MAX_AGE = 60_000;
const PULL_REQUEST_MAX_AGE = 30_000;

export class GitHubResourceDetailsResolver extends Disposable {

	private readonly _lifetime = new AbortController();
	private readonly _prefetchLimiter = this._register(new Limiter<void>(3));
	private readonly _issues = new Map<string, ILazyGitHubResourceEntry<IGitHubIssueHoverModel>>();
	private readonly _pullRequests = new Map<string, ILazyGitHubResourceEntry<IPullRequestHoverDetails>>();
	private _hovers = new WeakMap<object, IGitHubResourceDetailsHover>();
	private _details = new WeakMap<object, IGitHubResourceDetails>();
	private _scope: string | undefined;
	private _retainedTargets = new Set<string>();

	constructor(
		@IWorkbenchGitHubService private readonly _gitHubService: IWorkbenchGitHubService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._gitHubService.onDidChangeDefaultClient(() => {
			this._hovers = new WeakMap();
			this._details = new WeakMap();
			const entries = [...this._issues.values(), ...this._pullRequests.values()];
			this._issues.clear();
			this._pullRequests.clear();
			for (const entry of entries) {
				entry.controller?.abort();
				entry.state.set({ status: 'idle' }, undefined);
			}
		}));
	}

	createHover(identity: object, options: Omit<IGitHubResourceDetailsHoverOptions, 'resolver'>): IGitHubResourceDetailsHover {
		let hover = this._hovers.get(identity);
		if (!hover) {
			hover = createGitHubResourceDetailsHover({ ...options, resolver: this });
			this._hovers.set(identity, hover);
		}
		return hover;
	}

	resolveReference(identity: object, options: IGitHubResourceDetailsOptions): IGitHubResourceDetails | undefined {
		const target = parseGitHubReferenceTarget(options.resource, options.kind);
		if (!target) {
			return undefined;
		}
		let details = this._details.get(identity);
		if (!details) {
			const hover = options.enrich === false ? undefined : this.createHover(identity, {
				kind: options.kind,
				target,
				resource: options.resource,
				onDidClickRepository: () => options.onDidClickRepository(URI.parse(`https://github.com/${target.owner}/${target.repo}`)),
				onDidClickReference: options.onDidClickReference,
				onDidClickBaseBranch: options.onDidClickBranch,
				onDidClickHeadBranch: options.onDidClickBranch,
			});
			const presentation = options.kind === 'issue'
				? derived(this, reader => getGitHubResourceDetailsPresentation('issue', target, this.getIssueState(target).read(reader), options.fallbackLabel))
				: derived(this, reader => getGitHubResourceDetailsPresentation('pullRequest', target, this.getPullRequestState(target).read(reader), options.fallbackLabel));
			details = {
				presentation,
				...(hover ? { hover } : {}),
			};
			this._details.set(identity, details);
		}
		return details;
	}

	/** Retains current references and warms new arrivals, but not a newly selected session's history. */
	retain(references: readonly { readonly identity: object; readonly resource: URI }[], scope?: string): void {
		const issues = new Set<string>();
		const pullRequests = new Set<string>();
		const targets = new Set<string>();
		const hovers = new WeakMap<object, IGitHubResourceDetailsHover>();
		const details = new WeakMap<object, IGitHubResourceDetails>();
		for (const reference of references) {
			const issue = parseGitHubReferenceTarget(reference.resource, 'issue');
			const pullRequest = parseGitHubReferenceTarget(reference.resource, 'pullRequest');
			if (issue) {
				issues.add(githubTargetKey(issue));
			}
			if (pullRequest) {
				pullRequests.add(githubTargetKey(pullRequest));
			}
			const kind = issue ? 'issue' : 'pullRequest';
			const target = issue ?? pullRequest;
			if (target) {
				const key = `${kind}:${githubTargetKey(target)}`;
				targets.add(key);
				if (scope !== undefined && scope === this._scope && !this._retainedTargets.has(key)) {
					if (issue) {
						void this.prefetchIssue(issue);
					} else {
						void this.prefetchPullRequest(target);
					}
				}
			}
			const hover = this._hovers.get(reference.identity);
			if (hover && (issue || pullRequest)) {
				hovers.set(reference.identity, hover);
			}
			const referenceDetails = this._details.get(reference.identity);
			if (referenceDetails && (issue || pullRequest)) {
				details.set(reference.identity, referenceDetails);
			}
		}
		this._scope = scope;
		this._retainedTargets = targets;
		this._hovers = hovers;
		this._details = details;
		for (const [cache, keys] of [[this._issues, issues], [this._pullRequests, pullRequests]] as const) {
			for (const key of cache.keys()) {
				if (!keys.has(key)) {
					cache.get(key)?.controller?.abort();
					cache.delete(key);
				}
			}
		}
	}

	getIssueState(target: IGitHubReferenceTarget): IObservable<LazyGitHubResourceState<IGitHubIssueHoverModel>> {
		return this._getEntry(this._issues, target).state;
	}

	getPullRequestState(target: IGitHubReferenceTarget): IObservable<LazyGitHubResourceState<IPullRequestHoverDetails>> {
		return this._getEntry(this._pullRequests, target).state;
	}

	isFresh(kind: GitHubReferenceKind, target: IGitHubReferenceTarget): boolean {
		return kind === 'issue'
			? this._isFresh(this._getEntry(this._issues, target), true, ISSUE_MAX_AGE)
			: this._isFresh(this._getEntry(this._pullRequests, target), true, PULL_REQUEST_MAX_AGE);
	}

	resolveIssue(target: IGitHubReferenceTarget): Promise<IGitHubIssueHoverModel | undefined> {
		return this._resolve(this._issues, target, true, ISSUE_MAX_AGE, request => this._resolveIssue(target, request), 'issue');
	}

	prefetchIssue(target: IGitHubReferenceTarget): Promise<IGitHubIssueHoverModel | undefined> {
		return this._resolve(this._issues, target, true, PREFETCH_MAX_AGE, request => this._resolveIssue(target, request), 'issue', true);
	}

	resolvePullRequest(target: IGitHubReferenceTarget): Promise<IPullRequestHoverDetails | undefined> {
		return this._resolve(this._pullRequests, target, true, PULL_REQUEST_MAX_AGE, request => this._resolvePullRequest(target, true, request), 'pull request');
	}

	prefetchPullRequest(target: IGitHubReferenceTarget): Promise<IPullRequestHoverDetails | undefined> {
		return this._resolve(this._pullRequests, target, false, PREFETCH_MAX_AGE, request => this._resolvePullRequest(target, false, request), 'pull request', true);
	}

	private _getEntry<T>(cache: Map<string, ILazyGitHubResourceEntry<T>>, target: IGitHubReferenceTarget): ILazyGitHubResourceEntry<T> {
		const key = githubTargetKey(target);
		let entry = cache.get(key);
		if (!entry) {
			entry = { state: observableValue(this, { status: 'idle' }), promise: undefined, controller: undefined, complete: false, resolvedAt: undefined };
			cache.set(key, entry);
		}
		return entry;
	}

	private _isFresh<T>(entry: ILazyGitHubResourceEntry<T>, requireComplete: boolean, maxAge: number): boolean {
		const state = entry.state.get();
		return state.status === 'resolved' && !state.stale && (!requireComplete || entry.complete) && entry.resolvedAt !== undefined && Date.now() - entry.resolvedAt < maxAge;
	}

	private _resolve<T>(cache: Map<string, ILazyGitHubResourceEntry<T>>, target: IGitHubReferenceTarget, requireComplete: boolean, maxAge: number, resolve: (request: IGitHubResourceRequest) => Promise<T | undefined>, kind: string, prefetch = false): Promise<T | undefined> {
		const key = githubTargetKey(target);
		const entry = this._getEntry(cache, target);
		const state = entry.state.get();
		if (state.status === 'resolved' && this._isFresh(entry, requireComplete, maxAge)) {
			return Promise.resolve(state.value);
		}
		if (entry.promise) {
			if (!prefetch) {
				if (entry.request && !entry.request.interactive) {
					entry.request.interactive = true;
					entry.request.promote?.();
				}
				entry.promote?.(resolve, requireComplete);
			}
			return requireComplete
				? entry.promise.then(result => result && cache.get(key) === entry ? this._resolve(cache, target, true, maxAge, resolve, kind) : undefined)
				: entry.promise;
		}
		if (!entry.promise) {
			if (state.status !== 'resolved') {
				entry.state.set({ status: 'loading' }, undefined);
			}
			const controller = new AbortController();
			entry.controller = controller;
			const signal = AbortSignal.any([this._lifetime.signal, controller.signal]);
			const request: IGitHubResourceRequest = { signal, interactive: !prefetch, complete: requireComplete };
			entry.request = request;
			const result = new DeferredPromise<T | undefined>();
			let started = false;
			const execute = (resolveTask = resolve, fullyResolve = requireComplete): Promise<void> => {
				if (started) {
					return Promise.resolve();
				}
				started = true;
				entry.promote = undefined;
				request.complete = fullyResolve;
				const run = async () => {
					signal.throwIfAborted();
					return resolveTask(request);
				};
				return result.settleWith(run());
			};
			entry.promote = prefetch ? (resolveTask, fullyResolve) => { void execute(resolveTask, fullyResolve); } : undefined;
			const refresh = async () => {
				if (!prefetch) {
					void execute();
					return result.p;
				}
				const cancellation = new CancellationTokenSource();
				const abortListener = Event.once(Event.fromDOMEventEmitter(signal, 'abort'))(() => cancellation.cancel());
				if (signal.aborted) {
					cancellation.cancel();
				}
				try {
					void this._prefetchLimiter.queue(() => execute()).catch(error => result.error(error));
					return await raceCancellationError(result.p, cancellation.token);
				} finally {
					abortListener.dispose();
					cancellation.dispose();
				}
			};
			entry.promise = refresh().then(result => {
				if (signal.aborted || cache.get(key) !== entry) {
					return undefined;
				}
				if (cache.get(key) === entry) {
					entry.state.set(result ? { status: 'resolved', value: result } : state.status === 'resolved' ? { ...state, stale: true } : { status: 'failed' }, undefined);
				}
				if (result) {
					entry.complete = request.complete;
					entry.resolvedAt = Date.now();
				}
				return result;
			}, error => {
				if (cache.get(key) === entry) {
					entry.state.set(state.status === 'resolved' ? { ...state, stale: true } : { status: 'failed' }, undefined);
				}
				if (!signal.aborted) {
					this._logService.warn(`[GitHubResourceDetailsResolver] Failed to resolve GitHub ${kind}`, error);
				}
				return undefined;
			}).finally(() => {
				if (entry.controller === controller) {
					entry.controller = undefined;
					entry.promise = undefined;
					entry.promote = undefined;
					entry.request = undefined;
				}
			});
		}
		return entry.promise;
	}

	private async _resolveIssue(target: IGitHubReferenceTarget, request: IGitHubResourceRequest): Promise<IGitHubIssueHoverModel | undefined> {
		const { signal } = request;
		const cancellation = new CancellationTokenSource();
		const abortListener = Event.once(Event.fromDOMEventEmitter(signal, 'abort'))(() => cancellation.cancel());
		if (signal.aborted) {
			cancellation.cancel();
		}
		let clientReference: Awaited<ReturnType<IWorkbenchGitHubService['acquireDefaultAccountClient']>> | undefined;
		try {
			clientReference = await this._gitHubService.acquireDefaultAccountClient(signal);
			const client = clientReference.object;
			const credential = await client.credentials.getCredential(signal);
			if (credential.account.host.toLowerCase() !== 'api.github.com') {
				throw new Error('The selected GitHub account does not host github.com references.');
			}
			const ref: GitHubIssueRef = { ...credential.account, ...target };
			const subscription = client.query.subscribeIssue(ref, { priority: request.interactive ? 'interactive' : 'background' });
			try {
				request.promote = () => subscription.update({ priority: 'interactive' });
				await subscription.refresh(cancellation.token);
				signal.throwIfAborted();
				const state = subscription.resource.state.get();
				if (state.status !== 'ready') {
					throw new Error(state.error?.message ?? 'GitHub issue details are unavailable.');
				}
				return state.value ? toIssueHoverModel(state.value) : undefined;
			} finally {
				request.promote = undefined;
				subscription.dispose();
			}
		} finally {
			clientReference?.dispose();
			abortListener.dispose();
			cancellation.dispose();
		}
	}

	private async _resolvePullRequest(target: IGitHubReferenceTarget, includeChecks: boolean, request: IGitHubResourceRequest): Promise<IPullRequestHoverDetails | undefined> {
		const { signal } = request;
		const cancellation = new CancellationTokenSource();
		const abortListener = Event.once(Event.fromDOMEventEmitter(signal, 'abort'))(() => cancellation.cancel());
		if (signal.aborted) {
			cancellation.cancel();
		}
		let clientReference: Awaited<ReturnType<IWorkbenchGitHubService['acquireDefaultAccountClient']>> | undefined;
		try {
			clientReference = await this._gitHubService.acquireDefaultAccountClient(signal);
			const client = clientReference.object;
			const credential = await client.credentials.getCredential(signal);
			if (credential.account.host.toLowerCase() !== 'api.github.com') {
				throw new Error('The selected GitHub account does not host github.com references.');
			}
			const ref: PullRequestRef = { ...credential.account, ...target };
			const subscription = client.pullRequests.subscribePullRequest(ref, {
				priority: request.interactive ? 'interactive' : 'background',
				core: true,
			});
			try {
				request.promote = () => subscription.update({ priority: 'interactive', core: true });
				await subscription.refresh('core', cancellation.token);
				signal.throwIfAborted();
				let checksUnavailable = false;
				includeChecks ||= request.interactive;
				request.complete = includeChecks;
				if (includeChecks) {
					subscription.update({ priority: 'interactive', core: true, checks: { includeOptional: true } });
					await subscription.refresh('checks', cancellation.token).catch(error => {
						signal.throwIfAborted();
						checksUnavailable = true;
						this._logService.warn('[GitHubResourceDetailsResolver] Failed to resolve optional pull request checks', error);
					});
				}
				signal.throwIfAborted();
				const snapshot = subscription.resource.snapshot.get();
				if (snapshot.core.status !== 'ready') {
					throw new Error(snapshot.core.error?.message ?? 'GitHub pull request details are unavailable.');
				}
				checksUnavailable ||= includeChecks && snapshot.checks.status !== 'ready';
				return snapshot.core.value ? {
					pullRequest: toPullRequestHoverModel(snapshot.core.value),
					checksStatus: checksUnavailable ? undefined : getChecksStatus(snapshot),
					...(checksUnavailable ? { checksUnavailable: true } : {}),
				} : undefined;
			} finally {
				request.promote = undefined;
				subscription.dispose();
			}
		} finally {
			clientReference?.dispose();
			abortListener.dispose();
			cancellation.dispose();
		}
	}

	override dispose(): void {
		this._lifetime.abort();
		this.retain([]);
		super.dispose();
	}
}

export interface IGitHubResourceDetailsHoverOptions {
	readonly kind: GitHubReferenceKind;
	readonly target: IGitHubReferenceTarget;
	readonly resource: URI;
	readonly resolver: GitHubResourceDetailsResolver;
	readonly onDidClickRepository: () => void;
	readonly onDidClickReference: () => void;
	readonly onDidClickBaseBranch: (branch: string) => void;
	readonly onDidClickHeadBranch: (branch: string) => void;
}

export interface IGitHubResourceDetailsHover {
	readonly hover: IActionListItemHover;
	readonly pillHover: IManagedHoverTooltipHTMLElement;
	readonly prefetch: () => void;
}

export interface IGitHubResourceDetailsOptions {
	readonly kind: GitHubReferenceKind;
	readonly resource: URI;
	readonly fallbackLabel: string;
	readonly enrich?: boolean;
	readonly onDidClickRepository: (resource: URI) => void;
	readonly onDidClickReference: () => void;
	readonly onDidClickBranch: (branch: string) => void;
}

export interface IGitHubResourceDetails {
	readonly presentation: IObservable<GitHubResourcePresentation>;
	readonly hover?: IGitHubResourceDetailsHover;
}

export function createGitHubResourceDetailsHover(options: IGitHubResourceDetailsHoverOptions): IGitHubResourceDetailsHover {
	return {
		...createChatPillHover({
			fallback: getCanonicalLabel(options.kind, options.target.number),
			failedFallback: options.resource.toString(true),
			createContent: density => createResolvedHover(options, density),
			isFresh: () => options.resolver.isFresh(options.kind, options.target),
			resolve: async () => {
				if (options.kind === 'issue') {
					await options.resolver.resolveIssue(options.target);
				} else {
					await options.resolver.resolvePullRequest(options.target);
				}
			},
		}),
		prefetch: () => {
			if (options.kind === 'issue') {
				void options.resolver.prefetchIssue(options.target);
			} else {
				void options.resolver.prefetchPullRequest(options.target);
			}
		},
	};
}

type GitHubResourcePresentation = ReturnType<typeof getChatReferencePillPresentation>['entry'] & { readonly icon?: ThemeIcon };

export function getGitHubResourcePresentation(resource: URI, kind: GitHubReferenceKind, title?: string, fallbackLabel?: string): GitHubResourcePresentation | undefined {
	const target = parseGitHubReferenceTarget(resource, kind);
	return target ? getChatReferencePillPresentation(kind, `#${target.number}`, title, fallbackLabel).entry : undefined;
}

export function getGitHubResourceDetailsPresentation(kind: 'issue', target: IGitHubReferenceTarget, state: LazyGitHubResourceState<IGitHubIssueHoverModel>, fallbackLabel: string): GitHubResourcePresentation;
export function getGitHubResourceDetailsPresentation(kind: 'pullRequest', target: IGitHubReferenceTarget, state: LazyGitHubResourceState<IPullRequestHoverDetails>, fallbackLabel: string): GitHubResourcePresentation;
export function getGitHubResourceDetailsPresentation(kind: GitHubReferenceKind, target: IGitHubReferenceTarget, state: LazyGitHubResourceState<IGitHubIssueHoverModel | IPullRequestHoverDetails>, fallbackLabel: string): GitHubResourcePresentation {
	if (state.status !== 'resolved') {
		return getChatReferencePillPresentation(kind, `#${target.number}`, undefined, fallbackLabel).entry;
	}
	const details = state.value;
	const isPullRequest = hasKey(details, { pullRequest: true });
	const resource = isPullRequest ? details.pullRequest : details;
	const icon = isPullRequest
		? computePullRequestIcon(getPullRequestResourceStatus(details.pullRequest).kind, { hasFailingChecks: details.checksStatus === 'failure' })
		: computeIssueIcon(details.state, details.stateReason);
	return { ...getChatReferencePillPresentation(kind, `#${target.number}`, resource.title, fallbackLabel).entry, icon };
}

function createResolvedHover(options: IGitHubResourceDetailsHoverOptions, density: 'default' | 'compact'): IGitHubResourceHover | undefined {
	const common = {
		...options.target,
		repositoryHref: `https://github.com/${options.target.owner}/${options.target.repo}`,
		referenceHref: options.resource.toString(true),
		density,
		onDidClickRepository: options.onDidClickRepository,
		onDidClickReference: options.onDidClickReference,
	};
	if (options.kind === 'issue') {
		const state = options.resolver.getIssueState(options.target).get();
		if (state.status !== 'resolved') {
			return undefined;
		}
		const hover = createIssueResourceHover({ ...common, issue: state.value });
		if (state.stale) {
			appendRefreshStatus(hover, localize('githubReference.stale', "Details may be out of date"));
		}
		return { ...hover, onRefreshing: () => appendRefreshStatus(hover, localize('githubReference.refreshing', "Refreshing details…")) };
	}
	const state = options.resolver.getPullRequestState(options.target).get();
	if (state.status !== 'resolved') {
		return undefined;
	}
	const details = state.value;
	const hover = createPullRequestResourceHover({
		...common,
		pullRequest: details.pullRequest,
		checksStatus: details.checksStatus,
		onDidClickBaseBranch: () => options.onDidClickBaseBranch(details.pullRequest.baseRef),
		onDidClickHeadBranch: () => options.onDidClickHeadBranch(details.pullRequest.headRef),
	});
	if (state.stale || details.checksUnavailable) {
		appendRefreshStatus(hover, state.stale
			? localize('githubReference.stale', "Details may be out of date")
			: localize('githubReference.checksUnavailable', "Checks unavailable"));
	}
	return { ...hover, onRefreshing: () => appendRefreshStatus(hover, localize('githubReference.refreshing', "Refreshing details…")) };
}

function appendRefreshStatus(hover: IGitHubResourceHover, message: string): void {
	if (hover.statusRow && hover.refreshStatus) {
		hover.refreshStatus.hidden = false;
		hover.refreshStatus.textContent = message;
	}
}

export function parseGitHubReferenceTarget(resource: URI, kind: GitHubReferenceKind): IGitHubReferenceTarget | undefined {
	const segments = resource.path.split('/').filter(Boolean);
	const expectedKind = kind === 'pullRequest' ? 'pull' : 'issues';
	const number = Number(segments[3]);
	return resource.scheme === 'https'
		&& resource.authority.toLowerCase() === 'github.com'
		&& segments.length === 4
		&& segments[2] === expectedKind
		&& /^[1-9]\d*$/.test(segments[3])
		&& Number.isSafeInteger(number)
		? { owner: segments[0], repo: segments[1], number }
		: undefined;
}

function githubTargetKey(target: IGitHubReferenceTarget): string {
	return `${target.owner.toLowerCase()}/${target.repo.toLowerCase()}#${target.number}`;
}

function getCanonicalLabel(kind: GitHubReferenceKind, number: number): string {
	return getChatReferencePillPresentation(kind, `#${number}`).resourceLabel;
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
