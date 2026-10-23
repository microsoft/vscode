/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, Sequencer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { constObservable, IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { RepositoryRef } from '../../../../../platform/github/common/client/types.js';
import { ApiRequestOptions } from '../../../../../platform/github/common/client/request.js';
import { IGitHubAccountClient } from '../../../../../platform/github/common/account/account.js';
import { AutomationDetail, AutomationToolGroup, CreateAutomationRequest, EditAutomationRequest, IAutomationsClient } from '../../../../../platform/github/common/missionControl/automations.js';
import { ApiRequestError, MutationUncertainError } from '../../../../../platform/github/common/missionControl/missionControlClient.js';
import { Task } from '../../../../../platform/github/common/missionControl/tasks.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AutomationCatalogueState, AutomationMutationUncertainError, AutomationTriggerCatalog, AutomationUnavailableError, IAutomationRefreshOptions, IAutomationWorkspaceTarget } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IWorkbenchGitHubService } from '../../../../../workbench/services/github/common/githubService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../services/sessions/common/session.js';

const REPOSITORIES_STORAGE_KEY = 'cloudAutomations.repositories';
const REPOSITORY_CAPABILITY_FAILURE_RETRY_DELAY = 30_000;
const MAX_REPOSITORY_CAPABILITY_FAILURES = 100;

export interface ICloudAutomationEntry {
	readonly repository: RepositoryRef;
	readonly definition: AutomationDetail;
}

/** The account's tool catalog; `undefined` until it is first requested. */
export type CloudAutomationToolCatalog =
	| { readonly kind: 'loading' }
	| { readonly kind: 'ready'; readonly groups: readonly AutomationToolGroup[] }
	| { readonly kind: 'error' };

export interface ICloudAutomationHistoryEntry {
	readonly entry: ICloudAutomationEntry;
	readonly task: Task;
}

/** Provider-local coordination. Construction and account changes never initiate network requests. */
export class GitHubCloudAutomationStore extends Disposable {
	private readonly cachedEntries = observableValue<readonly ICloudAutomationEntry[]>(this, []);
	readonly entries: IObservable<readonly ICloudAutomationEntry[]> = this.cachedEntries;
	private readonly state = observableValue<AutomationCatalogueState>(this, 'ready');
	readonly catalogueState: IObservable<AutomationCatalogueState> = this.state;
	private lifetime = new AbortController();
	private readonly clientStore = this._register(new DisposableStore());
	private clientPromise: Promise<IGitHubAccountClient> | undefined;
	private refreshPromise: Promise<void> | undefined;
	private operations = new Sequencer();
	private readonly cachedHistory = observableValue<readonly ICloudAutomationHistoryEntry[]>(this, []);
	readonly history: IObservable<readonly ICloudAutomationHistoryEntry[]> = this.cachedHistory;
	private readonly uncertain = observableValue(this, false);
	readonly mutationUncertain: IObservable<boolean> = this.uncertain;
	private readonly targetEligibility = new Map<string, ReturnType<typeof observableValue<IAutomationWorkspaceTarget>>>();
	private readonly targetRepositories = new Map<string, RepositoryRef>();
	private readonly repositoryManageability = new Map<string, boolean>();
	private readonly repositoryManageabilityFailures = new LRUCache<string, number>(MAX_REPOSITORY_CAPABILITY_FAILURES);
	private readonly targetEligibilityLimiter = this._register(new Limiter<void>(5));
	private readonly cachedTools = observableValue<CloudAutomationToolCatalog | undefined>(this, undefined);
	readonly toolCatalog: IObservable<CloudAutomationToolCatalog | undefined> = this.cachedTools;
	readonly triggerCatalog = observableValue<AutomationTriggerCatalog | undefined>(this, undefined);

	constructor(
		private readonly resolveRepositoryUri: (workspace: URI) => URI | undefined | Promise<URI | undefined>,
		@IWorkbenchGitHubService private readonly gitHubService: IWorkbenchGitHubService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ISessionsRecentWorkspacesService private readonly recentWorkspacesService: ISessionsRecentWorkspacesService,
	) {
		super();
		this._register(defaultAccountService.onDidChangeDefaultAccount(() => this.reset()));
		this._register(gitHubService.onDidChangeDefaultClient(() => this.reset()));
		this.reset();
	}

	getWorkspaceTarget(workspace: URI | undefined): IObservable<IAutomationWorkspaceTarget> {
		const required = localize('cloudAutomations.repositoryTargetRequired', "Choose a GitHub.com repository that supports cloud automations.");
		if (!workspace || this._store.isDisposed || this.lifetime.signal.aborted) {
			return constObservable({ disabledReason: required });
		}
		const key = workspace.toString();
		const cached = this.targetEligibility.get(key);
		if (cached) {
			return cached;
		}
		const result = observableValue<IAutomationWorkspaceTarget>(this, {
			disabledReason: localize('cloudAutomations.checkingRepository', "Checking repository access..."),
			pending: true,
		});
		this.targetEligibility.set(key, result);
		const signal = this.lifetime.signal;
		void this.targetEligibilityLimiter.queue(async () => {
			let repository: RepositoryRef | undefined;
			try {
				this.requireAccount();
				signal.throwIfAborted();
				const resolvedRepository = await this.resolveRepository(workspace);
				repository = resolvedRepository;
				signal.throwIfAborted();
				const canManage = resolvedRepository && (await this.withClient(signal, (client, signal) => client.automations.getConfiguration(resolvedRepository, signal))).can_manage_automations;
				signal.throwIfAborted();
				if (this.targetEligibility.get(key) !== result) {
					return;
				}
				if (repository) {
					this.targetRepositories.set(key, repository);
					this.setRepositoryManageability(repositoryKey(repository), canManage === true);
				}
				result.set(repository && canManage ? {
					workspace: URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${repository.owner}/${repository.repo}/HEAD` }),
					repositoryLabel: repositoryDisplayName(repository),
				} : {
					disabledReason: repository
						? localize('cloudAutomations.manageabilityRequired', "Cloud automations cannot be managed for this repository.")
						: required,
					isRepository: repository !== undefined,
					repositoryLabel: repository ? repositoryDisplayName(repository) : undefined,
				}, undefined);
			} catch (error) {
				if (!isCancellationError(error)) {
					this.logService.warn('[CloudAutomations] Repository eligibility check failed', error);
				}
				if (!signal.aborted && !this._store.isDisposed && this.targetEligibility.get(key) === result) {
					result.set({
						disabledReason: localize('cloudAutomations.repositoryCheckFailed', "Unable to verify cloud automation access. Refresh automations to try again."),
						isRepository: repository !== undefined,
						repositoryLabel: repository ? repositoryDisplayName(repository) : undefined,
					}, undefined);
				}
			}
		});
		return result;
	}

	async isRepositoryManageable(repository: RepositoryRef, token: CancellationToken): Promise<boolean> {
		const key = repositoryKey(repository);
		if (this.repositoryManageability.has(key)) {
			return this.repositoryManageability.get(key) === true;
		}
		const retryAfter = this.repositoryManageabilityFailures.get(key);
		if (retryAfter !== undefined) {
			if (retryAfter > Date.now()) {
				return false;
			}
			this.repositoryManageabilityFailures.delete(key);
		}
		const resources = new DisposableStore();
		const signal = AbortSignal.any([this.lifetime.signal, CancellationToken.toAbortSignal(token, resources)]);
		try {
			this.requireAccount();
			const canManage = (await this.withClient(signal, (client, signal) => client.automations.getConfiguration(repository, signal))).can_manage_automations;
			signal.throwIfAborted();
			this.repositoryManageabilityFailures.delete(key);
			this.setRepositoryManageability(key, canManage);
			return canManage;
		} catch (error) {
			signal.throwIfAborted();
			if (isCancellationError(error)) {
				throw error;
			}
			this.repositoryManageabilityFailures.set(key, Date.now() + REPOSITORY_CAPABILITY_FAILURE_RETRY_DELAY);
			this.logService.warn(`[CloudAutomations] Failed to verify ${key}`, error);
			return false;
		} finally {
			resources.dispose();
		}
	}

	canManageRepository(repository: RepositoryRef): boolean {
		return this.repositoryManageability.get(repositoryKey(repository)) === true;
	}

	/** Loads the account's tool catalog once per account lifetime; a failed load can be retried. */
	loadTools(): void {
		const current = this.cachedTools.get();
		if (current?.kind === 'loading' || current?.kind === 'ready') {
			return;
		}
		const signal = this.lifetime.signal;
		this.cachedTools.set({ kind: 'loading' }, undefined);
		void (async () => {
			try {
				this.requireAccount();
				const groups = await this.withClient(signal, (client, signal) => client.automations.listTools(signal));
				signal.throwIfAborted();
				this.cachedTools.set({ kind: 'ready', groups }, undefined);
			} catch (error) {
				if (signal.aborted || this._store.isDisposed) {
					return;
				}
				if (!isCancellationError(error)) {
					this.logService.warn('[CloudAutomations] Failed to load automation tools', error);
				}
				this.cachedTools.set({ kind: 'error' }, undefined);
			}
		})();
	}

	loadTriggers(): void {
		const current = this.triggerCatalog.get();
		if (current?.kind === 'loading' || current?.kind === 'ready') {
			return;
		}
		const signal = this.lifetime.signal;
		this.triggerCatalog.set({ kind: 'loading' }, undefined);
		void (async () => {
			try {
				this.requireAccount();
				const definitions = await this.withClient(signal, (client, signal) => client.automations.listTriggers(signal));
				signal.throwIfAborted();
				this.triggerCatalog.set({ kind: 'ready', definitions }, undefined);
			} catch (error) {
				if (signal.aborted || this._store.isDisposed) {
					return;
				}
				this.logService.warn('[CloudAutomations] Failed to load automation triggers', error);
				this.triggerCatalog.set({ kind: 'error', message: localize('cloudAutomations.triggersLoadFailed', "Available triggers could not be loaded.") }, undefined);
			}
		})();
	}

	private clearTargetEligibility(): void {
		const targets = [...this.targetEligibility.values()];
		this.targetEligibility.clear();
		this.targetRepositories.clear();
		for (const target of targets) {
			target.set({ disabledReason: localize('cloudAutomations.repositoryRecheckRequired', "Repository access must be verified again.") }, undefined);
		}
	}

	async refresh(options?: IAutomationRefreshOptions): Promise<void> {
		const account = this.requireAccount();
		if (this.refreshPromise) {
			return this.refreshPromise;
		}
		if (!options?.background) {
			this.clearTargetEligibility();
			this.repositoryManageabilityFailures.clear();
		}
		const signal = this.lifetime.signal;
		if (this.state.get() !== 'ready') {
			this.state.set('loading', undefined);
		}
		const refresh = this.operations.queue(async () => {
			await this.withClient(signal, (client, signal) => this.refreshRepositories(account, signal, client, options?.background ? { priority: 'background' } : undefined));
			signal.throwIfAborted();
			this.uncertain.set(false, undefined);
		});
		this.refreshPromise = refresh;
		try {
			await refresh;
		} catch (error) {
			if (!signal.aborted && !this._store.isDisposed) {
				this.state.set('error', undefined);
				this.logService.warn('[CloudAutomations] Failed to refresh repositories', error);
			}
			throw error;
		} finally {
			if (this.refreshPromise === refresh) {
				this.refreshPromise = undefined;
			}
		}
	}

	private async acquireClient(signal: AbortSignal): Promise<IGitHubAccountClient> {
		const client = await this.gitHubService.acquireDefaultAccountApiClient(signal);
		if (signal.aborted) {
			client.dispose();
			throw signal.reason;
		}
		this.clientStore.add(client);
		this.clientStore.add(client.onDidInvalidate(() => this.reset()));
		return client;
	}

	private async withClient<T>(signal: AbortSignal, task: (client: IGitHubAccountClient, signal: AbortSignal) => Promise<T>): Promise<T> {
		signal.throwIfAborted();
		const pending = this.clientPromise ??= this.acquireClient(signal);
		let client: IGitHubAccountClient;
		try {
			client = await pending;
		} catch (error) {
			if (this.clientPromise === pending) {
				this.clientPromise = undefined;
			}
			throw error;
		}
		try {
			return await task(client, signal);
		} catch (error) {
			if (signal.aborted && !(error instanceof MutationUncertainError || error instanceof ApiRequestError && error.outcome === 'indeterminate')) {
				throw new CancellationError();
			}
			throw error;
		}
	}

	async create(workspace: URI, value: CreateAutomationRequest, guard?: () => void): Promise<ICloudAutomationEntry> {
		const account = this.requireAccount();
		const signal = this.lifetime.signal;
		const repository = await this.resolveRepository(workspace);
		signal.throwIfAborted();
		if (!repository) {
			throw new Error(localize('cloudAutomations.repositoryRequired', "Select a GitHub.com repository for this cloud automation."));
		}
		return this.mutate(repository, async (client, ref, signal) => {
			this.rememberRepositories(account.accountName, [repository], signal);
			guard?.();
			const definition = await client.automations.create(ref, value, signal);
			return this.publish(repository, definition, signal);
		}, CancellationToken.None, signal);
	}

	/** The preflight callback may decline an update after comparing the latest authoritative definition. */
	update(entry: ICloudAutomationEntry, patch: (current: AutomationDetail) => EditAutomationRequest | undefined, guard?: () => void): Promise<{ readonly entry: ICloudAutomationEntry; readonly updated: boolean } | { readonly entry: undefined; readonly updated: false }> {
		return this.mutate(entry.repository, async (client, ref, signal) => {
			let current: AutomationDetail;
			try {
				current = await client.automations.get(ref, entry.definition.id, signal);
			} catch (error) {
				if (!(error instanceof ApiRequestError) || error.statusCode !== 404) {
					throw error;
				}
				this.removeEntry(entry, signal);
				return { entry: undefined, updated: false };
			}
			this.publish(entry.repository, current, signal);
			const value = patch(current);
			if (!value) {
				return { entry: { repository: entry.repository, definition: current }, updated: false };
			}
			guard?.();
			const definition = await client.automations.update(ref, current.id, value, signal);
			return { entry: this.publish(entry.repository, definition, signal), updated: true };
		});
	}

	async delete(entry: ICloudAutomationEntry, guard?: () => void): Promise<void> {
		await this.mutate(entry.repository, async (client, ref, signal) => {
			guard?.();
			await client.automations.delete(ref, entry.definition.id, signal);
			this.removeEntry(entry, signal);
		});
	}

	async run(entry: ICloudAutomationEntry, token: CancellationToken = CancellationToken.None, guard?: () => void): Promise<void> {
		await this.mutate(entry.repository, async (client, ref, signal) => {
			let current: AutomationDetail;
			try {
				current = await client.automations.get(ref, entry.definition.id, signal);
			} catch (error) {
				if (!(error instanceof ApiRequestError) || error.statusCode !== 404) {
					throw error;
				}
				this.removeEntry(entry, signal);
				throw new AutomationUnavailableError(localize('cloudAutomations.missing', "This cloud automation is no longer available. Refresh the catalogue."));
			}
			this.publish(entry.repository, current, signal);
			guard?.();
			await client.automations.dispatch(ref, current.id, { event: 'manual' }, signal);
		}, token);
	}

	async stop(entry: ICloudAutomationHistoryEntry): Promise<void> {
		await this.mutate(entry.entry.repository, (client, _ref, signal) => client.tasks.abort(entry.task.id, signal));
	}

	async refreshHistory(options?: IAutomationRefreshOptions): Promise<void> {
		this.requireAccount();
		const signal = this.lifetime.signal;
		const requestOptions: ApiRequestOptions | undefined = options?.background ? { priority: 'background' } : undefined;
		await this.operations.queue(async () => {
			await this.withClient(signal, async (client, operationSignal) => {
				const resources = new DisposableStore();
				const controller = new AbortController();
				const historySignal = AbortSignal.any([operationSignal, controller.signal]);
				const limiter = resources.add(new Limiter<readonly ICloudAutomationHistoryEntry[]>(4));
				try {
					const history = await Promise.all(this.cachedEntries.get().map(entry => limiter.queue(async () => {
						try {
							historySignal.throwIfAborted();
							const tasks = await client.automations.listRuns(entry.definition.id, historySignal, { ...requestOptions, query: { per_page: 50, page: 1, sort: 'created_at', direction: 'desc', is_archived: false } }).catch(error => {
								if (!(error instanceof ApiRequestError) || error.statusCode !== 404) {
									throw error;
								}
								const creator = entry.definition.created_by.login;
								if ((entry.definition.ownership ?? entry.definition.owner_type) === 'repository'
									&& !!creator
									&& creator.toLowerCase() !== this.defaultAccountService.currentDefaultAccount?.accountName.toLowerCase()) {
									return undefined;
								}
								this.removeEntry(entry, historySignal);
								this.logService.info('[CloudAutomations] Definition no longer available', entry.definition.id);
								return undefined;
							});
							const result: ICloudAutomationHistoryEntry[] = [];
							for (const task of tasks?.data.tasks ?? []) {
								const detail = ['queued', 'in_progress', 'running', 'waiting_for_user'].includes(task.state)
									? await client.tasks.get(task.id, historySignal, requestOptions) : task;
								result.push({ entry, task: detail });
							}
							return result;
						} catch (error) {
							controller.abort(new CancellationError());
							throw error;
						}
					})));
					operationSignal.throwIfAborted();
					this.cachedHistory.set(history.flat(), undefined);
				} finally {
					controller.abort(new CancellationError());
					resources.dispose();
				}
			});
		});
	}

	private mutate<T>(repository: RepositoryRef, operation: (client: IGitHubAccountClient, ref: RepositoryRef, signal: AbortSignal) => Promise<T>, token: CancellationToken = CancellationToken.None, lifetime: AbortSignal = this.lifetime.signal): Promise<T> {
		this.requireAccount();
		return this.operations.queue(async () => {
			lifetime.throwIfAborted();
			if (this.uncertain.get()) {
				throw new AutomationMutationUncertainError(localize('cloudAutomations.mutationUncertain', "The automation request may have been accepted. Refresh automations before submitting again."));
			}
			const resources = new DisposableStore();
			try {
				const signal = AbortSignal.any([lifetime, CancellationToken.toAbortSignal(token, resources)]);
				return await this.withClient(signal, async (client, signal) => {
					const canManage = (await client.automations.getConfiguration(repository, signal)).can_manage_automations;
					signal.throwIfAborted();
					this.setRepositoryManageability(repositoryKey(repository), canManage);
					if (!canManage) {
						throw new AutomationUnavailableError(localize('cloudAutomations.manageabilityRequired', "Cloud automations cannot be managed for this repository."));
					}
					return operation(client, repository, signal);
				});
			} catch (error) {
				if (error instanceof MutationUncertainError || error instanceof ApiRequestError && error.outcome === 'indeterminate') {
					if (!lifetime.aborted) {
						this.uncertain.set(true, undefined);
					}
					throw new AutomationMutationUncertainError(localize('cloudAutomations.mutationUncertain', "The automation request may have been accepted. Refresh automations before submitting again."), { cause: error });
				}
				if (error instanceof ApiRequestError && error.response?.message) {
					throw new AutomationUnavailableError(error.response.message, { cause: error });
				}
				throw error;
			} finally {
				resources.dispose();
			}
		});
	}

	private publish(repository: RepositoryRef, definition: AutomationDetail, signal: AbortSignal): ICloudAutomationEntry {
		signal.throwIfAborted();
		const entry = { repository, definition };
		this.cachedEntries.set([...this.cachedEntries.get().filter(candidate => !sameEntry(candidate, entry)), entry], undefined);
		return entry;
	}

	private removeEntry(entry: ICloudAutomationEntry, signal: AbortSignal): void {
		signal.throwIfAborted();
		transaction(tx => {
			this.cachedEntries.set(this.cachedEntries.get().filter(candidate => !sameEntry(candidate, entry)), tx);
			this.cachedHistory.set(this.cachedHistory.get().filter(candidate => !sameEntry(candidate.entry, entry)), tx);
		});
	}

	private async refreshRepositories(account: IDefaultAccount, signal: AbortSignal, client: IGitHubAccountClient, options?: ApiRequestOptions): Promise<void> {
		const repositories = this.readRepositories(account.accountName);
		for (const repository of this.targetRepositories.values()) {
			repositories.set(repositoryKey(repository), repository);
		}
		const errors: unknown[] = [];
		for (const recent of this.recentWorkspacesService.getRecentWorkspaces(false)) {
			const root = recent.workspace.folders[0]?.root;
			try {
				const repository = root && await this.resolveRepository(root);
				signal.throwIfAborted();
				if (repository) {
					repositories.set(repositoryKey(repository), repository);
				}
			} catch (error) {
				signal.throwIfAborted();
				this.logService.warn('[CloudAutomations] Failed to resolve a recent repository', error);
				errors.push(error);
			}
		}

		const snapshot = new Map<string, readonly ICloudAutomationEntry[]>();
		for (const entry of this.cachedEntries.get()) {
			const key = repositoryKey(entry.repository);
			snapshot.set(key, [...snapshot.get(key) ?? [], entry]);
		}
		const eligible: RepositoryRef[] = [];
		for (const [key, repository] of repositories) {
			try {
				const canManage = (await client.automations.getConfiguration(repository, signal, options)).can_manage_automations;
				signal.throwIfAborted();
				this.setRepositoryManageability(key, canManage);
				if (!canManage) {
					snapshot.delete(key);
					continue;
				}
				eligible.push(repository);
				const definitions = await this.listDefinitions(client.automations, repository, signal, options);
				snapshot.set(key, definitions.map(definition => ({ repository, definition })));
			} catch (error) {
				signal.throwIfAborted();
				if (isCancellationError(error)) {
					throw error;
				}
				this.logService.warn(`[CloudAutomations] Failed to refresh ${key}`, error);
				errors.push(error);
			}
		}
		this.rememberRepositories(account.accountName, eligible, signal);
		transaction(tx => {
			this.cachedEntries.set([...snapshot.values()].flat(), tx);
			this.cachedHistory.set(this.cachedHistory.get().filter(row => this.cachedEntries.get().some(entry => sameEntry(row.entry, entry))), tx);
			this.state.set(errors.length ? 'error' : 'ready', tx);
		});
		if (errors.length) {
			throw new AggregateError(errors, localize('cloudAutomations.partialRefreshFailed', "Some GitHub repositories could not be refreshed. Check the logs for details."));
		}
	}

	private async listDefinitions(api: IAutomationsClient, repository: RepositoryRef, signal: AbortSignal, options?: ApiRequestOptions): Promise<readonly AutomationDetail[]> {
		const controller = new AbortController();
		const operationSignal = AbortSignal.any([signal, controller.signal]);
		try {
			const response = await api.list(repository, operationSignal, {
				...options,
				query: { page: 1, per_page: 100 },
				maxPages: 10,
			});
			const summaries = response.data.automations;
			const definitions: AutomationDetail[] = [];
			for (let offset = 0; offset < summaries.length; offset += 5) {
				operationSignal.throwIfAborted();
				definitions.push(...await Promise.all(summaries.slice(offset, offset + 5).map(summary => api.get(repository, summary.id, operationSignal, options))));
			}
			return definitions;
		} finally {
			controller.abort();
		}
	}

	private reset(): void {
		this.lifetime.abort(new CancellationError());
		this.clearTargetEligibility();
		this.repositoryManageability.clear();
		this.repositoryManageabilityFailures.clear();
		this.lifetime = new AbortController();
		this.clientPromise = undefined;
		this.clientStore.clear();
		this.refreshPromise = undefined;
		this.operations = new Sequencer();
		const account = this.defaultAccountService.currentDefaultAccount;
		transaction(tx => {
			this.cachedEntries.set([], tx);
			this.cachedHistory.set([], tx);
			this.uncertain.set(false, tx);
			this.cachedTools.set(undefined, tx);
			this.triggerCatalog.set(undefined, tx);
			this.state.set(account && !account.enterprise ? 'loading' : 'unavailable', tx);
		});
	}

	private setRepositoryManageability(key: string, canManage: boolean): void {
		this.repositoryManageabilityFailures.delete(key);
		const changed = this.repositoryManageability.has(key) && this.repositoryManageability.get(key) !== canManage;
		this.repositoryManageability.set(key, canManage);
		if (changed) {
			this.cachedEntries.set([...this.cachedEntries.get()], undefined);
			for (const [targetKey, repository] of this.targetRepositories) {
				if (repositoryKey(repository) === key) {
					this.targetEligibility.get(targetKey)?.set(canManage ? {
						workspace: URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${repository.owner}/${repository.repo}/HEAD` }),
						repositoryLabel: repositoryDisplayName(repository),
					} : {
						disabledReason: localize('cloudAutomations.manageabilityRequired', "Cloud automations cannot be managed for this repository."),
						isRepository: true,
						repositoryLabel: repositoryDisplayName(repository),
					}, undefined);
				}
			}
		}
	}

	override dispose(): void {
		this.lifetime.abort(new CancellationError());
		this.clearTargetEligibility();
		super.dispose();
		transaction(tx => {
			this.cachedEntries.set([], tx);
			this.cachedHistory.set([], tx);
			this.state.set('unavailable', tx);
		});
	}

	private requireAccount(): IDefaultAccount {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const account = this.defaultAccountService.currentDefaultAccount;
		if (!account || account.enterprise) {
			throw new Error(localize('cloudAutomations.signIn', "Sign in to GitHub.com with repository access to manage cloud automations."));
		}
		return account;
	}

	private async resolveRepository(workspace: URI): Promise<RepositoryRef | undefined> {
		const uri = workspace.scheme === GITHUB_REMOTE_FILE_SCHEME ? workspace : await this.resolveRepositoryUri(workspace);
		const match = uri?.scheme === GITHUB_REMOTE_FILE_SCHEME && uri.authority === 'github'
			? /^\/(?<owner>[^/]+)\/(?<name>[^/]+)(?:\/|$)/.exec(uri.path) : undefined;
		return match?.groups ? { owner: match.groups.owner, repo: match.groups.name } : undefined;
	}

	private readRepositories(account: string): Map<string, RepositoryRef> {
		const stored = this.storageService.get(this.storageKey(account), StorageScope.PROFILE);
		const repositories = new Map<string, RepositoryRef>();
		if (stored !== undefined) {
			const values: unknown = JSON.parse(stored);
			if (!Array.isArray(values)) {
				throw new Error(localize('cloudAutomations.invalidRepositories', "Invalid stored cloud automation repositories."));
			}
			for (const value of values) {
				if (!isObject(value) || typeof value.owner !== 'string' || !value.owner || value.owner.includes('/')
					|| typeof value.name !== 'string' || !value.name || value.name.includes('/')) {
					throw new Error(localize('cloudAutomations.invalidRepository', "Invalid stored cloud automation repository."));
				}
				const repository = { owner: value.owner, repo: value.name };
				repositories.set(repositoryKey(repository), repository);
			}
		}
		return repositories;
	}

	private rememberRepositories(account: string, repositories: readonly RepositoryRef[], signal: AbortSignal): void {
		signal.throwIfAborted();
		const known = this.readRepositories(account);
		for (const repository of repositories) {
			known.set(repositoryKey(repository), repository);
		}
		this.storageService.store(this.storageKey(account), JSON.stringify([...known.values()].map(repository => ({ owner: repository.owner, name: repository.repo }))), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private storageKey(account: string): string {
		return `${REPOSITORIES_STORAGE_KEY}.${encodeURIComponent(account)}`;
	}
}

function repositoryKey(repository: RepositoryRef): string {
	return `${repository.owner}/${repository.repo}`.toLowerCase();
}

function repositoryDisplayName(repository: RepositoryRef): string {
	return `${repository.owner}/${repository.repo}`;
}

function sameEntry(a: ICloudAutomationEntry, b: ICloudAutomationEntry): boolean {
	return a.definition.id === b.definition.id && repositoryKey(a.repository) === repositoryKey(b.repository);
}
