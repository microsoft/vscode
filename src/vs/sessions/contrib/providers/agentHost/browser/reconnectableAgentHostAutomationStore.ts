/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, disposableObservableValue, observableSignalFromEvent, observableValue, waitForState, type IObservable } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import type { AutomationRunTrigger, IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import type { AutomationMutationGuard, IAutomationRunClaim, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions, IUpdateAutomationRunOptions } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import type { IAutomation, IAutomationSnapshotImportResult, IGuardedAutomationSnapshotRemovalResult, ISessionsProviderAutomations } from '../../../../services/sessions/common/sessionsProvider.js';
import { AgentHostAutomationStore, type IAgentHostAutomationBoundaryMapper, type IAgentHostAutomationConnection } from './agentHostAutomationStore.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';

const MIGRATION_RETRY_DELAY_MS = 30_000;

type AutomationAuthorityState =
	| { readonly kind: 'disconnected' | 'initializing' | 'unsupported' | 'disabled' }
	| { readonly kind: 'supported'; readonly store: AgentHostAutomationStore };

export class ReconnectableAgentHostAutomationStore extends Disposable implements ISessionsProviderAutomations {

	readonly preservesImportedRunHistory = true;

	private readonly _currentStore = this._register(disposableObservableValue<AgentHostAutomationStore | undefined>(this, undefined));
	private readonly _migrationRetry = this._register(new MutableDisposable());
	private readonly _connectionBinding = this._register(new DisposableStore());
	private readonly _runsForCache = new Map<string, IObservable<readonly IAutomationRun[]>>();
	private readonly _configurationChanged;
	private readonly _authorityState = observableValue<AutomationAuthorityState>(this, { kind: 'disconnected' });
	private readonly _disposeCancellation = new CancellationTokenSource();

	readonly automations = derived(this, reader => this._currentStore.read(reader)?.automations.read(reader) ?? this._legacySource?.automations.read(reader) ?? []);
	readonly runs = derived(this, reader => this._currentStore.read(reader)?.runs.read(reader) ?? this._legacySource?.runs.read(reader) ?? []);

	constructor(
		private readonly _providerId: string,
		private readonly _legacySource: ISessionsProviderAutomations | undefined,
		private readonly _boundaryMapper: IAgentHostAutomationBoundaryMapper | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._configurationChanged = observableSignalFromEvent(this, this._configurationService.onDidChangeConfiguration);
	}

	override dispose(): void {
		this._connectionBinding.clear();
		this._migrationRetry.clear();
		this._setAuthorityState({ kind: 'disconnected' });
		this._disposeCancellation.cancel();
		this._disposeCancellation.dispose();
		this._currentStore.set(undefined, undefined);
		super.dispose();
	}

	setConnection(connection: IAgentHostAutomationConnection): void {
		this._connectionBinding.clear();
		this._migrationRetry.clear();
		this._currentStore.set(undefined, undefined);
		this._setAuthorityState({ kind: 'initializing' });
		this._connectionBinding.add(autorun(reader => {
			this._configurationChanged.read(reader);
			const initializeResult = connection.initializeResult.read(reader);
			const enabled = this._configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
			const current = this._currentStore.read(reader);
			if (!enabled) {
				if (current) {
					this._migrationRetry.clear();
					this._currentStore.set(undefined, undefined);
				}
				this._setAuthorityState({ kind: 'disabled' });
				return;
			}
			if (!initializeResult) {
				this._setAuthorityState({ kind: 'initializing' });
				return;
			}
			if (!initializeResult.automations) {
				if (current) {
					this._migrationRetry.clear();
					this._currentStore.set(undefined, undefined);
				}
				this._setAuthorityState({ kind: 'unsupported' });
				return;
			}
			if (!current) {
				const store = this._instantiationService.createInstance(AgentHostAutomationStore, this._providerId, connection, this._legacySource, this._boundaryMapper);
				this._currentStore.set(store, undefined);
				this._setAuthorityState({ kind: 'supported', store });
				this._completeMigration(store);
			} else {
				this._setAuthorityState({ kind: 'supported', store: current });
			}
		}));
	}

	clearConnection(): void {
		this._connectionBinding.clear();
		this._migrationRetry.clear();
		this._currentStore.set(undefined, undefined);
		this._setAuthorityState({ kind: 'disconnected' });
	}

	getAutomation(id: string): IAutomationDescriptor | undefined {
		return this._currentStore.get()?.getAutomation(id) ?? this._legacySource?.getAutomation(id);
	}

	isSchedulingOwnedByHost(automationId: string): boolean {
		return this._currentStore.get()?.isSchedulingOwnedByHost(automationId) === true;
	}

	canRunAutomation(automationId: string): boolean {
		return this._currentStore.get()?.canRunAutomation(automationId) ?? this._legacySource?.getAutomation(automationId) !== undefined;
	}

	canUpdateAutomation(automationId: string): boolean {
		return this._currentStore.get()?.canUpdateAutomation(automationId) ?? this._legacySource?.getAutomation(automationId) !== undefined;
	}

	canDeleteAutomation(automationId: string): boolean {
		return this._currentStore.get()?.canDeleteAutomation(automationId) ?? this._legacySource?.getAutomation(automationId) !== undefined;
	}

	runsFor(automationId: string): IObservable<readonly IAutomationRun[]> {
		let result = this._runsForCache.get(automationId);
		if (!result) {
			result = derived(this, reader => this.runs.read(reader).filter(run => run.automationId === automationId));
			this._runsForCache.set(automationId, result);
		}
		return result;
	}

	createAutomation(options: ICreateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
		return this._requireOperationalStore().createAutomation(options, mutationGuard);
	}

	updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor> {
		return this._requireOperationalStore().updateAutomation(id, patch);
	}

	updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		return this._requireOperationalStore().updateAutomationIfUnchanged(id, patch, expected, mutationGuard);
	}

	deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard): Promise<void> {
		return this._requireOperationalStore().deleteAutomation(id, mutationGuard);
	}

	importAutomationSnapshot(snapshot: IAutomation): Promise<IAutomationSnapshotImportResult> {
		return this._requireAgentHostStore().importAutomationSnapshot(snapshot);
	}

	upsertAutomationSnapshot(snapshot: IAutomation): Promise<void> {
		return this._requireAgentHostStore().upsertAutomationSnapshot(snapshot);
	}

	removeAutomationSnapshotIfUnchanged(expected: IAutomation): Promise<IGuardedAutomationSnapshotRemovalResult> {
		return this._requireAgentHostStore().removeAutomationSnapshotIfUnchanged(expected);
	}

	acknowledgeAutomationSnapshotImported(snapshot: IAutomation): Promise<void> {
		return this._requireAgentHostStore().acknowledgeAutomationSnapshotImported(snapshot);
	}

	recordRunStart(automationId: string, trigger: AutomationRunTrigger, leaderWindowId: number): Promise<IAutomationRunClaim> {
		return this._requireOperationalStore().recordRunStart(automationId, trigger, leaderWindowId);
	}

	updateRun(runId: string, patch: IUpdateAutomationRunOptions): Promise<IAutomationRun | undefined> {
		return this._requireOperationalStore().updateRun(runId, patch);
	}

	deleteRun(runId: string): Promise<void> {
		return this._requireOperationalStore().deleteRun(runId);
	}

	getActiveRunFor(automationId: string): IAutomationRun | undefined {
		return this._currentStore.get()?.getActiveRunFor(automationId) ?? this._legacySource?.getActiveRunFor(automationId);
	}

	async markStaleRunsFailed(reason: string): Promise<void> {
		await (this._currentStore.get() ?? this._legacySource)?.markStaleRunsFailed(reason);
	}

	async completeMigration(): Promise<void> {
		while (true) {
			let state = this._authorityState.get();
			if (state.kind === 'initializing') {
				const waitCancellation = new CancellationTokenSource(this._disposeCancellation.token);
				const waitTimeout = disposableTimeout(() => waitCancellation.cancel(), MIGRATION_RETRY_DELAY_MS);
				try {
					state = await waitForState(this._authorityState, candidate => candidate.kind !== 'initializing', undefined, waitCancellation.token);
				} catch (error) {
					if (isCancellationError(error)) {
						return;
					}
					throw error;
				} finally {
					waitTimeout.dispose();
					waitCancellation.cancel();
					waitCancellation.dispose();
				}
			}
			if (state.kind !== 'supported') {
				return;
			}
			try {
				await state.store.completeMigration();
				return;
			} catch (error) {
				const current = this._authorityState.get();
				if (current.kind !== 'supported' || current.store !== state.store) {
					continue;
				}
				throw error;
			}
		}
	}

	private _setAuthorityState(state: AutomationAuthorityState): void {
		const current = this._authorityState.get();
		if (current.kind === state.kind
			&& (current.kind !== 'supported' || state.kind !== 'supported' || current.store === state.store)) {
			return;
		}
		this._authorityState.set(state, undefined);
	}

	private _completeMigration(store: AgentHostAutomationStore): void {
		if (this._store.isDisposed || this._currentStore.get() !== store) {
			return;
		}
		void store.completeMigration().catch(error => {
			if (this._store.isDisposed || isCancellationError(error) || this._currentStore.get() !== store) {
				return;
			}
			this._logService.error(`[ReconnectableAgentHostAutomationStore] Failed to initialize remote Automation authority; retrying in ${MIGRATION_RETRY_DELAY_MS}ms.`, error);
			this._migrationRetry.value = disposableTimeout(() => this._completeMigration(store), MIGRATION_RETRY_DELAY_MS);
		});
	}

	private _requireAgentHostStore(): AgentHostAutomationStore {
		const store = this._currentStore.get();
		if (!store) {
			throw new Error('The Agent Host does not currently advertise Automation support.');
		}
		return store;
	}

	private _requireOperationalStore(): ISessionsProviderAutomations {
		return this._currentStore.get() ?? this._legacySource ?? this._requireAgentHostStore();
	}
}
