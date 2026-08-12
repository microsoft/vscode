/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAutomationDescriptor, IAutomationRun, AutomationRunTrigger } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationMutationGuard, IAutomationRunClaim, IAutomationService, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions, IUpdateAutomationRunOptions } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IAutomation, ISessionsProviderAutomations } from '../../../services/sessions/common/sessionsProvider.js';
import { AutomationService } from './automationService.js';

interface IAutomationStoreEntry {
	readonly providerId: string | undefined;
	readonly store: ISessionsProviderAutomations;
}

const MAX_AUTOMATION_TRANSFER_ATTEMPTS = 3;

export class ProviderAutomationService extends Disposable implements IAutomationService {

	declare readonly _serviceBrand: undefined;

	private readonly legacyStore: AutomationService;
	private readonly providersChanged;
	private readonly migrationSequencer = new Sequencer();
	private migrationPromise: Promise<void> = Promise.resolve();
	private readonly runsForCache = new Map<string, IObservable<readonly IAutomationRun[]>>();
	private staleRunRecoveryGeneration = 0;
	private staleRunRecoveryReason: string | undefined;
	private readonly recoveredStores = new Set<ISessionsProviderAutomations>();

	readonly automations: IObservable<readonly IAutomationDescriptor[]>;
	readonly runs: IObservable<readonly IAutomationRun[]>;

	constructor(
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.legacyStore = this._register(instantiationService.createInstance(AutomationService));
		this.providersChanged = observableSignalFromEvent(this, sessionsProvidersService.onDidChangeProviders);
		this.automations = derived(this, reader => {
			this.providersChanged.read(reader);
			return distinctById(
				this.getStores().flatMap(entry => [...entry.store.automations.read(reader)])
			).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		});
		this.runs = derived(this, reader => {
			this.providersChanged.read(reader);
			return distinctById(
				this.getStores().flatMap(entry => [...entry.store.runs.read(reader)])
			).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
		});
		this._register(sessionsProvidersService.onDidChangeProviders(event => {
			for (const provider of event.removed) {
				if (provider.automations) {
					this.recoveredStores.delete(provider.automations);
				}
			}
			if (event.added.some(provider => provider.automations)) {
				this.queueMigration();
			}
		}));
		this.queueMigration();
	}

	getAutomation(id: string): IAutomationDescriptor | undefined {
		return this.findAutomationStore(id)?.store.getAutomation(id);
	}

	runsFor(automationId: string): IObservable<readonly IAutomationRun[]> {
		let result = this.runsForCache.get(automationId);
		if (!result) {
			result = derived(this, reader => this.runs.read(reader).filter(run => run.automationId === automationId));
			this.runsForCache.set(automationId, result);
		}
		return result;
	}

	createAutomation(options: ICreateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
		return this.getCreationStore(options).createAutomation(options, mutationGuard);
	}

	async updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor> {
		const source = this.requireAutomationStore(id);
		const updated = await source.updateAutomation(id, patch);
		await this.retargetAutomationStorageIfNeeded(source, updated);
		return updated;
	}

	async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		const source = this.requireAutomationStore(id);
		const result = await source.updateAutomationIfUnchanged(id, patch, expected, mutationGuard);
		if (result.kind === 'updated') {
			await this.retargetAutomationStorageIfNeeded(source, result.automation);
		}
		return result;
	}

	async deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard): Promise<void> {
		await this.requireAutomationStore(id).deleteAutomation(id, mutationGuard);
		this.runsForCache.delete(id);
	}

	recordRunStart(automationId: string, trigger: AutomationRunTrigger, leaderWindowId: number): Promise<IAutomationRunClaim> {
		return this.requireAutomationStore(automationId).recordRunStart(automationId, trigger, leaderWindowId);
	}

	updateRun(runId: string, patch: IUpdateAutomationRunOptions): Promise<IAutomationRun | undefined> {
		const store = this.findRunStore(runId);
		return store ? store.updateRun(runId, patch) : Promise.resolve(undefined);
	}

	deleteRun(runId: string): Promise<void> {
		const store = this.findRunStore(runId);
		return store ? store.deleteRun(runId) : Promise.resolve();
	}

	getActiveRunFor(automationId: string): IAutomationRun | undefined {
		return this.findAutomationStore(automationId)?.store.getActiveRunFor(automationId);
	}

	async markStaleRunsFailed(reason: string): Promise<void> {
		await this.migrationPromise;
		const stores = this.getStores();
		const results = await Promise.allSettled(stores.map(entry => entry.store.markStaleRunsFailed(reason)));
		for (let index = 0; index < results.length; index++) {
			const result = results[index];
			if (result.status === 'rejected') {
				const providerId = stores[index].providerId ?? 'legacy';
				this.logService.error(`[ProviderAutomationService] Failed to recover stale Automation runs for '${providerId}'.`, result.reason);
			}
		}
	}

	async startStaleRunRecovery(reason: string): Promise<void> {
		const generation = ++this.staleRunRecoveryGeneration;
		this.staleRunRecoveryReason = reason;
		this.recoveredStores.clear();
		const stores = this.getStores();
		this.migrationPromise = this.migrationSequencer.queue(() => this.recoverStores(stores, reason, generation)).catch(error => {
			this.logService.error('[ProviderAutomationService] Failed to start stale Automation run recovery.', error);
		});
		await this.migrationPromise;
	}

	stopStaleRunRecovery(): void {
		this.staleRunRecoveryGeneration++;
		this.staleRunRecoveryReason = undefined;
		this.recoveredStores.clear();
	}

	waitForMigrationForTesting(): Promise<void> {
		return this.migrationPromise;
	}

	private getStores(): IAutomationStoreEntry[] {
		const providerStores = this.sessionsProvidersService.getProviders()
			.filter(provider => provider.automations)
			.map(provider => ({ providerId: provider.id, store: provider.automations! }));
		return [...providerStores, { providerId: undefined, store: this.legacyStore }];
	}

	private getCreationStore(options: ICreateAutomationOptions): ISessionsProviderAutomations {
		return this.getTargetStore(options.target.providerId);
	}

	private getTargetStore(providerId: string | undefined): ISessionsProviderAutomations {
		if (providerId) {
			const providerStore = this.sessionsProvidersService.getProvider(providerId)?.automations;
			if (providerStore) {
				return providerStore;
			}
		}

		return this.legacyStore;
	}

	private async retargetAutomationStorageIfNeeded(sourceStore: ISessionsProviderAutomations, initialAutomation: IAutomationDescriptor): Promise<void> {
		let snapshot: IAutomation = {
			automation: initialAutomation,
			runs: sourceStore.runsFor(initialAutomation.id).get(),
		};
		for (let attempt = 0; attempt < MAX_AUTOMATION_TRANSFER_ATTEMPTS; attempt++) {
			const destinationStore = this.getTargetStore(snapshot.automation.target.providerId);
			if (sourceStore === destinationStore) {
				return;
			}

			await destinationStore.upsertAutomationSnapshot(snapshot);
			const sourceRemoval = await sourceStore.removeAutomationSnapshotIfUnchanged(snapshot);
			switch (sourceRemoval.kind) {
				case 'removed':
					return;
				case 'missing':
					await this.rollbackAutomationSnapshotIfUnchanged(destinationStore, snapshot);
					return;
				case 'conflict':
					if (!await this.rollbackAutomationSnapshotIfUnchanged(destinationStore, snapshot)) {
						return;
					}
					snapshot = sourceRemoval.current;
					break;
			}
		}
		this.logService.warn(`[ProviderAutomationService] Automation '${snapshot.automation.id}' kept changing while transferring storage ownership; leaving the source copy in place.`);
	}

	private findAutomationStore(id: string): IAutomationStoreEntry | undefined {
		return this.getStores().find(entry => !!entry.store.getAutomation(id));
	}

	private requireAutomationStore(id: string): ISessionsProviderAutomations {
		const entry = this.findAutomationStore(id);
		if (!entry) {
			throw new Error(`Automation '${id}' does not exist.`);
		}
		return entry.store;
	}

	private findRunStore(runId: string): ISessionsProviderAutomations | undefined {
		return this.getStores().find(entry => entry.store.runs.get().some(run => run.id === runId))?.store;
	}

	private queueMigration(): void {
		this.migrationPromise = this.migrationSequencer.queue(async () => {
			await this.migrateLegacyAutomations();
			const reason = this.staleRunRecoveryReason;
			if (reason) {
				await this.recoverStores(this.getStores(), reason, this.staleRunRecoveryGeneration);
			}
		}).catch(error => {
			this.logService.error('[ProviderAutomationService] Failed to migrate legacy Automations.', error);
		});
	}

	private async recoverStores(entries: readonly IAutomationStoreEntry[], reason: string, generation: number): Promise<void> {
		for (const entry of entries) {
			if (generation !== this.staleRunRecoveryGeneration || this.staleRunRecoveryReason !== reason) {
				return;
			}
			if (this.recoveredStores.has(entry.store)) {
				continue;
			}
			try {
				await entry.store.markStaleRunsFailed(reason);
				if (generation === this.staleRunRecoveryGeneration && this.staleRunRecoveryReason === reason) {
					this.recoveredStores.add(entry.store);
				}
			} catch (error) {
				const providerId = entry.providerId ?? 'legacy';
				this.logService.error(`[ProviderAutomationService] Failed to recover stale Automation runs for '${providerId}'.`, error);
			}
		}
	}

	private async migrateLegacyAutomations(): Promise<void> {
		for (const automation of [...this.legacyStore.automations.get()]) {
			try {
				await this.migrateLegacyAutomation(automation);
			} catch (error) {
				this.logService.error(`[ProviderAutomationService] Failed to migrate Automation '${automation.id}'.`, error);
			}
		}
	}

	private async migrateLegacyAutomation(initialAutomation: IAutomationDescriptor): Promise<void> {
		let snapshot: IAutomation = {
			automation: initialAutomation,
			runs: this.legacyStore.runsFor(initialAutomation.id).get(),
		};
		for (let attempt = 0; attempt < MAX_AUTOMATION_TRANSFER_ATTEMPTS; attempt++) {
			const providerId = snapshot.automation.target.providerId;
			if (!providerId) {
				return;
			}
			const providerStore = this.sessionsProvidersService.getProvider(providerId)?.automations;
			if (!providerStore) {
				return;
			}

			const importResult = await providerStore.importAutomationSnapshot(snapshot);
			if (importResult.kind === 'conflict') {
				this.logService.warn(`[ProviderAutomationService] Automation '${snapshot.automation.id}' conflicts with the destination provider store; leaving the legacy copy in place.`);
				return;
			}
			this.recoveredStores.delete(providerStore);
			const sourceRemoval = await this.legacyStore.removeAutomationSnapshotIfUnchanged(snapshot);
			switch (sourceRemoval.kind) {
				case 'removed':
					return;
				case 'missing':
					if (importResult.kind === 'inserted') {
						await this.rollbackAutomationSnapshotIfUnchanged(providerStore, snapshot);
					}
					return;
				case 'conflict':
					if (importResult.kind === 'inserted' && !await this.rollbackAutomationSnapshotIfUnchanged(providerStore, snapshot)) {
						return;
					}
					snapshot = sourceRemoval.current;
					break;
			}
		}
		this.logService.warn(`[ProviderAutomationService] Automation '${snapshot.automation.id}' kept changing during legacy migration; leaving it in legacy storage.`);
	}

	private async rollbackAutomationSnapshotIfUnchanged(store: ISessionsProviderAutomations, snapshot: IAutomation): Promise<boolean> {
		const result = await store.removeAutomationSnapshotIfUnchanged(snapshot);
		switch (result.kind) {
			case 'removed':
				return true;
			case 'conflict':
				this.logService.warn(`[ProviderAutomationService] Automation '${snapshot.automation.id}' changed in the destination store during rollback; leaving both copies in place.`);
				return false;
			case 'missing':
				this.logService.warn(`[ProviderAutomationService] Automation '${snapshot.automation.id}' was deleted from the destination store during rollback; leaving the source copy in place.`);
				return false;
		}
	}

}

function distinctById<T extends { readonly id: string }>(items: readonly T[]): T[] {
	const result: T[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		if (!seen.has(item.id)) {
			seen.add(item.id);
			result.push(item);
		}
	}
	return result;
}
