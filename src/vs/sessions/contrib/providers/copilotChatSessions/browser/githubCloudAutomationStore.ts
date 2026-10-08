/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IGitHubClient } from '../../../../../platform/github/common/githubService.js';
import { AutomationDetail, IAutomationsClient } from '../../../../../platform/github/common/missionControl/automations.js';
import { RepositoryRef } from '../../../../../platform/github/common/missionControl/missionControl.js';
import { AccountHandle } from '../../../../../platform/github/common/types.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AutomationCatalogueState } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IWorkbenchGitHubService } from '../../../../../workbench/services/github/common/githubService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../services/sessions/common/session.js';

const REPOSITORIES_STORAGE_KEY = 'cloudAutomations.repositories';

export interface ICloudAutomationEntry {
	readonly repository: RepositoryRef;
	readonly definition: AutomationDetail;
}

/** Provider-local read cache. Construction and account changes never initiate network requests. */
export class GitHubCloudAutomationStore extends Disposable {
	private readonly cachedEntries = observableValue<readonly ICloudAutomationEntry[]>(this, []);
	readonly entries: IObservable<readonly ICloudAutomationEntry[]> = this.cachedEntries;
	private readonly state = observableValue<AutomationCatalogueState>(this, 'ready');
	readonly catalogueState: IObservable<AutomationCatalogueState> = this.state;
	private lifetime = new AbortController();
	private readonly clientStore = this._register(new DisposableStore());
	private clientPromise: Promise<IGitHubClient> | undefined;
	private refreshPromise: Promise<void> | undefined;

	constructor(
		private readonly resolveRepositoryUri: (workspace: URI) => URI | undefined,
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

	/** Remembers an eligible repository for subsequent explicit refreshes; no definitions are fetched. */
	async registerRepository(workspace: URI): Promise<void> {
		const account = this.requireAccount();
		const signal = this.lifetime.signal;
		const repository = this.resolveRepository(workspace);
		if (!repository) {
			throw new Error(localize('cloudAutomations.repositoryRequired', "Select a GitHub.com repository for this cloud automation."));
		}
		await this.withClient(account, signal, async (client, identity, signal) => {
			if (!(await client.query.getRepository({ ...identity, owner: repository.owner, repo: repository.name }, signal)).private) {
				throw new Error(localize('cloudAutomations.privateRepositoryRequired', "Cloud automations currently require a private GitHub repository."));
			}
			this.assertCurrent(account, signal);
			this.rememberRepositories(account.accountName, [repository]);
		});
	}

	async refresh(): Promise<void> {
		const account = this.requireAccount();
		if (this.refreshPromise) {
			return this.refreshPromise;
		}
		const signal = this.lifetime.signal;
		this.state.set('loading', undefined);
		const refresh = this.withClient(account, signal, (client, identity, signal) => this.refreshRepositories(account, signal, client, identity));
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

	private async acquireClient(account: IDefaultAccount, signal: AbortSignal): Promise<IGitHubClient> {
		const reference = await this.gitHubService.acquireDefaultAccountClient(signal);
		try {
			this.assertCurrent(account, signal);
			if (reference.object.endpoint.getApiBaseUri() !== 'https://api.github.com') {
				throw new Error(localize('cloudAutomations.dotcomRequired', "Cloud automations require a GitHub.com account."));
			}
		} catch (error) {
			reference.dispose();
			throw error;
		}
		this.clientStore.add(reference);
		this.clientStore.add(reference.object.onDidInvalidate(() => this.reset()));
		return reference.object;
	}

	private async withClient<T>(account: IDefaultAccount, signal: AbortSignal, task: (client: IGitHubClient, identity: AccountHandle, signal: AbortSignal) => Promise<T>): Promise<T> {
		const pending = this.clientPromise ??= this.acquireClient(account, signal);
		let client: IGitHubClient;
		try {
			client = await pending;
		} catch (error) {
			if (this.clientPromise === pending) {
				this.clientPromise = undefined;
			}
			throw error;
		}
		this.assertCurrent(account, signal);
		const credential = await client.credentials.getCredential(signal);
		const operationSignal = AbortSignal.any([signal, credential.signal]);
		this.assertCurrent(account, operationSignal);
		return task(client, credential.account, operationSignal);
	}

	private async refreshRepositories(account: IDefaultAccount, signal: AbortSignal, client: IGitHubClient, identity: AccountHandle): Promise<void> {
		const repositories = this.readRepositories(account.accountName);
		const errors: unknown[] = [];
		for (const recent of this.recentWorkspacesService.getRecentWorkspaces(false)) {
			const root = recent.workspace.folders[0]?.root;
			try {
				const repository = root && this.resolveRepository(root);
				if (repository) {
					repositories.set(repositoryKey(repository), repository);
				}
			} catch (error) {
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
				this.assertCurrent(account, signal);
				const ref = { ...identity, owner: repository.owner, repo: repository.name };
				if (!(await client.query.getRepository(ref, signal)).private) {
					this.assertCurrent(account, signal);
					snapshot.delete(key);
					continue;
				}
				this.assertCurrent(account, signal);
				eligible.push(repository);
				const definitions = await this.listDefinitions(client.automations, repository, signal);
				this.assertCurrent(account, signal);
				snapshot.set(key, definitions.map(definition => ({ repository, definition })));
			} catch (error) {
				this.assertCurrent(account, signal);
				if (isCancellationError(error)) {
					throw error;
				}
				this.logService.warn(`[CloudAutomations] Failed to refresh ${key}`, error);
				errors.push(error);
			}
		}
		this.assertCurrent(account, signal);
		this.rememberRepositories(account.accountName, eligible);
		transaction(tx => {
			this.cachedEntries.set([...snapshot.values()].flat(), tx);
			this.state.set(errors.length ? 'error' : 'ready', tx);
		});
		if (errors.length) {
			throw new AggregateError(errors, localize('cloudAutomations.partialRefreshFailed', "Some GitHub repositories could not be refreshed. Check the logs for details."));
		}
	}

	private async listDefinitions(api: IAutomationsClient, repository: RepositoryRef, signal: AbortSignal): Promise<readonly AutomationDetail[]> {
		const controller = new AbortController();
		const operationSignal = AbortSignal.any([signal, controller.signal]);
		try {
			const definitions: AutomationDetail[] = [];
			for (let page = 1; page <= 10; page++) {
				operationSignal.throwIfAborted();
				const response = await api.list(repository, operationSignal, { ownership: 'user', page, per_page: 100 });
				const summaries = response.data.automations;
				for (let offset = 0; offset < summaries.length; offset += 5) {
					operationSignal.throwIfAborted();
					definitions.push(...await Promise.all(summaries.slice(offset, offset + 5).map(summary => api.get(repository, summary.id, operationSignal))));
				}
				if (!response.nextLink) {
					return definitions;
				}
			}
			throw new Error(localize('cloudAutomations.catalogueLimit', "This repository has more cloud automations than can be loaded. Its catalogue is incomplete."));
		} finally {
			controller.abort();
		}
	}

	private reset(): void {
		this.lifetime.abort(new CancellationError());
		this.lifetime = new AbortController();
		this.clientPromise = undefined;
		this.clientStore.clear();
		this.refreshPromise = undefined;
		const account = this.defaultAccountService.currentDefaultAccount;
		transaction(tx => {
			this.cachedEntries.set([], tx);
			this.state.set(account && !account.enterprise ? 'ready' : 'unavailable', tx);
		});
	}

	override dispose(): void {
		this.lifetime.abort(new CancellationError());
		super.dispose();
		transaction(tx => {
			this.cachedEntries.set([], tx);
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

	private assertCurrent(account: IDefaultAccount, signal: AbortSignal): void {
		const current = this.defaultAccountService.currentDefaultAccount;
		if (signal.aborted || this._store.isDisposed || current?.accountName !== account.accountName
			|| current.sessionId !== account.sessionId || current.authenticationProvider.id !== account.authenticationProvider.id
			|| current.enterprise !== account.enterprise) {
			throw new CancellationError();
		}
	}

	private resolveRepository(workspace: URI): RepositoryRef | undefined {
		const uri = workspace.scheme === GITHUB_REMOTE_FILE_SCHEME ? workspace : this.resolveRepositoryUri(workspace);
		const match = uri?.scheme === GITHUB_REMOTE_FILE_SCHEME && uri.authority === 'github'
			? /^\/(?<owner>[^/]+)\/(?<name>[^/]+)(?:\/|$)/.exec(uri.path) : undefined;
		return match?.groups ? { owner: match.groups.owner, name: match.groups.name } : undefined;
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
				const repository = { owner: value.owner, name: value.name };
				repositories.set(repositoryKey(repository), repository);
			}
		}
		return repositories;
	}

	private rememberRepositories(account: string, repositories: readonly RepositoryRef[]): void {
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

function repositoryKey(repository: RepositoryRef): string {
	return `${repository.owner}/${repository.name}`.toLowerCase();
}
