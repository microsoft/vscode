/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionModelTeamPicker.css';
import { $, addStandardDisposableListener } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Switch } from '../../../../base/browser/ui/toggle/switch.js';
import { DeferredPromise, Sequencer } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { equals } from '../../../../base/common/objects.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IModelPickerAdditionalContent, IModelPickerDelegate, IModelPickerSelectionPresentation } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { extractSchemaDefaults, filterConfigurationToSchema, resolveModelConfiguration } from '../../../../workbench/contrib/chat/browser/widget/input/chatModelConfigurationLogic.js';
import { getModelConfigProperty, getModelConfigValueLabel, MODEL_CONFIG_GROUP_EFFORT } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { isAutoModel } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerPresentation.js';
import { ModelPickerInlineWidget } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerInlineWidget.js';
import { getCompactModelPickerIcon } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelProviderIcons.js';
import { createModelConfigurationActions, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelConfigurationAccess } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { getLanguageModelDisplayNameWithSubscriptionSource } from '../../../../workbench/contrib/chat/common/languageModelSourcePresentation.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { isActiveSessionStatus, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionModelTeam, ISessionModelTeamMember, ISessionModelTeamState, ISessionsProvider, SessionModelTeamRole } from '../../../services/sessions/common/sessionsProvider.js';

export interface ISessionModelTeamContext {
	readonly sessionId: string;
	readonly providerId: string;
	readonly chatResource: URI;
	readonly modelId: string | undefined;
}

type ModelTeamRole = 'lead' | 'worker' | 'scout';

interface IModelTeamRoleSelection {
	readonly modelId: string;
	readonly configuration?: Readonly<Record<string, unknown>>;
}

type IModelTeamSetup = Partial<Record<ModelTeamRole, IModelTeamRoleSelection>>;
type IModelTeamRolePicker = Pick<ModelPickerInlineWidget, 'onDidChangeSelection' | 'onDidClose' | 'setSelectedModel' | 'show' | 'focus' | 'dispose'>;
type ModelTeamPickerFactory = (delegate: IModelPickerDelegate) => IModelTeamRolePicker;
type ModelTeamPopup = Parameters<NonNullable<IModelPickerAdditionalContent['render']>>[1];

function modelName(models: readonly ILanguageModelChatMetadataAndIdentifier[], identifier: string | undefined): string {
	if (!identifier) {
		return localize('modelTeam.chooseModel', "Choose a model");
	}
	const model = models.find(model => model.identifier === identifier);
	return model
		? getLanguageModelDisplayNameWithSubscriptionSource(model)
		: localize('modelTeam.unavailableModel', "{0} (Unavailable)", identifier);
}

export function getModelTeamPresentation(state: ISessionModelTeamState | undefined, models: readonly ILanguageModelChatMetadataAndIdentifier[], leadModelId: string | undefined): IModelPickerSelectionPresentation | undefined {
	if (state?.loading) {
		const description = localize('modelTeam.loading', "Loading model configuration");
		return { label: localize('modelTeam.loadingLabel', "Models"), ariaLabel: description, tooltip: description };
	}
	const team = state?.selection;
	if (!team) {
		return undefined;
	}
	const ids = [leadModelId, team.workerModelId, ...(team.scoutModelId ? [team.scoutModelId] : [])];
	const names = ids.map(id => modelName(models, id));
	const configurations = [state.leadModelConfiguration, team.workerModelConfiguration, team.scoutModelConfiguration];
	const descriptions = names.map((name, index) => {
		const model = models.find(model => model.identifier === ids[index]);
		const property = model && !isAutoModel(model) ? getModelConfigProperty(model, { getModelConfiguration: () => configurations[index] }, MODEL_CONFIG_GROUP_EFFORT) : undefined;
		return property?.value === undefined ? name : localize('modelTeam.modelWithReasoning', "{0} (Reasoning: {1})", name, getModelConfigValueLabel(property.schema, property.value));
	});
	const details = team.scoutModelId
		? localize('modelTeam.threeRoles', "Lead: {0}. Worker: {1}. Scout: {2}.", ...descriptions)
		: localize('modelTeam.twoRoles', "Lead: {0}. Worker: {1}.", ...descriptions);
	const status = state.error ?? (state.pending ? localize('modelTeam.pending', "Applies on the next request.") : '');
	const tooltip = status ? localize('modelTeam.detailsWithStatus', "{0} {1}", details, status) : details;
	return {
		label: team.scoutModelId ? localize('modelTeam.trio', "{0} + {1} + {2}", ...names) : localize('modelTeam.pair', "{0} + {1}", ...names),
		ariaLabel: localize('modelTeam.accessibleSummary', "Model team. {0}", tooltip),
		tooltip,
		segments: ids.map((id, index) => {
			const model = models.find(model => model.identifier === id);
			return { label: names[index], icon: model ? getCompactModelPickerIcon(model) ?? Codicon.agent : Codicon.agent };
		}),
	};
}

export function getModelTeamModels(models: readonly ILanguageModelChatMetadataAndIdentifier[]): readonly ILanguageModelChatMetadataAndIdentifier[] {
	return models.filter(model => model.metadata.isUserSelectable !== false);
}

function sameContext(a: ISessionModelTeamContext | undefined, b: ISessionModelTeamContext | undefined): boolean {
	return a?.sessionId === b?.sessionId && a?.providerId === b?.providerId && isEqual(a?.chatResource, b?.chatResource);
}

function isSelectableConfiguration(model: ILanguageModelChatMetadataAndIdentifier, configuration: Readonly<Record<string, unknown>> | undefined): boolean {
	return equals(configuration ?? {}, filterConfigurationToSchema({ ...configuration }, model.metadata.configurationSchema))
		&& Object.keys(configuration ?? {}).every(key => !model.metadata.configurationSchema?.properties?.[key]?.readOnly);
}

function memberStatus(member: ISessionModelTeamMember): string {
	if (member.historyUnavailable) {
		return localize('modelTeam.memberHistoryUnavailable', "Previous history unavailable");
	}
	if (member.pendingInputCount || member.status === SessionStatus.NeedsInput) {
		return localize('modelTeam.memberInput', "Awaiting Approval or Input");
	}
	if (member.status === SessionStatus.Error) {
		return localize('modelTeam.memberError', "Last request failed");
	}
	if (member.enabled) {
		switch (member.assignment?.state) {
			case 'unassigned': return member.assignment.reviewFeedback ? localize('modelTeam.memberRework', "Needs Rework") : member.assignment.objective ? localize('modelTeam.memberAssigned', "Assigned") : localize('modelTeam.memberUnassigned', "Awaiting Assignment");
			case 'queued': return member.assignment.reviewFeedback ? localize('modelTeam.memberReworkQueued', "Rework Queued") : localize('modelTeam.memberQueued', "Queued");
			case 'working': return localize('modelTeam.memberWorking', "Working");
			case 'reported': return member.assignment.reviewed ? localize('modelTeam.memberAccepted', "Accepted") : localize('modelTeam.memberAwaitingReview', "Awaiting Lead Review");
			case 'blocked': return localize('modelTeam.memberBlocked', "Blocked");
			case 'removed': return localize('modelTeam.memberRemoved', "Removed from Task");
		}
	}
	return member.status === SessionStatus.InProgress ? localize('modelTeam.memberWorking', "Working")
		: member.enabled ? localize('modelTeam.memberIdle', "Ready") : localize('modelTeam.memberPaused', "Not in Team");
}

function taskNotice(state: ISessionModelTeamState | undefined): string | undefined {
	if (!state?.selection || !state.task) {
		return undefined;
	}
	if (state.members?.some(member => member.enabled && member.historyUnavailable)) {
		return localize('modelTeam.taskHistoryUnavailable', "Previous teammate history is unavailable. Reset the affected role to start a new conversation.");
	}
	if (state.task.leadStatus === SessionStatus.NeedsInput) {
		return localize('modelTeam.taskLeadNeedsInput', "Lead needs approval or input. Respond in its chat to continue.");
	}
	const needsInput = state.members?.find(member => member.enabled && (member.pendingInputCount || member.status === SessionStatus.NeedsInput));
	if (needsInput) {
		return localize('modelTeam.taskNeedsInput', "{0} needs approval or input. Respond in Lead's approval queue to continue.", needsInput.role === 'worker' ? localize('modelTeam.worker', "Worker") : localize('modelTeam.scout', "Scout"));
	}
	switch (state.task.state) {
		case 'working': return localize('modelTeam.taskWorking', "Team task in progress.");
		case 'waiting': return localize('modelTeam.taskWaiting', "Waiting for teammate reports.");
		case 'reviewing': return localize('modelTeam.taskReviewing', "Lead is reviewing teammate reports.");
		case 'integrating': return localize('modelTeam.taskIntegrating', "Lead is integrating accepted teammate work.");
		case 'completed': return localize('modelTeam.taskCompleted', "Team task completed.");
		case 'blocked':
		case 'cancelled': {
			const recovery = state.task.state === 'cancelled'
				? localize('modelTeam.taskCancelled', "Team task cancelled. Retry in the affected chat, remove Scout if it is blocked, or turn Team off.")
				: localize('modelTeam.taskBlocked', "Team task blocked. Retry in the affected chat, remove Scout if it is blocked, or turn Team off.");
			const error = state.task.error ?? state.members?.find(member => member.enabled && member.assignment?.state === 'blocked')?.assignment?.error;
			return error ? localize('modelTeam.taskError', "{0} {1}", error, recovery) : recovery;
		}
	}
}

function hasConfiguredRole(selection: ISessionModelTeam | undefined, role: SessionModelTeamRole): boolean {
	return !!selection && (role === 'worker' || !!selection.scoutModelId);
}

export class SessionModelTeamPicker extends Disposable {
	private readonly _state = observableValue<ISessionModelTeamState | undefined>(this, undefined);
	private readonly _configurationState = derivedOpts<Omit<ISessionModelTeamState, 'members' | 'task'> | undefined>({ owner: this, equalsFn: equals }, reader => {
		const state = this._state.read(reader);
		if (!state) {
			return undefined;
		}
		const { members: _members, task: _task, ...configuration } = state;
		return configuration;
	});
	private readonly _models = observableValue<readonly ILanguageModelChatMetadataAndIdentifier[]>(this, []);
	private readonly _leadModelSource = observableValue<IObservable<ILanguageModelChatMetadataAndIdentifier | undefined> | undefined>(this, undefined);
	private readonly _configurationChanged = observableSignal(this);
	private readonly _saving = observableValue(this, false);
	private readonly _providerListener = this._register(new MutableDisposable<IDisposable>());
	private readonly _leadConfigurationListener = this._register(new MutableDisposable<IDisposable>());
	private readonly _rolePicker = this._register(new MutableDisposable<DisposableStore>());
	private _activeRolePicker: IModelTeamRolePicker | undefined;
	private readonly _inlineSelection = observableValue<{ readonly role: ModelTeamRole; readonly configure: boolean } | undefined>(this, undefined);
	private readonly _setup = observableValue<IModelTeamSetup | undefined>(this, undefined);
	private readonly _onDidChangeConfiguration = this._register(new Emitter<string>());
	private readonly _saves = new Sequencer();
	private readonly _createPicker: ModelTeamPickerFactory;
	private _pendingSaves = 0;
	private _delegate: IModelPickerDelegate | undefined;
	private _provider: ISessionsProvider | undefined;
	private _boundContext: ISessionModelTeamContext | undefined;
	private _panel: HTMLElement | undefined;
	private _inlineOptionsContainer: HTMLElement | undefined;
	private readonly _modelButtons = new Map<ModelTeamRole, Button>();
	private readonly _reasoningButtons = new Map<ModelTeamRole, Button>();
	private readonly _resetButtons = new Map<SessionModelTeamRole, Button>();
	private _teamSwitch: Switch | undefined;
	private _scoutToggle: Button | undefined;

	readonly selectionPresentation = derived(this, reader => {
		this._configurationChanged.read(reader);
		const state = this._configurationState.read(reader);
		const context = this._context.read(reader);
		const model = this._leadModelSource.read(reader)?.read(reader);
		const leadModelId = context?.modelId ?? model?.identifier;
		return getModelTeamPresentation(
			state && leadModelId ? { ...state, leadModelConfiguration: this._getConfiguration('lead', leadModelId) } : state,
			this._models.read(reader),
			leadModelId,
		);
	});
	readonly canSelectModel = derived(this, reader => !this._state.read(reader)?.loading);

	constructor(
		private readonly _context: IObservable<ISessionModelTeamContext | undefined>,
		createPicker: ModelTeamPickerFactory | undefined,
		@ISessionsProvidersService private readonly _providersService: ISessionsProvidersService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
		@IHoverService private readonly _hoverService: IHoverService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IDialogService private readonly _dialogService: IDialogService,
	) {
		super();
		this._createPicker = createPicker ?? (delegate => instantiationService.createInstance(ModelPickerInlineWidget, delegate));
		this._register(autorun(reader => {
			this._context.read(reader);
			this._refresh();
		}));
		this._register(this._providersService.onDidChangeProviders(() => this._refresh()));
	}

	decorate(delegate: IModelPickerDelegate): IModelPickerDelegate {
		this._delegate = delegate;
		this._leadModelSource.set(delegate.currentModel, undefined);
		this._leadConfigurationListener.value = Event.any(delegate.modelConfiguration?.onDidChange ?? Event.None, this._languageModelsService.onDidChangeLanguageModels)(() => {
			this._configurationChanged.trigger(undefined);
			this._refresh();
		});
		const leadConfiguration: IModelConfigurationAccess = {
			getModelConfiguration: modelId => this._state.get()?.selection || this._state.get()?.rememberedSelection
				? this._getConfiguration('lead', modelId)
				: (delegate.modelConfiguration ?? this._languageModelsService).getModelConfiguration(modelId),
			setModelConfiguration: async (modelId, values) => {
				const context = this._context.get();
				if (!context) {
					throw new CancellationError();
				}
				if (!this._state.get()?.selection && !this._state.get()?.rememberedSelection) {
					await (delegate.modelConfiguration ?? this._languageModelsService).setModelConfiguration(modelId, values);
					return;
				}
				await this._saveRole(context, 'lead', { modelId, configuration: { ...this._getConfiguration('lead', modelId), ...values } });
			},
			getModelConfigurationActions: modelId => {
				if (!this._state.get()?.selection && !this._state.get()?.rememberedSelection) {
					return (delegate.modelConfiguration ?? this._languageModelsService).getModelConfigurationActions(modelId);
				}
				return createModelConfigurationActions(
					this._models.get().find(model => model.identifier === modelId)?.metadata.configurationSchema,
					this._getConfiguration('lead', modelId) ?? {},
					(key, value) => leadConfiguration.setModelConfiguration(modelId, { [key]: value }),
				);
			},
			onDidChange: Event.any(this._onDidChangeConfiguration.event, delegate.modelConfiguration?.onDidChange ?? this._languageModelsService.onDidChangeLanguageModels),
		};
		return {
			...delegate,
			modelConfiguration: leadConfiguration,
			selectionPresentation: this.selectionPresentation,
			getAdditionalContent: () => this.getAdditionalContent(),
			setModel: model => {
				const context = this._context.get();
				const state = this._state.get();
				if (!context || (!state?.selection && !state?.error)) {
					delegate.setModel(model);
					return;
				}
				void this._save(context, () => this._apply(context, model.identifier, undefined)).then(() => {
					if (!this._store.isDisposed && sameContext(context, this._context.get())) {
						delegate.setModel(model);
					}
				}, error => this._reportError(error));
			},
		};
	}

	getAdditionalContent(): IModelPickerAdditionalContent | undefined {
		this._refresh();
		const state = this._state.get();
		const setup = this._setup.get();
		return state && (state.supported || state.selection || state.error || state.members?.length) && !state.loading
			? {
				renderHeader: (container, context) => this._renderHeader(container, context),
				replaceModelList: !!state.selection || !!setup,
				render: state.selection || setup ? (container, context) => this._render(container, context)
					: state.members?.length ? (container, context) => this._renderHistory(container, context) : undefined,
			}
			: undefined;
	}

	private _renderHeader(parent: HTMLElement, popup: ModelTeamPopup): IDisposable {
		const store = new DisposableStore();
		const header = parent.appendChild($('.model-team-header'));
		const label = header.appendChild($('.model-team-heading'));
		label.textContent = localize('modelTeam.team', "Team");
		const toggle = store.add(new Switch({ ariaLabel: localize('modelTeam.enable', "Enable Model Team") }));
		header.appendChild(toggle.domNode);
		store.add(addStandardDisposableListener(toggle.domNode, 'keydown', event => {
			if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
				// Preserve native switch activation instead of accepting the focused model row.
				event.stopPropagation();
			}
		}));
		this._teamSwitch = toggle;
		const notice = parent.appendChild($('.model-team-header-notice'));
		store.add(autorun(reader => {
			const state = this._state.read(reader);
			const setup = this._setup.read(reader);
			toggle.checked = !!state?.selection || !!setup;
			toggle.disabled = this._saving.read(reader) || !!setup || (!state?.supported && !state?.selection);
			notice.textContent = state?.error ?? (!state?.selection && state?.pending ? localize('modelTeam.pendingOff', "Team changes apply to the next request.") : '');
			notice.hidden = !notice.textContent;
		}));
		store.add(toggle.onChange(enabled => {
			toggle.checked = !!this._state.get()?.selection;
			void this._toggleTeam(enabled, popup);
		}));
		store.add(toDisposable(() => {
			header.remove();
			notice.remove();
			if (this._teamSwitch === toggle) {
				this._teamSwitch = undefined;
			}
		}));
		return store;
	}

	private _render(parent: HTMLElement, popup: ModelTeamPopup): IDisposable {
		const store = new DisposableStore();
		const panel = parent.appendChild($('.model-team-picker'));
		panel.tabIndex = -1;
		this._panel = panel;
		panel.setAttribute('role', 'group');
		panel.setAttribute('aria-label', localize('modelTeam.panel', "Agent Team"));
		const cards = panel.appendChild($('.model-team-cards'));
		const options = panel.appendChild($('.model-team-inline-options'));
		options.id = generateUuid();
		this._inlineOptionsContainer = options;
		const controls = panel.appendChild($('.model-team-actions'));
		const history = panel.appendChild($('.model-team-history-container'));
		const notice = panel.appendChild($('.model-team-notice'));
		notice.setAttribute('role', 'status');
		store.add(autorun(reader => {
			options.hidden = !this._inlineSelection.read(reader);
		}));
		store.add(autorun(reader => {
			const state = this._state.read(reader);
			const setup = this._setup.read(reader);
			notice.textContent = state?.error ?? (setup
				? localize('modelTeam.setupNotice', "Choose the missing models to enable the team.")
				: taskNotice(state) ?? (state?.pending
					? localize('modelTeam.pendingUsageNotice', "Applies on the next request. Additional agents use credits.")
					: localize('modelTeam.usageNotice', "Additional agents use credits.")));
		}));
		store.add(autorun(reader => {
			const state = this._configurationState.read(reader);
			const setup = this._setup.read(reader);
			const inline = this._inlineSelection.read(reader);
			const models = this._models.read(reader);
			this._context.read(reader);
			this._leadModelSource.read(reader)?.read(reader);
			this._configurationChanged.read(reader);
			const enabled = state?.supported === true && !this._saving.read(reader);
			cards.replaceChildren();
			controls.replaceChildren();
			history.replaceChildren();
			this._modelButtons.clear();
			this._reasoningButtons.clear();
			if (!state?.selection && !setup) {
				return;
			}
			const hasScout = setup ? !!setup.scout : !!state?.selection?.scoutModelId;
			const roles: ModelTeamRole[] = hasScout || inline?.role === 'scout' ? ['lead', 'worker', 'scout'] : ['lead', 'worker'];
			panel.classList.toggle('three-roles', roles.length === 3);
			for (const role of roles) {
				const selection = this._getRoleSelection(role);
				const card = cards.appendChild($('.model-team-card'));
				const icon = role === 'lead' ? Codicon.organization : role === 'worker' ? Codicon.agent : Codicon.search;
				const title = role === 'lead' ? localize('modelTeam.lead', "Lead") : role === 'worker' ? localize('modelTeam.worker', "Worker") : localize('modelTeam.scout', "Scout");
				const heading = card.appendChild($('.model-team-role'));
				const avatar = heading.appendChild($('.model-team-avatar'));
				avatar.appendChild(renderIcon(icon));
				avatar.setAttribute('aria-hidden', 'true');
				heading.appendChild($('span')).textContent = title;
				reader.store.add(this._hoverService.setupDelayedHover(heading, { content: title }));
				card.appendChild($('.model-team-role-description')).textContent = role === 'lead'
					? localize('modelTeam.leadAction', "Plans and reviews")
					: role === 'worker' ? localize('modelTeam.workerAction', "Implements and tests") : localize('modelTeam.scoutAction', "Researches and explores");
				const name = modelName(models, selection?.modelId);
				const button = reader.store.add(new Button(card, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
				this._modelButtons.set(role, button);
				button.element.classList.add('model-team-model');
				button.element.dataset.role = role;
				button.element.dataset.control = 'model';
				button.label = localize('modelTeam.modelButton', "{0} {1}", name, '$(chevron-down)');
				button.enabled = enabled;
				button.element.setAttribute('aria-label', localize('modelTeam.chooseRole', "Choose model for {0}: {1}", title, name));
				button.element.setAttribute('aria-expanded', String(inline?.role === role && !inline.configure));
				button.element.setAttribute('aria-controls', options.id);
				reader.store.add(this._hoverService.setupDelayedHover(button.element, { content: name }));
				reader.store.add(button.onDidClick(() => void this._chooseModel(role)));
				const model = getModelTeamModels(models).find(model => model.identifier === selection?.modelId);
				const property = model && !isAutoModel(model) ? getModelConfigProperty(model, { getModelConfiguration: () => selection?.configuration }, MODEL_CONFIG_GROUP_EFFORT) : undefined;
				card.appendChild($('.model-team-reasoning-label')).textContent = localize('modelTeam.reasoning', "Reasoning");
				const reasoning = reader.store.add(new Button(card, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
				this._reasoningButtons.set(role, reasoning);
				reasoning.element.classList.add('model-team-reasoning');
				reasoning.element.dataset.role = role;
				reasoning.element.dataset.control = 'reasoning';
				const reasoningLabel = property?.value === undefined
					? localize('modelTeam.modelManaged', "Model Managed")
					: getModelConfigValueLabel(property.schema, property.value);
				const configurable = !!property && !property.schema.readOnly && (property.schema.enum?.length ?? 0) > 1;
				reasoning.label = configurable ? localize('modelTeam.reasoningButton', "{0} {1}", reasoningLabel, '$(chevron-down)') : reasoningLabel;
				reasoning.enabled = enabled && configurable;
				reasoning.element.setAttribute('aria-label', localize('modelTeam.roleReasoning', "{0} reasoning: {1}", title, reasoningLabel));
				reasoning.element.setAttribute('aria-expanded', String(inline?.role === role && inline.configure));
				reasoning.element.setAttribute('aria-controls', options.id);
				reader.store.add(this._hoverService.setupDelayedHover(reasoning.element, {
					content: configurable ? localize('modelTeam.changeReasoning', "Choose reasoning for {0}", title) : localize('modelTeam.automaticReasoning', "Reasoning cannot be changed for this model."),
				}));
				reader.store.add(reasoning.onDidClick(() => void this._chooseModel(role, true)));
				if (role !== 'lead') {
					reader.store.add(this._renderMemberActions(card, role, popup));
				}
			}
			const toggle = reader.store.add(new Button(controls, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
			this._scoutToggle = toggle;
			toggle.label = hasScout ? localize('modelTeam.removeScout', "Remove Scout") : localize('modelTeam.addScout', "{0} Add Scout", '$(add)');
			toggle.enabled = enabled && !setup;
			reader.store.add(toggle.onDidClick(() => void this._toggleScout()));
			reader.store.add(this._renderHistory(history, popup, true));
		}));
		store.add(toDisposable(() => {
			panel.remove();
			if (this._panel === panel) {
				this._panel = undefined;
				this._inlineOptionsContainer = undefined;
				this._rolePicker.clear();
				this._inlineSelection.set(undefined, undefined);
				this._modelButtons.clear();
				this._reasoningButtons.clear();
				this._scoutToggle = undefined;
			}
		}));
		return store;
	}

	private _renderHistory(parent: HTMLElement, popup: ModelTeamPopup, pausedOnly = false): IDisposable {
		const store = new DisposableStore();
		const history = parent.appendChild($('.model-team-history'));
		history.setAttribute('role', 'group');
		history.setAttribute('aria-label', localize('modelTeam.history', "Team History"));
		for (const role of ['worker', 'scout'] as const) {
			store.add(this._renderMemberActions(history, role, popup, true, pausedOnly));
		}
		store.add(autorun(reader => {
			const state = this._state.read(reader);
			history.hidden = !state?.members?.some(member => !pausedOnly || !hasConfiguredRole(state.selection, member.role));
		}));
		store.add(toDisposable(() => history.remove()));
		return store;
	}

	private _renderMemberActions(parent: HTMLElement, role: SessionModelTeamRole, popup: ModelTeamPopup, showRole = false, pausedOnly = false): IDisposable {
		const store = new DisposableStore();
		const entry = parent.appendChild($('.model-team-member'));
		const description = entry.appendChild($('.model-team-member-status'));
		description.id = generateUuid();
		const actions = entry.appendChild($('.model-team-member-actions'));
		const title = role === 'worker' ? localize('modelTeam.worker', "Worker") : localize('modelTeam.scout', "Scout");
		const open = store.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		open.label = showRole ? localize('modelTeam.openRole', "Open {0}", title) : localize('modelTeam.openChat', "Open Chat");
		open.element.setAttribute('aria-label', localize('modelTeam.openRoleChat', "Open {0} Chat", title));
		open.element.setAttribute('aria-describedby', description.id);
		open.element.dataset.role = role;
		open.element.dataset.control = 'open';
		store.add(open.onDidClick(() => void this._openMember(role, popup)));
		const reset = store.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		reset.label = localize('modelTeam.reset', "Reset...");
		reset.element.setAttribute('aria-label', localize('modelTeam.resetRole', "Reset {0}", title));
		reset.element.setAttribute('aria-describedby', description.id);
		reset.element.dataset.role = role;
		reset.element.dataset.control = 'reset';
		store.add(reset.onDidClick(() => void this._resetMember(role, title, popup)));
		store.add(autorun(reader => {
			const state = this._state.read(reader);
			const member = state?.members?.find(member => member.role === role);
			entry.hidden = !member || (pausedOnly && hasConfiguredRole(state?.selection, role));
			open.enabled = !!member && !member.historyUnavailable;
			reset.enabled = state?.supported === true && !!member
				&& !!this._provider?.resetModelTeamMember
				&& !isActiveSessionStatus(member.status) && !member.pendingInputCount && !this._saving.read(reader);
			description.textContent = member ? memberStatus(member) : '';
			if (!entry.hidden) {
				this._resetButtons.set(role, reset);
			}
		}));
		store.add(this._hoverService.setupDelayedHover(description, () => ({ content: description.textContent ?? '' })));
		store.add(toDisposable(() => {
			entry.remove();
			if (this._resetButtons.get(role) === reset) {
				this._resetButtons.delete(role);
			}
		}));
		return store;
	}

	private async _openMember(role: SessionModelTeamRole, popup: ModelTeamPopup): Promise<void> {
		const context = this._context.get();
		const member = this._state.get()?.members?.find(member => member.role === role);
		if (!context || !member) {
			return;
		}
		popup.hide();
		try {
			const session = this._provider?.getSessions().find(session => session.sessionId === context.sessionId);
			if (!session) {
				throw new Error(localize('modelTeam.sessionUnavailable', "This team session is no longer available."));
			}
			await this._sessionsService.openChat(session, member.chatResource);
		} catch (error) {
			this._reportError(error);
		}
	}

	private async _resetMember(role: SessionModelTeamRole, title: string, popup: ModelTeamPopup): Promise<void> {
		const context = this._context.get();
		const member = this._state.get()?.members?.find(member => member.role === role);
		if (!context || !member) {
			return;
		}
		popup.hide();
		try {
			const confirmation = await this._dialogService.confirm({
				type: 'warning',
				message: localize('modelTeam.confirmReset', "Reset {0}?", title),
				detail: localize('modelTeam.resetDetail', "Start a fresh conversation for this teammate. Its previous chat remains in history. Other teammates and workspace files will not be changed."),
				primaryButton: localize('modelTeam.resetRole', "Reset {0}", title),
			});
			if (!confirmation.confirmed) {
				return;
			}
			await this._save(context, async () => {
				const provider = this._providersService.getProvider(context.providerId);
				if (!provider?.resetModelTeamMember) {
					throw new Error(localize('modelTeam.resetUnavailable', "Resetting a teammate is not supported by this provider."));
				}
				await provider.resetModelTeamMember(context.sessionId, context.chatResource, role, member.chatResource);
			});
		} catch (error) {
			this._reportError(error);
		} finally {
			if (!this._store.isDisposed && sameContext(context, this._context.get())) {
				popup.reopen();
				this._resetButtons.get(role)?.focus();
			}
		}
	}

	private _getLeadModelId(): string | undefined {
		return this._context.get()?.modelId ?? this._leadModelSource.get()?.get()?.identifier;
	}

	private _getRoleSelection(role: ModelTeamRole): IModelTeamRoleSelection | undefined {
		const setup = this._setup.get();
		if (setup) {
			return setup[role];
		}
		const state = this._state.get();
		if (role === 'lead') {
			const modelId = this._getLeadModelId();
			return modelId ? { modelId, configuration: this._getConfiguration('lead', modelId) } : undefined;
		}
		const team = state?.selection;
		const modelId = role === 'worker' ? team?.workerModelId : team?.scoutModelId;
		return modelId ? { modelId, configuration: role === 'worker' ? team?.workerModelConfiguration : team?.scoutModelConfiguration } : undefined;
	}

	private _getConfiguration(role: ModelTeamRole, modelId: string): Readonly<Record<string, unknown>> | undefined {
		const setup = this._setup.get();
		if (setup?.[role]?.modelId === modelId) {
			return setup[role]?.configuration;
		}
		const state = this._state.get();
		if (role === 'lead') {
			return (modelId === this._getLeadModelId() ? state?.leadModelConfiguration : undefined)
				?? this._delegate?.modelConfiguration?.getModelConfiguration(modelId)
				?? this._languageModelsService.getModelConfiguration(modelId);
		}
		const team = state?.selection;
		return role === 'worker' && team?.workerModelId === modelId ? team.workerModelConfiguration
			: role === 'scout' && team?.scoutModelId === modelId ? team.scoutModelConfiguration : undefined;
	}

	private async _toggleTeam(enabled: boolean, popup: ModelTeamPopup): Promise<void> {
		const context = this._context.get();
		if (!context || this._saving.get() || this._setup.get()) {
			return;
		}
		this._rolePicker.clear();
		popup.hide();
		try {
			const lead = this._getRoleSelection('lead');
			if (!enabled) {
				if (!lead) {
					throw new Error(localize('modelTeam.leadRequired', "Choose a Lead model before changing the team."));
				}
				await this._save(context, () => this._apply(context, lead.modelId, undefined, lead.configuration));
			} else {
				const remembered = this._state.get()?.rememberedSelection;
				this._setup.set({
					lead,
					worker: remembered ? { modelId: remembered.workerModelId, configuration: remembered.workerModelConfiguration } : undefined,
					scout: remembered?.scoutModelId ? { modelId: remembered.scoutModelId, configuration: remembered.scoutModelConfiguration } : undefined,
				}, undefined);
				const roles: ModelTeamRole[] = remembered?.scoutModelId ? ['lead', 'worker', 'scout'] : ['lead', 'worker'];
				for (const role of roles) {
					const selection = this._setup.get()?.[role];
					const model = getModelTeamModels(this._models.get()).find(model => model.identifier === selection?.modelId);
					if (!model || !isSelectableConfiguration(model, selection?.configuration)) {
						if (!this._inlineOptionsContainer) {
							popup.reopen();
						}
						if (!await this._pickRole(context, role)) {
							return;
						}
					}
				}
				const setup = this._setup.get();
				if (!setup?.lead || !setup.worker) {
					throw new CancellationError();
				}
				const { lead: selectedLead, worker } = setup;
				await this._save(context, () => this._apply(context, selectedLead.modelId, {
					workerModelId: worker.modelId,
					workerModelConfiguration: worker.configuration,
					...(setup.scout ? { scoutModelId: setup.scout.modelId, scoutModelConfiguration: setup.scout.configuration } : {}),
				}, selectedLead.configuration));
			}
			if (!this._store.isDisposed && sameContext(context, this._context.get())) {
				status(enabled ? localize('modelTeam.enabled', "Model team enabled for the next request.") : localize('modelTeam.disabled', "Model team disabled. The helper setup is saved."));
			}
		} catch (error) {
			this._reportError(error);
		} finally {
			this._setup.set(undefined, undefined);
			if (!this._store.isDisposed && sameContext(context, this._context.get())) {
				popup.reopen();
				this._teamSwitch?.domNode.focus();
			}
		}
	}

	private async _toggleScout(): Promise<void> {
		if (!this._state.get()?.selection?.scoutModelId) {
			await this._chooseModel('scout');
			return;
		}
		const context = this._context.get();
		const team = this._state.get()?.selection;
		const lead = this._getRoleSelection('lead');
		if (!context || !team || !lead) {
			return;
		}
		this._rolePicker.clear();
		try {
			await this._save(context, () => this._apply(context, lead.modelId, { workerModelId: team.workerModelId, workerModelConfiguration: team.workerModelConfiguration }, lead.configuration));
		} catch (error) {
			this._reportError(error);
		} finally {
			if (!this._store.isDisposed && sameContext(context, this._context.get())) {
				this._scoutToggle?.focus();
			}
		}
	}

	private async _chooseModel(role: ModelTeamRole, configure = false): Promise<void> {
		const context = this._context.get();
		if (!context || this._saving.get()) {
			return;
		}
		const previous = this._inlineSelection.get();
		if (previous?.role === role && previous.configure === configure) {
			this._activeRolePicker?.focus();
			return;
		}
		this._rolePicker.clear();
		try {
			await this._pickRole(context, role, configure);
		} catch (error) {
			this._reportError(error);
		}
	}

	private async _pickRole(context: ISessionModelTeamContext, role: ModelTeamRole, configure = false): Promise<boolean> {
		const store = new DisposableStore();
		this._rolePicker.value = store;
		const inline = { role, configure };
		this._inlineSelection.set(inline, undefined);
		const closed = new DeferredPromise<void>();
		store.add(toDisposable(() => closed.complete()));
		let choice = this._getRoleSelection(role);
		const models = () => [...getModelTeamModels(this._models.get())];
		const currentModel = observableValue(this, models().find(model => model.identifier === choice?.modelId));
		let selected = false;
		let pending = Promise.resolve();
		const persist = async (selection: IModelTeamRoleSelection): Promise<void> => {
			if (this._rolePicker.value !== store || !sameContext(context, this._context.get())) {
				throw new CancellationError();
			}
			choice = selection;
			selected = true;
			const setup = this._setup.get();
			if (setup) {
				this._setup.set({ ...setup, [role]: selection }, undefined);
				return;
			}
			pending = this._saveRole(context, role, selection);
			return pending;
		};
		const configuration: IModelConfigurationAccess = {
			getModelConfiguration: modelId => {
				const defaults = extractSchemaDefaults(models().find(model => model.identifier === modelId)?.metadata.configurationSchema);
				return resolveModelConfiguration(choice?.modelId === modelId ? { ...choice.configuration } : undefined, defaults, undefined);
			},
			setModelConfiguration: async (modelId, values) => {
				await persist({ modelId, configuration: { ...(choice?.modelId === modelId ? choice.configuration : undefined), ...values } });
				this._onDidChangeConfiguration.fire(modelId);
			},
			getModelConfigurationActions: modelId => createModelConfigurationActions(
				models().find(model => model.identifier === modelId)?.metadata.configurationSchema,
				configuration.getModelConfiguration(modelId) ?? {},
				(key, value) => configuration.setModelConfiguration(modelId, { [key]: value }),
			),
			onDidChange: this._onDidChangeConfiguration.event,
		};
		const delegate: IModelPickerDelegate = {
			currentModel,
			getModels: models,
			getPresentationOptions: () => ({
				useGroupedModelPicker: true,
				showFeatured: true,
				showUnavailableFeatured: false,
				showManageModelsAction: false,
				showModelIcon: true,
				showAutoModel: true,
			}),
			modelConfiguration: configuration,
			getChatSessionId: () => context.sessionId,
			isCacheWarm: () => this._delegate?.isCacheWarm?.() ?? false,
			setModel: model => {
				currentModel.set(model, undefined);
				const next = choice?.modelId === model.identifier && isSelectableConfiguration(model, choice.configuration) ? choice : {
					modelId: model.identifier,
					configuration: Object.fromEntries(Object.entries(extractSchemaDefaults(model.metadata.configurationSchema))
						.filter(([key]) => model.metadata.configurationSchema?.required?.includes(key) && !model.metadata.configurationSchema.properties?.[key]?.readOnly)),
				};
				void persist(next).catch(error => this._reportError(error));
			},
		};
		try {
			const picker = store.add(this._createPicker(delegate));
			this._activeRolePicker = picker;
			store.add(toDisposable(() => {
				if (this._activeRolePicker === picker) {
					this._activeRolePicker = undefined;
				}
			}));
			picker.setSelectedModel(currentModel.get());
			store.add(picker.onDidChangeSelection(model => delegate.setModel(model)));
			store.add(picker.onDidClose(() => {
				// Keep focus inside Team while saving can replace or disable the role buttons.
				if (sameContext(context, this._context.get())) {
					this._panel?.focus();
				}
				closed.complete();
			}));
			const container = this._inlineOptionsContainer;
			if (!container) {
				throw new CancellationError();
			}
			const title = role === 'lead' ? localize('modelTeam.lead', "Lead") : role === 'worker' ? localize('modelTeam.worker', "Worker") : localize('modelTeam.scout', "Scout");
			picker.show(container, configure ? localize('modelTeam.inlineReasoning', "{0} Reasoning", title) : localize('modelTeam.inlineModel', "Choose {0} Model", title), configure ? MODEL_CONFIG_GROUP_EFFORT : undefined);
			await closed.p;
			const [saved] = await Promise.allSettled([pending]);
			return selected && saved.status === 'fulfilled' && !this._store.isDisposed && sameContext(context, this._context.get());
		} finally {
			if (this._rolePicker.value === store) {
				this._rolePicker.clear();
			}
			if (this._inlineSelection.get() === inline) {
				this._inlineSelection.set(undefined, undefined);
				if (this._inlineOptionsContainer && !this._store.isDisposed && sameContext(context, this._context.get())) {
					(configure ? this._reasoningButtons.get(role) : this._modelButtons.get(role))?.focus();
				}
			}
		}
	}

	private _saveRole(context: ISessionModelTeamContext, role: ModelTeamRole, choice: IModelTeamRoleSelection): Promise<void> {
		return this._save(context, async () => {
			const team = this._provider?.getModelTeam?.(context.sessionId, context.chatResource)?.selection;
			const lead = this._getRoleSelection('lead');
			if (role === 'lead') {
				await this._apply(context, choice.modelId, team, choice.configuration);
				return;
			}
			if (!lead || !team) {
				throw new Error(localize('modelTeam.noActiveTeam', "Enable a model team before changing its helpers."));
			}
			await this._apply(context, lead.modelId, {
				...team,
				...(role === 'worker' ? { workerModelId: choice.modelId, workerModelConfiguration: choice.configuration } : { scoutModelId: choice.modelId, scoutModelConfiguration: choice.configuration }),
			}, lead.configuration);
		});
	}

	private async _save(context: ISessionModelTeamContext, operation: () => Promise<void>): Promise<void> {
		this._pendingSaves++;
		this._saving.set(true, undefined);
		try {
			await this._saves.queue(async () => {
				if (this._store.isDisposed || !sameContext(context, this._context.get())) {
					throw new CancellationError();
				}
				await operation();
			});
		} finally {
			this._pendingSaves--;
			this._saving.set(this._pendingSaves > 0, undefined);
			this._refresh();
			if (context.modelId) {
				this._onDidChangeConfiguration.fire(context.modelId);
			}
		}
	}

	private async _apply(context: ISessionModelTeamContext, leadModelId: string, team: ISessionModelTeam | undefined, leadModelConfiguration?: Readonly<Record<string, unknown>>): Promise<void> {
		const provider = this._providersService.getProvider(context.providerId);
		if (!provider?.setModelTeam) {
			throw new Error(localize('modelTeam.unsupported', "Model teams are not available for this chat."));
		}
		const models = provider.getModelsSnapshot(context.sessionId).models;
		const selectableModels = getModelTeamModels(models);
		if (!selectableModels.some(model => model.identifier === leadModelId)
			|| (team && !selectableModels.some(model => model.identifier === team.workerModelId))
			|| (team?.scoutModelId && !selectableModels.some(model => model.identifier === team.scoutModelId))) {
			throw new Error(localize('modelTeam.selectionUnavailable', "A selected team model is unavailable. Choose a replacement before applying the team."));
		}
		await provider.setModelTeam(context.sessionId, context.chatResource, leadModelId, team, leadModelConfiguration);
	}

	private _reportError(error: unknown): void {
		if (!isCancellationError(error)) {
			this._logService.error('Failed to configure the model team', error);
			this._notificationService.error(error instanceof Error ? error : String(error));
		}
	}

	private _refresh(): void {
		const context = this._context.get();
		const provider = context && this._providersService.getProvider(context.providerId);
		if (!sameContext(context, this._boundContext)) {
			this._rolePicker.clear();
			this._setup.set(undefined, undefined);
		}
		if (provider !== this._provider) {
			this._providerListener.value = provider ? Event.any(provider.onDidChangeModels, provider.onDidChangeModelTeam ?? Event.None)(() => this._refresh()) : undefined;
		}
		this._provider = provider;
		this._boundContext = context;
		const models = context ? provider?.getModelsSnapshot(context.sessionId).models ?? [] : [];
		if (!equals(models, this._models.get())) {
			this._models.set(models, undefined);
		}
		const state = context ? provider?.getModelTeam?.(context.sessionId, context.chatResource) : undefined;
		if (!equals(state, this._state.get())) {
			this._state.set(state, undefined);
		}
	}

}
