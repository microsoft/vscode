/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../base/common/observable.js';
import { ILogService } from '../../log/common/log.js';
import {
	FragmentState,
	GitHubFragmentError,
	PullRequestChecks,
	PullRequestComment,
	PullRequestCore,
	PullRequestFragment,
	PullRequestInlineComment,
	PullRequestMergeability,
	PullRequestParticipants,
	PullRequestRef,
	PullRequestRefreshOptions,
	PullRequestResource,
	PullRequestReview,
	PullRequestReviewThread,
	PullRequestSnapshot,
	PullRequestSubscription,
	PullRequestSubscriptionOptions,
} from './githubPullRequestService.js';
import { GitHubCredential, GitHubCredentialInvalidation, IGitHubCredentials } from './githubCredentialService.js';
import { IGitHubScheduler, systemGitHubScheduler } from './githubScheduler.js';
import { GitHubRequestError } from './githubTransport.js';
import { EffectivePullRequestFragmentInterest, pullRequestOptionsForFragment, unionPullRequestInterests } from './pullRequestInterests.js';
import { IPullRequestQuery, PullRequestFragmentResult } from './pullRequestQueryService.js';
import { PullRequestScheduler } from './pullRequestScheduler.js';

export interface IPullRequestResources {
	subscribePullRequest(ref: PullRequestRef, options: PullRequestSubscriptionOptions): PullRequestSubscription;
	invalidatePullRequest(ref: PullRequestRef, fragments: readonly PullRequestFragment[]): void;
	clear(): void;
}

function formatPullRequestRef(ref: PullRequestRef): string {
	return `${ref.host}/${ref.owner}/${ref.repo}#${ref.number}`;
}

function resourceErrorKind(error: unknown): string {
	if (error instanceof GitHubRequestError) {
		return `${error.kind}${error.statusCode === undefined ? '' : `:${error.statusCode}`}`;
	}
	return error instanceof Error ? error.name : typeof error;
}

function dataInterestExpanded(left: EffectivePullRequestFragmentInterest, right: EffectivePullRequestFragmentInterest): boolean {
	return !left.includeBodies && right.includeBodies === true
		|| !left.requiredChecks && right.requiredChecks === true
		|| !left.includeOptionalChecks && right.includeOptionalChecks === true;
}

export interface PullRequestPollingPolicy {
	readonly dormantGrace: number;
	readonly fragmentBodyGrace: number;
	readonly maximumDormantEntries: number;
	readonly coreVisible: number;
	readonly coreBackground: number;
	readonly conversationVisible: number;
	readonly conversationBackground: number;
	readonly checksPendingVisible: number;
	readonly checksPendingBackground: number;
	readonly checksBackstop: number;
	readonly mergeabilityVisible: number;
	readonly mergeabilityBackground: number;
	readonly participants: number;
	readonly failureRetryBase: number;
	readonly failureRetryMaximum: number;
	readonly jitter: number;
}

const defaultPollingPolicy: PullRequestPollingPolicy = {
	dormantGrace: 120_000,
	fragmentBodyGrace: 30_000,
	maximumDormantEntries: 50,
	coreVisible: 60_000,
	coreBackground: 300_000,
	conversationVisible: 60_000,
	conversationBackground: 300_000,
	checksPendingVisible: 15_000,
	checksPendingBackground: 60_000,
	checksBackstop: 300_000,
	mergeabilityVisible: 30_000,
	mergeabilityBackground: 120_000,
	participants: 300_000,
	failureRetryBase: 30_000,
	failureRetryMaximum: 300_000,
	jitter: 5_000,
};

const fragments: readonly PullRequestFragment[] = [
	'core',
	'topLevelComments',
	'submittedReviews',
	'inlineComments',
	'reviewThreads',
	'checks',
	'mergeability',
	'participants',
];

type AnyFragmentState =
	| FragmentState<PullRequestCore>
	| FragmentState<readonly PullRequestComment[]>
	| FragmentState<readonly PullRequestReview[]>
	| FragmentState<readonly PullRequestInlineComment[]>
	| FragmentState<readonly PullRequestReviewThread[]>
	| FragmentState<PullRequestChecks>
	| FragmentState<PullRequestMergeability>
	| FragmentState<PullRequestParticipants>;

interface IFragmentOperation {
	readonly controller: AbortController;
	readonly generation: number;
	readonly interest: EffectivePullRequestFragmentInterest;
	readonly promise: Promise<void>;
}

class PullRequestResourceImpl implements PullRequestResource {

	constructor(private readonly _entry: PullRequestEntry) { }

	get ref(): PullRequestRef {
		return this._entry.ref;
	}

	get snapshot(): IObservable<PullRequestSnapshot> {
		return this._entry.snapshot;
	}
}

class PullRequestEntry {

	readonly resource = new PullRequestResourceImpl(this);
	readonly snapshot: ISettableObservable<PullRequestSnapshot>;
	readonly subscriptions = new Set<PullRequestSubscriptionImpl>();
	readonly fragmentGenerations = new Map<PullRequestFragment, number>();
	readonly operations = new Map<PullRequestFragment, IFragmentOperation>();
	readonly failureCounts = new Map<PullRequestFragment, number>();
	readonly keys = new Set<string>();
	readonly mirrors = new Set<PullRequestEntry>();
	effective = new Map<PullRequestFragment, EffectivePullRequestFragmentInterest>();
	generation = 1;
	headGeneration = 0;
	dormantAt: number | undefined;
	mergedInto: PullRequestEntry | undefined;
	disposed = false;

	constructor(
		readonly id: number,
		ref: PullRequestRef,
	) {
		this.ref = ref;
		this.snapshot = observableValue(this, initialSnapshot(ref));
		for (const fragment of fragments) {
			this.fragmentGenerations.set(fragment, 0);
		}
	}

	ref: PullRequestRef;
}

class PullRequestSubscriptionImpl implements PullRequestSubscription {

	private _disposed = false;

	constructor(
		readonly resource: PullRequestResource,
		entry: PullRequestEntry,
		private readonly _service: PullRequestResourceService,
		options: PullRequestSubscriptionOptions,
	) {
		this.entry = entry;
		this.options = options;
	}

	entry: PullRequestEntry;
	options: PullRequestSubscriptionOptions;

	update(options: PullRequestSubscriptionOptions): void {
		if (this._disposed) {
			throw new Error('Pull request subscription has been disposed');
		}
		this._service.updateSubscription(this, options);
	}

	refresh(
		fragment?: PullRequestFragment,
		token: CancellationToken = CancellationToken.None,
		options?: PullRequestRefreshOptions,
	): Promise<void> {
		if (this._disposed) {
			return Promise.reject(new Error('Pull request subscription has been disposed'));
		}
		return this._service.refreshSubscription(this, fragment, token, options);
	}

	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._service.removeSubscription(this);
	}
}

export class PullRequestResourceService extends Disposable implements IPullRequestResources {

	private readonly _entriesByKey = new Map<string, PullRequestEntry>();
	private readonly _entries = new Set<PullRequestEntry>();
	private readonly _dormant = new Map<number, PullRequestEntry>();
	private readonly _scheduler: PullRequestScheduler;
	private _entryId = 0;

	constructor(
		scheduler: IGitHubScheduler = systemGitHubScheduler,
		private readonly _policy: PullRequestPollingPolicy = defaultPollingPolicy,
		private readonly _credentials: IGitHubCredentials,
		private readonly _queries: IPullRequestQuery,
		private readonly _logService: ILogService,
	) {
		super();
		this._scheduler = this._register(new PullRequestScheduler(scheduler));
		this._clock = scheduler;
		this._register(this._credentials.onDidInvalidate(event => this._handleCredentialInvalidation(event)));
	}

	private readonly _clock: IGitHubScheduler;

	subscribePullRequest(ref: PullRequestRef, options: PullRequestSubscriptionOptions): PullRequestSubscription {
		const normalized = normalizeRef(ref);
		const initialKey = pullRequestKey(normalized);
		let entry = this._entriesByKey.get(initialKey);
		if (!entry) {
			entry = new PullRequestEntry(this._entryId++, normalized);
			entry.keys.add(initialKey);
			this._entriesByKey.set(initialKey, entry);
			this._entries.add(entry);
			this._logService.debug(`[PullRequestResourceService] Created resource ${formatPullRequestRef(normalized)} (entry ${entry.id})`);
		} else if (entry.dormantAt !== undefined) {
			entry.dormantAt = undefined;
			this._dormant.delete(entry.id);
			this._scheduler.cancel(this._dormantTaskKey(entry));
			this._logService.trace(`[PullRequestResourceService] Resumed resource ${formatPullRequestRef(entry.ref)} (entry ${entry.id})`);
		}
		const subscription = new PullRequestSubscriptionImpl(entry.resource, entry, this, options);
		entry.subscriptions.add(subscription);
		this._logService.trace(`[PullRequestResourceService] Added subscription for ${formatPullRequestRef(entry.ref)} (entry ${entry.id}, subscriptions: ${entry.subscriptions.size})`);
		this._updateEffectiveInterests(entry);
		return subscription;
	}

	invalidatePullRequest(ref: PullRequestRef, invalidatedFragments: readonly PullRequestFragment[]): void {
		const entry = this._entriesByKey.get(pullRequestKey(normalizeRef(ref)));
		if (!entry) {
			return;
		}
		for (const fragment of invalidatedFragments) {
			this._cancelFragment(entry, fragment);
			const current = fragmentState(entry.snapshot.get(), fragment);
			this._setFragmentState(entry, fragment, {
				...current,
				status: current.value ? 'stale' : 'missing',
				complete: false,
				error: undefined,
			});
			if (entry.subscriptions.size > 0 && entry.effective.has(fragment)) {
				this._scheduleFragment(entry, fragment, this._clock.now());
			}
		}
	}

	updateSubscription(subscription: PullRequestSubscriptionImpl, options: PullRequestSubscriptionOptions): void {
		if (!subscription.entry.subscriptions.has(subscription)) {
			throw new Error('Pull request subscription is no longer active');
		}
		subscription.options = options;
		this._updateEffectiveInterests(subscription.entry);
	}

	async refreshSubscription(
		subscription: PullRequestSubscriptionImpl,
		fragment: PullRequestFragment | undefined,
		token: CancellationToken,
		options?: PullRequestRefreshOptions,
	): Promise<void> {
		if (!subscription.entry.subscriptions.has(subscription)) {
			throw new Error('Pull request subscription is no longer active');
		}
		if (fragment) {
			if (!subscription.entry.effective.has(fragment)) {
				throw new Error(`Pull request fragment ${fragment} is not part of the subscription interests`);
			}
			await this._refreshFragment(subscription.entry, fragment, token, options?.authoritative === true);
			return;
		}
		await this._refreshFragment(subscription.entry, 'core', token, options?.authoritative === true);
		const entry = subscription.entry;
		await Promise.all([...entry.effective.keys()]
			.filter(candidate => candidate !== 'core')
			.map(candidate => this._refreshFragment(entry, candidate, token, options?.authoritative === true)));
	}

	removeSubscription(subscription: PullRequestSubscriptionImpl): void {
		const entry = subscription.entry;
		if (!entry.subscriptions.delete(subscription)) {
			return;
		}
		if (entry.subscriptions.size > 0) {
			this._updateEffectiveInterests(entry);
			return;
		}
		entry.effective = new Map();
		entry.dormantAt = this._clock.now();
		this._logService.trace(`[PullRequestResourceService] Resource ${formatPullRequestRef(entry.ref)} became dormant (entry ${entry.id})`);
		this._cancelEntryWork(entry);
		this._dormant.set(entry.id, entry);
		this._scheduler.schedule(this._dormantTaskKey(entry), this._clock.now() + this._policy.dormantGrace, () => {
			if (entry.dormantAt !== undefined) {
				this._disposeEntry(entry);
			}
		});
		this._trimDormantEntries();
	}

	clear(): void {
		for (const entry of [...this._entries]) {
			this._disposeEntry(entry);
		}
		this._scheduler.clear();
		this._entriesByKey.clear();
		this._entries.clear();
		this._dormant.clear();
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}

	private _updateEffectiveInterests(entry: PullRequestEntry): void {
		const previous = entry.effective;
		const next = new Map(unionPullRequestInterests([...entry.subscriptions].map(subscription => subscription.options)));
		entry.effective = next;
		for (const fragment of fragments) {
			const oldInterest = previous.get(fragment);
			const newInterest = next.get(fragment);
			if (!newInterest) {
				if (oldInterest) {
					this._cancelFragment(entry, fragment);
				}
				continue;
			}
			if (!oldInterest) {
				this._scheduleFragment(entry, fragment, this._clock.now());
				continue;
			}
			if (!sameInterest(oldInterest, newInterest)) {
				if (dataInterestExpanded(oldInterest, newInterest)) {
					this._cancelFragment(entry, fragment);
					this._scheduleFragment(entry, fragment, this._clock.now());
					continue;
				}
				if (oldInterest.includeBodies && !newInterest.includeBodies && isConversationFragment(fragment)) {
					this._scheduleBodyRelease(entry, fragment);
				} else {
					this._scheduler.cancel(this._bodyTaskKey(entry, fragment));
				}
				if (oldInterest.priority !== newInterest.priority) {
					this._scheduleNext(entry, fragment, newInterest);
				}
			}
		}
	}

	private async _refreshFragment(
		entry: PullRequestEntry,
		fragment: PullRequestFragment,
		token: CancellationToken,
		authoritative = false,
	): Promise<void> {
		entry = this._resolveEntry(entry);
		if (entry.disposed || entry.subscriptions.size === 0 || !entry.effective.has(fragment)) {
			return;
		}
		this._scheduler.cancel(this._fragmentTaskKey(entry, fragment));
		const existing = entry.operations.get(fragment);
		if (existing) {
			const interest = entry.effective.get(fragment);
			if (!authoritative && (!interest || !dataInterestExpanded(existing.interest, interest))) {
				await raceCancellationError(existing.promise, token);
				return;
			}
			this._cancelFragment(entry, fragment);
		}
		if (fragment !== 'core' && entry.snapshot.get().core.status !== 'ready') {
			await this._refreshFragment(entry, 'core', token, authoritative);
			entry = this._resolveEntry(entry);
			if (entry.snapshot.get().core.status !== 'ready') {
				return;
			}
		}
		const interest = entry.effective.get(fragment);
		if (!interest) {
			return;
		}
		const fragmentGeneration = (entry.fragmentGenerations.get(fragment) ?? 0) + 1;
		entry.fragmentGenerations.set(fragment, fragmentGeneration);
		const controller = new AbortController();
		const entryGeneration = entry.generation;
		const headAtStart = isHeadFragment(fragment) ? entry.snapshot.get().core.value?.headSha : undefined;
		this._setLoading(entry, fragment);
		const operation: IFragmentOperation = {
			controller,
			generation: fragmentGeneration,
			interest,
			promise: this._runFragmentFetch(
				entry,
				fragment,
				interest,
				entryGeneration,
				fragmentGeneration,
				headAtStart,
				controller,
			).finally(() => {
				if (entry.operations.get(fragment) === operation) {
					entry.operations.delete(fragment);
				}
			}),
		};
		entry.operations.set(fragment, operation);
		await raceCancellationError(operation.promise, token);
	}

	private async _runFragmentFetch(
		entry: PullRequestEntry,
		fragment: PullRequestFragment,
		interest: EffectivePullRequestFragmentInterest,
		entryGeneration: number,
		fragmentGeneration: number,
		headAtStart: string | undefined,
		controller: AbortController,
	): Promise<void> {
		let credential: GitHubCredential | undefined;
		const startedAt = this._clock.now();
		this._logService.trace(`[PullRequestResourceService] Refreshing ${fragment} for ${formatPullRequestRef(entry.ref)} (entry ${entry.id}, generation ${entryGeneration})`);
		try {
			credential = await this._credentials.getCredential(controller.signal);
			if (!sameAccount(credential.account, entry.ref)) {
				throw new GitHubRequestError('Pull request resource account does not match the current GitHub credential', 'authentication');
			}
			const result = await this._queries.fetch(
				fragment,
				entry.ref,
				entry.snapshot.get().core.value,
				pullRequestOptionsForFragment(fragment, interest),
				credential,
				AbortSignal.any([controller.signal, credential.signal]),
			);
			if (!this._canCommit(entry, fragment, entryGeneration, fragmentGeneration, credential, headAtStart)) {
				if (!controller.signal.aborted && this._isFragmentActive(entry, fragment)) {
					this._scheduleFragment(entry, fragment, this._clock.now());
				}
				return;
			}
			const committedEntry = this._commitResult(entry, result);
			this._logService.trace(`[PullRequestResourceService] Refreshed ${fragment} for ${formatPullRequestRef(committedEntry.ref)} in ${this._clock.now() - startedAt}ms (entry ${committedEntry.id}, generation ${committedEntry.generation})`);
			committedEntry.failureCounts.delete(fragment);
			this._scheduleNext(committedEntry, fragment, committedEntry.effective.get(fragment) ?? interest);
		} catch (error) {
			if (credential && sameAccount(credential.account, entry.ref)) {
				this._credentials.handleRequestError(credential, error);
			}
			const canCommit = this._canCommit(entry, fragment, entryGeneration, fragmentGeneration, credential, headAtStart);
			if (canCommit) {
				this._setError(entry, fragment, error);
			}
			this._logService.debug(`[PullRequestResourceService] Refresh ${fragment} for ${formatPullRequestRef(entry.ref)} ${controller.signal.aborted ? 'cancelled' : 'failed'} after ${this._clock.now() - startedAt}ms (${resourceErrorKind(error)})`);
			if (canCommit && !controller.signal.aborted && this._isFragmentActive(entry, fragment)) {
				this._scheduleAfterFailure(entry, fragment, interest, error);
			} else if (credential?.signal.aborted && !controller.signal.aborted && this._isFragmentActive(entry, fragment)) {
				this._scheduleFragment(entry, fragment, this._clock.now());
			}
			throw error;
		}
	}

	private _canCommit(
		entry: PullRequestEntry,
		fragment: PullRequestFragment,
		entryGeneration: number,
		fragmentGeneration: number,
		credential: GitHubCredential | undefined,
		headAtStart: string | undefined,
	): boolean {
		if (entry.disposed
			|| entry.generation !== entryGeneration
			|| entry.fragmentGenerations.get(fragment) !== fragmentGeneration
			|| credential?.signal.aborted) {
			return false;
		}
		return !isHeadFragment(fragment) || entry.snapshot.get().core.value?.headSha === headAtStart;
	}

	private _commitResult(entry: PullRequestEntry, result: PullRequestFragmentResult): PullRequestEntry {
		const observedAt = toTimestamp(this._clock.now());
		if (result.fragment === 'core') {
			entry = this._canonicalizeEntry(entry, result.value);
			const previousHead = entry.snapshot.get().core.value?.headSha;
			if (previousHead !== result.value.headSha) {
				entry.headGeneration++;
			}
			if (previousHead && previousHead !== result.value.headSha) {
				this._invalidateHeadFragments(entry);
			}
			this._setFragmentState(entry, 'core', {
				value: result.value,
				status: 'ready',
				complete: true,
				observedAt,
				attemptedAt: observedAt,
			});
			if (result.value.state !== 'open') {
				for (const fragment of entry.effective.keys()) {
					this._scheduler.cancel(this._fragmentTaskKey(entry, fragment));
					if (fragment !== 'core') {
						this._scheduleFragment(entry, fragment, this._clock.now());
					}
				}
			}
			return entry;
		}
		switch (result.fragment) {
			case 'topLevelComments':
				this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt));
				break;
			case 'submittedReviews':
				this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt));
				break;
			case 'inlineComments':
				this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt));
				break;
			case 'reviewThreads':
				this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt, result.headSha));
				break;
			case 'checks':
				this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt, result.headSha));
				break;
			case 'mergeability':
				this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt, result.headSha));
				break;
			case 'participants':
				this._setFragmentState(entry, result.fragment, readyState(result.value, result.complete, observedAt));
				break;
		}
		return entry;
	}

	private _invalidateHeadFragments(entry: PullRequestEntry): void {
		for (const fragment of ['reviewThreads', 'checks', 'mergeability'] as const) {
			this._cancelFragment(entry, fragment);
			const current = fragmentState(entry.snapshot.get(), fragment);
			this._setFragmentState(entry, fragment, {
				...current,
				status: current.value ? 'stale' : 'missing',
				complete: false,
				headSha: undefined,
				error: undefined,
			});
			if (entry.effective.has(fragment)) {
				this._scheduleFragment(entry, fragment, this._clock.now());
			}
		}
	}

	private _setLoading(entry: PullRequestEntry, fragment: PullRequestFragment): void {
		const current = fragmentState(entry.snapshot.get(), fragment);
		this._setFragmentState(entry, fragment, {
			...current,
			status: 'loading',
			complete: false,
			attemptedAt: toTimestamp(this._clock.now()),
			error: undefined,
		});
	}

	private _setError(entry: PullRequestEntry, fragment: PullRequestFragment, error: unknown): void {
		const current = fragmentState(entry.snapshot.get(), fragment);
		this._setFragmentState(entry, fragment, {
			...current,
			status: 'error',
			complete: false,
			attemptedAt: toTimestamp(this._clock.now()),
			error: toFragmentError(error),
		});
	}

	private _setFragmentState(entry: PullRequestEntry, fragment: PullRequestFragment, state: AnyFragmentState): void {
		this._publishSnapshot(entry, {
			...withFragmentState(entry.snapshot.get(), fragment, state),
			generation: entry.generation,
			headGeneration: entry.headGeneration,
		});
	}

	private _cancelFragment(entry: PullRequestEntry, fragment: PullRequestFragment): void {
		this._scheduler.cancel(this._fragmentTaskKey(entry, fragment));
		this._scheduler.cancel(this._bodyTaskKey(entry, fragment));
		entry.fragmentGenerations.set(fragment, (entry.fragmentGenerations.get(fragment) ?? 0) + 1);
		entry.operations.get(fragment)?.controller.abort(new Error(`Pull request fragment ${fragment} is no longer active`));
		entry.operations.delete(fragment);
		const current = fragmentState(entry.snapshot.get(), fragment);
		if (current.status === 'loading') {
			this._setFragmentState(entry, fragment, {
				...current,
				status: current.value ? 'stale' : 'missing',
				complete: false,
			});
		}
	}

	private _cancelEntryWork(entry: PullRequestEntry): void {
		this._scheduler.cancelPrefix(`${entry.id}\x00`);
		for (const fragment of fragments) {
			this._cancelFragment(entry, fragment);
		}
	}

	private _scheduleFragment(entry: PullRequestEntry, fragment: PullRequestFragment, dueAt: number): void {
		if (entry.disposed || entry.subscriptions.size === 0 || !entry.effective.has(fragment)) {
			return;
		}
		this._scheduler.schedule(this._fragmentTaskKey(entry, fragment), dueAt, () => {
			void this._refreshFragment(entry, fragment, CancellationToken.None).catch(error => {
				if (!entry.disposed && entry.subscriptions.size > 0) {
					this._logService.warn(`[PullRequestResourceService] Failed to refresh ${fragment} for ${entry.ref.owner}/${entry.ref.repo}#${entry.ref.number}`, error);
				}
			});
		});
	}

	private _scheduleNext(entry: PullRequestEntry, fragment: PullRequestFragment, interest: EffectivePullRequestFragmentInterest): void {
		const delay = this._pollDelay(entry, fragment, interest);
		if (delay === undefined) {
			return;
		}
		this._scheduleFragment(entry, fragment, this._clock.now() + delay + this._clock.jitter(this._policy.jitter));
	}

	private _scheduleAfterFailure(
		entry: PullRequestEntry,
		fragment: PullRequestFragment,
		interest: EffectivePullRequestFragmentInterest,
		error: unknown,
	): void {
		if (entry.snapshot.get().core.value?.state && entry.snapshot.get().core.value?.state !== 'open') {
			return;
		}
		if (error instanceof GitHubRequestError && error.kind === 'authentication') {
			return;
		}
		if (error instanceof GitHubRequestError
			&& (error.kind === 'authorization' || error.kind === 'notFound' || error.kind === 'validation' || error.kind === 'schema' || error.kind === 'rateLimit')) {
			this._scheduleNext(entry, fragment, interest);
			return;
		}
		const failures = (entry.failureCounts.get(fragment) ?? 0) + 1;
		entry.failureCounts.set(fragment, failures);
		const delay = Math.min(this._policy.failureRetryBase * 2 ** (failures - 1), this._policy.failureRetryMaximum);
		this._scheduleFragment(entry, fragment, this._clock.now() + delay + this._clock.jitter(this._policy.jitter));
	}

	private _pollDelay(entry: PullRequestEntry, fragment: PullRequestFragment, interest: EffectivePullRequestFragmentInterest): number | undefined {
		if (entry.snapshot.get().core.value?.state !== 'open') {
			return undefined;
		}
		const visible = interest.priority !== 'background';
		switch (fragment) {
			case 'core':
				return visible ? this._policy.coreVisible : this._policy.coreBackground;
			case 'topLevelComments':
			case 'submittedReviews':
			case 'inlineComments':
			case 'reviewThreads':
				return visible ? this._policy.conversationVisible : this._policy.conversationBackground;
			case 'checks':
				return checksPending(entry.snapshot.get().checks.value)
					? visible ? this._policy.checksPendingVisible : this._policy.checksPendingBackground
					: this._policy.checksBackstop;
			case 'mergeability':
				return visible ? this._policy.mergeabilityVisible : this._policy.mergeabilityBackground;
			case 'participants':
				return this._policy.participants;
		}
	}

	private _scheduleBodyRelease(entry: PullRequestEntry, fragment: PullRequestFragment): void {
		this._scheduler.schedule(this._bodyTaskKey(entry, fragment), this._clock.now() + this._policy.fragmentBodyGrace, () => {
			if (entry.effective.get(fragment)?.includeBodies !== true) {
				this._releaseBodies(entry, fragment);
			}
		});
	}

	private _releaseBodies(entry: PullRequestEntry, fragment: PullRequestFragment): void {
		const snapshot = entry.snapshot.get();
		switch (fragment) {
			case 'topLevelComments':
				if (snapshot.topLevelComments.value) {
					this._setFragmentState(entry, fragment, { ...snapshot.topLevelComments, value: snapshot.topLevelComments.value.map(({ body, ...comment }) => comment) });
				}
				break;
			case 'submittedReviews':
				if (snapshot.submittedReviews.value) {
					this._setFragmentState(entry, fragment, { ...snapshot.submittedReviews, value: snapshot.submittedReviews.value.map(({ body, ...review }) => review) });
				}
				break;
			case 'inlineComments':
				if (snapshot.inlineComments.value) {
					this._setFragmentState(entry, fragment, { ...snapshot.inlineComments, value: snapshot.inlineComments.value.map(({ body, ...comment }) => comment) });
				}
				break;
			case 'reviewThreads':
				if (snapshot.reviewThreads.value) {
					this._setFragmentState(entry, fragment, {
						...snapshot.reviewThreads,
						value: snapshot.reviewThreads.value.map(thread => ({
							...thread,
							comments: thread.comments.map(({ body, ...comment }) => comment),
						})),
					});
				}
				break;
		}
	}

	private _canonicalizeEntry(entry: PullRequestEntry, core: PullRequestCore): PullRequestEntry {
		const [owner, repo, extra] = core.repositoryNameWithOwner.split('/');
		if (!owner || !repo || extra) {
			return entry;
		}
		const canonicalRef = { ...entry.ref, owner, repo };
		const aliases = [
			pullRequestKey(canonicalRef),
			core.repositoryId ? stablePullRequestKey(canonicalRef, core.repositoryId) : undefined,
		].filter((key): key is string => key !== undefined);
		let target = entry;
		let merged = false;
		for (const key of aliases) {
			const existing = this._entriesByKey.get(key);
			if (!existing || existing === target) {
				continue;
			}
			if (target === entry) {
				target = existing;
				this._mergeEntry(entry, target);
			} else {
				this._mergeEntry(existing, target);
			}
			merged = true;
		}
		entry = target;
		const refChanged = entry.ref.owner !== owner || entry.ref.repo !== repo;
		let aliasAdded = false;
		entry.ref = canonicalRef;
		for (const key of aliases) {
			const existing = this._entriesByKey.get(key);
			if (!existing || existing === entry) {
				aliasAdded ||= !entry.keys.has(key);
				this._entriesByKey.set(key, entry);
				entry.keys.add(key);
			}
		}
		if (merged) {
			this._logService.debug(`[PullRequestResourceService] Converged canonical resource ${formatPullRequestRef(canonicalRef)} onto entry ${entry.id}`);
			this._updateEffectiveInterests(entry);
		}
		if (refChanged || aliasAdded || merged) {
			this._logService.debug(`[PullRequestResourceService] Canonicalized ${formatPullRequestRef(entry.ref)} (entry ${entry.id}, aliases: ${entry.keys.size})`);
			entry.generation++;
			for (const fragment of entry.effective.keys()) {
				if (fragment !== 'core') {
					this._scheduleFragment(entry, fragment, this._clock.now());
				}
			}
		}
		const snapshot = entry.snapshot.get();
		this._publishSnapshot(entry, { ...snapshot, ref: entry.ref, generation: entry.generation, headGeneration: entry.headGeneration });
		return entry;
	}

	private _mergeEntry(source: PullRequestEntry, target: PullRequestEntry): void {
		const sourceSnapshot = source.snapshot.get();
		source.disposed = true;
		source.mergedInto = target;
		source.generation++;
		this._cancelEntryWork(source);
		for (const subscription of source.subscriptions) {
			subscription.entry = target;
			target.subscriptions.add(subscription);
		}
		source.subscriptions.clear();
		for (const key of source.keys) {
			this._entriesByKey.set(key, target);
			target.keys.add(key);
		}
		source.keys.clear();
		target.mirrors.add(source);
		for (const mirror of source.mirrors) {
			target.mirrors.add(mirror);
		}
		source.mirrors.clear();
		this._publishSnapshot(target, mergeSnapshotValues(target.snapshot.get(), sourceSnapshot));
		this._dormant.delete(source.id);
		this._entries.delete(source);
		if (target.dormantAt !== undefined && target.subscriptions.size > 0) {
			target.dormantAt = undefined;
			this._dormant.delete(target.id);
			this._scheduler.cancel(this._dormantTaskKey(target));
		}
	}

	private _resolveEntry(entry: PullRequestEntry): PullRequestEntry {
		while (entry.mergedInto) {
			entry = entry.mergedInto;
		}
		return entry;
	}

	private _publishSnapshot(entry: PullRequestEntry, snapshot: PullRequestSnapshot): void {
		entry.snapshot.set(snapshot, undefined);
		for (const mirror of entry.mirrors) {
			mirror.ref = entry.ref;
			mirror.snapshot.set(snapshot, undefined);
		}
	}

	private _handleCredentialInvalidation(event: GitHubCredentialInvalidation): void {
		this._logService.debug(`[PullRequestResourceService] Handling credential invalidation (${event.reason}) for ${this._entries.size} resource(s)`);
		for (const entry of [...this._entries]) {
			if (!event.credential || sameAccount(event.credential.account, entry.ref)) {
				if (event.reason === 'replacement' || event.reason === 'authentication') {
					for (const fragment of fragments) {
						const current = fragmentState(entry.snapshot.get(), fragment);
						this._setFragmentState(entry, fragment, {
							...current,
							status: current.value ? 'stale' : 'missing',
							complete: false,
							error: undefined,
						});
						if (entry.subscriptions.size > 0 && entry.effective.has(fragment)) {
							this._scheduleFragment(entry, fragment, this._clock.now());
						}
					}
				} else {
					this._disposeEntry(entry);
				}
			}
		}
	}

	private _disposeEntry(entry: PullRequestEntry): void {
		if (entry.disposed) {
			return;
		}
		entry.disposed = true;
		this._logService.trace(`[PullRequestResourceService] Disposing resource ${formatPullRequestRef(entry.ref)} (entry ${entry.id})`);
		entry.generation++;
		this._cancelEntryWork(entry);
		for (const subscription of [...entry.subscriptions]) {
			entry.subscriptions.delete(subscription);
		}
		for (const key of entry.keys) {
			if (this._entriesByKey.get(key) === entry) {
				this._entriesByKey.delete(key);
			}
		}
		this._dormant.delete(entry.id);
		this._entries.delete(entry);
		entry.mirrors.clear();
	}

	private _trimDormantEntries(): void {
		while (this._dormant.size > this._policy.maximumDormantEntries) {
			const oldest = [...this._dormant.values()]
				.sort((left, right) => (left.dormantAt ?? 0) - (right.dormantAt ?? 0) || left.id - right.id)[0];
			this._disposeEntry(oldest);
		}
	}

	private _fragmentTaskKey(entry: PullRequestEntry, fragment: PullRequestFragment): string {
		return `${entry.id}\x00fragment\x00${fragment}`;
	}

	private _bodyTaskKey(entry: PullRequestEntry, fragment: PullRequestFragment): string {
		return `${entry.id}\x00body\x00${fragment}`;
	}

	private _dormantTaskKey(entry: PullRequestEntry): string {
		return `${entry.id}\x00dormant`;
	}

	private _isFragmentActive(entry: PullRequestEntry, fragment: PullRequestFragment): boolean {
		return !entry.disposed && entry.subscriptions.size > 0 && entry.effective.has(fragment);
	}
}

function initialSnapshot(ref: PullRequestRef): PullRequestSnapshot {
	const missing = { status: 'missing', complete: false } as const;
	return {
		ref,
		generation: 1,
		headGeneration: 0,
		core: missing,
		topLevelComments: missing,
		submittedReviews: missing,
		inlineComments: missing,
		reviewThreads: missing,
		checks: missing,
		mergeability: missing,
		participants: missing,
	};
}

function normalizeRef(ref: PullRequestRef): PullRequestRef {
	const host = ref.host.trim().toLowerCase();
	const accountId = ref.accountId.trim();
	const owner = ref.owner.trim();
	const repo = ref.repo.trim();
	if (!host || !accountId || !owner || !repo || !Number.isInteger(ref.number) || ref.number <= 0) {
		throw new Error('Pull request reference must contain a host, account, owner, repository, and positive number');
	}
	return { host, accountId, owner, repo, number: ref.number };
}

function pullRequestKey(ref: PullRequestRef): string {
	return [
		ref.host.toLowerCase(),
		ref.accountId,
		ref.owner.toLowerCase(),
		ref.repo.toLowerCase(),
		ref.number,
	].join('\x00');
}

function stablePullRequestKey(ref: PullRequestRef, repositoryId: string): string {
	return [ref.host.toLowerCase(), ref.accountId, 'repository', repositoryId, ref.number].join('\x00');
}

function sameAccount(left: { readonly host: string; readonly accountId: string }, right: { readonly host: string; readonly accountId: string }): boolean {
	return left.host.toLowerCase() === right.host.toLowerCase() && left.accountId === right.accountId;
}

function sameInterest(left: EffectivePullRequestFragmentInterest, right: EffectivePullRequestFragmentInterest): boolean {
	return left.priority === right.priority
		&& (left.includeBodies === true) === (right.includeBodies === true)
		&& (left.requiredChecks === true) === (right.requiredChecks === true)
		&& (left.includeOptionalChecks === true) === (right.includeOptionalChecks === true);
}

function isConversationFragment(fragment: PullRequestFragment): fragment is 'topLevelComments' | 'submittedReviews' | 'inlineComments' | 'reviewThreads' {
	return fragment === 'topLevelComments' || fragment === 'submittedReviews' || fragment === 'inlineComments' || fragment === 'reviewThreads';
}

function isHeadFragment(fragment: PullRequestFragment): fragment is 'reviewThreads' | 'checks' | 'mergeability' {
	return fragment === 'reviewThreads' || fragment === 'checks' || fragment === 'mergeability';
}

function checksPending(value: PullRequestChecks | undefined): boolean {
	if (!value) {
		return true;
	}
	return value.checks.some(check => {
		if (check.type === 'checkRun') {
			return check.status !== 'COMPLETED';
		}
		return check.status === 'PENDING' || check.status === 'EXPECTED';
	});
}

function fragmentState(snapshot: PullRequestSnapshot, fragment: PullRequestFragment): AnyFragmentState {
	switch (fragment) {
		case 'core': return snapshot.core;
		case 'topLevelComments': return snapshot.topLevelComments;
		case 'submittedReviews': return snapshot.submittedReviews;
		case 'inlineComments': return snapshot.inlineComments;
		case 'reviewThreads': return snapshot.reviewThreads;
		case 'checks': return snapshot.checks;
		case 'mergeability': return snapshot.mergeability;
		case 'participants': return snapshot.participants;
	}
}

function withFragmentState(snapshot: PullRequestSnapshot, fragment: PullRequestFragment, state: AnyFragmentState): PullRequestSnapshot {
	switch (fragment) {
		case 'core': return { ...snapshot, core: state as FragmentState<PullRequestCore> };
		case 'topLevelComments': return { ...snapshot, topLevelComments: state as FragmentState<readonly PullRequestComment[]> };
		case 'submittedReviews': return { ...snapshot, submittedReviews: state as FragmentState<readonly PullRequestReview[]> };
		case 'inlineComments': return { ...snapshot, inlineComments: state as FragmentState<readonly PullRequestInlineComment[]> };
		case 'reviewThreads': return { ...snapshot, reviewThreads: state as FragmentState<readonly PullRequestReviewThread[]> };
		case 'checks': return { ...snapshot, checks: state as FragmentState<PullRequestChecks> };
		case 'mergeability': return { ...snapshot, mergeability: state as FragmentState<PullRequestMergeability> };
		case 'participants': return { ...snapshot, participants: state as FragmentState<PullRequestParticipants> };
	}
}

function toFragmentError(error: unknown): GitHubFragmentError {
	if (error instanceof GitHubRequestError) {
		return { message: error.message, kind: error.kind, statusCode: error.statusCode };
	}
	return { message: error instanceof Error ? error.message : String(error), kind: 'unknown' };
}

function toTimestamp(value: number): string {
	return new Date(value).toISOString();
}

function readyState<T>(value: T, complete: boolean, observedAt: string, headSha?: string): FragmentState<T> {
	return {
		value,
		status: 'ready',
		complete,
		observedAt,
		attemptedAt: observedAt,
		headSha,
	};
}

function mergeSnapshotValues(target: PullRequestSnapshot, source: PullRequestSnapshot): PullRequestSnapshot {
	return {
		...target,
		topLevelComments: retainFragmentValue(target.topLevelComments, source.topLevelComments),
		submittedReviews: retainFragmentValue(target.submittedReviews, source.submittedReviews),
		inlineComments: retainFragmentValue(target.inlineComments, source.inlineComments),
		reviewThreads: retainFragmentValue(target.reviewThreads, source.reviewThreads),
		checks: retainFragmentValue(target.checks, source.checks),
		mergeability: retainFragmentValue(target.mergeability, source.mergeability),
		participants: retainFragmentValue(target.participants, source.participants),
	};
}

function retainFragmentValue<T>(target: FragmentState<T>, source: FragmentState<T>): FragmentState<T> {
	if (target.value !== undefined || source.value === undefined) {
		return target;
	}
	return {
		...source,
		status: 'stale',
		complete: false,
		error: undefined,
	};
}
