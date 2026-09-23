/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { autorun, derived, disposableObservableValue, observableSignalFromEvent, observableValue, transaction, type IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { supportsAgentHostAutonomousAutomations } from '../../../../../platform/agentHost/common/meta/agentHostAutomationsMeta.js';
import type { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationUnavailableError, type AutomationCatalogueState, type AutomationMutationGuard, type IAutomationRunRequestResult, type ICreateAutomationOptions, type IGuardedAutomationUpdateResult, type IUpdateAutomationOptions } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import type { ISessionsProviderAutomations } from '../../../../services/sessions/common/sessionsProvider.js';
import { AgentHostAutomationStore, type IAgentHostAutomationBoundaryMapper, type IAgentHostAutomationConnection } from './agentHostAutomationStore.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';

type AutomationConnectionState = 'disconnected' | 'initializing' | 'disabled' | 'unsupported' | 'incompatible' | 'connected';

/**
 * Stable Automation facade for one Sessions provider across connection, capability, and enablement changes.
 * Owns a replaceable connection-scoped projection and reports unavailability without a fallback executor.
 */
export class ReconnectableAgentHostAutomationStore extends Disposable implements ISessionsProviderAutomations {

	private readonly currentStore = this._register(disposableObservableValue<AgentHostAutomationStore | undefined>(this, undefined));
	private readonly connectionBinding = this._register(new DisposableStore());
	private readonly runsForCache = new Map<string, IObservable<readonly IAutomationRun[]>>();
	private readonly configurationChanged;
	private readonly connectionState = observableValue<AutomationConnectionState>(this, 'disconnected');

	readonly automations = derived(this, reader => this.currentStore.read(reader)?.automations.read(reader) ?? []);
	readonly runs = derived(this, reader => this.currentStore.read(reader)?.runs.read(reader) ?? []);
	readonly catalogueState: IObservable<AutomationCatalogueState> = derived(this, reader => this.currentStore.read(reader)?.catalogueState.read(reader)
		?? (this.connectionState.read(reader) === 'initializing' ? 'loading' : 'unavailable'));
	readonly canCreateAutomation = derived(this, reader => this.currentStore.read(reader)?.canCreateAutomation.read(reader) ?? false);
	readonly unavailableReason = derived(this, reader => {
		switch (this.connectionState.read(reader)) {
			case 'disconnected':
				return localize('automationHostDisconnected', "The Agent Host is disconnected. Reconnect to the host and try again.");
			case 'initializing':
				return localize('automationHostInitializing', "The Agent Host is still connecting. Wait for the connection to finish, then try again.");
			case 'disabled':
				return localize('automationFeatureDisabled', "Automations are disabled. Enable the {0} setting and try again.", CHAT_AUTOMATIONS_ENABLED_SETTING);
			case 'unsupported':
				return localize('automationHostUnsupported', "This Agent Host does not support automations. Update the host or use an Agent Host with Automation support.");
			case 'incompatible':
				return localize('automationHostUpgradeRequired', "Update this Agent Host to a newer version, then reconnect to use automations.");
			case 'connected':
				return undefined;
		}
	});

	constructor(
		private readonly providerId: string,
		private readonly boundaryMapper: IAgentHostAutomationBoundaryMapper | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.configurationChanged = observableSignalFromEvent(this, this.configurationService.onDidChangeConfiguration);
	}

	/** Rebinds to the connection and exposes a projection only while compatible Automation support is available. */
	setConnection(connection: IAgentHostAutomationConnection): void {
		this.clearConnection();
		this.connectionBinding.add(autorun(reader => {
			this.configurationChanged.read(reader);
			const enabled = this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
			const capabilities = connection.initializeResult.read(reader);
			const current = this.currentStore.read(reader);
			let state: AutomationConnectionState;
			if (!enabled) {
				state = 'disabled';
			} else if (capabilities === undefined) {
				state = 'initializing';
			} else if (capabilities.automations === undefined) {
				state = 'unsupported';
			} else if (!supportsAgentHostAutonomousAutomations(capabilities)) {
				state = 'incompatible';
			} else {
				state = 'connected';
			}
			transaction(tx => {
				this.connectionState.set(state, tx);
				if (state !== 'connected') {
					this.currentStore.set(undefined, tx);
				} else if (!current) {
					this.currentStore.set(this.instantiationService.createInstance(AgentHostAutomationStore, this.providerId, connection, this.boundaryMapper), tx);
				}
			});
		}));
	}

	/** Disposes client-side projections and observations without changing host definitions or runs. */
	clearConnection(): void {
		this.connectionBinding.clear();
		transaction(tx => {
			this.currentStore.set(undefined, tx);
			this.connectionState.set('disconnected', tx);
		});
	}

	getAutomation(id: string): IAutomationDescriptor | undefined {
		return this.currentStore.get()?.getAutomation(id);
	}

	canRunAutomation(id: string): boolean {
		return this.currentStore.get()?.canRunAutomation(id) === true;
	}

	canUpdateAutomation(id: string): boolean {
		return this.currentStore.get()?.canUpdateAutomation(id) === true;
	}

	canDeleteAutomation(id: string): boolean {
		return this.currentStore.get()?.canDeleteAutomation(id) === true;
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
		return this.requireStore().createAutomation(options, mutationGuard);
	}

	updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor> {
		return this.requireStore().updateAutomation(id, patch);
	}

	updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		return this.requireStore().updateAutomationIfUnchanged(id, patch, expected, mutationGuard);
	}

	deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard): Promise<void> {
		return this.requireStore().deleteAutomation(id, mutationGuard);
	}

	runAutomation(automationId: string, token?: CancellationToken): Promise<IAutomationRunRequestResult> {
		return this.requireStore().runAutomation(automationId, token);
	}

	getActiveRunFor(automationId: string): IAutomationRun | undefined {
		return this.currentStore.get()?.getActiveRunFor(automationId);
	}

	private requireStore(): AgentHostAutomationStore {
		const store = this.currentStore.get();
		if (!store) {
			throw new AutomationUnavailableError(this.unavailableReason.get() ?? localize('automationHostUnavailable', "The Agent Host is unavailable. Reconnect to the host and try again."));
		}
		return store;
	}
}
