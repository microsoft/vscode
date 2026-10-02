/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, derived, IObservable, observableSignalFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { isStringArray } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { AutomationTarget, IAutomationDescriptor, IAutomationRun, IAutomationSchedule, IAutomationSessionTemplate } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationCatalogueState, AutomationMutationGuard, AutomationUnavailableError, assertAutomationSessionTemplateAuthority, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions, serializeAutomationEditableState } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../services/sessions/common/session.js';
import { ISessionsProviderAutomations } from '../../../../services/sessions/common/sessionsProvider.js';
import { CloudAutomationApiClient, ICloudAutomationDefinition, ICloudAutomationMutation, ICloudAutomationTask, ICloudAutomationTrigger } from './cloudAutomationApiClient.js';
import { GitHubCloudAutomationStore, ICloudAutomationEntry, ICloudAutomationHistoryEntry } from './gitHubCloudAutomationStore.js';

/** Adapts the account-bound cloud store to the provider-neutral Automation contract. */
export class CloudAutomationStore extends Disposable implements ISessionsProviderAutomations {
	private readonly store = observableValue<GitHubCloudAutomationStore | undefined>(this, undefined);
	private readonly refreshError = observableValue<string | undefined>(this, undefined);
	readonly enabled: IObservable<boolean>;
	readonly catalogueState = derived<AutomationCatalogueState>(this, reader =>
		this.refreshError.read(reader) ? 'error' : this.store.read(reader)?.catalogueState.read(reader) ?? 'unavailable');
	readonly unavailableReason = this.refreshError;
	readonly canCreateAutomation = derived(this, reader =>
		this.enabled.read(reader) && this.catalogueState.read(reader) === 'ready' && this.store.read(reader)?.mutationUncertain.read(reader) === false);
	readonly automations = derived(this, reader => (this.store.read(reader)?.entries.read(reader) ?? []).map(entry => this.toAutomation(entry)));
	readonly runs = derived(this, reader => (this.store.read(reader)?.history.read(reader) ?? []).map(entry => this.toRun(entry)));

	constructor(
		private readonly providerId: string,
		private readonly sessionTypeId: string,
		resolveRepositoryUri: (workspace: URI) => URI | undefined | Promise<URI | undefined>,
		@IConfigurationService configurationService: IConfigurationService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const configurationChanged = observableSignalFromEvent(this, configurationService.onDidChangeConfiguration);
		const sentimentChanged = observableSignalFromEvent(this, entitlementService.onDidChangeSentiment);
		const accountChanged = observableSignalFromEvent(this, defaultAccountService.onDidChangeDefaultAccount);
		this.enabled = derived(this, reader => {
			configurationChanged.read(reader);
			sentimentChanged.read(reader);
			return configurationService.getValue<boolean>(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING) === true
				&& configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true
				&& configurationService.getValue<boolean>(ChatAIDisabledSettingId) !== true
				&& !entitlementService.sentiment.hidden;
		});
		this._register(autorun(reader => {
			accountChanged.read(reader);
			const account = defaultAccountService.currentDefaultAccount;
			let store: GitHubCloudAutomationStore | undefined;
			if (this.enabled.read(reader) && account && !account.enterprise) {
				const api = reader.store.add(instantiationService.createInstance(CloudAutomationApiClient));
				store = reader.store.add(instantiationService.createInstance(GitHubCloudAutomationStore, resolveRepositoryUri, api));
			}
			transaction(tx => {
				this.store.set(store, tx);
				this.refreshError.set(undefined, tx);
			});
			if (store) {
				void this.refresh().catch(error => {
					if (!isCancellationError(error)) {
						this.logService.warn('[CloudAutomations] Initial refresh failed', error);
					}
				});
			}
		}));
	}

	async refresh(): Promise<void> {
		const store = this.requireStore();
		try {
			await store.refresh();
			await store.refreshHistory();
			if (this.store.get() === store) {
				this.refreshError.set(undefined, undefined);
			}
		} catch (error) {
			if (this.store.get() === store && !isCancellationError(error)) {
				this.refreshError.set(error instanceof Error ? error.message : localize('cloudAutomations.refreshFailed', "Cloud automations could not be refreshed."), undefined);
			}
			throw error;
		}
	}

	getAutomation(id: string): IAutomationDescriptor | undefined {
		return this.automations.get().find(automation => automation.id === id);
	}

	runsFor(id: string): IObservable<readonly IAutomationRun[]> {
		return derived(this, reader => this.runs.read(reader).filter(run => run.automationId === id));
	}

	getActiveRunFor(id: string): IAutomationRun | undefined {
		return this.runs.get().filter(run => run.automationId === id && (run.status === 'pending' || run.status === 'running'))
			.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
	}

	canRunAutomation(id: string): boolean {
		return this.canCreateAutomation.get() && this.getAutomation(id) !== undefined;
	}

	canUpdateAutomation(id: string): boolean {
		return this.canRunAutomation(id) && !this.getAutomation(id)?.readOnlyReason;
	}

	canDeleteAutomation(id: string): boolean {
		return this.canRunAutomation(id);
	}

	async createAutomation(options: ICreateAutomationOptions, guard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
		const store = this.requireWritableStore();
		this.validateTarget(options.target);
		validateLocalOptions(options);
		const value: ICloudAutomationMutation = {
			name: options.name, prompt: options.prompt, disabled: !(options.enabled ?? false),
			triggers: cloudAutomationTriggers(options.schedule), ...templateMutation(options.sessionTemplate),
			...(options.modelId !== undefined && options.sessionTemplate === undefined ? { model: options.modelId } : {}),
		};
		const entry = await store.create(options.target.folderUri, value, guard);
		this.assertCurrentStore(store);
		return this.toAutomation(entry);
	}

	async updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor> {
		const store = this.requireWritableStore();
		const { entry } = await store.update(this.requireEntry(id), current => this.updateValue(current, id, patch));
		this.assertCurrentStore(store);
		return this.toAutomation(entry);
	}

	async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, guard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		const store = this.requireWritableStore();
		const entry = this.requireEntry(id);
		const result = await store.update(entry, current => {
			const latest = this.toAutomation({ repository: entry.repository, definition: current });
			return serializeAutomationEditableState(latest) === serializeAutomationEditableState(expected)
				? this.updateValue(current, id, patch) : undefined;
		}, guard);
		this.assertCurrentStore(store);
		const automation = this.toAutomation(result.entry);
		return result.updated ? { kind: 'updated', automation } : { kind: 'conflict', current: automation };
	}

	async deleteAutomation(id: string, guard?: AutomationMutationGuard): Promise<void> {
		await this.requireWritableStore().delete(this.requireEntry(id), guard);
	}

	async runAutomation(id: string, token: CancellationToken = CancellationToken.None): Promise<{ readonly kind: 'accepted' }> {
		await this.requireWritableStore().run(this.requireEntry(id), token);
		return { kind: 'accepted' };
	}

	canStopRun(run: IAutomationRun): boolean {
		return this.canRunAutomation(run.automationId) && this.runs.get().some(current => current.id === run.id && (current.status === 'pending' || current.status === 'running'));
	}

	async stopRun(run: IAutomationRun): Promise<void> {
		const store = this.requireWritableStore();
		const entry = store.history.get().find(entry => this.toRun(entry).id === run.id);
		if (!entry || !this.canStopRun(run)) {
			throw new AutomationUnavailableError(localize('cloudAutomations.stopUnavailable', "This cloud automation run cannot be stopped."));
		}
		await store.stop(entry);
	}

	private updateValue(definition: ICloudAutomationDefinition, id: string, patch: IUpdateAutomationOptions): ICloudAutomationMutation {
		validateLocalOptions(patch);
		const current = this.getAutomation(id)!;
		assertAutomationSessionTemplateAuthority(current, patch);
		if (cloudAutomationSchedule(definition.triggers).interval === 'custom') {
			throw new Error(localize('cloudAutomations.unsupportedEdit', "This automation uses triggers that cannot be edited in VS Code."));
		}
		if (patch.target) {
			this.validateTarget(patch.target);
			if (current.target.kind !== 'workspace' || !isEqual(current.target.folderUri, patch.target.folderUri)) {
				throw new Error(localize('cloudAutomations.repositoryImmutable', "Duplicate this automation to use another repository."));
			}
		}
		let triggers = patch.schedule ? cloudAutomationTriggers(patch.schedule) : undefined;
		if (triggers?.interval && definition.triggers?.interval) {
			const { types: _types, hour_utc: _hour, minute_utc: _minute, day_of_week: _day, ...otherFields } = definition.triggers.interval;
			triggers = { interval: { ...otherFields, ...triggers.interval } };
		}
		return {
			...(patch.name !== undefined ? { name: patch.name } : {}),
			...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
			...(patch.enabled !== undefined ? { disabled: !patch.enabled } : {}),
			...(triggers !== undefined ? { triggers } : {}),
			...(patch.sessionTemplate !== undefined ? templateMutation(patch.sessionTemplate ?? undefined) : {}),
			...(patch.modelId !== undefined ? { model: patch.modelId ?? '' } : {}),
		};
	}

	private validateTarget(target: AutomationTarget): asserts target is Extract<AutomationTarget, { kind: 'workspace' }> {
		if (target.providerId !== this.providerId || target.sessionTypeId !== this.sessionTypeId || target.kind !== 'workspace' || target.isolation.kind !== 'default') {
			throw new Error(localize('cloudAutomations.invalidTarget', "Select a GitHub repository with default isolation for this cloud automation."));
		}
	}

	private requireStore(): GitHubCloudAutomationStore {
		const store = this.store.get();
		if (!store || !this.enabled.get() || this._store.isDisposed) {
			throw new AutomationUnavailableError(localize('cloudAutomations.unavailable', "Sign in to GitHub.com and enable cloud automations before continuing."));
		}
		return store;
	}

	private assertCurrentStore(store: GitHubCloudAutomationStore): void {
		if (this.store.get() !== store || this._store.isDisposed) {
			throw new CancellationError();
		}
	}

	private requireWritableStore(): GitHubCloudAutomationStore {
		const store = this.requireStore();
		if (!this.canCreateAutomation.get()) {
			throw new AutomationUnavailableError(localize('cloudAutomations.refreshRequired', "Refresh cloud automations before submitting another request."));
		}
		return store;
	}

	private requireEntry(id: string): ICloudAutomationEntry {
		const entry = this.requireStore().entries.get().find(entry => this.toAutomation(entry).id === id);
		if (!entry) {
			throw new AutomationUnavailableError(localize('cloudAutomations.missing', "This cloud automation is no longer available. Refresh the catalogue."));
		}
		return entry;
	}

	private toAutomation(entry: ICloudAutomationEntry): IAutomationDescriptor {
		const { definition, repository } = entry;
		const schedule = cloudAutomationSchedule(definition.triggers);
		return {
			id: JSON.stringify([this.providerId, this.defaultAccountService.currentDefaultAccount?.accountName, repository.owner.toLowerCase(), repository.name.toLowerCase(), definition.id]),
			name: definition.name, prompt: definition.prompt, schedule,
			target: { kind: 'workspace', providerId: this.providerId, sessionTypeId: this.sessionTypeId, isolation: { kind: 'default' }, folderUri: URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${repository.owner}/${repository.name}/HEAD` }) },
			sessionTemplate: {
				...(definition.model ? { modelId: definition.model } : {}),
				config: { ...(definition.tools ? { tools: definition.tools } : {}), ...(definition.reasoning_effort ? { reasoningEffort: definition.reasoning_effort } : {}) },
			},
			enabled: definition.disabled !== true, createdAt: definition.created_at, updatedAt: definition.updated_at,
			...(schedule.interval === 'custom' ? { readOnlyReason: localize('cloudAutomations.customSchedule', "This automation uses triggers that cannot be edited in VS Code.") } : {}),
		};
	}

	private toRun({ entry, task }: ICloudAutomationHistoryEntry): IAutomationRun {
		const automationId = this.toAutomation(entry).id;
		const status = cloudTaskStatus(task);
		return {
			id: JSON.stringify([automationId, task.id]), automationId, status, trigger: 'external',
			startedAt: task.created_at, updatedAt: task.updated_at,
			...(status === 'completed' || status === 'failed' ? { completedAt: task.updated_at } : {}),
			...(status === 'failed' ? { errorMessage: task.status || task.state } : {}),
			...(task.state === 'waiting_for_user' ? { needsInput: true, statusDescription: localize('cloudAutomations.needsInput', "Needs input on GitHub") } : {}),
			externalResource: URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${entry.repository.owner}/${entry.repository.name}/tasks/${task.id}` }),
		};
	}
}

function validateLocalOptions(options: IUpdateAutomationOptions): void {
	if (options.mode !== undefined || options.permissionLevel !== undefined) {
		throw new Error(localize('cloudAutomations.localConfiguration', "Cloud automations do not support local mode or approval settings."));
	}
	if ((options.name !== undefined && !options.name.trim()) || (options.prompt !== undefined && !options.prompt.trim())) {
		throw new Error(localize('cloudAutomations.requiredFields', "An automation name and prompt are required."));
	}
}

function templateMutation(template: IAutomationSessionTemplate | undefined): ICloudAutomationMutation {
	const tools = template?.config?.tools;
	const reasoning = template?.config?.reasoningEffort;
	if (template?.agent || template?.modelConfiguration || Object.keys(template?.config ?? {}).some(key => key !== 'tools' && key !== 'reasoningEffort')
		|| (tools !== undefined && !isStringArray(tools)) || (reasoning !== undefined && typeof reasoning !== 'string')) {
		throw new Error(localize('cloudAutomations.unsupportedConfiguration', "This session configuration is not supported by cloud automations."));
	}
	return { model: template?.modelId ?? '', ...(isStringArray(tools) ? { tools } : {}), ...(typeof reasoning === 'string' ? { reasoning_effort: reasoning } : {}) };
}

export function cloudAutomationSchedule(triggers: ICloudAutomationDefinition['triggers']): IAutomationSchedule {
	const base = { scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0, timeZone: 'UTC' as const };
	if (Object.keys(triggers ?? {}).length === 0) {
		return { ...base, interval: 'manual' };
	}
	const trigger = triggers?.interval;
	if (Object.keys(triggers ?? {}).length !== 1 || !trigger || trigger.types.length !== 1) {
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
	if (schedule.timeZone !== 'UTC' || schedule.interval === 'custom' || !Number.isInteger(schedule.scheduleHour) || schedule.scheduleHour < 0 || schedule.scheduleHour > 23
		|| ![0, 15, 30, 45].includes(schedule.scheduleMinute) || !Number.isInteger(schedule.scheduleDay) || schedule.scheduleDay < 0 || schedule.scheduleDay > 6) {
		throw new Error(localize('cloudAutomations.invalidSchedule', "Choose a daily or weekly UTC schedule with minutes 00, 15, 30, or 45."));
	}
	return { interval: { types: [schedule.interval], hour_utc: schedule.scheduleHour, minute_utc: schedule.scheduleMinute, ...(schedule.interval === 'weekly' ? { day_of_week: schedule.scheduleDay } : {}) } };
}

function cloudTaskStatus(task: ICloudAutomationTask): IAutomationRun['status'] {
	switch (task.state) {
		case 'queued': return 'pending';
		case 'in_progress': case 'running': case 'waiting_for_user': return 'running';
		case 'completed': case 'idle': return 'completed';
		case 'failed': case 'timed_out': case 'cancelled': case 'canceled': case 'error': return 'failed';
		default: throw new Error(localize('cloudAutomations.unknownRunState', "GitHub returned an unsupported cloud run state: {0}.", task.state));
	}
}
