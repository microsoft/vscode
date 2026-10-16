/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { derived, IObservable } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { CopilotImageGenerationEnabledSettingId } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { isSessionConfigWritable } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { observableContextKey } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../../workbench/common/contributions.js';
import { IToggleChatModeArgs, ToggleAgentModeActionId } from '../../../../../../workbench/contrib/chat/browser/actions/chatExecuteActions.js';
import { ChatPetAchievementIds, didExplicitlyEnableChatPetAutopilot } from '../../../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { IChatPetService } from '../../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { ChatPhoneInputPresenterRequest, IChatPhoneInputPresenter, IChatPhoneInputSessionContext, IChatPhonePresenterImpl } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { IModePickerDelegate } from '../../../../../../workbench/contrib/chat/browser/widget/input/modePickerActionItem.js';
import { IImageGenerationPickerAccess, IModelPickerDelegate } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { buildModelPickerDestinations, MODEL_PICKER_IMAGES_DESTINATION } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerTabs.js';
import { getImageModelOperationsLabel, renderImageModelDetails } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerDetails.js';
import '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/media/modelPicker.css';
import { getModelProviderIcon } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelProviderIcons.js';
import { IChatMode } from '../../../../../../workbench/contrib/chat/common/chatModes.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { IWorkbenchLayoutService } from '../../../../../../workbench/services/layout/browser/layoutService.js';
import { getSessionConfigProvider, type IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { showMobileContentSheet, showMobilePickerSheet, IMobilePickerSheetItem, MOBILE_PICKER_SHEET_CONFIRM } from '../../../../../browser/parts/mobile/mobilePickerSheet.js';
import { getAgentHostModeIcon } from '../agentHostModeIcon.js';
import { isWellKnownModeSchema, isWellKnownModeValue } from '../agentHostPermissionPickerDelegate.js';
import { normalizeModelPickerOptions } from '../../../../chat/browser/sessionModelPickerState.js';
import { createChatPhoneInputSessionContext, createChatPhoneInputTarget, IChatPhoneInputTarget, matchesChatPhoneInputTarget } from './mobileChatPhoneInputTarget.js';

/**
 * Action id passed to the workbench `ToggleAgentModeActionId` command when
 * the user picks a mode row. The arg shape is
 * {@link IToggleChatModeArgs}.
 */
type ChatPhonePickerAction =
	| { kind: 'images' }
	| { kind: 'mode'; mode: IChatMode }
	| { kind: 'model'; model: ILanguageModelChatMetadataAndIdentifier }
	| { kind: 'agentHostMode'; value: string }
	| { kind: 'agentHostModel'; model: ILanguageModelChatMetadataAndIdentifier };

type RegisterChatPhonePickerAction = (action: ChatPhonePickerAction) => string;

interface IPhoneImageContext {
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly access?: IImageGenerationPickerAccess;
	readonly onDidChange: Event<void>;
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
export class MobileChatPhoneInputPresenter extends Disposable implements IChatPhonePresenterImpl {

	readonly enabled: IObservable<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly _commandService: ICommandService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IChatPetService private readonly _chatPetService: IChatPetService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
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

	async showCombinedModeAndModelSheet(
		_target: HTMLElement,
		request: ChatPhoneInputPresenterRequest,
	): Promise<void> {
		// Side table from opaque sheet-row id back to the action it
		// represents. Mirrors {@link MobileChatInputConfigPicker} so
		// values containing `:` or other separator-unsafe characters
		// (e.g. model identifiers like `copilot:gpt-4o`) round-trip
		// safely through the sheet's string id contract.
		const idToAction = new Map<string, ChatPhonePickerAction>();
		const registerAction = (action: ChatPhonePickerAction): string => {
			const id = `chat-phone-picker-row-${idToAction.size}`;
			idToAction.set(id, action);
			return id;
		};

		const sessionContext = this._getSessionContext(request);
		const target = createChatPhoneInputTarget(sessionContext, this._uriIdentityService);
		const inputResource = request.kind === 'delegates' ? request.modeDelegate.sessionResource() : undefined;
		const ownsImageInput = () => !this._store.isDisposed && (request.kind === 'delegates'
			? this._uriIdentityService.extUri.isEqual(inputResource, request.modeDelegate.sessionResource())
			: matchesChatPhoneInputTarget(target, this._getSessionContext(request), this._uriIdentityService));
		const rawProvider = sessionContext ? this._sessionsProvidersService.getProvider(sessionContext.providerId) : undefined;
		const agentHostProvider = rawProvider && isAgentHostProvider(rawProvider) ? rawProvider : undefined;
		let sheetItems: IMobilePickerSheetItem[];
		if (sessionContext && agentHostProvider) {
			sheetItems = this._buildAgentHostSheetItems(sessionContext, agentHostProvider, registerAction);
		} else {
			sheetItems = request.kind === 'delegates'
				? this._buildDelegateSheetItems(request.modeDelegate, request.modelDelegate, registerAction)
				: [];
		}
		const imageContext = this._readImageContext(request);
		if (this._configurationService.getValue<boolean>(CopilotImageGenerationEnabledSettingId) === true
			&& (imageContext?.access?.getState() || imageContext?.models.some(model => model.metadata.imageModels !== undefined))) {
			sheetItems.push({
				id: registerAction({ kind: 'images' }),
				label: localize('chatPhoneInput.images', "Images"),
				icon: Codicon.fileMedia,
				navigates: true,
				sectionTitle: '',
			});
		}

		if (sheetItems.length === 0) {
			return;
		}

		// Use `stayOpenOnSelect` so tapping a row applies the choice but
		// keeps the sheet visible until the user explicitly hits Done
		// (or the backdrop / Escape). This matches the multi-property
		// sheets in the agents window where users adjust several values
		// in one session.
		const selected = await showMobilePickerSheet(
			this._layoutService.mainContainer,
			localize('chatPhoneInput.title', "Configure Session"),
			sheetItems,
			{
				stayOpenOnSelect: true,
				onDidSelect: id => {
					const action = idToAction.get(id);
					if (action?.kind === 'images') {
						return MOBILE_PICKER_SHEET_CONFIRM;
					}
					if (action) {
						this._performAction(action, target, request);
					}
					return undefined;
				},
			},
		);
		if (selected && idToAction.get(selected)?.kind === 'images') {
			await this._showImages(request, ownsImageInput);
		}
	}

	private _readImageContext(request: ChatPhoneInputPresenterRequest): IPhoneImageContext | undefined {
		if (request.kind === 'delegates') {
			const access = request.modelDelegate.imageGeneration;
			return { models: request.modelDelegate.getModels(), access, onDidChange: access?.onDidChange ?? Event.None };
		}
		const session = request.getSessionContext();
		const provider = session && this._sessionsProvidersService.getProvider(session.providerId);
		if (!session || !provider) {
			return undefined;
		}
		const configProvider = getSessionConfigProvider(provider);
		const access: IImageGenerationPickerAccess | undefined = configProvider ? {
			onDidChange: Event.any(
				Event.map(Event.filter(configProvider.onDidChangeSessionConfig, id => id === session.sessionId), () => undefined),
				Event.fromObservableLight(configProvider.isSessionConfigResolving(session.sessionId, session.chatResource)),
			),
			getState: () => {
				const config = configProvider.getSessionConfig(session.sessionId, session.chatResource);
				const schema = config?.schema.properties[SessionConfigKey.ImageGenerationEnabled];
				const value = config?.values[SessionConfigKey.ImageGenerationEnabled] ?? schema?.default;
				return schema?.type === 'boolean' && typeof value === 'boolean' ? {
					enabled: value,
					readOnly: !isSessionConfigWritable(schema, configProvider.getCreateSessionConfig(session.sessionId) !== undefined)
						|| configProvider.isSessionConfigResolving(session.sessionId, session.chatResource).get(),
				} : undefined;
			},
			setEnabled: enabled => configProvider.setSessionConfigValue(session.sessionId, session.chatResource, SessionConfigKey.ImageGenerationEnabled, enabled),
		} : undefined;
		return {
			models: provider.getModelsSnapshot(session.sessionId).models,
			access,
			onDidChange: Event.any(provider.onDidChangeModels, access?.onDidChange ?? Event.None),
		};
	}

	private async _showImages(request: ChatPhoneInputPresenterRequest, ownsInput: () => boolean): Promise<void> {
		while (ownsInput() && this._configurationService.getValue<boolean>(CopilotImageGenerationEnabledSettingId) === true) {
			const context = this._readImageContext(request);
			if (!context) {
				return;
			}
			const state = context.access?.getState();
			const images = buildModelPickerDestinations(context.models, this._languageModelsService)
				.find(destination => destination.id === MODEL_PICKER_IMAGES_DESTINATION)?.imageModels ?? [];
			const enabled = state?.enabled === true && images.some(image => image.model.availability !== 'unavailable');
			type ImageAction = { kind: 'off' } | { kind: 'enable' | 'details'; identifier: string };
			const actions = new Map<string, ImageAction>();
			const register = (action: ImageAction) => {
				const id = `image-choice-${actions.size}`;
				actions.set(id, action);
				return id;
			};
			const items: IMobilePickerSheetItem[] = state ? [{
				id: register({ kind: 'off' }), label: localize('chatPhoneInput.images.off', "Off"),
				description: localize('chatPhoneInput.images.offDescription', "The image generation tool won't be called."),
				checked: !enabled, disabled: state.readOnly,
			}] : [];
			for (const image of images) {
				const unavailable = image.model.availability === 'unavailable';
				items.push({
					id: register({ kind: 'enable', identifier: image.identifier }),
					label: image.model.name,
					badge: unavailable ? localize('chatPhoneInput.images.unavailable', "Not Available") : localize('chatPhoneInput.images.preview', "Preview"),
					description: unavailable ? undefined : getImageModelOperationsLabel(image.model),
					checked: state?.enabled === true && !unavailable,
					disabled: !state || state.readOnly || unavailable,
				}, {
					id: register({ kind: 'details', identifier: image.identifier }),
					label: localize('chatPhoneInput.images.details', "{0} Details", image.model.name),
					navigates: true,
				});
			}
			if (!images.length) {
				items.push({ id: 'image-catalog-unavailable', label: localize('chatPhoneInput.images.catalogUnavailable', "Image model information is currently unavailable."), disabled: true });
			}
			const listeners = new DisposableStore();
			const cancellation = listeners.add(new CancellationTokenSource());
			let refresh = false;
			listeners.add(Event.any(context.onDidChange, Event.map(this._languageModelsService.onDidChangeLanguageModels, () => undefined), Event.map(this._sessionsProvidersService.onDidChangeProviders, () => undefined),
				Event.map(Event.filter(this._configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(CopilotImageGenerationEnabledSettingId)), () => undefined))(() => {
					refresh = true;
					cancellation.cancel();
				}));
			let selected: string | undefined;
			try {
				selected = await showMobilePickerSheet(this._layoutService.mainContainer, localize('chatPhoneInput.images', "Images"), items, { cancellationToken: cancellation.token });
			} finally {
				listeners.dispose();
			}
			if (!ownsInput() || this._configurationService.getValue<boolean>(CopilotImageGenerationEnabledSettingId) !== true) {
				return;
			}
			if (refresh) {
				continue;
			}
			const action = selected && actions.get(selected);
			if (!action) {
				return;
			}
			const current = this._readImageContext(request);
			const currentState = current?.access?.getState();
			if (action.kind === 'off') {
				if (current?.access && currentState && !currentState.readOnly) {
					await current.access.setEnabled(false);
					return;
				}
				continue;
			}
			const image = buildModelPickerDestinations(current?.models ?? [], this._languageModelsService)
				.find(destination => destination.id === MODEL_PICKER_IMAGES_DESTINATION)?.imageModels?.find(image => image.identifier === action.identifier);
			if (!image) {
				continue;
			}
			if (action.kind === 'details') {
				await showMobileContentSheet(this._layoutService.mainContainer, image.model.name, body => {
					const details = renderImageModelDetails(image.model, image.providerLabel);
					body.classList.add('chat-model-card');
					body.append(details.header, details.content);
					return details;
				}, { doneLabel: localize('chatPhoneInput.images.back', "Back"), trapFocus: true });
			} else if (current?.access && currentState && !currentState.readOnly && image.model.availability !== 'unavailable') {
				await current.access.setEnabled(true);
				return;
			}
		}
	}

	private _buildAgentHostSheetItems(
		session: IChatPhoneInputSessionContext,
		provider: IAgentHostSessionsProvider,
		registerAction: RegisterChatPhonePickerAction,
	): IMobilePickerSheetItem[] {
		const items: IMobilePickerSheetItem[] = [];
		const config = provider.getSessionConfig(session.sessionId, session.chatResource);
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
			sectionTitle: index === 0 ? localize('chatPhoneInput.modeSection', "Agent Mode") : undefined,
		}));

		const models = provider.getModelsSnapshot(session.sessionId).models;
		const currentModelId = session.modelId;
		models.forEach((model, index) => items.push({
			id: registerAction({ kind: 'agentHostModel', model }),
			label: model.metadata.name,
			icon: getModelProviderIcon(model),
			checked: model.identifier === currentModelId,
			sectionTitle: index === 0 ? localize('chatPhoneInput.modelSection', "Model") : undefined,
		}));

		const options = normalizeModelPickerOptions(provider.getModelPickerOptions(session.sessionId));
		if (models.length === 0 && !options.showAutoModel) {
			items.push({
				id: 'chat-phone-picker-no-models',
				label: localize('chatPhoneInput.noModels', "No models available"),
				disabled: true,
				sectionTitle: localize('chatPhoneInput.modelSection', "Model"),
			});
		}
		return items;
	}

	private _buildDelegateSheetItems(
		modeDelegate: IModePickerDelegate,
		modelDelegate: IModelPickerDelegate,
		registerAction: RegisterChatPhonePickerAction,
	): IMobilePickerSheetItem[] {
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

		const currentModel = modelDelegate.currentModel.get();
		modelDelegate.getModels().forEach((model, index) => items.push({
			id: registerAction({ kind: 'model', model }),
			label: model.metadata.name,
			icon: getModelProviderIcon(model),
			checked: model.identifier === currentModel?.identifier,
			sectionTitle: index === 0 ? localize('chatPhoneInput.modelSection', "Model") : undefined,
		}));
		return items;
	}

	private _performAction(
		action: ChatPhonePickerAction,
		target: IChatPhoneInputTarget | undefined,
		request: ChatPhoneInputPresenterRequest,
	): void {
		const session = this._getSessionContext(request);
		if (!matchesChatPhoneInputTarget(target, session, this._uriIdentityService)) {
			return;
		}
		const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		const agentHostProvider = provider && isAgentHostProvider(provider) ? provider : undefined;

		switch (action.kind) {
			case 'mode':
				if (request.kind === 'delegates') {
					this._commandService.executeCommand(
						ToggleAgentModeActionId,
						{ modeId: action.mode.id, sessionResource: request.modeDelegate.sessionResource() } satisfies IToggleChatModeArgs,
					).catch(() => { });
				}
				break;
			case 'model':
				if (request.kind === 'delegates') {
					request.modelDelegate.setModel(action.model);
				}
				break;
			case 'agentHostMode':
				if (session && agentHostProvider) {
					const config = agentHostProvider.getSessionConfig(session.sessionId, session.chatResource);
					const schema = config?.schema.properties[SessionConfigKey.Mode];
					if (schema && isWellKnownModeValue(schema, action.value)) {
						const previousMode = String(config?.values[SessionConfigKey.Mode] ?? schema.default ?? '');
						agentHostProvider.setSessionConfigValue(session.sessionId, session.chatResource, SessionConfigKey.Mode, action.value)
							.then(() => {
								if (didExplicitlyEnableChatPetAutopilot(previousMode, action.value)) {
									this._chatPetService.unlockAchievement(ChatPetAchievementIds.AutopilotEnabled);
								}
							})
							.catch(() => { });
					}
				}
				break;
			case 'agentHostModel':
				if (session && agentHostProvider) {
					if (request.kind === 'delegates') {
						request.modelDelegate.setModel(action.model);
					} else {
						request.selectModel(action.model.identifier);
					}
				}
				break;
		}
	}

	private _getSessionContext(request: ChatPhoneInputPresenterRequest): IChatPhoneInputSessionContext | undefined {
		return request.kind === 'session'
			? request.getSessionContext()
			: createChatPhoneInputSessionContext(this._sessionsService.activeSession.get());
	}
}

class MobileChatPhoneInputPresenterContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.mobileChatPhoneInputPresenter';

	private readonly _registration = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@IChatPhoneInputPresenter presenter: IChatPhoneInputPresenter,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const impl = this._register(instantiationService.createInstance(MobileChatPhoneInputPresenter));

		// Keep the registration mounted for the lifetime of the
		// contribution. The workbench presenter's `enabled` observable
		// already gates the actual sheet path on phone layout, so no
		// dynamic mount/unmount is needed here.
		this._registration.value = presenter.setImpl(impl);
	}
}

registerWorkbenchContribution2(
	MobileChatPhoneInputPresenterContribution.ID,
	MobileChatPhoneInputPresenterContribution,
	WorkbenchPhase.AfterRestored,
);
