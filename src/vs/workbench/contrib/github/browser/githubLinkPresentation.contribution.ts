/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ILinkPresentation, ILinkPresentationProvider, ILinkPresentationService, ILinkPresentationStatus, ILinkPresentationWatcher, LinkPresentationKind } from '../../../../platform/dataChannel/common/dataChannel.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IGitHubService } from '../../../../platform/github/common/githubService.js';
import { GitHubHydratableResourceRef, GitHubIssue, GitHubIssueRef, GitHubRepository } from '../../../../platform/github/common/githubQueryService.js';
import { FragmentState, PullRequestCheck, PullRequestCore, PullRequestRef, PullRequestSnapshot } from '../../../../platform/github/common/githubPullRequestService.js';
import { GitHubRequestError } from '../../../../platform/github/common/githubTransport.js';
import { GitHubAccountHandle, GitHubRequestErrorKind } from '../../../../platform/github/common/githubTypes.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

const githubRepositoryProviderId = 'workbench.github.repositoryLinkPresentation';
const githubIssueProviderId = 'workbench.github.issueLinkPresentation';
const githubPullRequestProviderId = 'workbench.github.pullRequestLinkPresentation';

type GitHubLinkTarget =
	| { readonly kind: 'repository'; readonly owner: string; readonly repo: string }
	| { readonly kind: 'issue'; readonly owner: string; readonly repo: string; readonly number: number }
	| { readonly kind: 'pullRequest'; readonly owner: string; readonly repo: string; readonly number: number };

export class GitHubLinkPresentationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.githubLinkPresentations';

	private readonly _registrations = this._register(new MutableDisposable<DisposableStore>());
	private readonly _provider: GitHubLinkPresentationProvider;

	constructor(
		@IGitHubService gitHubService: IGitHubService,
		@ILinkPresentationService private readonly _linkPresentationService: ILinkPresentationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ILogService logService: ILogService,
	) {
		super();
		this._provider = this._register(new GitHubLinkPresentationProvider(gitHubService, logService));
		this._register(_defaultAccountService.onDidChangeDefaultAccount(() => this._registerProviders()));
		this._registerProviders();
	}

	private _registerProviders(): void {
		this._registrations.clear();
		const authority = URI.parse(this._defaultAccountService.resolveGitHubUrl('')).authority;
		if (!authority) {
			return;
		}

		const escapedAuthority = escapeRegExpCharacters(authority);
		const ownerAndRepo = `[^/?#]+/[^/?#]+`;
		const suffix = '(?:[?#].*)?$';
		const registrations = new DisposableStore();
		registrations.add(this._linkPresentationService.registerLinkPresentationProvider({
			id: githubIssueProviderId,
			uriPattern: new RegExp(`^https://${escapedAuthority}/${ownerAndRepo}/issues/[1-9]\\d*${suffix}`),
			kind: 'issue',
		}, this._provider));
		registrations.add(this._linkPresentationService.registerLinkPresentationProvider({
			id: githubPullRequestProviderId,
			uriPattern: new RegExp(`^https://${escapedAuthority}/${ownerAndRepo}/pull/[1-9]\\d*${suffix}`),
			kind: 'pullRequest',
		}, this._provider));
		registrations.add(this._linkPresentationService.registerLinkPresentationProvider({
			id: githubRepositoryProviderId,
			uriPattern: new RegExp(`^https://${escapedAuthority}/${ownerAndRepo}/?${suffix}`),
			kind: 'repository',
		}, this._provider));
		this._registrations.value = registrations;
	}
}

class GitHubLinkPresentationProvider extends Disposable implements ILinkPresentationProvider {

	private readonly _hydrator: GitHubLinkPresentationHydrator;

	constructor(
		private readonly _gitHubService: IGitHubService,
		private readonly _logService: ILogService,
	) {
		super();
		this._hydrator = this._register(new GitHubLinkPresentationHydrator(_gitHubService, _logService));
	}

	createLinkPresentationWatcher(resource: URI): ILinkPresentationWatcher {
		const target = parseGitHubLinkTarget(resource);
		if (!target) {
			throw new Error(`Unsupported GitHub link presentation resource: ${resource.toString(true)}`);
		}
		return new GitHubLinkPresentationWatcher(target, this._gitHubService, this._hydrator, this._logService);
	}
}

class GitHubLinkPresentationHydrator extends Disposable {

	private readonly _controller = new AbortController();
	private _pending: {
		readonly resource: GitHubHydratableResourceRef;
		readonly resolve: () => void;
		readonly reject: (error: unknown) => void;
	}[] = [];
	private _scheduled = false;

	constructor(
		private readonly _gitHubService: IGitHubService,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => this._controller.abort()));
	}

	hydrate(target: GitHubLinkTarget, account: GitHubAccountHandle): Promise<void> {
		if (target.kind === 'pullRequest') {
			return Promise.resolve();
		}
		const resource: GitHubHydratableResourceRef = target.kind === 'repository'
			? { kind: 'repository', ref: { ...account, owner: target.owner, repo: target.repo } }
			: { kind: 'issue', ref: { ...account, owner: target.owner, repo: target.repo, number: target.number } };
		const promise = new Promise<void>((resolve, reject) => this._pending.push({ resource, resolve, reject }));
		if (!this._scheduled) {
			this._scheduled = true;
			queueMicrotask(() => void this._flush());
		}
		return promise;
	}

	private async _flush(): Promise<void> {
		this._scheduled = false;
		const pending = this._pending;
		this._pending = [];
		if (pending.length === 0) {
			return;
		}

		const groups = new Map<string, typeof pending>();
		for (const item of pending) {
			const key = `${item.resource.ref.host.toLowerCase()}\x00${item.resource.ref.accountId}`;
			const group = groups.get(key);
			if (group) {
				group.push(item);
			} else {
				groups.set(key, [item]);
			}
		}

		await Promise.all([...groups.values()].map(async group => {
			const resources = [...new Map(group.map(item => [
				hydrationResourceKey(item.resource),
				item.resource,
			])).values()];
			try {
				await this._gitHubService.query.hydrateResources(resources, this._controller.signal);
				this._logService.trace(`[GitHubLinkPresentation] Hydrated ${resources.length} resource(s) in one request`);
				for (const item of group) {
					item.resolve();
				}
			} catch (error) {
				for (const item of group) {
					item.reject(error);
				}
			}
		}));
	}

	override dispose(): void {
		for (const item of this._pending) {
			item.reject(new Error('GitHub link presentation hydrator was disposed'));
		}
		this._pending = [];
		super.dispose();
	}
}

class GitHubLinkPresentationWatcher extends Disposable implements ILinkPresentationWatcher {

	private readonly _presentation = observableValue<ILinkPresentation | undefined>(this, undefined);
	readonly presentation: IObservable<ILinkPresentation | undefined> = this._presentation;

	private readonly _activeSubscription = this._register(new MutableDisposable<DisposableStore>());
	private _generation = 0;

	constructor(
		private readonly _target: GitHubLinkTarget,
		private readonly _gitHubService: IGitHubService,
		private readonly _hydrator: GitHubLinkPresentationHydrator,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(_gitHubService.credentials.onDidInvalidate(() => this._initialize()));
		this._initialize();
	}

	private _initialize(): void {
		const generation = ++this._generation;
		const target = this._target;
		const store = new DisposableStore();
		const controller = new AbortController();
		store.add(toDisposable(() => controller.abort()));
		this._activeSubscription.value = store;

		void this._initializeSubscription(target, generation, controller, store);
	}

	private async _initializeSubscription(target: GitHubLinkTarget, generation: number, controller: AbortController, store: DisposableStore): Promise<void> {
		try {
			const credential = await this._gitHubService.credentials.getCredential(controller.signal);
			if (controller.signal.aborted || generation !== this._generation) {
				return;
			}
			const account = credential.account;
			void this._hydrator.hydrate(target, account).catch(error => {
				this._logService.trace(`[GitHubLinkPresentation] Bulk hydration failed for ${formatTarget(target)}; falling back to resource fetch`, error);
			});
			switch (target.kind) {
				case 'repository': {
					const subscription = store.add(this._gitHubService.query.subscribeRepository({
						...account,
						owner: target.owner,
						repo: target.repo,
					}, { priority: 'visible' }));
					store.add(autorun(reader => this._presentation.set(
						repositoryPresentation(target, subscription.resource.state.read(reader)),
						undefined,
					)));
					break;
				}
				case 'issue': {
					const ref: GitHubIssueRef = { ...account, owner: target.owner, repo: target.repo, number: target.number };
					const subscription = store.add(this._gitHubService.query.subscribeIssue(ref, { priority: 'visible' }));
					store.add(autorun(reader => this._presentation.set(
						issuePresentation(target, subscription.resource.state.read(reader)),
						undefined,
					)));
					break;
				}
				case 'pullRequest': {
					const ref: PullRequestRef = { ...account, owner: target.owner, repo: target.repo, number: target.number };
					const subscription = store.add(this._gitHubService.pullRequests.subscribePullRequest(ref, {
						priority: 'visible',
						core: true,
						checks: { includeOptional: true },
					}));
					store.add(autorun(reader => this._presentation.set(
						pullRequestPresentation(target, subscription.resource.snapshot.read(reader)),
						undefined,
					)));
					break;
				}
			}
		} catch (error) {
			if (controller.signal.aborted || generation !== this._generation) {
				return;
			}
			this._logService.trace(`[GitHubLinkPresentation] Failed to resolve ${formatTarget(this._target)}`, error);
			this._presentation.set(failurePresentation(this._target.kind, error instanceof GitHubRequestError ? error.kind : undefined), undefined);
		}
	}
}

function repositoryPresentation(target: Extract<GitHubLinkTarget, { kind: 'repository' }>, state: FragmentState<GitHubRepository>): ILinkPresentation | undefined {
	if (!state.value) {
		return state.status === 'error' ? failurePresentation(target.kind, state.error?.kind) : undefined;
	}
	const details = [
		state.value.language,
		state.value.stars === undefined ? undefined : localize('github.repository.stars', "{0} stars", formatCount(state.value.stars)),
	].filter((value): value is string => !!value);
	return {
		kind: 'repository',
		detail: details.length ? details.join(' · ') : undefined,
		tooltip: `${target.owner}/${target.repo}`,
		ariaLabel: localize('github.repository.ariaLabel', "GitHub repository {0} slash {1}", target.owner, target.repo),
		...(state.status !== 'ready' ? { isLoading: true } : {}),
	};
}

function issuePresentation(target: Extract<GitHubLinkTarget, { kind: 'issue' }>, state: FragmentState<GitHubIssue>): ILinkPresentation | undefined {
	if (!state.value) {
		return state.status === 'error' ? failurePresentation(target.kind, state.error?.kind) : undefined;
	}
	const status = issueStatus(state.value);
	return {
		kind: 'issue',
		title: state.value.title,
		reference: `#${target.number}`,
		status,
		tooltip: `${target.owner}/${target.repo}#${target.number} · ${status.label}`,
		ariaLabel: localize('github.issue.ariaLabel', "Issue {0} slash {1} number {2}, {3}: {4}", target.owner, target.repo, target.number, status.label, state.value.title),
		...(state.status !== 'ready' ? { isLoading: true } : {}),
	};
}

function pullRequestPresentation(target: Extract<GitHubLinkTarget, { kind: 'pullRequest' }>, snapshot: PullRequestSnapshot): ILinkPresentation | undefined {
	const core = snapshot.core;
	if (!core.value) {
		return core.status === 'error' ? failurePresentation(target.kind, core.error?.kind) : undefined;
	}
	const status = pullRequestStatus(core.value);
	const checksStatus = status.kind === 'open' || status.kind === 'draft'
		? pullRequestChecksStatus(snapshot.checks.value?.checks)
		: undefined;
	return {
		kind: 'pullRequest',
		title: core.value.title,
		reference: `#${target.number}`,
		status,
		secondaryStatus: checksStatus,
		tooltip: [target.owner + '/' + target.repo + '#' + target.number, status.label, checksStatus?.label].filter(Boolean).join(' · '),
		ariaLabel: checksStatus
			? localize('github.pullRequest.ariaLabelWithChecks', "Pull request {0} slash {1} number {2}, {3}, {4}: {5}", target.owner, target.repo, target.number, status.label, checksStatus.label, core.value.title)
			: localize('github.pullRequest.ariaLabel', "Pull request {0} slash {1} number {2}, {3}: {4}", target.owner, target.repo, target.number, status.label, core.value.title),
		...(core.status !== 'ready' ? { isLoading: true } : {}),
	};
}

function issueStatus(issue: GitHubIssue): ILinkPresentationStatus {
	if (issue.state === 'open') {
		return { kind: 'open', label: localize('github.status.open', "Open") };
	}
	return issue.stateReason === 'not_planned'
		? { kind: 'notPlanned', label: localize('github.status.notPlanned', "Not planned") }
		: { kind: 'closed', label: localize('github.status.closed', "Closed") };
}

function pullRequestStatus(pullRequest: PullRequestCore): ILinkPresentationStatus {
	if (pullRequest.state === 'merged') {
		return { kind: 'merged', label: localize('github.status.merged', "Merged") };
	}
	if (pullRequest.draft) {
		return { kind: 'draft', label: localize('github.status.draft', "Draft") };
	}
	return pullRequest.state === 'closed'
		? { kind: 'closed', label: localize('github.status.closed', "Closed") }
		: { kind: 'open', label: localize('github.status.open', "Open") };
}

function pullRequestChecksStatus(checks: readonly PullRequestCheck[] | undefined): ILinkPresentationStatus | undefined {
	if (!checks?.length) {
		return undefined;
	}
	if (checks.some(check => check.type === 'checkRun'
		? check.status !== 'COMPLETED'
		: check.status === 'PENDING' || check.status === 'EXPECTED')) {
		return { kind: 'pending', label: localize('github.checks.running', "Checks running") };
	}
	if (checks.some(check => check.type === 'checkRun'
		? check.conclusion === 'FAILURE'
		|| check.conclusion === 'TIMED_OUT'
		|| check.conclusion === 'CANCELLED'
		|| check.conclusion === 'ACTION_REQUIRED'
		|| check.conclusion === 'STARTUP_FAILURE'
		: check.status === 'FAILURE' || check.status === 'ERROR')) {
		return { kind: 'error', label: localize('github.checks.failed', "Checks failed") };
	}
	return { kind: 'success', label: localize('github.checks.passed', "Checks passed") };
}

function failurePresentation(kind: LinkPresentationKind, errorKind: GitHubRequestErrorKind | undefined): ILinkPresentation {
	const label = errorKind === 'rateLimit'
		? localize('github.failure.rateLimited', "Rate limited")
		: errorKind === 'authentication'
			? localize('github.failure.authenticationRequired', "Authentication required")
			: errorKind === 'authorization'
				? localize('github.failure.accessDenied', "Access denied")
				: errorKind === 'notFound'
					? localize('github.failure.notFound', "Not found")
					: localize('github.failure.unavailable', "Not available");
	return {
		kind,
		status: { kind: 'error', label },
		tooltip: localize('github.failure.tooltip', "GitHub could not load this resource: {0}", label),
		ariaLabel: localize('github.failure.ariaLabel', "GitHub {0} lookup failed: {1}", kind, label),
	};
}

function parseGitHubLinkTarget(resource: URI): GitHubLinkTarget | undefined {
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

function formatTarget(target: GitHubLinkTarget): string {
	return target.kind === 'repository'
		? `${target.owner}/${target.repo}`
		: `${target.owner}/${target.repo}#${target.number}`;
}

function hydrationResourceKey(resource: GitHubHydratableResourceRef): string {
	const suffix = resource.kind === 'issue' ? `#${resource.ref.number}` : '';
	return `${resource.kind}:${resource.ref.owner.toLowerCase()}/${resource.ref.repo.toLowerCase()}${suffix}`;
}

function formatCount(value: number): string {
	return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
}

function escapeRegExpCharacters(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

registerWorkbenchContribution2(GitHubLinkPresentationContribution.ID, GitHubLinkPresentationContribution, WorkbenchPhase.AfterRestored);
