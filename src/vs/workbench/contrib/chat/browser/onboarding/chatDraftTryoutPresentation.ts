/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { chatRequiresSetup, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IOnboardingTryoutPresentationDefinition, IOnboardingTryoutRunContext, IOnboardingTryoutUnavailable, OnboardingTryoutAvailability, OnboardingTryoutPreparation, OnboardingTryoutResult } from '../../../onboarding/common/onboardingTryout.js';
import { IChatMode, IChatModes, IChatModeService } from '../../common/chatModes.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, isNewChatSessionTypeUsable } from '../../common/constants.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { getChatSessionType, getNewChatSessionResource } from '../../common/model/chatUri.js';
import { CHAT_DRAFT_TRYOUT_PRESENTATION, IChatDraftTryoutPayload, isChatDraftTryoutPayload } from '../../common/onboarding/chatDraftTryout.js';
import { Target } from '../../common/promptSyntax/promptTypes.js';
import { CHAT_SETUP_ACTION_ID } from '../actions/chatActions.js';
import { AttachContextAction, IChatAttachContextActionContext } from '../actions/chatContextActions.js';
import { getSessionTypeAvailability, getSessionTypeUnavailableLabel, SessionTypeAvailability } from '../agentSessions/sessionTypeAvailability.js';
import { IChatContextPickerItem, IChatContextPickService, IChatContextValueItem } from '../attachments/chatContextPickService.js';
import { IChatWidgetService } from '../chat.js';

interface IPreparedChatDraft {
	readonly model: IChatModel;
	readonly modes: IChatModes;
	readonly mode: IChatMode;
	readonly token: CancellationToken;
	readonly store: DisposableStore;
}

type ChatContextCommandItem = (IChatContextValueItem | IChatContextPickerItem) & { readonly commandId: string };

export class ChatDraftTryoutPresentation extends Disposable implements IOnboardingTryoutPresentationDefinition<IChatDraftTryoutPayload> {
	readonly kind = CHAT_DRAFT_TRYOUT_PRESENTATION;
	readonly isPayload = isChatDraftTryoutPayload;
	readonly onDidChangeAvailability: Event<void>;

	private readonly lifetime = this._register(new CancellationTokenSource());

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatContextPickService private readonly contextPickService: IChatContextPickService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ICommandService private readonly commandService: ICommandService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IAgentHostEnablementService private readonly agentHostEnablementService: IAgentHostEnablementService,
	) {
		super();
		this.onDidChangeAvailability = Event.any(
			chatEntitlementService.onDidChangeSentiment,
			chatEntitlementService.onDidChangeEntitlement,
			chatEntitlementService.onDidChangeAnonymous,
			chatSessionsService.onDidChangeAvailability,
			extensionService.onDidRegisterExtensions,
			languageModelsService.onDidChangeModelVisibility,
			Event.map(extensionService.onDidChangeExtensions, () => undefined),
			Event.map(languageModelsService.onDidChangeLanguageModels, () => undefined),
			Event.map(configurationService.onDidChangeConfiguration, () => undefined),
			Event.map(CommandsRegistry.onDidRegisterCommand, () => undefined),
			Event.fromObservableLight(agentHostEnablementService.enabled),
			Event.fromObservableLight(agentHostEnablementService.managedSandboxEnforced),
		);
	}

	getAvailability(payload: IChatDraftTryoutPayload): OnboardingTryoutAvailability {
		const { sentiment } = this.chatEntitlementService;
		if (sentiment.hidden) {
			return { kind: 'hidden' };
		}
		if (sentiment.disabledInWorkspace) {
			return { kind: 'unavailable', message: localize('chat.tryout.disabledInWorkspace', "Chat is disabled in this workspace.") };
		}
		if (sentiment.disabled || sentiment.untrusted || payload.sessionType === localChatSessionType && sentiment.installed === false) {
			return this.setupRequired();
		}
		if (payload.sessionType === localChatSessionType && chatRequiresSetup({
			completed: !!sentiment.completed,
			disabled: !!sentiment.disabled,
			untrusted: !!sentiment.untrusted,
			entitlement: this.chatEntitlementService.entitlement,
			anonymous: this.chatEntitlementService.anonymous,
			hasByokModels: this.chatEntitlementService.hasByokModels,
		})) {
			return this.setupRequired();
		}
		if (!isNewChatSessionTypeUsable(payload.sessionType, this.configurationService, this.chatSessionsService, this.workspaceContextService.getWorkspace(), this.agentHostEnablementService.enabled.get(), this.agentHostEnablementService.managedSandboxEnforced.get())) {
			return this.providerUnavailable();
		}
		const contribution = this.chatSessionsService.getChatSessionContribution(payload.sessionType);
		if (payload.sessionType !== localChatSessionType && !contribution
			|| contribution?.isReadOnly || contribution?.locations && !contribution.locations.includes(ChatAgentLocation.Chat)) {
			return this.providerUnavailable();
		}
		const availability = getSessionTypeAvailability(this.chatSessionsService, this.chatEntitlementService, this.languageModelsService, payload.sessionType, true);
		if (availability === SessionTypeAvailability.SignInRequired) {
			return this.setupRequired();
		}
		if (availability !== SessionTypeAvailability.Available) {
			return { kind: 'unavailable', message: getSessionTypeUnavailableLabel(availability) ?? this.providerUnavailable().message };
		}
		if (payload.mode === ChatModeKind.Agent && this.configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled) === false) {
			return this.modeUnavailable();
		}
		const extensionId = payload.attachContext?.extensionId;
		if (extensionId && !this.extensionService.extensions.some(extension => ExtensionIdentifier.equals(extension.identifier, extensionId))) {
			return this.pickerUnavailable(extensionId);
		}
		return { kind: 'ready' };
	}

	async prepare(payload: IChatDraftTryoutPayload, context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutPreparation> {
		if (context.token.isCancellationRequested || context.store.isDisposed || this._store.isDisposed) {
			return { kind: 'cancelled' };
		}
		const cancellation = new CancellationTokenSource(context.token);
		context.store.add(toDisposable(() => cancellation.dispose(true)));
		context.store.add(this.lifetime.token.onCancellationRequested(() => cancellation.cancel()));
		const token = cancellation.token;

		await raceCancellation(this.extensionService.whenInstalledExtensionsRegistered(), token);
		if (token.isCancellationRequested) {
			return { kind: 'cancelled' };
		}
		const availability = this.getAvailability(payload);
		if (availability.kind !== 'ready') {
			return availability.kind === 'hidden' ? { kind: 'cancelled' } : availability;
		}
		context.store.add(this.onDidChangeAvailability(() => {
			if (this.getAvailability(payload).kind !== 'ready') {
				cancellation.cancel();
			}
		}));
		if (payload.attachContext) {
			const { extensionId, commandIds } = payload.attachContext;
			if (extensionId) {
				const identifier = new ExtensionIdentifier(extensionId);
				await raceCancellation(this.extensionService.activateById(identifier, { extensionId: identifier, activationEvent: `onCommand:${commandIds[0]}`, startup: false }), token);
			} else {
				for (const commandId of commandIds) {
					if (token.isCancellationRequested) {
						return { kind: 'cancelled' };
					}
					if (!CommandsRegistry.getCommand(commandId)) {
						await raceCancellation(this.extensionService.activateByEvent(`onCommand:${commandId}`), token);
					}
				}
			}
			if (token.isCancellationRequested) {
				return { kind: 'cancelled' };
			}
			if (!this.getContextItems(commandIds)) {
				return this.pickerUnavailable(extensionId);
			}
		}
		if (payload.sessionType === localChatSessionType) {
			if (!this.chatService.isEnabled(ChatAgentLocation.Chat)) {
				return this.providerUnavailable();
			}
			await raceCancellation(this.chatService.activateDefaultAgent(ChatAgentLocation.Chat), token);
		} else {
			const canResolve = await raceCancellation(this.chatSessionsService.canResolveChatSession(payload.sessionType), token);
			if (token.isCancellationRequested) {
				return { kind: 'cancelled' };
			}
			if (!canResolve || !this.chatSessionsService.getChatSessionContribution(payload.sessionType)) {
				return this.providerUnavailable();
			}
		}
		if (token.isCancellationRequested) {
			return { kind: 'cancelled' };
		}

		const resource = getNewChatSessionResource(payload.sessionType);
		const modes = context.store.add(this.chatModeService.createModes(resource));
		await raceCancellation(modes.waitForPendingUpdates(), token);
		if (token.isCancellationRequested) {
			return { kind: 'cancelled' };
		}
		const mode = this.getMode(payload, modes);
		if (!mode) {
			return this.modeUnavailable();
		}
		const modelReference = payload.sessionType === localChatSessionType
			? this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: 'ChatDraftTryoutPresentation', sessionTypeSelectionReason: 'explicitOverride' })
			: await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, 'ChatDraftTryoutPresentation', 'explicitOverride');
		if (token.isCancellationRequested) {
			modelReference?.dispose();
			return { kind: 'cancelled' };
		}
		if (modelReference) {
			context.store.add(modelReference);
		}
		if (!modelReference || modelReference.object.hasRequests
			|| getChatSessionType(modelReference.object.sessionResource) !== payload.sessionType
			|| payload.sessionType !== localChatSessionType && !isEqual(modelReference.object.sessionResource, resource)) {
			return this.providerUnavailable();
		}
		const prepared: IPreparedChatDraft = { model: modelReference.object, modes, mode, token, store: context.store };
		let hasRun = false;
		return {
			kind: 'ready',
			run: async () => {
				if (hasRun || token.isCancellationRequested) {
					return { kind: 'cancelled' };
				}
				hasRun = true;
				return this.openDraft(payload, prepared, cancellation);
			},
		};
	}

	private async openDraft(payload: IChatDraftTryoutPayload, prepared: IPreparedChatDraft, cancellation: CancellationTokenSource): Promise<OnboardingTryoutResult> {
		const { token, model, store } = prepared;
		const availability = this.getAvailability(payload);
		if (availability.kind !== 'ready') {
			return availability.kind === 'hidden' ? { kind: 'cancelled' } : availability;
		}
		if (!this.getMode(payload, prepared.modes)) {
			return this.modeUnavailable();
		}
		const widget = await this.chatWidgetService.openSession(model.sessionResource, SIDE_GROUP, {
			pinned: true,
			revealIfOpened: true,
			explicitSessionType: payload.sessionType,
			sessionTypeSelectionReason: 'explicitOverride',
			title: payload.title ? { preferred: payload.title } : undefined,
			modelInputState: {
				inputText: payload.prompt ?? '',
				mode: { id: prepared.mode.id, kind: prepared.mode.kind },
				attachments: [],
				selectedModel: undefined,
				selections: [],
				contrib: {},
			},
		});
		if (token.isCancellationRequested) {
			return { kind: 'cancelled' };
		}
		if (!widget || !isEqual(widget.viewModel?.sessionResource, model.sessionResource)
			|| this.chatWidgetService.getWidgetBySessionResource(model.sessionResource) !== widget) {
			return { kind: 'unavailable', message: localize('chat.tryout.openFailed', "The independent Chat draft could not be opened.") };
		}
		store.add(this.chatWidgetService.onDidRemoveWidget(removed => {
			if (removed === widget) {
				cancellation.cancel();
			}
		}));
		store.add(widget.onDidChangeViewModel(() => {
			if (!isEqual(widget.viewModel?.sessionResource, model.sessionResource)) {
				cancellation.cancel();
			}
		}));
		if (widget.input.currentModeObs.get().id !== payload.mode) {
			return this.modeUnavailable();
		}
		store.add(Event.fromObservableLight(widget.input.currentModeObs)(() => {
			if (widget.input.currentModeObs.get().id !== payload.mode) {
				cancellation.cancel();
			}
		}));
		const currentAvailability = this.getAvailability(payload);
		if (currentAvailability.kind !== 'ready') {
			return currentAvailability.kind === 'hidden' ? { kind: 'cancelled' } : currentAvailability;
		}
		if (payload.attachContext) {
			const { commandIds, extensionId, placeholder } = payload.attachContext;
			let goBack: boolean;
			do {
				const items = this.getContextItems(commandIds);
				if (!items) {
					return this.pickerUnavailable(extensionId);
				}
				const picks = [];
				for (const item of items) {
					const enabled = !item.isEnabled || await raceCancellation(Promise.resolve(item.isEnabled(widget)), token);
					if (token.isCancellationRequested) {
						return { kind: 'cancelled' };
					}
					if (!enabled) {
						return this.pickerUnavailable(extensionId);
					}
					picks.push({ label: item.label, iconClass: ThemeIcon.asClassName(item.icon), item });
				}
				const selected = picks.length === 1 ? picks[0] : await this.quickInputService.pick(picks, {
					placeHolder: placeholder ?? localize('chat.tryout.pickContext', "Choose the context to attach to this draft"),
					canPickMany: false,
				}, token);
				if (!selected || token.isCancellationRequested) {
					return { kind: 'cancelled' };
				}
				if (!this.getContextItems(commandIds)?.includes(selected.item)) {
					return this.pickerUnavailable(extensionId);
				}
				const actionContext: IChatAttachContextActionContext = { widget, contextItemCommandId: selected.item.commandId, token };
				goBack = await this.commandService.executeCommand<'back' | void>(AttachContextAction.ID, actionContext) === 'back';
				if (token.isCancellationRequested) {
					return { kind: 'cancelled' };
				}
			} while (goBack && commandIds.length > 1);
		}
		widget.focusInput();
		return { kind: 'prepared' };
	}

	private getMode(payload: IChatDraftTryoutPayload, modes: IChatModes): IChatMode | undefined {
		const mode = modes.findModeById(payload.mode);
		const target = this.chatSessionsService.getCustomAgentTargetForSessionType(payload.sessionType);
		return mode && (target === Target.Undefined || mode.id === ChatModeKind.Agent)
			&& (mode.kind !== ChatModeKind.Agent || this.configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled) !== false)
			? mode : undefined;
	}

	private getContextItems(commandIds: readonly string[]): ChatContextCommandItem[] | undefined {
		const items = Array.from(this.contextPickService.items);
		const result = [];
		for (const commandId of commandIds) {
			const matches = items.filter((item): item is ChatContextCommandItem => item.commandId === commandId);
			if (matches.length !== 1 || !CommandsRegistry.getCommand(commandId)) {
				return undefined;
			}
			result.push(matches[0]);
		}
		return result;
	}

	private setupRequired(): IOnboardingTryoutUnavailable {
		return {
			kind: 'unavailable',
			message: localize('chat.tryout.setupRequired', "Finish Chat setup before opening this example."),
			action: { label: localize('chat.tryout.setup', "Set Up Chat"), command: { id: CHAT_SETUP_ACTION_ID } },
		};
	}

	private providerUnavailable(): IOnboardingTryoutUnavailable {
		return { kind: 'unavailable', message: localize('chat.tryout.providerUnavailable', "The requested Chat provider is not available. No other provider will be selected.") };
	}

	private modeUnavailable(): IOnboardingTryoutUnavailable {
		return { kind: 'unavailable', message: localize('chat.tryout.modeUnavailable', "The requested Chat mode is not available. No other mode will be selected.") };
	}

	private pickerUnavailable(extensionId?: string): IOnboardingTryoutUnavailable {
		return {
			kind: 'unavailable',
			message: localize('chat.tryout.pickerUnavailable', "The requested attachment picker is not available. Install or enable its extension and try again."),
			action: extensionId ? {
				label: localize('chat.tryout.manageExtension', "Manage Extension"),
				command: { id: 'workbench.extensions.action.showExtensionsWithIds', arguments: [[extensionId]] },
			} : undefined,
		};
	}

	override dispose(): void {
		this.lifetime.cancel();
		super.dispose();
	}
}
