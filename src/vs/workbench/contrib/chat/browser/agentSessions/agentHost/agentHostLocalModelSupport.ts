/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { equals } from '../../../../../../base/common/arrays.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { LocalModelEnabledSettingId, type ILocalModelStatusV1, type ILocalTurnExecution } from '../../../../../../platform/agentHost/common/localModel.js';
import { identifierForLog } from '../../../../../../platform/agentHost/common/logRedaction.js';
import { readLocalModelTurnExecution, readUsageInfoMeta } from '../../../../../../platform/agentHost/common/meta/agentUsageMeta.js';
import { readLocalModelStatusFromRootState } from '../../../../../../platform/agentHost/common/meta/localModelStatus.js';
import type { UsageInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ILocalModelService, type LocalModelSendCheck } from '../../../../../services/agentHost/common/localModelService.js';
import { IChatRequestVariableEntry, isImplicitVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isStringVariableEntry, isWorkspaceVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { AUTO_RAW_MODEL_ID, isAutoLanguageModel } from '../../../common/languageModels.js';
import type { IChatAgentRequest } from '../../../common/participants/chatAgents.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService, type IChatInputNotificationAction } from '../../widget/input/chatInputNotificationService.js';
import { formatLocalModelOnDeviceName, matchesLocalModelRowId } from '../../widget/input/modelPicker/modelPickerLocalModelItems.js';
import { getLocalModelNoticeGroup, LocalModelNoticePriority } from './localModelSetupProgress.js';

/** Runs the "Load {0}" action of a pre-send guard notice; the argument names the pending load. */
const LOCAL_MODEL_LOAD_AND_SEND_COMMAND_ID = '_agentHost.localModel.loadAndSend';
/** How long a "Load and send" waits for the swap, matching the host's load timeout. */
const LOAD_AND_SEND_TIMEOUT_MS = 10 * 60_000;

const pendingLoads = new Map<string, () => void>();
CommandsRegistry.registerCommand(LOCAL_MODEL_LOAD_AND_SEND_COMMAND_ID, (_accessor, id: unknown) => typeof id === 'string' ? pendingLoads.get(id)?.() : undefined);

/** Names an on-device model id (a family's `capiId` or its direct row's id) from the host's status; no name table is hard-coded. */
export function getLocalModelDisplayName(status: ILocalModelStatusV1 | undefined, rawModelId: string | undefined, familyId?: string): string | undefined {
	if (!status) {
		return undefined;
	}
	const normalized = rawModelId?.toLowerCase();
	const family = (familyId ? status.families.find(candidate => candidate.familyId === familyId) : undefined)
		?? (normalized ? status.families.find(candidate => candidate.capiId.toLowerCase() === normalized || candidate.familyId === normalized || matchesLocalModelRowId(candidate.install?.modelId, rawModelId)) : undefined);
	return family?.displayName;
}

/** The draft a "Load {0}" gesture sends once the model is ready: exactly what the input held when the user chose it. */
interface IKeptDraft {
	readonly text: string;
	readonly attachmentIds: readonly string[];
	readonly modelIdentifier: string;
}

function captureDraft(widget: IChatWidget): IKeptDraft | undefined {
	const modelIdentifier = widget.input.currentLanguageModel;
	const text = widget.getInput();
	return modelIdentifier && text.trim() ? { text, attachmentIds: widget.input.attachmentModel.attachments.map(attachment => attachment.id), modelIdentifier } : undefined;
}

function isSameDraft(widget: IChatWidget, draft: IKeptDraft): boolean {
	const current = captureDraft(widget);
	return !!current && current.text === draft.text && current.modelIdentifier === draft.modelIdentifier && equals(current.attachmentIds, draft.attachmentIds);
}

/** How the load a "Load {0}" gesture started has turned out so far. */
type LoadAttemptOutcome = 'pending' | 'ready' | 'ended';

/**
 * Follows the load a "Load {0}" gesture started. The kept draft is sent only if the model becomes ready during that
 * load; once it is cancelled, fails or ends without the model ready, a later load of the same model doesn't send it.
 */
class LocalModelLoadAttempt {
	private _operationId: string | undefined;

	/** @param _ignoredOperationId A failed swap of the family that the request replaces, which must not end this attempt. */
	constructor(
		private readonly _familyId: string,
		private readonly _ignoredOperationId: string | undefined,
	) { }

	update(status: ILocalModelStatusV1 | undefined): LoadAttemptOutcome {
		if (!status) {
			return 'ended';
		}
		const operation = status.families.find(family => family.familyId === this._familyId)?.operation;
		if (!this._operationId && operation?.kind === 'swap' && operation.state === 'running' && operation.id !== this._ignoredOperationId) {
			this._operationId = operation.id;
		}
		if (!this._operationId) {
			// The host hasn't taken up the request yet.
			return 'pending';
		}
		const own = operation?.id === this._operationId ? operation : undefined;
		const active = status.active?.familyId === this._familyId ? status.active : undefined;
		if (own?.state === 'error' || active?.server === 'error') {
			return 'ended';
		}
		if (active?.server === 'ready') {
			return 'ready';
		}
		// Only its own running swap keeps the wait: once that is cancelled, fails or is gone without the
		// model ready (stopping, stopped, the previous model, or a cancelled launch still being prepared),
		// a later load of the same model isn't this one.
		return own?.state === 'running' ? 'pending' : 'ended';
	}
}

/** How a turn that involved the on-device model is labelled. */
export interface ILocalModelTurnPresentation {
	/** The response footer's model label. */
	readonly name: string;
	/** Shown after the label when no credits were reported; only direct local inference says "No usage limit". */
	readonly pricing?: string;
	/** Why the label reads as it does, for a hover or the routing row. */
	readonly hover?: string;
	/** The routing row of an Auto turn. */
	readonly routed?: { readonly id: string; readonly name: string; readonly reason?: string };
	/** The model the turn bills to: the cloud model of a fallback, or the on-device model. */
	readonly billed?: { readonly rawModelId: string; readonly name: string };
}

/** Inputs to {@link getLocalModelTurnPresentation}. */
export interface ILocalModelTurnPresentationContext {
	/** Whether the chat's model was Auto; otherwise the turn ran on a directly selected model. */
	readonly isAuto: boolean;
	/** Display name of the serving on-device model, or `undefined` when the host's status doesn't name it. */
	readonly localName: string | undefined;
	/** The on-device model's id as the runtime reported it. */
	readonly localModelId: string | undefined;
	/** Display name of a cloud model, or `undefined` when unknown. */
	readonly resolveCloudModelName: (rawModelId: string) => string | undefined;
	/** Auto explainability is hidden: name no cloud model the router picked. */
	readonly hideCloudModelName?: boolean;
}

/**
 * Labels a turn from how it actually executed, in the Copilot CLI and app's style: "On-device" for a turn served on the
 * device, the answering cloud model for a fallback, and `undefined` (the existing Auto label) for `unknown`. Cloud usage
 * is never hidden: only a direct on-device turn is described as having no usage limit.
 */
export function getLocalModelTurnPresentation(execution: ILocalTurnExecution, context: ILocalModelTurnPresentationContext): ILocalModelTurnPresentation | undefined {
	const onDeviceName = context.localName !== undefined
		? formatLocalModelOnDeviceName(context.localName)
		: localize('agentHost.localModel.unnamedOnDevice', "On-device model");
	const cloudModelId = execution.fallbackModel;
	const cloudName = context.hideCloudModelName || !cloudModelId
		? localize('agentHost.localModel.cloudModel', "a cloud model")
		: context.resolveCloudModelName(cloudModelId) ?? cloudModelId;
	if (!context.isAuto) {
		// Direct requests never fall back to the cloud.
		return execution.execution === 'local' ? {
			name: onDeviceName,
			pricing: localize('agentHost.localModel.noUsageLimit', "No usage limit"),
		} : undefined;
	}
	switch (execution.execution) {
		case 'local': {
			return {
				name: localize({ key: 'agentHost.localModel.labelLocal', comment: ['{0} is a model name followed by "On-device", e.g. "MAI Code 1.1 Flash · On-device"'] }, "Auto ({0})", onDeviceName),
				routed: { id: context.localModelId ?? execution.familyId ?? onDeviceName, name: onDeviceName },
				billed: context.localModelId ? { rawModelId: context.localModelId, name: onDeviceName } : undefined,
			};
		}
		case 'fallback': {
			const hover = localize('agentHost.localModel.fallbackHover', "The on-device model was unavailable, so a cloud model was used.");
			return {
				name: localize('agentHost.localModel.labelFallback', "Auto ({0})", cloudName),
				hover,
				routed: cloudModelId ? { id: cloudModelId, name: cloudName, reason: localize('agentHost.localModel.fallbackReason', "Auto routed task to {0}. {1}", cloudName, hover) } : undefined,
				billed: cloudModelId ? { rawModelId: cloudModelId, name: cloudName } : undefined,
			};
		}
		case 'mixed': {
			const reason = localize('agentHost.localModel.mixedReason', "Auto ran part of this task on this device and part on {0}.", cloudName);
			return {
				name: localize('agentHost.localModel.labelMixed', "Auto (On-device + {0})", cloudName),
				hover: reason,
				routed: cloudModelId ? { id: cloudModelId, name: cloudName, reason } : undefined,
				billed: cloudModelId ? { rawModelId: cloudModelId, name: cloudName } : undefined,
			};
		}
		default:
			return undefined;
	}
}

/** User attachments of a request, without the implicit and automatically added context. */
function getUserAttachments(variables: readonly IChatRequestVariableEntry[]): IChatRequestVariableEntry[] {
	return variables.filter(entry =>
		!isImplicitVariableEntry(entry) &&
		!isWorkspaceVariableEntry(entry) &&
		!isStringVariableEntry(entry) &&
		!(isPromptFileVariableEntry(entry) && entry.automaticallyAdded) &&
		!(isPromptTextVariableEntry(entry) && entry.automaticallyAdded));
}

/**
 * The on-device model behavior of one Agent Host session handler: the pre-send guard for chats bound to a model that
 * isn't loaded, turn attribution and the one-time fallback notice. Nothing runs unless the setting is on or a turn
 * reports on-device execution.
 */
export class AgentHostLocalModelSupport extends Disposable {

	/** Sessions that already showed the fallback notice. */
	private readonly _fallbackNoticeShown = new Set<string>();
	/** The pending "Load {0}" action of each session's guard notice. */
	private readonly _pendingLoads = this._register(new DisposableMap<string>());
	/** Each session's swap that will send the kept draft once the model is ready. */
	private readonly _loads = this._register(new DisposableMap<string, DisposableStore>());
	/** Each session's deferred restore of a withdrawn draft. */
	private readonly _draftRestores = this._register(new DisposableMap<string>());

	constructor(
		private readonly _connection: IAgentConnection,
		private readonly _sessionType: string,
		@ILocalModelService private readonly _localModelService: ILocalModelService,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatService private readonly _chatService: IChatService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	private _isEnabled(): boolean {
		return this._configurationService.getValue<boolean>(LocalModelEnabledSettingId) === true;
	}

	private _getStatus(): ILocalModelStatusV1 | undefined {
		// Hosts without on-device models publish no status; don't bind to the service for them.
		if (!readLocalModelStatusFromRootState(this._connection.rootState.value)) {
			return undefined;
		}
		return this._localModelService.getStatus(this._connection).get();
	}

	/** The display name of an on-device model id, while the host publishes status. */
	getDisplayName(rawModelId: string): string | undefined {
		return this._isEnabled() ? getLocalModelDisplayName(this._getStatus(), rawModelId) : undefined;
	}

	/** The label of a turn that reported on-device execution, or `undefined` to keep the existing label. */
	getTurnPresentation(usage: UsageInfo | undefined, selectedRawModelId: string | undefined, resolveCloudModelName: (rawModelId: string) => string | undefined, hideCloudModelName: boolean | undefined): ILocalModelTurnPresentation | undefined {
		const execution = readLocalModelTurnExecution(usage);
		if (!execution || execution.execution === 'unknown') {
			return undefined;
		}
		const resolution = readUsageInfoMeta(usage).autoModeResolved;
		const isAuto = selectedRawModelId === AUTO_RAW_MODEL_ID || !!resolution;
		const localModelId = resolution?.chosenModel ?? usage?.model ?? selectedRawModelId;
		const localName = getLocalModelDisplayName(this._getStatus(), localModelId, execution.familyId);
		return getLocalModelTurnPresentation(execution, { isAuto, localName, localModelId, resolveCloudModelName, hideCloudModelName });
	}

	/** Shows the one-time fallback notice for a session when a live turn fell back from the on-device model to the cloud. */
	noteCompletedTurn(sessionResource: URI, usage: UsageInfo | undefined): void {
		const execution = readLocalModelTurnExecution(usage);
		const key = sessionResource.toString();
		if (execution?.execution !== 'fallback' || this._fallbackNoticeShown.has(key)) {
			return;
		}
		this._fallbackNoticeShown.add(key);
		const name = getLocalModelDisplayName(this._getStatus(), usage?.model, execution.familyId)
			?? localize('agentHost.localModel.unknownNameCapitalized', "The on-device model");
		this._chatInputNotificationService.setNotification({
			id: `localModel.fallback.${key}`,
			sessionResources: [sessionResource],
			severity: ChatInputNotificationSeverity.Info,
			message: localize('agentHost.localModel.fallbackNotice', "{0} couldn't respond, so Auto used a cloud model.", name),
			description: undefined,
			actions: [],
			dismissible: true,
			autoDismissOnMessage: true,
			group: getLocalModelNoticeGroup(LocalModelNoticePriority.Other),
		});
	}

	/** The pre-send guard: `true` when the request may be sent; otherwise its draft goes back to the input and a notice offers to load the model, switch, or use Auto. */
	async checkBeforeSend(request: IChatAgentRequest, rawModelId: string | undefined): Promise<boolean> {
		if (!rawModelId || !this._isEnabled() || !this._getStatus()) {
			return true;
		}
		const check = await this._localModelService.checkBeforeSend(this._connection, request.sessionResource, rawModelId);
		if (check.kind === 'allow') {
			return true;
		}
		const status = this._getStatus();
		// The host queues direct requests for the model it is swapping in.
		if (status?.active?.swapTo === check.familyId) {
			return true;
		}
		this._logService.info(`[AgentHost] On-device model '${identifierForLog(check.familyId)}' isn't loaded; keeping the draft`);
		this._restoreDraft(request);
		void this._chatService.removeRequest(request.sessionResource, request.requestId).catch(onUnexpectedError);
		this._showModelNotActiveNotice(request.sessionResource, check, status);
		return false;
	}

	private _restoreDraft(request: IChatAgentRequest): void {
		const widget = this._chatWidgetService.getWidgetBySessionResource(request.sessionResource);
		if (!widget) {
			return;
		}
		// The input clears once the send was accepted; restore after it, never over a new draft.
		this._draftRestores.set(request.sessionResource.toString(), disposableTimeout(() => {
			this._draftRestores.deleteAndDispose(request.sessionResource.toString());
			const current = widget.getInput();
			if (current && current !== request.message) {
				return;
			}
			widget.input.setValue(request.message, false);
			const attachments = getUserAttachments(request.variables.variables);
			if (attachments.length && !widget.input.attachmentModel.attachments.length) {
				void widget.input.restoreAttachments(attachments).catch(onUnexpectedError);
			}
		}, 0));
	}

	private _notificationId(sessionResource: URI): string {
		return `localModel.modelNotActive.${sessionResource.toString()}`;
	}

	private _showModelNotActiveNotice(sessionResource: URI, check: Extract<LocalModelSendCheck, { kind: 'block' }>, status: ILocalModelStatusV1 | undefined): void {
		const id = this._notificationId(sessionResource);
		const family = status?.families.find(candidate => candidate.familyId === check.familyId);
		const activeFamily = check.activeFamilyId ? status?.families.find(candidate => candidate.familyId === check.activeFamilyId) : undefined;
		const name = family?.displayName ?? check.familyId;
		const activeName = activeFamily?.displayName ?? check.activeFamilyId;
		const actions: IChatInputNotificationAction[] = [{
			kind: ChatInputNotificationActionKind.Command,
			label: activeName
				? localize('agentHost.localModel.loadUnloads', "Load {0} (unloads {1})", name, activeName)
				: localize('agentHost.localModel.load', "Load {0}", name),
			commandId: LOCAL_MODEL_LOAD_AND_SEND_COMMAND_ID,
			commandArgs: [id],
			primary: true,
			telemetryActionId: 'localModel.load',
		}];
		const activeModelId = activeFamily?.install?.modelId;
		if (activeName && activeModelId) {
			actions.push({
				kind: ChatInputNotificationActionKind.SwitchToModel,
				label: localize('agentHost.localModel.switchTo', "Switch to {0}", activeName),
				matchesModel: model => matchesLocalModelRowId(activeModelId, model.metadata.id) && model.metadata.targetChatSessionType === this._sessionType,
				requireUniqueModel: true,
				telemetryActionId: 'localModel.switchToActive',
			});
		}
		actions.push({
			kind: ChatInputNotificationActionKind.SwitchToModel,
			label: localize('agentHost.localModel.useAuto', "Use Auto"),
			matchesModel: model => isAutoLanguageModel(model) && model.metadata.targetChatSessionType === this._sessionType,
			requireUniqueModel: true,
			telemetryActionId: 'localModel.useAuto',
		});

		this._loads.deleteAndDispose(id);
		this._pendingLoads.set(id, toDisposable(() => pendingLoads.delete(id)));
		pendingLoads.set(id, () => this._loadAndSend(sessionResource, check.familyId, name));
		this._chatInputNotificationService.setNotification({
			id,
			sessionResources: [sessionResource],
			severity: ChatInputNotificationSeverity.Warning,
			message: localize('agentHost.localModel.notLoaded', "{0} isn't loaded.", name),
			description: undefined,
			actions,
			dismissible: true,
			autoDismissOnMessage: true,
			group: getLocalModelNoticeGroup(LocalModelNoticePriority.Other),
		});
	}

	/**
	 * Loads the model at once, then sends the kept draft once that load has the model ready. Another send, a different
	 * model or an edited draft supersedes it: changed input is never submitted on the user's behalf.
	 */
	private _loadAndSend(sessionResource: URI, familyId: string, name: string): void {
		const id = this._notificationId(sessionResource);
		this._pendingLoads.deleteAndDispose(id);
		const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
		const installModelId = this._getStatus()?.families.find(family => family.familyId === familyId)?.install?.modelId;
		const draft = widget && captureDraft(widget);
		const sendable = !!draft && matchesLocalModelRowId(installModelId, widget.input.selectedLanguageModel.get()?.metadata.id);
		// A failed swap the request replaces isn't this load; a swap already loading the model is.
		const previous = this._getStatus()?.families.find(family => family.familyId === familyId)?.operation;
		const ignoredOperationId = previous?.kind === 'swap' && previous.state === 'running' ? undefined : previous?.id;
		if (!this._localModelService.makeActive(this._connection, familyId)) {
			return;
		}
		if (!widget || !draft || !sendable || !isSameDraft(widget, draft)) {
			// Nothing this gesture may send: the model still loads, and the user sends when ready.
			return;
		}
		this._chatInputNotificationService.setNotification({
			id,
			sessionResources: [sessionResource],
			severity: ChatInputNotificationSeverity.Info,
			message: localize('agentHost.localModel.loading', "Loading {0}…", name),
			description: localize('agentHost.localModel.loadingDescription', "Your message will be sent when it's ready."),
			actions: [],
			dismissible: true,
			autoDismissOnMessage: true,
			group: getLocalModelNoticeGroup(LocalModelNoticePriority.Other),
		});
		void this._sendWhenReady(sessionResource, new LocalModelLoadAttempt(familyId, ignoredOperationId), widget, draft).catch(onUnexpectedError);
	}

	/** Sends the kept draft once the load `attempt` follows has the model ready; if that load ends otherwise, the notice goes and the draft stays in the input. */
	private async _sendWhenReady(sessionResource: URI, attempt: LocalModelLoadAttempt, widget: IChatWidget, draft: IKeptDraft): Promise<void> {
		const id = this._notificationId(sessionResource);
		const operation = new DisposableStore();
		const cancellation = new CancellationTokenSource();
		operation.add(toDisposable(() => cancellation.dispose(true)));
		const supersede = () => {
			if (!cancellation.token.isCancellationRequested) {
				cancellation.cancel();
				this._chatInputNotificationService.deleteNotification(id);
			}
		};
		// Another send in this session takes the kept draft's place.
		operation.add(this._chatService.onDidSubmitRequest(e => {
			if (isEqual(e.chatSessionResource, sessionResource)) {
				supersede();
			}
		}));
		// So does editing the draft or picking another model.
		const inputState = this._chatService.getSession(sessionResource)?.inputModel.state;
		if (inputState) {
			operation.add(autorun(reader => {
				inputState.read(reader);
				if (!isSameDraft(widget, draft)) {
					supersede();
				}
			}));
		}
		this._loads.set(id, operation);
		const status = this._localModelService.getStatus(this._connection);
		let outcome: LoadAttemptOutcome | 'superseded';
		try {
			outcome = await new Promise<LoadAttemptOutcome | 'superseded'>(resolve => {
				// Superseded, or replaced by a newer guard notice: that notice stays.
				if (cancellation.token.isCancellationRequested) {
					resolve('superseded');
					return;
				}
				operation.add(cancellation.token.onCancellationRequested(() => resolve('superseded')));
				operation.add(disposableTimeout(() => resolve('ended'), LOAD_AND_SEND_TIMEOUT_MS));
				operation.add(autorun(reader => {
					const result = attempt.update(status.read(reader));
					if (result !== 'pending') {
						resolve(result);
					}
				}));
			});
		} finally {
			if (this._loads.get(id) === operation) {
				this._loads.deleteAndDispose(id);
			}
		}
		if (outcome === 'superseded') {
			return;
		}
		// Sent now, or never: the setup progress and error UI explain a cancelled or failed load, and the draft stays.
		this._chatInputNotificationService.deleteNotification(id);
		if (outcome === 'ready' && this._chatWidgetService.getWidgetBySessionResource(sessionResource) === widget && isSameDraft(widget, draft)) {
			await widget.acceptInput();
		}
	}
}
