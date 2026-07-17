/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { observableContextKey } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../../workbench/common/contributions.js';
import { IToggleChatModeArgs, ToggleAgentModeActionId } from '../../../../../../workbench/contrib/chat/browser/actions/chatExecuteActions.js';
import { ChatPhoneInputPresenterRequest, IChatPhoneInputPresenter, IChatPhoneInputSessionContext, IChatPhonePresenterImpl } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { IModePickerDelegate } from '../../../../../../workbench/contrib/chat/browser/widget/input/modePickerActionItem.js';
import { IModelPickerDelegate } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { getModelProviderIcon } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelProviderIcons.js';
import { IChatMode } from '../../../../../../workbench/contrib/chat/common/chatModes.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { IWorkbenchLayoutService } from '../../../../../../workbench/services/layout/browser/layoutService.js';
import { type IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { showMobilePickerSheet, IMobilePickerSheetItem } from '../../../../../browser/parts/mobile/mobilePickerSheet.js';
import { getAgentHostModeIcon } from '../agentHostModeIcon.js';
import { isWellKnownModeSchema, isWellKnownModeValue } from '../agentHostPermissionPickerDelegate.js';
import { normalizeModelPickerOptions, selectAvailableSessionModel } from '../../../../chat/browser/modelPickerSelection.js';
import { createChatPhoneInputSessionContext, createChatPhoneInputTarget, IChatPhoneInputTarget, matchesChatPhoneInputTarget } from './mobileChatPhoneInputTarget.js';

/**
 * Action id passed to the workbench `ToggleAgentModeActionId` command when
 * the user picks a mode row. The arg shape is
 * {@link IToggleChatModeArgs}.
 */
type ChatPhonePickerAction =
	| { kind: 'mode'; mode: IChatMode }
	| { kind: 'model'; model: ILanguageModelChatMetadataAndIdentifier }
	| { kind: 'agentHostMode'; value: string }
	| { kind: 'agentHostModel'; model: ILanguageModelChatMetadataAndIdentifier };

type RegisterChatPhonePickerAction = (action: ChatPhonePickerAction) => string;

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
class MobileChatPhoneInputPresenter extends Disposable implements IChatPhonePresenterImpl {

	readonly enabled: IObservable<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly _commandService: ICommandService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly _storageService: IStorageService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
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
		const rawProvider = sessionContext ? this._sessionsProvidersService.getProvider(sessionContext.providerId) : undefined;
		const agentHostProvider = rawProvider && isAgentHostProvider(rawProvider) ? rawProvider : undefined;
		let sheetItems: IMobilePickerSheetItem[];
		if (sessionContext && agentHostProvider) {
			sheetItems = this._buildAgentHostSheetItems(sessionContext, agentHostProvider, registerAction);
		} else {
			if (request.kind !== 'delegates') {
				return;
			}
			sheetItems = this._buildDelegateSheetItems(request.modeDelegate, request.modelDelegate, registerAction);
		}

		if (sheetItems.length === 0) {
			return;
		}

		// Use `stayOpenOnSelect` so tapping a row applies the choice but
		// keeps the sheet visible until the user explicitly hits Done
		// (or the backdrop / Escape). This matches the multi-property
		// sheets in the agents window where users adjust several values
		// in one session.
		await showMobilePickerSheet(
			this._layoutService.mainContainer,
			localize('chatPhoneInput.title', "Configure Session"),
			sheetItems,
			{
				stayOpenOnSelect: true,
				onDidSelect: id => {
					const action = idToAction.get(id);
					if (action) {
						this._performAction(action, target, request);
					}
				},
			},
		);
	}

	private _buildAgentHostSheetItems(
		session: IChatPhoneInputSessionContext,
		provider: IAgentHostSessionsProvider,
		registerAction: RegisterChatPhonePickerAction,
	): IMobilePickerSheetItem[] {
		const items: IMobilePickerSheetItem[] = [];
		const config = provider.getSessionConfig(session.sessionId);
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
					const schema = agentHostProvider.getSessionConfig(session.sessionId)?.schema.properties[SessionConfigKey.Mode];
					if (schema && isWellKnownModeValue(schema, action.value)) {
						agentHostProvider.setSessionConfigValue(session.sessionId, SessionConfigKey.Mode, action.value).catch(() => { });
					}
				}
				break;
			case 'agentHostModel':
				if (session && agentHostProvider) {
					selectAvailableSessionModel(session, agentHostProvider, this._storageService, action.model.identifier);
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
