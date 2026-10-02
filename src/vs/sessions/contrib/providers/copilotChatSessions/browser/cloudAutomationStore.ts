/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, Sequencer } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AutomationCatalogueState } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../services/sessions/common/session.js';
import { CloudAutomationApiClient, CloudAutomationMutationUncertainError, ICloudAutomationDefinition, ICloudAutomationMutation, ICloudAutomationRepository, ICloudAutomationTask } from './cloudAutomationApiClient.js';

const REPOSITORIES_STORAGE_KEY = 'cloudAutomations.repositories';

export interface ICloudAutomationEntry {
	readonly repository: ICloudAutomationRepository;
	readonly definition: ICloudAutomationDefinition;
}

export interface ICloudAutomationHistoryEntry {
	readonly entry: ICloudAutomationEntry;
	readonly task: ICloudAutomationTask;
}

/** Provider-local coordination. Construction and account changes never initiate network requests. */
export class CloudAutomationStore extends Disposable {
	private readonly cachedEntries = observableValue<readonly ICloudAutomationEntry[]>(this, []);
	readonly entries: IObservable<readonly ICloudAutomationEntry[]> = this.cachedEntries;
	private readonly state = observableValue<AutomationCatalogueState>(this, 'ready');
	readonly catalogueState: IObservable<AutomationCatalogueState> = this.state;
	private readonly lifetime = this._register(new MutableDisposable<CancellationTokenSource>());
	private refreshPromise: Promise<void> | undefined;
	private operations = new Sequencer();
	private readonly cachedHistory = observableValue<readonly ICloudAutomationHistoryEntry[]>(this, []);
	readonly history: IObservable<readonly ICloudAutomationHistoryEntry[]> = this.cachedHistory;
	private readonly uncertain = observableValue(this, false);
	readonly mutationUncertain: IObservable<boolean> = this.uncertain;

	constructor(
		private readonly resolveRepositoryUri: (workspace: URI) => URI | undefined | Promise<URI | undefined>,
		private readonly api: CloudAutomationApiClient,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ISessionsRecentWorkspacesService private readonly recentWorkspacesService: ISessionsRecentWorkspacesService,
	) {
		super();
		this._register(defaultAccountService.onDidChangeDefaultAccount(() => this.reset()));
		this.reset();
	}

	/** Remembers an eligible repository for subsequent explicit refreshes; no definitions are fetched. */
	async registerRepository(workspace: URI): Promise<void> {
		const account = this.requireAccount();
		const token = this.lifetime.value!.token;
		const repository = await this.resolveRepository(workspace);
		this.assertCurrent(account, token);
		if (!repository) {
			throw new Error(localize('cloudAutomations.repositoryRequired', "Select a GitHub.com repository for this cloud automation."));
		}
		await this.api.requirePrivateRepository(account.accountName, repository, token);
		this.assertCurrent(account, token);
		this.rememberRepositories(account.accountName, [repository]);
	}

	async refresh(): Promise<void> {
		const account = this.requireAccount();
		if (this.refreshPromise) {
			return this.refreshPromise;
		}
		const token = this.lifetime.value!.token;
		this.state.set('loading', undefined);
		const refresh = this.operations.queue(async () => {
			this.assertCurrent(account, token);
			await this.refreshRepositories(account, token);
			this.uncertain.set(false, undefined);
		});
		this.refreshPromise = refresh;
		try {
			await refresh;
		} catch (error) {
			if (!token.isCancellationRequested && !this._store.isDisposed) {
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

	async create(workspace: URI, value: ICloudAutomationMutation, guard?: () => void): Promise<ICloudAutomationEntry> {
		const account = this.requireAccount();
		const token = this.lifetime.value!.token;
		const repository = await this.resolveRepository(workspace);
		this.assertCurrent(account, token);
		if (!repository) {
			throw new Error(localize('cloudAutomations.repositoryRequired', "Select a GitHub.com repository for this cloud automation."));
		}
		return this.mutate(repository, async (account, token) => {
			this.rememberRepositories(account.accountName, [repository]);
			guard?.();
			const definition = await this.api.create(account.accountName, repository, value, token);
			this.assertCurrent(account, token);
			return this.publish(repository, definition);
		});
	}

	/** The preflight callback may decline an update after comparing the latest authoritative definition. */
	update(entry: ICloudAutomationEntry, patch: (current: ICloudAutomationDefinition) => ICloudAutomationMutation | undefined, guard?: () => void): Promise<{ readonly entry: ICloudAutomationEntry; readonly updated: boolean }> {
		return this.mutate(entry.repository, async (account, token) => {
			const current = await this.api.get(account.accountName, entry.repository, entry.definition.id, token);
			this.assertCurrent(account, token);
			this.publish(entry.repository, current);
			const value = patch(current);
			if (!value) {
				return { entry: { repository: entry.repository, definition: current }, updated: false };
			}
			guard?.();
			const definition = await this.api.update(account.accountName, entry.repository, current.id, value, token);
			this.assertCurrent(account, token);
			return { entry: this.publish(entry.repository, definition), updated: true };
		});
	}

	async delete(entry: ICloudAutomationEntry, guard?: () => void): Promise<void> {
		await this.mutate(entry.repository, async (account, token) => {
			guard?.();
			await this.api.delete(account.accountName, entry.repository, entry.definition.id, token);
			this.assertCurrent(account, token);
			transaction(tx => {
				this.cachedEntries.set(this.cachedEntries.get().filter(candidate => !sameEntry(candidate, entry)), tx);
				this.cachedHistory.set(this.cachedHistory.get().filter(candidate => !sameEntry(candidate.entry, entry)), tx);
			});
		});
	}

	async run(entry: ICloudAutomationEntry, token: CancellationToken = CancellationToken.None): Promise<void> {
		await this.mutate(entry.repository, (account, token) => this.api.run(account.accountName, entry.repository, entry.definition.id, 'manual', token), token);
	}

	async stop(entry: ICloudAutomationHistoryEntry): Promise<void> {
		await this.mutate(entry.entry.repository, (account, token) => this.api.stopTask(account.accountName, entry.task.id, token));
	}

	async refreshHistory(): Promise<void> {
		const account = this.requireAccount();
		const token = this.lifetime.value!.token;
		await this.operations.queue(async () => {
			this.assertCurrent(account, token);
			const resources = new DisposableStore();
			const source = resources.add(new CancellationTokenSource(token));
			const limiter = resources.add(new Limiter<readonly ICloudAutomationHistoryEntry[]>(4));
			try {
				const history = await Promise.all(this.cachedEntries.get().map(entry => limiter.queue(async () => {
					try {
						this.assertCurrent(account, source.token);
						const tasks = await this.api.listRuns(account.accountName, entry.definition.id, source.token);
						const result: ICloudAutomationHistoryEntry[] = [];
						for (const task of tasks) {
							this.assertCurrent(account, source.token);
							const detail = ['queued', 'in_progress', 'running', 'waiting_for_user'].includes(task.state)
								? await this.api.getTask(account.accountName, task.id, entry.definition.id, source.token) : task;
							result.push({ entry, task: detail });
						}
						this.assertCurrent(account, source.token);
						return result;
					} catch (error) {
						source.cancel();
						throw error;
					}
				})));
				this.assertCurrent(account, token);
				this.cachedHistory.set(history.flat(), undefined);
			} finally {
				source.cancel();
				resources.dispose();
			}
		});
	}

	private mutate<T>(repository: ICloudAutomationRepository, operation: (account: IDefaultAccount, token: CancellationToken) => Promise<T>, token: CancellationToken = CancellationToken.None): Promise<T> {
		const account = this.requireAccount();
		const lifetime = this.lifetime.value!.token;
		return this.operations.queue(async () => {
			this.assertCurrent(account, lifetime);
			if (this.uncertain.get()) {
				throw new CloudAutomationMutationUncertainError(undefined);
			}
			const resources = new DisposableStore();
			const source = resources.add(new CancellationTokenSource(lifetime));
			resources.add(token.onCancellationRequested(() => source.cancel()));
			try {
				if (token.isCancellationRequested) {
					source.cancel();
				}
				this.assertCurrent(account, source.token);
				await this.api.requirePrivateRepository(account.accountName, repository, source.token);
				this.assertCurrent(account, source.token);
				const result = await operation(account, source.token);
				this.assertCurrent(account, source.token);
				return result;
			} catch (error) {
				if (error instanceof CloudAutomationMutationUncertainError && !lifetime.isCancellationRequested) {
					this.uncertain.set(true, undefined);
				}
				throw error;
			} finally {
				resources.dispose();
			}
		});
	}

	private publish(repository: ICloudAutomationRepository, definition: ICloudAutomationDefinition): ICloudAutomationEntry {
		const entry = { repository, definition };
		this.cachedEntries.set([...this.cachedEntries.get().filter(candidate => !sameEntry(candidate, entry)), entry], undefined);
		return entry;
	}

	private async refreshRepositories(account: IDefaultAccount, token: CancellationToken): Promise<void> {
		const repositories = this.readRepositories(account.accountName);
		const errors: unknown[] = [];
		for (const recent of this.recentWorkspacesService.getRecentWorkspaces(false)) {
			const root = recent.workspace.folders[0]?.root;
			try {
				const repository = root && await this.resolveRepository(root);
				this.assertCurrent(account, token);
				if (repository) {
					repositories.set(repositoryKey(repository), repository);
				}
			} catch (error) {
				this.assertCurrent(account, token);
				this.logService.warn('[CloudAutomations] Failed to resolve a recent repository', error);
				errors.push(error);
			}
		}

		const snapshot = new Map<string, readonly ICloudAutomationEntry[]>();
		for (const entry of this.cachedEntries.get()) {
			const key = repositoryKey(entry.repository);
			snapshot.set(key, [...snapshot.get(key) ?? [], entry]);
		}
		const eligible: ICloudAutomationRepository[] = [];
		for (const [key, repository] of repositories) {
			try {
				this.assertCurrent(account, token);
				if (!await this.api.isPrivateRepository(account.accountName, repository, token)) {
					this.assertCurrent(account, token);
					snapshot.delete(key);
					continue;
				}
				this.assertCurrent(account, token);
				eligible.push(repository);
				const definitions = await this.api.list(account.accountName, repository, token);
				this.assertCurrent(account, token);
				snapshot.set(key, definitions.map(definition => ({ repository, definition })));
			} catch (error) {
				this.assertCurrent(account, token);
				if (isCancellationError(error)) {
					throw error;
				}
				this.logService.warn(`[CloudAutomations] Failed to refresh ${key}`, error);
				errors.push(error);
			}
		}
		this.assertCurrent(account, token);
		this.rememberRepositories(account.accountName, eligible);
		transaction(tx => {
			this.cachedEntries.set([...snapshot.values()].flat(), tx);
			this.cachedHistory.set(this.cachedHistory.get().filter(row => this.cachedEntries.get().some(entry => sameEntry(row.entry, entry))), tx);
			this.state.set(errors.length ? 'error' : 'ready', tx);
		});
		if (errors.length) {
			throw new AggregateError(errors, localize('cloudAutomations.partialRefreshFailed', "Some GitHub repositories could not be refreshed. Check the logs for details."));
		}
	}

	private reset(): void {
		this.lifetime.value?.cancel();
		this.lifetime.value = new CancellationTokenSource();
		this.refreshPromise = undefined;
		this.operations = new Sequencer();
		const account = this.defaultAccountService.currentDefaultAccount;
		transaction(tx => {
			this.cachedEntries.set([], tx);
			this.cachedHistory.set([], tx);
			this.uncertain.set(false, tx);
			this.state.set(account && !account.enterprise ? 'ready' : 'unavailable', tx);
		});
	}

	override dispose(): void {
		this.lifetime.value?.cancel();
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

	private assertCurrent(account: IDefaultAccount, token: CancellationToken): void {
		const current = this.defaultAccountService.currentDefaultAccount;
		if (token.isCancellationRequested || this._store.isDisposed || current?.accountName !== account.accountName
			|| current.sessionId !== account.sessionId || current.authenticationProvider.id !== account.authenticationProvider.id
			|| current.enterprise !== account.enterprise) {
			throw new CancellationError();
		}
	}

	private async resolveRepository(workspace: URI): Promise<ICloudAutomationRepository | undefined> {
		const uri = workspace.scheme === GITHUB_REMOTE_FILE_SCHEME ? workspace : await this.resolveRepositoryUri(workspace);
		const match = uri?.scheme === GITHUB_REMOTE_FILE_SCHEME && uri.authority === 'github'
			? /^\/(?<owner>[^/]+)\/(?<name>[^/]+)(?:\/|$)/.exec(uri.path) : undefined;
		return match?.groups ? { owner: match.groups.owner, name: match.groups.name } : undefined;
	}

	private readRepositories(account: string): Map<string, ICloudAutomationRepository> {
		const stored = this.storageService.get(this.storageKey(account), StorageScope.PROFILE);
		const repositories = new Map<string, ICloudAutomationRepository>();
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
				const repository = { owner: value.owner, name: value.name };
				repositories.set(repositoryKey(repository), repository);
			}
		}
		return repositories;
	}

	private rememberRepositories(account: string, repositories: readonly ICloudAutomationRepository[]): void {
		// Merge current references so registration during a refresh is not overwritten.
		const known = this.readRepositories(account);
		for (const repository of repositories) {
			known.set(repositoryKey(repository), repository);
		}
		this.storageService.store(this.storageKey(account), JSON.stringify([...known.values()]), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private storageKey(account: string): string {
		return `${REPOSITORIES_STORAGE_KEY}.${encodeURIComponent(account)}`;
	}
}

function repositoryKey(repository: ICloudAutomationRepository): string {
	return `${repository.owner}/${repository.name}`.toLowerCase();
}

function sameEntry(a: ICloudAutomationEntry, b: ICloudAutomationEntry): boolean {
	return a.definition.id === b.definition.id && repositoryKey(a.repository) === repositoryKey(b.repository);
}
