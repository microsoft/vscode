/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, RunOnceScheduler, SequencerByKey } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { constObservable, derived, IObservable, observableSignal, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isStringArray } from '../../../../../base/common/types.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AgentSessionProviders } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { AutomationTarget, IAutomationDescriptor, IAutomationRun, IAutomationSchedule, IAutomationSessionTemplate } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationCatalogueState, AutomationMutationGuard, AutomationMutationUncertainError, AutomationUnavailableError, IAutomationProviderConfiguration, IAutomationRunRequestResult, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions, serializeAutomationEditableState } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../services/sessions/common/session.js';
import { ISessionsProviderAutomations } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { GitHubApiError } from '../../../github/browser/githubApiClient.js';
import { CloudAutomationApiClient, ICloudAutomationDefinition, ICloudAutomationMutation, ICloudAutomationRepository, ICloudAutomationTask, ICloudAutomationTrigger } from './cloudAutomationApiClient.js';

export const CLOUD_AUTOMATIONS_ENABLED_SETTING = 'chat.automations.cloud.enabled';
const REPOSITORIES_STORAGE_KEY = 'cloudAutomations.repositories';
const HISTORY_REFRESH_MS = 30_000;
const HISTORY_DISCOVERY_REFRESH_MS = 5_000;
const FULL_HISTORY_REFRESH_MS = HISTORY_REFRESH_MS;
const TARGET_ELIGIBILITY_CACHE_LIMIT = 100;

interface ICloudAutomationEntry {
	readonly repository: ICloudAutomationRepository;
	readonly definition: ICloudAutomationDefinition;
}

export class CloudAutomationStore extends Disposable implements ISessionsProviderAutomations {
	readonly enabled = observableValue(this, false);
	private readonly definitionState = observableValue<AutomationCatalogueState>(this, 'ready');
	private readonly historyFailed = observableValue(this, false);
	readonly catalogueState = derived<AutomationCatalogueState>(this, reader => this.historyFailed.read(reader) ? 'error' : this.definitionState.read(reader));
	readonly unavailableReason = observableValue<string | undefined>(this, undefined);
	readonly automations = observableValue<readonly IAutomationDescriptor[]>(this, []);
	private readonly history = observableValue<readonly IAutomationRun[]>(this, []);
	private readonly accountName = observableValue<string | undefined>(this, undefined);
	private readonly repositoriesLoaded = observableValue(this, false);
	readonly canCreateAutomation = derived(this, reader => this.accountName.read(reader) !== undefined && this.repositoriesLoaded.read(reader));
	readonly runs: IObservable<readonly IAutomationRun[]>;
	readonly configuration: IAutomationProviderConfiguration;

	private readonly entries = new Map<string, ICloudAutomationEntry>();
	private readonly repositories = new Map<string, ICloudAutomationRepository>();
	private readonly mutations = new SequencerByKey<string>();
	private readonly stoppingRuns = new Map<string, Promise<void>>();
	private readonly targetEligibility = new LRUCache<string, IObservable<string | undefined>>(TARGET_ELIGIBILITY_CACHE_LIMIT);
	private readonly targetEligibilityReset = observableSignal(this);
	private readonly targetEligibilityLimiter = this._register(new Limiter<void>(4));
	private readonly historyLimiter = this._register(new Limiter<void>(4));
	private readonly historyRequest = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly historyScheduler: RunOnceScheduler;
	private readonly refreshScheduler: RunOnceScheduler;
	private lifetime = new CancellationTokenSource();
	private refreshPromise: Promise<void> | undefined;
	private historyObservers = 0;
	private historyLoaded = false;
	private lastFullHistoryRefresh: number | undefined;
	private historyRefreshVersion = 0;
	private historyRetryAfter = 0;
	private readonly requestedHistory = new Map<string, number>();
	private historyRefreshPromise: Promise<void> | undefined;
	private generation = 0;

	constructor(
		private readonly providerId: string,
		private readonly sessionTypeId: string,
		private readonly resolveRepositoryUri: (workspace: URI) => URI | undefined,
		private readonly api: CloudAutomationApiClient,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ISessionsRecentWorkspacesService private readonly recentWorkspacesService: ISessionsRecentWorkspacesService,
	) {
		super();
		this.configuration = {
			sessionTypes: [sessionTypeId],
			label: localize('cloudAutomations.provider', "GitHub Cloud"),
			description: localize('cloudAutomations.description', "Runs on GitHub even when VS Code is closed and may consume credits. Requires a private repository."),
			timeZone: 'UTC',
			defaultEnabled: false,
			getTargetDisabledReason: workspace => this.getTargetDisabledReason(workspace),
			tools: [
				{ id: 'read', label: localize('cloudAutomations.read', "Read Files") },
				{ id: 'edit', label: localize('cloudAutomations.edit', "Edit Files") },
				{ id: 'bash', label: localize('cloudAutomations.commands', "Run Commands") },
				{ id: 'github/*', label: localize('cloudAutomations.github', "GitHub Tools") },
			],
		};
		this.historyScheduler = this._register(new RunOnceScheduler(() => {
			void this.refreshHistory().catch(error => {
				if (!isCancellationError(error)) {
					this.logService.error('[CloudAutomations] History refresh failed', error);
				}
			});
		}, HISTORY_REFRESH_MS));
		this.refreshScheduler = this._register(new RunOnceScheduler(() => {
			void this.refresh().catch(error => {
				if (!isCancellationError(error)) {
					this.logService.error('[CloudAutomations] Catalogue refresh failed', error);
				}
			});
		}, 0));
		this.runs = derived(this, reader => {
			this.historyObservers++;
			if (!this.historyScheduler.isScheduled() && this.historyRefreshPromise === undefined) {
				this.scheduleHistory(0);
			}
			// Retain observation across recomputation so publishing history does not cancel its own request.
			reader.delayedStore.add(toDisposable(() => {
				if (--this.historyObservers === 0) {
					this.historyScheduler.cancel();
					this.historyRequest.value?.cancel();
					this.historyRequest.clear();
				}
			}));
			return this.history.read(reader);
		});
		this._register(defaultAccountService.onDidChangeDefaultAccount(() => this.reset()));
		this._register(recentWorkspacesService.onDidChangeRecentWorkspaces(() => this.refreshScheduler.schedule()));
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(CLOUD_AUTOMATIONS_ENABLED_SETTING) || event.affectsConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING) || event.affectsConfiguration('chat.disableAIFeatures')) {
				this.reset();
			}
		}));
		this._register(toDisposable(() => this.lifetime.dispose(true)));
		this.reset();
	}

	override dispose(): void {
		this.historyRequest.value?.cancel();
		this.lifetime.cancel();
		this.targetEligibility.clear();
		super.dispose();
		this.targetEligibilityReset.trigger(undefined);
	}

	private getTargetDisabledReason(workspace: URI | undefined): IObservable<string | undefined> {
		const requiredRepository = localize('cloudAutomations.privateRepositoryTarget', "Requires a private repository");
		if (workspace === undefined) {
			return constObservable(requiredRepository);
		}
		let repository: ICloudAutomationRepository | undefined;
		try {
			repository = this.tryResolveRepository(workspace);
		} catch (error) {
			this.logService.warn('[CloudAutomations] Repository resolution failed', error);
			return constObservable(localize('cloudAutomations.repositoryCheckFailed', "Unable to verify repository visibility."));
		}
		if (repository === undefined) {
			return constObservable(requiredRepository);
		}
		const account = this.accountName.get();
		if (account === undefined || this._store.isDisposed || this.lifetime.token.isCancellationRequested) {
			return constObservable(this.unavailableReason.get() ?? localize('cloudAutomations.targetUnavailable', "Cloud automations are unavailable."));
		}
		const key = repositoryKey(repository);
		const cached = this.targetEligibility.get(key);
		if (cached !== undefined) {
			return cached;
		}
		const generation = this.generation;
		const token = this.lifetime.token;
		const reason = observableValue<string | undefined>(this, localize('cloudAutomations.checkingRepository', "Checking repository visibility..."));
		const eligibility = derived(this, reader => {
			this.targetEligibilityReset.read(reader);
			if (generation !== this.generation || this._store.isDisposed) {
				return this.unavailableReason.read(reader) ?? localize('cloudAutomations.targetRecheck', "Repository access must be verified again.");
			}
			return reason.read(reader);
		});
		this.targetEligibility.set(key, eligibility);
		void this.targetEligibilityLimiter.queue(async () => {
			if (token.isCancellationRequested) {
				return;
			}
			let disabledReason: string | undefined;
			try {
				disabledReason = await this.api.isPrivateRepository(account, repository, token) ? undefined : requiredRepository;
			} catch (error) {
				if (!isCancellationError(error)) {
					this.logService.warn('[CloudAutomations] Repository visibility check failed', error);
				}
				disabledReason = localize('cloudAutomations.repositoryCheckFailed', "Unable to verify repository visibility.");
			}
			if (generation === this.generation && !this._store.isDisposed && !token.isCancellationRequested) {
				reason.set(disabledReason, undefined);
			}
		});
		return eligibility;
	}

	getAutomation(id: string): IAutomationDescriptor | undefined {
		return this.automations.get().find(automation => automation.id === id);
	}

	runsFor(id: string): IObservable<readonly IAutomationRun[]> {
		return this.runs.map(runs => runs.filter(run => run.automationId === id));
	}

	getActiveRunFor(id: string): IAutomationRun | undefined {
		return this.history.get().find(run => run.automationId === id && (run.status === 'pending' || run.status === 'running'));
	}

	canRunAutomation(id: string): boolean {
		const automation = this.getAutomation(id);
		return this.isAvailable() && automation !== undefined && automation.enabled && automation.readOnlyReason === undefined;
	}

	canUpdateAutomation(id: string): boolean {
		const automation = this.getAutomation(id);
		return this.isAvailable() && automation !== undefined && automation.readOnlyReason === undefined;
	}

	canDeleteAutomation(id: string): boolean {
		return this.isAvailable() && this.entries.has(id);
	}

	canStopRun(run: IAutomationRun): boolean {
		return this.isAvailable() && this.entries.has(run.automationId)
			&& this.history.get().some(current => current.id === run.id && current.automationId === run.automationId
				&& (current.status === 'pending' || current.status === 'running'));
	}

	async stopRun(run: IAutomationRun): Promise<void> {
		const pending = this.stoppingRuns.get(run.id);
		if (pending) {
			return pending;
		}
		if (!this.canStopRun(run)) {
			throw new AutomationUnavailableError(localize('cloudAutomations.stopUnavailable', "This cloud automation run is no longer active. Refresh its history."));
		}
		const account = this.requireAccount();
		const token = this.lifetime.token;
		const current = this.history.get().find(current => current.id === run.id)!;
		const taskId = current.sessionResource!.path.slice('/task/'.length);
		const stop = this.api.stopTask(account, taskId, token);
		this.stoppingRuns.set(run.id, stop);
		try {
			await stop;
		} finally {
			if (this.stoppingRuns.get(run.id) === stop) {
				this.stoppingRuns.delete(run.id);
			}
			if (!this._store.isDisposed && !token.isCancellationRequested && this.accountName.get() === account) {
				this.requestedHistory.set(run.automationId, Date.now() + 2 * 60_000);
				this.scheduleHistory(0);
			}
		}
	}

	async registerRepository(workspace: URI): Promise<void> {
		const account = this.requireAccount();
		const repository = this.repositoryFor(workspace);
		await this.api.requirePrivateRepository(account, repository, this.lifetime.token);
		this.assertAccount(account);
		const key = repositoryKey(repository);
		if (this.repositories.has(key)) {
			return;
		}
		this.repositories.set(key, repository);
		this.storageService.store(this.storageKey(account), JSON.stringify([...this.repositories.values()]), StorageScope.PROFILE, StorageTarget.MACHINE);
		await this.refresh();
	}

	async createAutomation(options: ICreateAutomationOptions, guard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
		const account = this.requireAccount();
		const repository = this.validateTarget(options.target);
		const value = this.createValue(options);
		if (options.target.kind !== 'workspace') {
			throw new Error(localize('cloudAutomations.repositoryRequired', "Select a GitHub repository for this cloud automation."));
		}
		await this.registerRepository(options.target.folderUri);
		this.assertAccount(account);
		guard?.();
		const definition = await this.api.create(account, repository, value, this.lifetime.token);
		return this.publish(repository, definition, account);
	}

	updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor> {
		return this.mutations.queue(id, async () => {
			const account = this.requireAccount();
			const entry = this.requireEntry(id);
			const current = await this.api.get(account, entry.repository, entry.definition.id, this.lifetime.token);
			this.assertAccount(account);
			return this.applyUpdate(account, entry.repository, current, patch);
		});
	}

	updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, guard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		return this.mutations.queue(id, async () => {
			const account = this.requireAccount();
			const entry = this.requireEntry(id);
			const definition = await this.api.get(account, entry.repository, entry.definition.id, this.lifetime.token);
			this.assertAccount(account);
			const current = this.publish(entry.repository, definition);
			if (serializeAutomationEditableState(current) !== serializeAutomationEditableState(expected)) {
				return { kind: 'conflict', current };
			}
			guard?.();
			return { kind: 'updated', automation: await this.applyUpdate(account, entry.repository, definition, patch) };
		});
	}

	async deleteAutomation(id: string, guard?: AutomationMutationGuard): Promise<void> {
		await this.mutations.queue(id, async () => {
			const account = this.requireAccount();
			const entry = this.requireEntry(id);
			guard?.();
			await this.api.delete(account, entry.repository, entry.definition.id, this.lifetime.token);
			if (this.accountName.get() !== account || this._store.isDisposed) {
				return;
			}
			this.entries.delete(id);
			this.requestedHistory.delete(id);
			transaction(tx => {
				this.automations.set(this.automations.get().filter(automation => automation.id !== id), tx);
				this.history.set(this.history.get().filter(run => run.automationId !== id), tx);
			});
		});
	}

	async runAutomation(id: string, token: CancellationToken = CancellationToken.None): Promise<IAutomationRunRequestResult> {
		const account = this.requireAccount();
		const entry = this.requireEntry(id);
		const activeRun = this.getActiveRunFor(id);
		if (activeRun !== undefined) {
			return { kind: 'alreadyRunning', run: activeRun };
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const current = await this.api.get(account, entry.repository, entry.definition.id, token);
		this.assertAccount(account);
		this.publish(entry.repository, current);
		if (!this.canRunAutomation(id)) {
			throw new AutomationUnavailableError(localize('cloudAutomations.runUnavailable', "Enable the cloud automation and refresh it before running."));
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		try {
			await this.api.run(account, entry.repository, current.id, Object.keys(current.triggers ?? {}).length === 0 ? 'manual' : 'interval', token);
		} catch (error) {
			if (error instanceof AutomationMutationUncertainError && this.accountName.get() === account && !this._store.isDisposed) {
				this.requestedHistory.set(id, Date.now() + 2 * 60_000);
				this.scheduleHistory(HISTORY_DISCOVERY_REFRESH_MS);
			}
			throw error;
		}
		if (this.accountName.get() === account && !this._store.isDisposed) {
			this.requestedHistory.set(id, Date.now() + 2 * 60_000);
			this.scheduleHistory(HISTORY_DISCOVERY_REFRESH_MS);
		}
		return { kind: 'accepted' };
	}

	private reset(): void {
		this.generation++;
		this.lifetime.dispose(true);
		this.lifetime = new CancellationTokenSource();
		this.refreshPromise = undefined;
		this.refreshScheduler.cancel();
		this.historyScheduler.cancel();
		this.historyRequest.value?.cancel();
		this.historyRequest.clear();
		this.historyRefreshPromise = undefined;
		this.entries.clear();
		this.stoppingRuns.clear();
		this.repositories.clear();
		this.targetEligibility.clear();
		this.historyLoaded = false;
		this.lastFullHistoryRefresh = undefined;
		this.historyRetryAfter = 0;
		this.requestedHistory.clear();
		const enabled = this.configurationService.getValue<boolean>(CLOUD_AUTOMATIONS_ENABLED_SETTING) === true
			&& this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true
			&& this.configurationService.getValue<boolean>('chat.disableAIFeatures') !== true;
		const account = this.defaultAccountService.currentDefaultAccount;
		const name = enabled && account !== null && !account.enterprise ? account.accountName : undefined;
		transaction(tx => {
			this.enabled.set(enabled, tx);
			this.accountName.set(name, tx);
			this.repositoriesLoaded.set(false, tx);
			this.automations.set([], tx);
			this.history.set([], tx);
			this.definitionState.set(!enabled ? 'ready' : name === undefined ? 'unavailable' : 'loading', tx);
			this.historyFailed.set(false, tx);
			this.unavailableReason.set(enabled && name === undefined ? localize('cloudAutomations.signIn', "Sign in to GitHub.com with repository access to manage cloud automations.") : undefined, tx);
			this.targetEligibilityReset.trigger(tx);
		});
		if (name === undefined) {
			return;
		}
		const stored = this.storageService.get(this.storageKey(name), StorageScope.PROFILE);
		if (stored !== undefined) {
			try {
				const repositories: ICloudAutomationRepository[] = JSON.parse(stored);
				if (!Array.isArray(repositories)) {
					throw new Error('Invalid stored cloud automation repositories.');
				}
				for (const repository of repositories) {
					if (typeof repository.owner !== 'string' || typeof repository.name !== 'string') {
						throw new Error('Invalid stored cloud automation repository.');
					}
					this.repositories.set(repositoryKey(repository), repository);
				}
			} catch (error) {
				this.reportRefreshError(error);
				return;
			}
		}
		this.repositoriesLoaded.set(true, undefined);
		this.refreshScheduler.schedule();
	}

	async refresh(): Promise<void> {
		this.refreshScheduler.cancel();
		if (this.accountName.get() === undefined) {
			return;
		}
		if (!this.repositoriesLoaded.get()) {
			throw new AutomationUnavailableError(this.unavailableReason.get());
		}
		if (this.refreshPromise !== undefined) {
			await this.refreshPromise;
			return;
		}
		const account = this.requireAccount();
		const generation = this.generation;
		const token = this.lifetime.token;
		const assertCurrent = () => {
			this.assertAccount(account);
			if (token.isCancellationRequested || generation !== this.generation) {
				throw new CancellationError();
			}
		};
		if (this.definitionState.get() !== 'loading') {
			this.targetEligibility.clear();
		}
		this.lastFullHistoryRefresh = undefined;
		this.historyRefreshVersion++;
		transaction(tx => {
			this.definitionState.set('loading', tx);
			this.unavailableReason.set(undefined, tx);
		});
		const refresh = (async () => {
			const errors: unknown[] = [];
			for (const recent of this.recentWorkspacesService.getRecentWorkspaces(false)) {
				const uri = recent.workspace.folders[0]?.root;
				try {
					assertCurrent();
					const repository = uri === undefined ? undefined : this.tryResolveRepository(uri);
					if (repository && !this.repositories.has(repositoryKey(repository)) && await this.api.isPrivateRepository(account, repository, token)) {
						assertCurrent();
						this.repositories.set(repositoryKey(repository), repository);
					}
				} catch (error) {
					assertCurrent();
					if (isCancellationError(error)) {
						throw error;
					}
					this.logService.warn('[CloudAutomations] Failed to discover a recent repository', error);
					errors.push(error);
				}
			}
			assertCurrent();
			this.storageService.store(this.storageKey(account), JSON.stringify([...this.repositories.values()]), StorageScope.PROFILE, StorageTarget.MACHINE);
			const originalEntries = new Map(this.entries);
			const snapshot = new Map(originalEntries);
			for (const repository of this.repositories.values()) {
				try {
					assertCurrent();
					const definitions = await this.api.list(account, repository, token);
					assertCurrent();
					for (const [id, entry] of snapshot) {
						if (repositoryKey(entry.repository) === repositoryKey(repository)) {
							snapshot.delete(id);
						}
					}
					for (const definition of definitions) {
						snapshot.set(this.definitionId(account, definition.id), { repository, definition });
					}
				} catch (error) {
					assertCurrent();
					if (isCancellationError(error)) {
						throw error;
					}
					this.logService.warn(`[CloudAutomations] Failed to refresh ${repositoryKey(repository)}`, error);
					errors.push(error);
				}
			}
			assertCurrent();
			// Preserve mutations that completed while the catalogue request was in flight.
			for (const [id, entry] of this.entries) {
				if (originalEntries.get(id) !== entry) {
					snapshot.set(id, entry);
				}
			}
			for (const id of originalEntries.keys()) {
				if (!this.entries.has(id)) {
					snapshot.delete(id);
				}
			}
			this.entries.clear();
			for (const [id, entry] of snapshot) {
				this.entries.set(id, entry);
			}
			transaction(tx => {
				this.automations.set([...snapshot].map(([id, entry]) => this.toAutomation(id, entry)), tx);
				this.definitionState.set(errors.length > 0 ? 'error' : 'ready', tx);
				this.unavailableReason.set(undefined, tx);
			});
			if (this.historyObservers > 0) {
				this.scheduleHistory(0);
			}
			if (errors.length > 0) {
				throw new AggregateError(errors, localize('cloudAutomations.partialRefreshFailed', "Some GitHub repositories could not be refreshed. Check the logs for details."));
			}
		})();
		this.refreshPromise = refresh;
		try {
			await refresh;
		} catch (error) {
			if (generation === this.generation && !this._store.isDisposed) {
				this.reportRefreshError(error);
			}
			throw error;
		} finally {
			if (this.refreshPromise === refresh) {
				this.refreshPromise = undefined;
			}
		}
	}

	private async refreshHistory(): Promise<void> {
		if (this._store.isDisposed || this.historyObservers === 0 || this.accountName.get() === undefined || this.definitionState.get() === 'loading') {
			return;
		}
		if (this.historyRefreshPromise !== undefined) {
			return this.historyRefreshPromise;
		}
		const pending = this.readHistory();
		this.historyRefreshPromise = pending;
		try {
			await pending;
		} finally {
			if (this.historyRefreshPromise === pending) {
				this.historyRefreshPromise = undefined;
			}
		}
	}

	private async readHistory(): Promise<void> {
		const account = this.accountName.get();
		if (account === undefined) {
			return;
		}
		const generation = this.generation;
		const refreshVersion = this.historyRefreshVersion;
		const cancellation = new CancellationTokenSource(this.lifetime.token);
		this.historyRequest.value = cancellation;
		const token = cancellation.token;
		const retained = [...this.history.get()];
		const now = Date.now();
		const fullRefresh = !this.historyLoaded || this.lastFullHistoryRefresh === undefined || now - this.lastFullHistoryRefresh >= FULL_HISTORY_REFRESH_MS;
		const activeDefinitions = new Set(retained.filter(run => run.status === 'pending' || run.status === 'running').map(run => run.automationId));
		for (const [id, until] of this.requestedHistory) {
			if (until <= now || !this.entries.has(id)) {
				this.requestedHistory.delete(id);
			}
		}
		const entries = [...this.entries].filter(([id]) => fullRefresh || activeDefinitions.has(id) || this.requestedHistory.has(id));
		const refreshedIds = new Set(entries.map(([id]) => id));
		const collected = retained.filter(run => !refreshedIds.has(run.automationId));
		const errors: unknown[] = [];
		try {
			await Promise.all(entries.map(([id, entry]) => this.historyLimiter.queue(async () => {
				if (token.isCancellationRequested) {
					return;
				}
				try {
					const tasks = [...await this.api.listRuns(account, entry.definition.id, token)];
					if (token.isCancellationRequested) {
						return;
					}
					const listed = new Set(tasks.map(task => task.id));
					const olderActive = retained.filter(run => run.automationId === id && (run.status === 'pending' || run.status === 'running'));
					for (const run of olderActive) {
						const taskId = run.sessionResource?.path.slice('/task/'.length);
						if (taskId !== undefined && !listed.has(taskId)) {
							try {
								tasks.push(await this.api.getTask(account, taskId, entry.definition.id, token));
							} catch (error) {
								if (!(error instanceof GitHubApiError) || error.statusCode !== 404) {
									throw error;
								}
								this.logService.trace(`[CloudAutomations] Previously active task ${taskId} is no longer available.`);
							}
						}
					}
					collected.push(...tasks.map(task => cloudAutomationRun(id, account, task, entry.repository)));
				} catch (error) {
					if (token.isCancellationRequested) {
						throw new CancellationError();
					}
					this.logService.warn('[CloudAutomations] Failed to refresh run history', error);
					errors.push(error);
					collected.push(...retained.filter(run => run.automationId === id));
					if (error instanceof GitHubApiError && error.retryAfterSeconds !== undefined) {
						this.historyRetryAfter = Math.max(this.historyRetryAfter, Date.now() + error.retryAfterSeconds * 1000);
					}
				}
			})));
			if (generation === this.generation && !this._store.isDisposed && !token.isCancellationRequested) {
				this.historyLoaded = true;
				// A catalogue refreshed during this request still needs its own full history snapshot.
				if (fullRefresh && errors.length === 0 && refreshVersion === this.historyRefreshVersion) {
					this.lastFullHistoryRefresh = now;
				}
				transaction(tx => {
					this.historyFailed.set(errors.length > 0, tx);
					this.history.set(collected.filter(run => this.entries.has(run.automationId)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), tx);
				});
			}
			if (errors.length > 0) {
				throw new AggregateError(errors, localize('cloudAutomations.partialHistoryFailed', "Some cloud automation runs could not be refreshed."));
			}
		} catch (error) {
			if (generation === this.generation && !this._store.isDisposed && !token.isCancellationRequested) {
				this.historyFailed.set(true, undefined);
				if (error instanceof GitHubApiError && error.retryAfterSeconds !== undefined) {
					this.historyRetryAfter = Date.now() + error.retryAfterSeconds * 1000;
				}
			}
			throw error;
		} finally {
			if (this.historyRequest.value === cancellation) {
				this.historyRequest.clear();
			}
			if (generation === this.generation && !this._store.isDisposed && this.historyObservers > 0) {
				this.scheduleHistory(token.isCancellationRequested || refreshVersion !== this.historyRefreshVersion ? 0 : undefined);
			}
		}
	}

	private scheduleHistory(delay?: number): void {
		if (this._store.isDisposed || this.historyObservers === 0 || this.accountName.get() === undefined) {
			return;
		}
		const now = Date.now();
		const discovering = [...this.requestedHistory.values()].some(until => until > now);
		this.historyScheduler.schedule(Math.max(delay ?? (discovering ? HISTORY_DISCOVERY_REFRESH_MS : HISTORY_REFRESH_MS), this.historyRetryAfter - now));
	}

	private createValue(options: ICreateAutomationOptions): ICloudAutomationMutation {
		if (!options.name.trim() || !options.prompt.trim()) {
			throw new Error(localize('cloudAutomations.requiredFields', "An automation name and prompt are required."));
		}
		if (options.mode !== undefined || options.permissionLevel !== undefined) {
			throw new Error(localize('cloudAutomations.localConfiguration', "Cloud automations do not support local mode or approval settings."));
		}
		this.validateTemplate(options.sessionTemplate);
		return {
			name: options.name, prompt: options.prompt, triggers: cloudAutomationTriggers(options.schedule),
			disabled: !(options.enabled ?? false),
			tools: this.templateTools(options.sessionTemplate) ?? this.configuration.tools.map(tool => tool.id),
			model: options.sessionTemplate?.modelId ?? options.modelId,
			reasoning_effort: this.templateReasoning(options.sessionTemplate),
		};
	}

	private async applyUpdate(account: string, repository: ICloudAutomationRepository, definition: ICloudAutomationDefinition, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor> {
		if (patch.mode !== undefined || patch.permissionLevel !== undefined) {
			throw new Error(localize('cloudAutomations.localConfiguration', "Cloud automations do not support local mode or approval settings."));
		}
		if (patch.target !== undefined && repositoryKey(this.validateTarget(patch.target)) !== repositoryKey(repository)) {
			throw new Error(localize('cloudAutomations.repositoryImmutable', "Duplicate this automation to use another repository. The original remains unchanged."));
		}
		const schedule = cloudAutomationSchedule(definition.triggers);
		if (schedule.interval === 'custom') {
			throw new Error(localize('cloudAutomations.unsupportedEdit', "This automation uses triggers that cannot be edited in VS Code."));
		}
		const template = patch.sessionTemplate === null ? undefined : patch.sessionTemplate;
		this.validateTemplate(template);
		const triggers = patch.schedule === undefined ? undefined : updatedCloudTriggers(definition.triggers, patch.schedule);
		const scheduleChanged = triggers !== undefined && !structuralEquals(schedule, cloudAutomationSchedule(triggers));
		const value: ICloudAutomationMutation = {
			...(patch.name !== undefined ? { name: patch.name } : {}),
			...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
			...(patch.enabled !== undefined ? { disabled: !patch.enabled } : {}),
			...(scheduleChanged ? { triggers } : {}),
			...(patch.modelId !== undefined ? { model: patch.modelId ?? '' } : {}),
			...(patch.sessionTemplate !== undefined ? {
				model: template?.modelId ?? '',
				...(this.templateReasoning(template) !== undefined ? { reasoning_effort: this.templateReasoning(template) } : {}),
				...(this.templateTools(template) !== undefined ? { tools: this.templateTools(template) } : {}),
			} : {}),
		};
		const updated = await this.api.update(account, repository, definition.id, value, this.lifetime.token);
		return this.publish(repository, updated, account);
	}

	private publish(repository: ICloudAutomationRepository, definition: ICloudAutomationDefinition, account = this.requireAccount()): IAutomationDescriptor {
		const id = this.definitionId(account, definition.id);
		const entry = { repository, definition };
		const automation = this.toAutomation(id, entry);
		if (this._store.isDisposed || this.accountName.get() !== account) {
			return automation;
		}
		this.entries.set(id, entry);
		this.requestedHistory.set(id, Date.now() + 60_000);
		this.automations.set([automation, ...this.automations.get().filter(value => value.id !== id)], undefined);
		if (this.historyObservers > 0) {
			this.scheduleHistory(0);
		}
		return automation;
	}

	private toAutomation(id: string, entry: ICloudAutomationEntry): IAutomationDescriptor {
		const { definition, repository } = entry;
		const schedule = cloudAutomationSchedule(definition.triggers);
		return {
			id, name: definition.name, prompt: definition.prompt, schedule,
			target: {
				kind: 'workspace', providerId: this.providerId, sessionTypeId: this.sessionTypeId,
				folderUri: URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${repository.owner}/${repository.name}/HEAD` }),
				isolation: { kind: 'default' },
			},
			sessionTemplate: {
				...(definition.model ? { modelId: definition.model } : {}),
				config: {
					...(definition.tools !== undefined && definition.tools !== null ? { tools: definition.tools } : {}),
					...(definition.reasoning_effort ? { reasoningEffort: definition.reasoning_effort } : {}),
				},
			},
			enabled: definition.disabled !== true,
			createdAt: definition.created_at, updatedAt: definition.updated_at,
			...(schedule.interval === 'custom' ? { readOnlyReason: localize('cloudAutomations.customSchedule', "This automation uses triggers that cannot be edited in VS Code.") } : {}),
		};
	}

	private validateTarget(target: AutomationTarget): ICloudAutomationRepository {
		if (target.providerId !== this.providerId || target.sessionTypeId !== this.sessionTypeId || target.kind !== 'workspace' || target.isolation.kind !== 'default') {
			throw new AutomationUnavailableError(localize('cloudAutomations.invalidTarget', "Cloud automations require a GitHub Cloud repository target without local workspace isolation."));
		}
		return this.repositoryFor(target.folderUri);
	}

	private repositoryFor(workspace: URI): ICloudAutomationRepository {
		const repository = this.tryResolveRepository(workspace);
		if (repository === undefined) {
			throw new Error(localize('cloudAutomations.repositoryRequired', "Select a GitHub repository for this cloud automation."));
		}
		return repository;
	}

	private tryResolveRepository(workspace: URI): ICloudAutomationRepository | undefined {
		const uri = workspace.scheme === GITHUB_REMOTE_FILE_SCHEME ? workspace : this.resolveRepositoryUri(workspace);
		const match = uri?.scheme === GITHUB_REMOTE_FILE_SCHEME && uri.authority === 'github' ? /^\/(?<owner>[^/]+)\/(?<name>[^/]+)(?:\/|$)/.exec(uri.path) : undefined;
		return match?.groups ? { owner: match.groups.owner, name: match.groups.name } : undefined;
	}

	private validateTemplate(template: IAutomationSessionTemplate | undefined): void {
		if (template?.agent !== undefined || template?.modelConfiguration !== undefined
			|| Object.keys(template?.config ?? {}).some(key => key !== 'tools' && key !== 'reasoningEffort')) {
			throw new Error(localize('cloudAutomations.unsupportedConfiguration', "This session configuration is not supported by cloud automations."));
		}
		if (template?.config?.tools !== undefined && !isStringArray(template.config.tools)) {
			throw new Error(localize('cloudAutomations.invalidTools', "Cloud automation tools must be a list of tool identifiers."));
		}
		if (template?.config?.reasoningEffort !== undefined && typeof template.config.reasoningEffort !== 'string') {
			throw new Error(localize('cloudAutomations.invalidReasoning', "The cloud reasoning effort must be a string."));
		}
	}

	private templateTools(template: IAutomationSessionTemplate | undefined): readonly string[] | undefined {
		const tools = template?.config?.tools;
		return isStringArray(tools) ? tools : undefined;
	}

	private templateReasoning(template: IAutomationSessionTemplate | undefined): string | undefined {
		const reasoning = template?.config?.reasoningEffort;
		return typeof reasoning === 'string' ? reasoning : undefined;
	}

	private storageKey(account: string): string {
		return `${REPOSITORIES_STORAGE_KEY}.${encodeURIComponent(account)}`;
	}

	private definitionId(account: string, id: string): string {
		return JSON.stringify([this.providerId, account, id]);
	}

	private requireEntry(id: string): ICloudAutomationEntry {
		const entry = this.entries.get(id);
		if (entry === undefined) {
			throw new AutomationUnavailableError(localize('cloudAutomations.missing', "This cloud automation is no longer available. Refresh the catalogue."));
		}
		return entry;
	}

	private requireAccount(): string {
		const account = this.accountName.get();
		if (account === undefined) {
			throw new AutomationUnavailableError(localize('cloudAutomations.unavailable', "Sign in and enable cloud automations before continuing."));
		}
		this.assertAccount(account);
		return account;
	}

	private assertAccount(account: string): void {
		if (this._store.isDisposed || this.accountName.get() !== account || this.defaultAccountService.currentDefaultAccount?.accountName !== account || this.lifetime.token.isCancellationRequested) {
			throw new CancellationError();
		}
	}

	private isAvailable(): boolean {
		return !this._store.isDisposed && this.canCreateAutomation.get() && !this.lifetime.token.isCancellationRequested;
	}

	private reportRefreshError(error: unknown): void {
		if (isCancellationError(error)) {
			return;
		}
		this.logService.error('[CloudAutomations] Refresh failed', error);
		this.definitionState.set('error', undefined);
		this.unavailableReason.set(error instanceof Error ? error.message : localize('cloudAutomations.refreshFailed', "Cloud automations could not be refreshed."), undefined);
	}
}

function repositoryKey(repository: ICloudAutomationRepository): string {
	return `${repository.owner}/${repository.name}`.toLowerCase();
}

export function cloudAutomationSchedule(triggers: ICloudAutomationDefinition['triggers']): IAutomationSchedule {
	const base = { scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0, timeZone: 'UTC' as const };
	if (Object.keys(triggers ?? {}).length === 0) {
		return { ...base, interval: 'manual' };
	}
	const trigger = triggers?.interval;
	if (Object.keys(triggers ?? {}).length !== 1 || trigger === undefined || !Array.isArray(trigger.types) || trigger.types.length !== 1) {
		return { ...base, interval: 'custom' };
	}
	const interval = trigger.types[0];
	if (interval === 'hourly') {
		return { ...base, interval };
	}
	const hour = trigger.hour_utc;
	const minute = trigger.minute_utc ?? 0;
	const day = trigger.day_of_week ?? 0;
	if ((interval === 'daily' || interval === 'weekly') && typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour < 24
		&& typeof minute === 'number' && [0, 15, 30, 45].includes(minute)
		&& typeof day === 'number' && Number.isInteger(day) && day >= 0 && day < 7) {
		return { ...base, interval, scheduleHour: hour, scheduleMinute: minute, scheduleDay: day };
	}
	return { ...base, interval: 'custom' };
}

export function cloudAutomationTriggers(schedule: IAutomationSchedule): Readonly<Record<string, ICloudAutomationTrigger>> {
	if (schedule.interval === 'manual') {
		return {};
	}
	if (schedule.interval === 'hourly') {
		return { interval: { types: ['hourly'] } };
	}
	if (schedule.timeZone !== 'UTC') {
		throw new Error(localize('cloudAutomations.utcRequired', "Cloud schedules use UTC. Set the schedule time zone to UTC explicitly."));
	}
	if (schedule.interval === 'custom' || !Number.isInteger(schedule.scheduleHour) || schedule.scheduleHour < 0 || schedule.scheduleHour > 23
		|| ![0, 15, 30, 45].includes(schedule.scheduleMinute) || !Number.isInteger(schedule.scheduleDay) || schedule.scheduleDay < 0 || schedule.scheduleDay > 6) {
		throw new Error(localize('cloudAutomations.invalidSchedule', "Choose a daily or weekly UTC schedule with minutes 00, 15, 30, or 45."));
	}
	return {
		interval: {
			types: [schedule.interval], hour_utc: schedule.scheduleHour, minute_utc: schedule.scheduleMinute,
			...(schedule.interval === 'weekly' ? { day_of_week: schedule.scheduleDay } : {}),
		},
	};
}

function updatedCloudTriggers(triggers: ICloudAutomationDefinition['triggers'], schedule: IAutomationSchedule): Readonly<Record<string, ICloudAutomationTrigger>> {
	const updated = cloudAutomationTriggers(schedule);
	if (updated.interval === undefined || triggers?.interval === undefined) {
		return updated;
	}
	const { types: _types, hour_utc: _hour, minute_utc: _minute, day_of_week: _day, ...otherFields } = triggers.interval;
	return { interval: { ...otherFields, ...updated.interval } };
}

export function cloudAutomationRun(automationId: string, account: string, task: ICloudAutomationTask, repository: ICloudAutomationRepository): IAutomationRun {
	if (!['queued', 'in_progress', 'running', 'idle', 'waiting_for_user', 'completed', 'failed', 'timed_out', 'cancelled', 'canceled', 'error'].includes(task.state)) {
		throw new Error(localize('cloudAutomations.unknownRunState', "GitHub returned an unsupported cloud run state: {0}.", task.state));
	}
	const status = task.state === 'queued' ? 'pending'
		: task.state === 'in_progress' || task.state === 'running' || task.state === 'idle' || task.state === 'waiting_for_user' ? 'running'
			: task.state === 'completed' ? 'completed' : 'failed';
	return {
		id: JSON.stringify([automationId, account, task.id]), automationId, status, trigger: 'external',
		startedAt: task.created_at,
		...(status === 'completed' || status === 'failed' ? { completedAt: task.updated_at } : {}),
		...(status === 'failed' ? { errorMessage: task.status !== undefined && task.status !== null && task.status.length > 0 ? task.status : task.state } : {}),
		...(task.state === 'waiting_for_user' ? { needsInput: true, statusDescription: localize('cloudAutomations.needsInput', "Needs input on GitHub") } : {}),
		sessionResource: URI.from({ scheme: AgentSessionProviders.Cloud, path: `/task/${task.id}` }),
		externalResource: URI.from({
			scheme: Schemas.https,
			authority: 'github.com',
			path: `/${repository.owner}/${repository.name}/tasks/${task.id}`,
			query: new URLSearchParams({ author: task.creator?.login ?? account }).toString(),
		}),
	};
}
