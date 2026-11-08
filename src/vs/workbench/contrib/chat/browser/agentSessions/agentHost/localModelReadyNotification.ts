/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import type { ILocalModelFamilyV1, ILocalModelStatusV1 } from '../../../../../../platform/agentHost/common/localModel.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ILocalModelService } from '../../../../../services/agentHost/common/localModelService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, isAutoLanguageModel } from '../../../common/languageModels.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { ACTION_ID_NEW_CHAT } from '../../actions/chatActions.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { addDismissedNotificationId, ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationAction, IChatInputNotificationBody, IChatInputNotificationService, readDismissedNotificationIds } from '../../widget/input/chatInputNotificationService.js';
import { logLocalModelFlow, observeLocalModelUiEnabled, type LocalModelCurrentModelKind } from './localModelSetupFlow.js';
import { getLocalModelNoticeGroup, LocalModelNoticePriority } from './localModelSetupProgress.js';

/** Notification id prefix: `localModel.ready.<readyOfferId>`. */
export const LOCAL_MODEL_READY_OFFER_NOTIFICATION_PREFIX = 'localModel.ready.';
/** Application storage: ready offers the user acknowledged (dismissed, Not Now, or acted on), in any window. */
export const LOCAL_MODEL_READY_OFFER_ACKNOWLEDGED_KEY = 'chat.localModel.readyOffer.acknowledged';
/** Application storage: ready offers a chat input has shown at least once. */
export const LOCAL_MODEL_READY_OFFER_SHOWN_KEY = 'chat.localModel.readyOffer.shown';

export const LOCAL_MODEL_NEW_AUTO_CHAT_COMMAND_ID = 'workbench.action.chat.localModel.newAutoChat';
export const LOCAL_MODEL_READY_OFFER_NOT_NOW_COMMAND_ID = '_workbench.action.chat.localModel.readyOfferNotNow';
export const LOCAL_MODEL_READY_OFFER_LOAD_COMMAND_ID = '_workbench.action.chat.localModel.readyOfferLoad';

/** The agent-host vendor of the local Copilot host: its model identifiers are `${vendor}:${id}`. */
const LOCAL_COPILOT_VENDOR = SessionType.AgentHostCopilot;

/** `ready`: the active model reached ready. `secondInstall`: an install finished while another model is active. */
export type LocalModelReadyOfferFlavor = 'ready' | 'secondInstall';

/** Which ready offer `family` warrants; a registered offer stays while the install is unchanged, even after an idle unload. */
export function getLocalModelReadyOfferFlavor(status: ILocalModelStatusV1, family: ILocalModelFamilyV1, registered: boolean): LocalModelReadyOfferFlavor | undefined {
	if (!family.readyOfferId || !family.install || family.operation) {
		return undefined;
	}
	const active = status.active;
	if (active?.familyId === family.familyId) {
		return active.server === 'ready' || registered ? 'ready' : undefined;
	}
	if (active) {
		return 'secondInstall';
	}
	return registered ? 'ready' : undefined;
}

/** Classifies the chat's current model for telemetry and the ready offer's body. */
export function getLocalModelCurrentModelKind(model: ILanguageModelChatMetadataAndIdentifier | undefined, status: ILocalModelStatusV1): LocalModelCurrentModelKind {
	if (!model) {
		return 'other';
	}
	if (isAutoLanguageModel(model)) {
		return 'auto';
	}
	const isLocalRow = status.families.some(family => family.install?.modelId === model.metadata.id);
	return model.metadata.vendor === LOCAL_COPILOT_VENDOR && !isLocalRow ? 'server' : 'other';
}

/** Matches the family's direct-selection row of the local Copilot host. */
function matchesLocalModelRow(modelId: string | undefined): (model: ILanguageModelChatMetadataAndIdentifier) => boolean {
	return model => !!modelId && model.metadata.vendor === LOCAL_COPILOT_VENDOR && model.metadata.id === modelId;
}

function matchesLocalCopilotAuto(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return model.metadata.vendor === LOCAL_COPILOT_VENDOR && isAutoLanguageModel(model);
}

/** Whether Auto may run requests on the family now: active, auto-capable, Use in Auto on and passing the Auto gate. */
function isUsableByAuto(status: ILocalModelStatusV1, family: ILocalModelFamilyV1): boolean {
	return family.autoCapable && status.useInAuto && status.active?.familyId === family.familyId && status.active.autoEligible === true;
}

/** Whether `model` already acts on the family's ready offer: its direct row, or Auto once Auto may use it. */
export function isLocalModelReadyOfferTakenBy(status: ILocalModelStatusV1, family: ILocalModelFamilyV1, model: ILanguageModelChatMetadataAndIdentifier | undefined): boolean {
	return !!model && (matchesLocalModelRow(family.install?.modelId)(model) || (matchesLocalCopilotAuto(model) && isUsableByAuto(status, family)));
}

/** Inputs to {@link resolveLocalModelReadyOfferBody}. */
export interface ILocalModelReadyOfferInput {
	readonly status: ILocalModelStatusV1;
	readonly family: ILocalModelFamilyV1;
	readonly flavor: LocalModelReadyOfferFlavor;
	readonly currentModel: ILanguageModelChatMetadataAndIdentifier | undefined;
}

/** The ready offer's description and actions for one chat input; the primary action is always last. */
export function resolveLocalModelReadyOfferBody(input: ILocalModelReadyOfferInput): IChatInputNotificationBody {
	const { status, family } = input;
	const name = family.displayName;
	const readyOfferId = family.readyOfferId ?? '';
	const currentModelKind = getLocalModelCurrentModelKind(input.currentModel, status);

	const notNow: IChatInputNotificationAction = {
		kind: ChatInputNotificationActionKind.Command,
		label: localize('localModel.ready.notNow', "Not Now"),
		commandId: LOCAL_MODEL_READY_OFFER_NOT_NOW_COMMAND_ID,
		commandArgs: [readyOfferId, currentModelKind],
		primary: false,
		telemetryActionId: 'notNow',
	};
	const switchToLocal = (primary: boolean): IChatInputNotificationAction => ({
		kind: ChatInputNotificationActionKind.SwitchToModel,
		label: localize('localModel.ready.switchTo', "Switch to {0}", name),
		matchesModel: matchesLocalModelRow(family.install?.modelId),
		requireUniqueModel: true,
		primary,
		telemetryActionId: 'switchDirect',
	});

	if (input.flavor === 'secondInstall') {
		const activeName = status.families.find(candidate => candidate.familyId === status.active?.familyId)?.displayName
			?? localize('localModel.ready.activeFallback', "the active model");
		return {
			description: localize('localModel.ready.secondInstall', "Loading it unloads {0}.", activeName),
			actions: [notNow, {
				kind: ChatInputNotificationActionKind.Command,
				label: localize('localModel.ready.load', "Load {0}", name),
				commandId: LOCAL_MODEL_READY_OFFER_LOAD_COMMAND_ID,
				commandArgs: [family.familyId, currentModelKind],
				primary: true,
				telemetryActionId: 'load',
			}],
		};
	}

	if (!isUsableByAuto(status, family)) {
		const tooSlow = family.autoCapable && status.active?.familyId === family.familyId && status.active.autoEligible === false;
		return {
			description: tooSlow
				? localize('localModel.ready.tooSlow', "It's too slow on this device for Auto, but you can select it directly.")
				: localize('localModel.ready.directOnly', "Select it directly to run on your device."),
			actions: [notNow, switchToLocal(true)],
		};
	}

	if (currentModelKind === 'auto') {
		return {
			description: localize('localModel.ready.auto', "Auto can now run some requests on this device, with cloud fallback. New Auto chats will use it."),
			actions: [switchToLocal(false), notNow, {
				kind: ChatInputNotificationActionKind.Command,
				label: localize('localModel.ready.newAutoChat', "New Auto Chat"),
				commandId: LOCAL_MODEL_NEW_AUTO_CHAT_COMMAND_ID,
				commandArgs: [readyOfferId, currentModelKind],
				primary: true,
				telemetryActionId: 'newAutoChat',
			}],
		};
	}

	const useAuto: IChatInputNotificationAction = {
		kind: ChatInputNotificationActionKind.SwitchToModel,
		label: localize('localModel.ready.useAuto', "Use Auto"),
		matchesModel: matchesLocalCopilotAuto,
		requireUniqueModel: true,
		primary: false,
		telemetryActionId: 'useAuto',
	};
	return {
		description: localize('localModel.ready.server', "Run this chat on your device, or let Auto choose between local and cloud."),
		actions: [useAuto, notNow, switchToLocal(true)],
	};
}

function isLocalCopilotChat(widget: IChatWidget | undefined): boolean {
	const sessionResource = widget?.viewModel?.sessionResource;
	return !!sessionResource && getChatSessionType(sessionResource) === SessionType.AgentHostCopilot;
}

interface IRegisteredOffer {
	readonly familyId: string;
	readonly flavor: LocalModelReadyOfferFlavor;
	readonly signature: string;
	readonly inputUri: URI | undefined;
}

/**
 * Offers to switch to a family once it is ready on this device, as a chat input notification for local Copilot
 * agent-host chats. It defers to the on-device status notice, and each `readyOfferId` is offered until acknowledged
 * (kept in application storage so every window honors it).
 */
export class LocalModelReadyNotificationContribution extends Disposable {

	private readonly _registered = new Map<string, IRegisteredOffer>();
	private readonly _widgetListeners = this._register(new DisposableMap<IChatWidget>());
	private readonly _enabled: IObservable<boolean>;
	private readonly _status: IObservable<ILocalModelStatusV1 | undefined>;

	constructor(
		@IAgentHostService private readonly _connection: IAgentHostService,
		@ILocalModelService private readonly _localModelService: ILocalModelService,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._enabled = observeLocalModelUiEnabled(configurationService, contextKeyService);
		this._status = this._localModelService.getStatus(this._connection);
		this._register(toDisposable(() => {
			for (const id of this._registered.keys()) {
				this._chatInputNotificationService.deleteNotification(id);
			}
			this._registered.clear();
		}));
		this._register(autorun(reader => this._update(this._enabled.read(reader) ? this._status.read(reader) : undefined)));
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, LOCAL_MODEL_READY_OFFER_ACKNOWLEDGED_KEY, this._store)(() => this._updateNow()));
		for (const widget of this._chatWidgetService.getAllWidgets()) {
			this._trackWidget(widget);
		}
		this._register(this._chatWidgetService.onDidAddWidget(widget => this._trackWidget(widget)));
		this._register(this._chatWidgetService.onDidRemoveWidget(widget => {
			this._widgetListeners.deleteAndDispose(widget);
			this._untarget(widget.input.inputUri);
		}));
	}

	/** Selecting the offered model, or Auto once Auto may use it, in any chat input acts on the offer. */
	private _trackWidget(widget: IChatWidget): void {
		this._widgetListeners.set(widget, widget.input.onDidChangeUserSelectedModel(() => {
			const status = this._enabled.get() ? this._status.get() : undefined;
			if (!status) {
				return;
			}
			const model = widget.input.selectedLanguageModel.get();
			for (const family of status.families) {
				if (family.readyOfferId && isLocalModelReadyOfferTakenBy(status, family, model)) {
					this._acknowledge(family.readyOfferId);
				}
			}
		}));
	}

	private _updateNow(): void {
		this._update(this._enabled.get() ? this._status.get() : undefined);
	}

	private _update(status: ILocalModelStatusV1 | undefined): void {
		const acknowledged = readDismissedNotificationIds(this._storageService, LOCAL_MODEL_READY_OFFER_ACKNOWLEDGED_KEY);
		const keep = new Set<string>();
		const loaded: string[] = [];
		for (const family of status?.families ?? []) {
			const readyOfferId = family.readyOfferId;
			if (!status || !readyOfferId || acknowledged.has(readyOfferId)) {
				continue;
			}
			const id = LOCAL_MODEL_READY_OFFER_NOTIFICATION_PREFIX + readyOfferId;
			const registered = this._registered.get(id);
			const flavor = getLocalModelReadyOfferFlavor(status, family, !!registered);
			if (!flavor) {
				continue;
			}
			// Loading the installed model by any route (Load, the model's page, Make On-Device Model Active) acts on its offer.
			if (registered?.flavor === 'secondInstall' && flavor === 'ready') {
				loaded.push(readyOfferId);
				continue;
			}
			keep.add(id);
			const signature = `${flavor}\u0000${family.displayName}`;
			if (registered?.signature === signature) {
				continue;
			}
			const inputUri = registered ? registered.inputUri : this._focusedLocalInputUri();
			this._registered.set(id, { familyId: family.familyId, flavor, signature, inputUri });
			this._chatInputNotificationService.setNotification(this._createNotification(readyOfferId, family, flavor, inputUri));
		}
		for (const id of [...this._registered.keys()]) {
			if (!keep.has(id)) {
				this._registered.delete(id);
				this._chatInputNotificationService.deleteNotification(id);
			}
		}
		for (const readyOfferId of loaded) {
			addDismissedNotificationId(this._storageService, LOCAL_MODEL_READY_OFFER_ACKNOWLEDGED_KEY, readyOfferId);
		}
	}

	private _createNotification(readyOfferId: string, family: ILocalModelFamilyV1, flavor: LocalModelReadyOfferFlavor, inputUri: URI | undefined): IChatInputNotification {
		const familyId = family.familyId;
		const resolve = (currentModel: ILanguageModelChatMetadataAndIdentifier | undefined): IChatInputNotificationBody => {
			const status = this._status.get();
			const current = status?.families.find(candidate => candidate.familyId === familyId);
			if (!status || !current) {
				return { description: undefined, actions: [] };
			}
			return resolveLocalModelReadyOfferBody({ status, family: current, flavor: getLocalModelReadyOfferFlavor(status, current, true) ?? flavor, currentModel });
		};
		const initial = resolve(undefined);
		return {
			id: LOCAL_MODEL_READY_OFFER_NOTIFICATION_PREFIX + readyOfferId,
			telemetryId: 'localModel.ready',
			inputUri,
			severity: ChatInputNotificationSeverity.Info,
			message: flavor === 'secondInstall'
				? localize('localModel.ready.installedMessage', "{0} is installed.", family.displayName)
				: localize('localModel.ready.message', "{0} is ready on this device.", family.displayName),
			description: initial.description,
			actions: initial.actions,
			// Hidden in an input already on the model, however it got there (a restored selection, Load, another window).
			when: context => {
				const current = this._status.get()?.families.find(candidate => candidate.familyId === familyId);
				return !context.modelState.currentModel || !matchesLocalModelRow(current?.install?.modelId)(context.modelState.currentModel);
			},
			resolveBody: context => resolve(context.modelState.currentModel),
			onDidShow: context => this._recordShown(readyOfferId, context.modelState.currentModel),
			dismissible: true,
			onDismiss: () => this._acknowledge(readyOfferId),
			autoDismissOnMessage: false,
			sessionTypes: [SessionType.AgentHostCopilot],
			group: getLocalModelNoticeGroup(LocalModelNoticePriority.Other),
		};
	}

	/** Targets the focused local Copilot chat input, if any; otherwise the next matching input shows it. */
	private _focusedLocalInputUri(): URI | undefined {
		const widget = this._chatWidgetService.lastFocusedWidget;
		return isLocalCopilotChat(widget) ? widget?.input.inputUri : undefined;
	}

	/** The targeted input went away: let any matching input show the offer instead. */
	private _untarget(inputUri: URI): void {
		for (const [id, offer] of [...this._registered]) {
			if (offer.inputUri && isEqual(offer.inputUri, inputUri)) {
				this._registered.set(id, { ...offer, inputUri: undefined, signature: '' });
			}
		}
		this._updateNow();
	}

	private _recordShown(readyOfferId: string, currentModel: ILanguageModelChatMetadataAndIdentifier | undefined): void {
		if (readDismissedNotificationIds(this._storageService, LOCAL_MODEL_READY_OFFER_SHOWN_KEY).has(readyOfferId)) {
			return;
		}
		addDismissedNotificationId(this._storageService, LOCAL_MODEL_READY_OFFER_SHOWN_KEY, readyOfferId);
		const status = this._status.get();
		logLocalModelFlow(this._telemetryService, { step: 'readyOfferShown', currentModelKind: status ? getLocalModelCurrentModelKind(currentModel, status) : 'other' });
	}

	private _acknowledge(readyOfferId: string): void {
		addDismissedNotificationId(this._storageService, LOCAL_MODEL_READY_OFFER_ACKNOWLEDGED_KEY, readyOfferId);
		this._updateNow();
	}
}

function readCurrentModelKind(value: unknown): LocalModelCurrentModelKind | undefined {
	return value === 'auto' || value === 'server' || value === 'other' ? value : undefined;
}

/** The ready offer's command actions; switch actions are reported by the chat input notification telemetry. */
export function registerLocalModelReadyOfferCommands(): void {
	CommandsRegistry.registerCommand(LOCAL_MODEL_READY_OFFER_NOT_NOW_COMMAND_ID, (accessor: ServicesAccessor, readyOfferId: unknown, currentModelKind: unknown) => {
		if (typeof readyOfferId === 'string' && readyOfferId) {
			addDismissedNotificationId(accessor.get(IStorageService), LOCAL_MODEL_READY_OFFER_ACKNOWLEDGED_KEY, readyOfferId);
		}
		logLocalModelFlow(accessor.get(ITelemetryService), { step: 'readyOfferAction', action: 'notNow', currentModelKind: readCurrentModelKind(currentModelKind) });
	});

	CommandsRegistry.registerCommand(LOCAL_MODEL_READY_OFFER_LOAD_COMMAND_ID, (accessor: ServicesAccessor, familyId: unknown, currentModelKind: unknown) => {
		if (typeof familyId !== 'string') {
			return;
		}
		const connection = accessor.get(IAgentHostService);
		const localModelService = accessor.get(ILocalModelService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const languageModelsService = accessor.get(ILanguageModelsService);
		logLocalModelFlow(accessor.get(ITelemetryService), { step: 'readyOfferAction', action: 'switchDirect', currentModelKind: readCurrentModelKind(currentModelKind) });
		const widget = chatWidgetService.lastFocusedWidget;
		// Loads at once: the notice above the chat input shows it waiting for running responses, then loading, with Cancel.
		if (!localModelService.makeActive(connection, familyId) || !isLocalCopilotChat(widget)) {
			return;
		}
		const modelId = localModelService.getStatus(connection).get()?.families.find(family => family.familyId === familyId)?.install?.modelId;
		const identifier = languageModelsService.getLanguageModelIds().find(id => {
			const metadata = languageModelsService.lookupLanguageModel(id);
			return !!metadata && metadata.vendor === LOCAL_COPILOT_VENDOR && metadata.id === modelId;
		});
		if (identifier) {
			widget?.input.switchModelByIdentifier(identifier, false, true);
		}
	});

	CommandsRegistry.registerCommand(LOCAL_MODEL_NEW_AUTO_CHAT_COMMAND_ID, async (accessor: ServicesAccessor, _readyOfferId: unknown, currentModelKind: unknown) => {
		const commandService = accessor.get(ICommandService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const languageModelsService = accessor.get(ILanguageModelsService);
		logLocalModelFlow(accessor.get(ITelemetryService), { step: 'readyOfferAction', action: 'newAutoChat', currentModelKind: readCurrentModelKind(currentModelKind) });
		await commandService.executeCommand(ACTION_ID_NEW_CHAT);
		const widget = chatWidgetService.lastFocusedWidget;
		if (!isLocalCopilotChat(widget)) {
			return;
		}
		const identifier = languageModelsService.getLanguageModelIds().find(id => {
			const metadata = languageModelsService.lookupLanguageModel(id);
			return !!metadata && matchesLocalCopilotAuto({ identifier: id, metadata });
		});
		if (identifier) {
			widget?.input.switchModelByIdentifier(identifier, false, true);
		}
	});
}
