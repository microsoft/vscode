/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationCatalogueState, AutomationMutationGuard, AutomationUnavailableError, assertAutomationTargetAuthority, combineAutomationCatalogueStates, IAutomationProviderDescriptor, IAutomationRunRequestResult, IAutomationService, ICreateAutomationOptions, IGuardedAutomationUpdateResult, serializeAutomationEditableState, IUpdateAutomationOptions } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProviderAutomations } from '../../../services/sessions/common/sessionsProvider.js';

/**
 * Provider-neutral catalogue and command router for Automations across registered Sessions providers.
 * Providers own persistence and execution; this service combines their observable state without a fallback store.
 */
export class ProviderAutomationService extends Disposable implements IAutomationService {

	declare readonly _serviceBrand: undefined;

	private readonly providersChanged;
	private readonly runsForCache = new Map<string, IObservable<readonly IAutomationRun[]>>();

	readonly automations: IObservable<readonly IAutomationDescriptor[]>;
	readonly runs: IObservable<readonly IAutomationRun[]>;
	/** Aggregate completeness, with errors taking precedence over loading, unavailability, and readiness. */
	readonly catalogueState: IObservable<AutomationCatalogueState>;
	readonly unavailableProviders: IObservable<readonly IAutomationProviderDescriptor[]>;
	/** Providers permitting creation; existing definitions may allow updates on providers absent from this list. */
	readonly availableProviders: IObservable<readonly IAutomationProviderDescriptor[]>;

	/** @param initialProvidersSettled Whether startup contributions have finished registering providers. */
	constructor(
		initialProvidersSettled: IObservable<boolean>,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
		this.providersChanged = observableSignalFromEvent(this, sessionsProvidersService.onDidChangeProviders);
		this.catalogueState = derived(this, reader => {
			this.providersChanged.read(reader);
			const states = this.getStores().map(store => store.catalogueState.read(reader));
			if (!initialProvidersSettled.read(reader)) {
				states.push('loading');
			}
			return states.length > 0 ? combineAutomationCatalogueStates(states) : 'unavailable';
		});
		this.unavailableProviders = derived(this, reader => {
			this.providersChanged.read(reader);
			return this.sessionsProvidersService.getProviders()
				.filter(provider => provider.automations?.catalogueState.read(reader) === 'unavailable')
				.map(provider => {
					const reason = provider.automations?.unavailableReason?.read(reader);
					return { id: provider.id, label: provider.label, ...(reason !== undefined ? { unavailableReason: reason } : {}) };
				});
		});
		this.availableProviders = derived(this, reader => {
			this.providersChanged.read(reader);
			return this.sessionsProvidersService.getProviders()
				.filter(provider => provider.automations?.canCreateAutomation.read(reader))
				.map(provider => ({ id: provider.id, label: provider.label }));
		});
		this.automations = derived(this, reader => {
			this.providersChanged.read(reader);
			return this.getStores().flatMap(store => [...store.automations.read(reader)])
				.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		});
		this.runs = derived(this, reader => {
			this.providersChanged.read(reader);
			return this.getStores().flatMap(store => [...store.runs.read(reader)])
				.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
		});
	}

	getAutomation(id: string): IAutomationDescriptor | undefined {
		return this.findAutomationStore(id)?.getAutomation(id);
	}

	runsFor(automationId: string): IObservable<readonly IAutomationRun[]> {
		let result = this.runsForCache.get(automationId);
		if (!result) {
			result = derived(this, reader => this.runs.read(reader).filter(run => run.automationId === automationId));
			this.runsForCache.set(automationId, result);
		}
		return result;
	}

	canCreateAutomation(providerId: string | undefined): boolean {
		return !!providerId && this.sessionsProvidersService.getProvider(providerId)?.automations?.canCreateAutomation.get() === true;
	}

	/** Routes creation only to the explicitly selected provider, rejecting unavailable destinations. */
	createAutomation(options: ICreateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
		const providerId = options.target.providerId;
		const store = providerId ? this.sessionsProvidersService.getProvider(providerId)?.automations : undefined;
		if (!store?.canCreateAutomation.get()) {
			throw new AutomationUnavailableError(localize('automationCreateUnavailable', "Connect to an Agent Host that supports automations before creating one."));
		}
		return store.createAutomation(options, mutationGuard);
	}

	updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor> {
		const store = this.requireAutomationStore(id);
		assertAutomationTargetAuthority(store.getAutomation(id)!, patch.target);
		return store.updateAutomation(id, patch);
	}

	/** Checks editable-state conflicts before cross-host restrictions so stale callers can refresh their definition. */
	async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		const store = this.requireAutomationStore(id);
		const current = store.getAutomation(id);
		if (!current || serializeAutomationEditableState(current) !== serializeAutomationEditableState(expected)) {
			return { kind: 'conflict', current };
		}
		assertAutomationTargetAuthority(current, patch.target);
		return store.updateAutomationIfUnchanged(id, patch, expected, mutationGuard);
	}

	async deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard): Promise<void> {
		await this.requireAutomationStore(id).deleteAutomation(id, mutationGuard);
		this.runsForCache.delete(id);
	}

	runAutomation(automationId: string, token?: CancellationToken): Promise<IAutomationRunRequestResult> {
		return this.requireAutomationStore(automationId).runAutomation(automationId, token);
	}

	getActiveRunFor(automationId: string): IAutomationRun | undefined {
		return this.findAutomationStore(automationId)?.getActiveRunFor(automationId);
	}

	canRunAutomation(automationId: string): boolean {
		return this.findAutomationStore(automationId)?.canRunAutomation(automationId) === true;
	}

	canUpdateAutomation(automationId: string): boolean {
		return this.findAutomationStore(automationId)?.canUpdateAutomation(automationId) === true;
	}

	canDeleteAutomation(automationId: string): boolean {
		return this.findAutomationStore(automationId)?.canDeleteAutomation(automationId) === true;
	}

	private getStores(): ISessionsProviderAutomations[] {
		return this.sessionsProvidersService.getProviders().flatMap(provider => provider.automations ? [provider.automations] : []);
	}

	/** Resolves an already provider-scoped identifier; a missing owner is never replaced by another host. */
	private findAutomationStore(id: string): ISessionsProviderAutomations | undefined {
		return this.getStores().find(store => !!store.getAutomation(id));
	}

	private requireAutomationStore(id: string): ISessionsProviderAutomations {
		const store = this.findAutomationStore(id);
		if (!store) {
			throw new AutomationUnavailableError(localize('automationUnavailable', "Automation '{0}' is unavailable. Its Agent Host may be disconnected or the automation may have been deleted.", id));
		}
		return store;
	}

}
