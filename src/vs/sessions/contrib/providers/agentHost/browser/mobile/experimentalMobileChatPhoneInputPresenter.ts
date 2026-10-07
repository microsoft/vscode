/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IAction, toAction } from '../../../../../../base/common/actions.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable } from '../../../../../../base/common/observable.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { localize } from '../../../../../../nls.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ClaudeSessionConfigKey } from '../../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { CodexSessionConfigKey } from '../../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { getSessionApprovalProperty, isSessionConfigWritable, validateSessionConfigWrite } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { ActionListItemKind } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { observableContextKey } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../../workbench/common/contributions.js';
import { IToggleChatModeArgs, ToggleAgentModeActionId } from '../../../../../../workbench/contrib/chat/browser/actions/chatExecuteActions.js';
import { ChatPetAchievementIds, didExplicitlyEnableChatPetAutopilot } from '../../../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { IChatPetService } from '../../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatPhoneInputPresenterRequest, IChatPhoneInputPresenter, IChatPhoneInputSessionContext, IChatPhonePresenterImpl } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { IModePickerDelegate } from '../../../../../../workbench/contrib/chat/browser/widget/input/modePickerActionItem.js';
import { IModelPickerDelegate } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { getModelProviderIcon } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelProviderIcons.js';
import { IChatMode } from '../../../../../../workbench/contrib/chat/common/chatModes.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelConfigurationAccess } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { getModelConfigChoices, getModelConfigProperty, IModelConfigProperty, MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT, setModelConfigValues } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { buildSpeedVariants } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerVariants.js';
import type { SessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IWorkbenchLayoutService } from '../../../../../../workbench/services/layout/browser/layoutService.js';
import { getSessionConfigProvider, isAgentHostProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { showMobilePickerSheet, IMobilePickerSheetItem, MOBILE_PICKER_SHEET_CONFIRM } from '../../../../../browser/parts/mobile/mobilePickerSheet.js';
import { getAgentHostModeIcon } from '../agentHostModeIcon.js';
import { AgentHostPermissionPickerDelegate, isWellKnownAutoApproveSchema, isWellKnownClaudePermissionModeSchema, isWellKnownCodexApprovalsSchema, isWellKnownModeSchema, isWellKnownModeValue } from '../agentHostPermissionPickerDelegate.js';
import { normalizeModelPickerOptions } from '../../../../chat/browser/sessionModelPickerState.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { createChatPhoneInputSessionContext, createChatPhoneInputTarget, IChatPhoneInputTarget, matchesChatPhoneInputTarget } from '../../../../../services/presentation/browser/chatPhoneInputContext.js';
import { ExperimentalMobileChatInputActionViewItem } from './experimentalMobileChatInputActionViewItem.js';
import { PermissionPicker } from '../../../copilotChatSessions/browser/permissionPicker.js';
import { ISessionAgentRef } from '../../../../../services/sessions/common/session.js';
import { setAgentHostAgent } from '../agentHostAgentSelection.js';

/**
 * Action id passed to the workbench `ToggleAgentModeActionId` command when
 * the user picks a mode row. The arg shape is
 * {@link IToggleChatModeArgs}.
 */
type ChatPhonePickerAction =
	| { kind: 'mode'; mode: IChatMode }
	| { kind: 'model'; model: ILanguageModelChatMetadataAndIdentifier }
	| { kind: 'agentHostMode'; value: string }
	| { kind: 'agentHostModel'; model: ILanguageModelChatMetadataAndIdentifier }
	| { kind: 'modelConfig'; model: ILanguageModelChatMetadataAndIdentifier; access: IModelConfigurationAccess; key: string; value: unknown }
	| { kind: 'sessionConfig'; property: string; value: unknown }
	| { kind: 'providerPermissions'; property: string; value: unknown }
	| { kind: 'permission'; action: IAction }
	| { kind: 'agent'; agent: ISessionAgentRef | undefined }
	| { kind: 'chooseModel' };

/** What the combined sheet is built from, so the model sheet can reuse it. */
interface IChatPhoneSheet {
	readonly items: IMobilePickerSheetItem[];
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly currentModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	/** Produces the action that selects a model in this request. */
	readonly selectModelAction: (model: ILanguageModelChatMetadataAndIdentifier) => ChatPhonePickerAction;
}

/** Rows stay a comfortable thumb-list; above this the model sheet gets a search field. */
const MODEL_SHEET_SEARCH_THRESHOLD = 8;

/**
 * Session-config properties that already have a dedicated phone presentation
 * (mode row, permission sheet) or that the phone cannot act on, and so are not
 * rendered as generic rows in the combined sheet.
 */
function isGenericPhoneSessionConfigProperty(property: string, schema: SessionConfigPropertySchema, isNewSession: boolean): boolean {
	if (!isSessionConfigWritable(schema, isNewSession)) {
		return false;
	}
	if (schema.type === 'boolean') {
		return true;
	}
	if (schema.type !== 'string' || !schema.enum?.length) {
		return false;
	}
	if (property === SessionConfigKey.Mode && isWellKnownModeSchema(schema)) {
		return false;
	}
	if ((property === SessionConfigKey.AutoApprove && isWellKnownAutoApproveSchema(schema))
		|| property === SessionConfigKey.Permissions) {
		return false;
	}
	return true;
}

type RegisterChatPhonePickerAction = (action: ChatPhonePickerAction) => string;

function getActionKey(action: ChatPhonePickerAction): string {
	switch (action.kind) {
		case 'mode': return JSON.stringify([action.kind, action.mode.id]);
		case 'agentHostMode': return JSON.stringify([action.kind, action.value]);
		case 'model':
		case 'agentHostModel': return JSON.stringify([action.kind, action.model.identifier]);
		case 'modelConfig': return JSON.stringify([action.kind, action.model.identifier, action.key, action.value]);
		case 'sessionConfig':
		case 'providerPermissions': return JSON.stringify([action.kind, action.property, action.value]);
		case 'permission': return JSON.stringify([action.kind, action.action.id]);
		case 'agent': return JSON.stringify([action.kind, action.agent?.uri]);
		case 'chooseModel': return action.kind;
	}
}

/**
 * Sessions-side implementation of {@link IChatPhoneInputPresenter}.
 *
 * On phone-layout viewports of the agents window, intercepts the
 * workbench {@link ChatInputPart}'s Mode + Model pickers and routes them
 * through the shared {@link showMobilePickerSheet} bottom sheet — the
 * same primitive used by the empty new-chat input (see
 * {@link MobileChatInputConfigPicker}). Workbench code does not depend on
 * the sheet primitive: it only sees the {@link IChatPhoneInputPresenter}
 * decorator interface, so this wiring stays out of the workbench layer.
 */
class ExperimentalMobileChatPhoneInputPresenter extends Disposable implements IChatPhonePresenterImpl {

	readonly enabled: IObservable<boolean>;
	readonly inputEditorMetrics = { fontSize: 16, lineHeight: 24 };
	readonly deferClipboardImageRead = true;
	readonly supportsUnifiedConfiguration = true;
	private readonly _openSheet = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly _commandService: ICommandService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IChatPetService private readonly _chatPetService: IChatPetService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IChatPhoneInputPresenter private readonly _phonePresenter: IChatPhoneInputPresenter,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		// Track the phone-layout context key (`sessionsIsPhoneLayout`) so
		// the workbench toolbar refreshes its action view items the moment
		// we cross the phone breakpoint. This key is the source of truth
		// for "is this viewport phone-classified" — the layout policy
		// updates it through the workbench's main `layout()` pass.
		const isPhoneCtx = observableContextKey<boolean>('sessionsIsPhoneLayout', contextKeyService);
		this.enabled = derived(this, reader => isPhoneCtx.read(reader) === true);
	}

	createActionViewItem(action: IAction, mode: IModePickerDelegate, model: IModelPickerDelegate): ExperimentalMobileChatInputActionViewItem {
		const request: ChatPhoneInputPresenterRequest = {
			kind: 'delegates', modeDelegate: mode, modelDelegate: model,
		};
		return new ExperimentalMobileChatInputActionViewItem(action, mode, model, target => this.showCombinedModeAndModelSheet(target, request), () => this._phonePresenter.registerSessionModelPicker({
			getSessionContext: () => this._getSessionContext(request),
			modelDelegate: model,
			selectModel: identifier => {
				const selected = model.getModels().find(candidate => candidate.identifier === identifier && candidate.metadata.isUserSelectable !== false);
				if (!selected) {
					return false;
				}
				model.setModel(selected);
				return true;
			},
		}));
	}

	async showCombinedModeAndModelSheet(
		anchor: HTMLElement,
		request: ChatPhoneInputPresenterRequest,
	): Promise<void> {
		const sessionContext = this._getSessionContext(request);
		const target = createChatPhoneInputTarget(sessionContext, this._uriIdentityService);
		const store = new DisposableStore();
		this._openSheet.value = store;
		const cancellation = new CancellationTokenSource();
		store.add(toDisposable(() => cancellation.dispose(true)));
		const provider = sessionContext && this._sessionsProvidersService.getProvider(sessionContext.providerId);
		const isCurrent = () => !cancellation.token.isCancellationRequested
			&& matchesChatPhoneInputTarget(target, this._getSessionContext(request), this._uriIdentityService)
			&& (!sessionContext || this._sessionsProvidersService.getProvider(sessionContext.providerId) === provider);
		const configProvider = provider && getSessionConfigProvider(provider);
		const itemsChanged = store.add(new Emitter<void>());
		const permissionStore = store.add(new DisposableStore());
		let permissionPicker: PermissionPicker | undefined;
		let permissionDelegate: AgentHostPermissionPickerDelegate | undefined;
		if (sessionContext && configProvider) {
			store.add(configProvider.onDidChangeSessionConfig(id => {
				if (id === sessionContext.sessionId) {
					itemsChanged.fire();
				}
			}));
			store.add(autorun(reader => {
				configProvider.isSessionConfigResolving(sessionContext.sessionId).read(reader);
				itemsChanged.fire();
			}));
		}
		try {
			const idToAction = new Map<string, ChatPhonePickerAction>();
			const actionIds = new Map<string, string>();
			const registerAction = (action: ChatPhonePickerAction): string => {
				const key = getActionKey(action);
				const id = actionIds.get(key) ?? `chat-phone-picker-row-${actionIds.size}`;
				actionIds.set(key, id);
				idToAction.set(id, action);
				return id;
			};
			const buildSheet = () => {
				idToAction.clear();
				const config = sessionContext && configProvider?.getSessionConfig(sessionContext.sessionId);
				if (sessionContext && getSessionApprovalProperty(config?.schema)) {
					if (!permissionPicker) {
						permissionDelegate = permissionStore.add(this._instantiationService.createInstance(AgentHostPermissionPickerDelegate, constObservable(sessionContext)));
						permissionPicker = permissionStore.add(this._instantiationService.createInstance(PermissionPicker, permissionDelegate));
					}
				} else {
					permissionStore.clear();
					permissionPicker = undefined;
					permissionDelegate = undefined;
				}
				const sheet = this._buildSheet(request, this._getSessionContext(request), registerAction);
				if (sheet && permissionPicker && permissionDelegate) {
					this._pushPermissionItems(sheet.items, permissionPicker, isCurrent, registerAction, !permissionDelegate.isApplicable.get() || permissionDelegate.isResolving.get());
				}
				return sheet;
			};
			let openModelSheet: boolean;
			do {
				openModelSheet = false;
				if (!isCurrent()) {
					return;
				}
				let sheet = buildSheet();
				if (!sheet?.items.length) {
					return;
				}
				const refreshItems = () => {
					if (!isCurrent()) {
						cancellation.cancel();
						return [];
					}
					sheet = buildSheet();
					return sheet?.items ?? [];
				};
				const initialFocusItemId = sheet.items.find(item => {
					const action = idToAction.get(item.id);
					return request.initialSection === 'permissions' ? action?.kind === 'permission' || action?.kind === 'providerPermissions'
						: request.initialSection === 'modelConfiguration' ? action?.kind === 'modelConfig'
							: request.initialSection === 'model' ? action?.kind === 'chooseModel'
								: request.initialSection === 'agent' ? action?.kind === 'agent'
									: action?.kind === 'mode' || action?.kind === 'agentHostMode';
				})?.id;
				await showMobilePickerSheet(this._layoutService.mainContainer, localize('chatPhoneInput.title', "Configure Session"), sheet.items, {
					stayOpenOnSelect: true,
					initialFocusItemId,
					dismissToken: cancellation.token,
					itemProvider: { onDidChange: itemsChanged.event, getItems: refreshItems },
					onDidSelect: async id => {
						if (!isCurrent()) {
							cancellation.cancel();
							return;
						}
						const action = idToAction.get(id);
						if (action?.kind === 'chooseModel') {
							openModelSheet = true;
							return MOBILE_PICKER_SHEET_CONFIRM;
						}
						if (action) {
							try {
								await this._performAction(action, target, request, isCurrent);
							} catch (error) {
								this._notificationService.error(error);
							}
						}
						if (!isCurrent()) {
							cancellation.cancel();
							return;
						}
						return { items: refreshItems(), focusItemId: id };
					},
				});
				if (openModelSheet && isCurrent() && sheet) {
					const chosen = await this._showModelSheet(sheet.models, sheet.currentModel, cancellation);
					if (chosen && isCurrent()) {
						await this._performAction(sheet.selectModelAction(chosen), target, request, isCurrent);
					}
				}
			} while (openModelSheet);
		} finally {
			if (this._openSheet.value === store) {
				this._openSheet.clear();
				if (anchor.isConnected) {
					anchor.focus();
				}
			}
		}
	}

	private _buildSheet(
		request: ChatPhoneInputPresenterRequest,
		session: IChatPhoneInputSessionContext | undefined,
		registerAction: RegisterChatPhonePickerAction,
	): IChatPhoneSheet | undefined {
		const rawProvider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		if (session && rawProvider) {
			return this._buildSessionSheet(session, rawProvider, request, registerAction);
		}
		if (request.kind !== 'delegates') {
			return undefined;
		}
		return this._buildDelegateSheet(request.modeDelegate, request.modelDelegate, registerAction);
	}

	private _buildSessionSheet(
		session: IChatPhoneInputSessionContext,
		provider: ISessionsProvider,
		request: ChatPhoneInputPresenterRequest,
		registerAction: RegisterChatPhonePickerAction,
	): IChatPhoneSheet {
		const items: IMobilePickerSheetItem[] = [];
		const configProvider = getSessionConfigProvider(provider);
		const config = configProvider?.getSessionConfig(session.sessionId);
		const isNewSession = configProvider?.getCreateSessionConfig(session.sessionId) !== undefined;
		const resolving = configProvider?.isSessionConfigResolving(session.sessionId).get() === true;
		if (isAgentHostProvider(provider) && provider.setAgent) {
			const agents = provider.getCustomAgents(session.sessionId);
			const selectedAgent = provider.getSessions().find(candidate => candidate.sessionId === session.sessionId)?.mode.get()?.id;
			if (agents.length) {
				items.push({
					id: registerAction({ kind: 'agent', agent: undefined }),
					label: localize('chatPhoneInput.defaultAgent', "Default Agent"),
					icon: Codicon.agent,
					checked: !selectedAgent || selectedAgent === 'agent',
					disabled: resolving,
					sectionTitle: localize('chatPhoneInput.agentSection', "Agent"),
				});
				for (const agent of agents) {
					items.push({
						id: registerAction({ kind: 'agent', agent: { uri: agent.uri, name: agent.name } }),
						label: agent.name,
						description: agent.description,
						checked: selectedAgent === agent.uri,
						disabled: resolving,
					});
				}
			}
		}
		const modeSchema = config?.schema.properties[SessionConfigKey.Mode];
		const modeItems = (modeSchema && isWellKnownModeSchema(modeSchema))
			? (modeSchema.enum ?? []).map((value, index) => ({
				value: String(value),
				label: modeSchema.enumLabels?.[index] ?? String(value),
				description: modeSchema.enumDescriptions?.[index],
			}))
			: [];
		const rawCurrentMode = config?.values[SessionConfigKey.Mode] ?? modeSchema?.default;
		const currentModeValue = typeof rawCurrentMode === 'string' && modeItems.some(item => item.value === rawCurrentMode)
			? rawCurrentMode
			: modeItems[0]?.value;

		modeItems.forEach((item, index) => items.push({
			id: registerAction({ kind: 'agentHostMode', value: item.value }),
			label: item.label,
			description: item.description,
			icon: getAgentHostModeIcon(item.value),
			checked: item.value === currentModeValue,
			disabled: resolving || !isSessionConfigWritable(modeSchema, isNewSession),
			sectionTitle: index === 0 ? localize('chatPhoneInput.modeSection', "Agent Mode") : undefined,
		}));

		const modelDelegate = this._getModelDelegate(request, session);
		const models = (modelDelegate?.getModels() ?? provider.getModelsSnapshot(session.sessionId).models).filter(model => model.metadata.isUserSelectable !== false);
		const composerModel = modelDelegate?.currentModel.get();
		const currentModel = (composerModel && (models.find(model => model.identifier === composerModel.identifier) ?? composerModel))
			?? models.find(model => model.identifier === session.modelId);
		const options = normalizeModelPickerOptions(provider.getModelPickerOptions(session.sessionId));
		this._pushModelRow(items, models, currentModel, options.showAutoModel, registerAction);

		const configAccess = modelDelegate?.modelConfiguration ?? (isAgentHostProvider(provider) ? provider.getAutomationModelConfiguration?.(session.sessionId) : undefined) ?? this._languageModelsService;
		if (currentModel) {
			this._pushModelConfigItems(items, currentModel, configAccess, registerAction);
			this._pushSpeedItems(items, models, currentModel, registerAction);
		}

		// Remaining session settings the agent exposes (e.g. isolation, sandbox,
		// network access). Each enum becomes a radio section; a boolean becomes
		// an On/Off radio section, so the row the user taps carries the value it
		// sets and the check always reflects the current state.
		if (config) {
			for (const [property, schema] of Object.entries(config.schema.properties)) {
				if (!isGenericPhoneSessionConfigProperty(property, schema, isNewSession) || property === getSessionApprovalProperty(config.schema)?.key || property === SessionConfigKey.SandboxEnabled) {
					continue;
				}
				const current = config.values[property] ?? schema.default;
				if (schema.type === 'boolean') {
					[true, false].forEach((value, index) => items.push({
						id: registerAction({ kind: 'sessionConfig', property, value }),
						label: value ? localize('chatPhoneInput.on', "On") : localize('chatPhoneInput.off', "Off"),
						description: index === 0 ? schema.description : undefined,
						checked: current === value,
						disabled: resolving,
						sectionTitle: index === 0 ? schema.title : undefined,
					}));
					continue;
				}
				const permissions = property === ClaudeSessionConfigKey.PermissionMode && isWellKnownClaudePermissionModeSchema(schema)
					|| property === CodexSessionConfigKey.PermissionsPreset && isWellKnownCodexApprovalsSchema(schema);
				(schema.enum ?? []).forEach((value, index) => items.push({
					id: registerAction({ kind: permissions ? 'providerPermissions' : 'sessionConfig', property, value }),
					label: schema.enumLabels?.[index] ?? String(value),
					description: schema.enumDescriptions?.[index],
					checked: value === current,
					disabled: resolving,
					sectionTitle: index === 0 ? permissions ? localize('chatPhoneInput.permissionsSection', "Approvals") : schema.title : undefined,
				}));
			}
		}
		return { items, models, currentModel, selectModelAction: model => ({ kind: 'agentHostModel', model }) };
	}

	private _pushPermissionItems(
		items: IMobilePickerSheetItem[],
		picker: PermissionPicker,
		isCurrent: () => boolean,
		registerAction: RegisterChatPhonePickerAction,
		disabled: boolean,
	): void {
		let sectionTitle: string | undefined = localize('chatPhoneInput.permissionsSection', "Approvals");
		for (const item of picker.getActionListItems(isCurrent)) {
			if (item.kind !== ActionListItemKind.Action || !item.item) {
				continue;
			}
			const toggle = item.standaloneToggle;
			if (toggle) {
				for (const [index, checked] of [true, false].entries()) {
					items.push({
						id: registerAction({
							kind: 'permission', action: toAction({
								id: `${item.item.id}.${checked}`,
								label: item.item.label,
								run: async () => {
									if (isCurrent() && !toggle.disabled) {
										await toggle.onChange(checked);
									}
								},
							})
						}),
						label: checked ? localize('chatPhoneInput.on', "On") : localize('chatPhoneInput.off', "Off"),
						checked: toggle.checked === checked,
						disabled: disabled || toggle.disabled,
						sectionTitle: index === 0 ? toggle.label : undefined,
					});
				}
				sectionTitle = '';
				continue;
			}
			items.push({
				id: registerAction({ kind: 'permission', action: item.item }),
				label: item.label ?? item.item.label,
				description: item.detail,
				badge: item.badge,
				icon: item.group?.icon,
				checked: item.item.checked,
				disabled: disabled || item.disabled,
				sectionTitle: item.item.checked === undefined ? '' : sectionTitle,
			});
			sectionTitle = undefined;
		}
	}

	private _pushSpeedItems(items: IMobilePickerSheetItem[], models: readonly ILanguageModelChatMetadataAndIdentifier[], currentModel: ILanguageModelChatMetadataAndIdentifier, registerAction: RegisterChatPhonePickerAction): void {
		const variants = buildSpeedVariants(models).get(currentModel.identifier);
		if (variants) {
			[variants.standard, variants.fast].forEach((model, index) => items.push({
				id: registerAction({ kind: 'agentHostModel', model }),
				label: index === 0 ? localize('chatPhoneInput.standardSpeed', "Standard") : localize('chatPhoneInput.fastSpeed', "Fast"),
				checked: model.identifier === currentModel.identifier,
				sectionTitle: index === 0 ? localize('chatPhoneInput.speedSection', "Speed") : undefined,
				icon: index === 1 ? Codicon.zap : undefined,
			}));
		}
	}

	private _buildDelegateSheet(
		modeDelegate: IModePickerDelegate,
		modelDelegate: IModelPickerDelegate,
		registerAction: RegisterChatPhonePickerAction,
	): IChatPhoneSheet {
		const items: IMobilePickerSheetItem[] = [];
		const modes = modeDelegate.currentChatModes.get();
		const currentMode = modeDelegate.currentMode.get();
		[...modes.builtin, ...modes.custom].forEach((mode, index) => {
			const icon = mode.icon.get();
			items.push({
				id: registerAction({ kind: 'mode', mode }),
				label: mode.label.get(),
				icon: ThemeIcon.isThemeIcon(icon) ? icon : undefined,
				checked: mode.id === currentMode.id,
				sectionTitle: index === 0 ? localize('chatPhoneInput.modeSection', "Agent Mode") : undefined,
			});
		});

		const models = modelDelegate.getModels().filter(model => model.metadata.isUserSelectable !== false);
		const currentModel = modelDelegate.currentModel.get();
		this._pushModelRow(items, models, currentModel, true, registerAction);
		if (currentModel) {
			this._pushModelConfigItems(items, currentModel, modelDelegate.modelConfiguration ?? this._languageModelsService, registerAction);
			this._pushSpeedItems(items, models, currentModel, registerAction);
		}
		return { items, models, currentModel, selectModelAction: model => ({ kind: 'model', model }) };
	}

	/**
	 * One row summarizing the model in use. Tapping it opens the model sheet
	 * (see {@link _showModelSheet}) rather than listing every model inline.
	 */
	private _pushModelRow(
		items: IMobilePickerSheetItem[],
		models: readonly ILanguageModelChatMetadataAndIdentifier[],
		currentModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		showAutoModel: boolean,
		registerAction: RegisterChatPhonePickerAction,
	): void {
		const sectionTitle = localize('chatPhoneInput.modelSection', "Model");
		if (models.length === 0 && !showAutoModel) {
			items.push({
				id: 'chat-phone-picker-no-models',
				label: localize('chatPhoneInput.noModels', "No models available"),
				disabled: true,
				sectionTitle,
			});
			return;
		}
		items.push({
			id: registerAction({ kind: 'chooseModel' }),
			label: currentModel?.metadata.name ?? localize('chatPhoneInput.autoModel', "Auto"),
			description: models.length > 1
				? localize('chatPhoneInput.modelRowDescription', "{0} models available", models.length)
				: undefined,
			icon: currentModel ? getModelProviderIcon(currentModel) : undefined,
			navigates: true,
			disabled: models.length === 0,
			sectionTitle,
		});
	}

	/** The model sheet: every model as a radio row, searchable once the list is long. */
	private async _showModelSheet(
		models: readonly ILanguageModelChatMetadataAndIdentifier[],
		currentModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		cancellation: CancellationTokenSource,
	): Promise<ILanguageModelChatMetadataAndIdentifier | undefined> {
		const byId = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
		const toItem = (model: ILanguageModelChatMetadataAndIdentifier, index: number): IMobilePickerSheetItem => {
			const id = `chat-phone-model-${index}`;
			byId.set(id, model);
			return {
				id,
				label: model.metadata.name,
				icon: getModelProviderIcon(model),
				checked: model.identifier === currentModel?.identifier,
			};
		};
		const items = models.map(toItem);
		// With a search field the sheet renders the static rows and the results
		// of the current query together, so the search source owns the whole
		// list: every model for an empty query, a filtered set while typing.
		const searchable = models.length > MODEL_SHEET_SEARCH_THRESHOLD;
		const pickedId = await showMobilePickerSheet(
			this._layoutService.mainContainer,
			localize('chatPhoneInput.modelSheetTitle', "Model"),
			searchable ? [] : items,
			{
				dismissToken: cancellation.token,
				doneLabel: localize('chatPhoneInput.cancel', "Cancel"),
				search: searchable
					? {
						placeholder: localize('chatPhoneInput.searchModels', "Search models"),
						loadItems: async query => {
							const needle = query.trim().toLowerCase();
							return needle ? items.filter(item => item.label.toLowerCase().includes(needle)) : items;
						},
					}
					: undefined,
			},
		);
		return pickedId ? byId.get(pickedId) : undefined;
	}

	private _pushModelConfigItems(
		items: IMobilePickerSheetItem[],
		model: ILanguageModelChatMetadataAndIdentifier,
		access: IModelConfigurationAccess,
		registerAction: RegisterChatPhonePickerAction,
	): void {
		const groups: [string, string][] = [
			[MODEL_CONFIG_GROUP_EFFORT, localize('chatPhoneInput.thinkingSection', "Thinking")],
			[MODEL_CONFIG_GROUP_CONTEXT, localize('chatPhoneInput.contextSection', "Context")],
		];
		const properties: IModelConfigProperty[] = [];
		for (const [group] of groups) {
			const property = getModelConfigProperty(model, access, group);
			if (property) {
				properties.push(property);
			}
		}
		const schema = access.getModelConfigurationSchema?.(model.identifier) ?? model.metadata.configurationSchema;
		const values = access.getModelConfiguration(model.identifier);
		for (const [key, propertySchema] of Object.entries(schema?.properties ?? {})) {
			if (!properties.some(property => property.key === key) && (propertySchema.enum?.length || propertySchema.type === 'boolean')) {
				properties.push({
					key,
					schema: propertySchema.type === 'boolean' && !propertySchema.enum
						? { ...propertySchema, enum: [true, false], enumItemLabels: [localize('chatPhoneInput.on', "On"), localize('chatPhoneInput.off', "Off")] }
						: propertySchema,
					value: values && Object.hasOwn(values, key) ? values[key] : propertySchema.default,
				});
			}
		}
		for (const property of properties) {
			const title = property.schema.title ?? groups.find(([group]) => group === property.schema.group)?.[1] ?? property.key;
			getModelConfigChoices(property).forEach((choice, index) => items.push({
				id: registerAction({ kind: 'modelConfig', model, access, key: property.key, value: choice.value }),
				label: choice.label,
				description: choice.description,
				checked: choice.checked,
				disabled: choice.readOnly,
				sectionTitle: index === 0 ? title : undefined,
			}));
		}
	}

	private async _performAction(
		action: ChatPhonePickerAction,
		target: IChatPhoneInputTarget | undefined,
		request: ChatPhoneInputPresenterRequest,
		isCurrent: () => boolean,
	): Promise<void> {
		const session = this._getSessionContext(request);
		if (!matchesChatPhoneInputTarget(target, session, this._uriIdentityService)) {
			return;
		}
		const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		const configProvider = provider && getSessionConfigProvider(provider);

		switch (action.kind) {
			case 'mode':
				if (request.kind === 'delegates') {
					await this._commandService.executeCommand(
						ToggleAgentModeActionId,
						{ modeId: action.mode.id, sessionResource: request.modeDelegate.sessionResource() } satisfies IToggleChatModeArgs,
					);
				}
				break;
			case 'agentHostMode':
				if (session && configProvider && !configProvider.isSessionConfigResolving(session.sessionId).get()) {
					const config = configProvider.getSessionConfig(session.sessionId);
					const schema = config?.schema.properties[SessionConfigKey.Mode];
					if (isSessionConfigWritable(schema, configProvider.getCreateSessionConfig(session.sessionId) !== undefined) && schema && isWellKnownModeValue(schema, action.value)) {
						const previousMode = String(config?.values[SessionConfigKey.Mode] ?? schema.default ?? '');
						const operation = configProvider.setSessionConfigValue(session.sessionId, SessionConfigKey.Mode, action.value);
						configProvider.trackSessionConfigOperation?.(session.sessionId, operation);
						await operation;
						if (didExplicitlyEnableChatPetAutopilot(previousMode, action.value)) {
							this._chatPetService.unlockAchievement(ChatPetAchievementIds.AutopilotEnabled);
						}
					}
				}
				break;
			case 'model':
			case 'agentHostModel': {
				const modelDelegate = this._getModelDelegate(request, session);
				if (modelDelegate) {
					const model = modelDelegate.getModels().find(model => model.identifier === action.model.identifier && model.metadata.isUserSelectable !== false);
					if (model) {
						modelDelegate.setModel(model);
					}
				} else if (session) {
					const picker = this._phonePresenter.getSessionModelPicker(session);
					const selected = picker ? picker.selectModel(action.model.identifier)
						: request.kind === 'session' && request.selectModel ? request.selectModel(action.model.identifier)
							: this._chatWidgetService.getWidgetBySessionResource(session.chatResource)?.inputPart?.switchModelByIdentifier(action.model.identifier, true, true);
					if (!selected) {
						throw new Error(localize('chatPhoneInput.modelUnavailable', "This model is no longer available for this session."));
					}
				}
				break;
			}
			case 'modelConfig': {
				const currentModelId = this._getModelDelegate(request, session)?.currentModel.get()?.identifier ?? session?.modelId;
				const property = (action.access.getModelConfigurationSchema?.(action.model.identifier) ?? action.model.metadata.configurationSchema)?.properties?.[action.key];
				if (currentModelId === action.model.identifier && property && !property.readOnly && (!property.enum || property.enum.includes(action.value))) {
					await setModelConfigValues(action.model, action.access, { [action.key]: action.value });
				}
				break;
			}
			case 'sessionConfig':
			case 'providerPermissions':
				if (session && configProvider && !configProvider.isSessionConfigResolving(session.sessionId).get()) {
					const config = configProvider.getSessionConfig(session.sessionId);
					const isNewSession = configProvider.getCreateSessionConfig(session.sessionId) !== undefined;
					if (config && isSessionConfigWritable(config.schema.properties[action.property], isNewSession)) {
						validateSessionConfigWrite(config.schema, config.values, action.property, action.value, isNewSession);
						const operation = configProvider.setSessionConfigValue(session.sessionId, action.property, action.value);
						configProvider.trackSessionConfigOperation?.(session.sessionId, operation);
						await operation;
					}
				}
				break;
			case 'permission':
				if (isCurrent() && action.action.enabled) {
					await action.action.run();
				}
				break;
			case 'agent':
				if (session && provider && isAgentHostProvider(provider) && provider.setAgent && !provider.isSessionConfigResolving(session.sessionId).get()) {
					const currentSession = provider.getSessions().find(candidate => candidate.sessionId === session.sessionId);
					if (currentSession && (!action.agent || provider.getCustomAgents(session.sessionId).some(agent => agent.uri === action.agent?.uri))) {
						setAgentHostAgent(currentSession, provider, action.agent, this._storageService);
					}
				}
				break;
			case 'chooseModel':
				// Handled by the sheet loop, which opens the model sheet.
				break;
		}
	}

	private _getModelDelegate(request: ChatPhoneInputPresenterRequest, session: IChatPhoneInputSessionContext | undefined): IModelPickerDelegate | undefined {
		return request.modelDelegate ?? (session && this._phonePresenter.getSessionModelPicker(session)?.modelDelegate);
	}

	private _getSessionContext(request: ChatPhoneInputPresenterRequest): IChatPhoneInputSessionContext | undefined {
		if (request.kind === 'session') {
			return request.getSessionContext();
		}
		const resource = request.modeDelegate.sessionResource();
		return resource ? createChatPhoneInputSessionContext(this._sessionsService.visibleSessions.get().find(session =>
			session && this._uriIdentityService.extUri.isEqual(session.activeChat.get().resource, resource),
		)) : undefined;
	}
}

export class ExperimentalMobileChatPhoneInputPresenterContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.experimentalMobileChatPhoneInputPresenter';

	private readonly _registration = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@IChatPhoneInputPresenter presenter: IChatPhoneInputPresenter,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const impl = this._register(instantiationService.createInstance(ExperimentalMobileChatPhoneInputPresenter));

		// Keep the registration mounted for the lifetime of the
		// contribution. The workbench presenter's `enabled` observable
		// already gates the actual sheet path on phone layout, so no
		// dynamic mount/unmount is needed here.
		this._registration.value = presenter.setImpl(impl);
	}
}

registerWorkbenchContribution2(
	ExperimentalMobileChatPhoneInputPresenterContribution.ID,
	ExperimentalMobileChatPhoneInputPresenterContribution,
	WorkbenchPhase.BlockRestore,
);
