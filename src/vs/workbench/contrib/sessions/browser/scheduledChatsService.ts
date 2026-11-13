/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { toAction } from '../../../../base/common/actions.js';
import { SequencerByKey } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { parse, stringify } from '../../../../base/common/marshalling.js';
import { equals, stableStringify } from '../../../../base/common/objects.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { Message, MessageKind } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { validateAutomationRunAt } from '../../../../platform/agentHost/common/automationRequest.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatInteractivity, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { ChatDynamicVariableModel } from '../../chat/browser/attachments/chatDynamicVariables.js';
import { getDynamicVariablesForWidget } from '../../chat/browser/attachments/chatVariables.js';
import { IChatWidget } from '../../chat/browser/chat.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { IChatDraft } from '../../chat/common/attachments/chatDraft.js';
import { AutomationTarget, IAutomationDescriptor, IAutomationSchedule } from '../../chat/common/automations/automation.js';
import { AutomationMutationGuard, AutomationMutationUncertainError, AutomationUnavailableError, IAutomationService, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions } from '../../chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../chat/common/automations/automationsEnabled.js';
import { ChatInputCanScheduleContext } from '../common/contextkeys.js';
import { fromStoredChatDraft, toStoredChatDraft } from '../common/newChatDraftState.js';
import { hasSessionDraftContent, ISavedSessionDraftTarget } from '../common/savedSessionDrafts.js';
import { captureScheduledChatRequest, parseScheduledChatTime } from '../common/scheduledChatRequest.js';
import { SESSIONS_SEND_LATER_ENABLED_SETTING } from '../common/sessionConfig.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionDraftsService } from './sessionDraftsService.js';
import { ISessionGroupsService } from './sessionGroupsService.js';
import { ISessionsService } from './sessionsService.js';
import { IPendingSessionItem } from './views/pendingSessions.js';
import { IChatScheduledRequest, IChatScheduledRequestEditing } from '../../chat/common/model/chatViewModel.js';

const handoffStorageKey = 'sessions.scheduledChatHandoffs';
const receiptStorageKey = 'sessions.scheduledChatReceipts';
interface IScheduledChatReceipt {
	readonly operationId: string;
	readonly automationId: string;
}

interface IScheduledChatHandoff {
	readonly id: string;
	readonly toolOperationId?: string;
	readonly name?: string;
	readonly compositionId: string;
	readonly input: IChatDraft;
	readonly target: ISavedSessionDraftTarget;
	readonly automationTarget: AutomationTarget;
	readonly request: Message;
	readonly schedule: IAutomationSchedule;
	readonly requestedAutomationId?: string;
	readonly automationId?: string;
	readonly conversation?: IAutomationDescriptor['conversation'];
	readonly sourceTarget?: ISavedSessionDraftTarget;
	readonly recoverySaved?: boolean;
	readonly sourceReleased?: boolean;
	readonly groupApplied?: boolean;
}

export const IScheduledChatsService = createDecorator<IScheduledChatsService>('scheduledChatsService');

interface IScheduledChatItem extends IPendingSessionItem, IChatScheduledRequest {
	readonly conversation?: IAutomationDescriptor['conversation'];
}

export type IScheduledChatRequestOptions = Pick<ICreateAutomationOptions, 'name' | 'prompt' | 'schedule' | 'target' | 'sessionTemplate' | 'conversation'>;

export interface IPendingScheduledChatRequest {
	readonly handoffId: string;
	readonly automationId?: string;
	readonly providerId?: string;
	readonly name: string;
	readonly prompt: string;
	readonly runAt: string;
	readonly conversation?: IAutomationDescriptor['conversation'];
}

export type ScheduledChatSubmission =
	| { readonly status: 'accepted'; readonly automation: IAutomationDescriptor }
	| { readonly status: 'unknown'; readonly pending: IPendingScheduledChatRequest; readonly message: string };

export interface IScheduledChatsService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly items: IObservable<readonly IScheduledChatItem[]>;
	readonly claimedDraftIds: IObservable<ReadonlySet<string>>;
	canSchedule(session: ISession | undefined, conversation?: IAutomationDescriptor['conversation']): boolean;
	readonly availableProviders: IAutomationService['availableProviders'];
	schedule(input: IChatDraft, target: ISavedSessionDraftTarget, session: ISession, compositionId: string, conversation?: IAutomationDescriptor['conversation'], anchor?: HTMLElement): Promise<boolean>;
	hasRequest(operationId: string): boolean;
	scheduleRequest(options: IScheduledChatRequestOptions, operationId: string, mutationGuard?: AutomationMutationGuard, captureTemplate?: () => Promise<IScheduledChatRequestOptions['sessionTemplate']>): Promise<ScheduledChatSubmission>;
	getPendingRequests(): readonly IPendingScheduledChatRequest[];
	updateRequest(automation: IAutomationDescriptor, patch: IUpdateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult>;
	hasPendingHandoff(compositionId: string, input: IChatDraft): boolean;
	releaseSource(compositionId: string): void;
	assertUnscheduled(compositionId: string, input: IChatDraft): void;
	registerChatInput(widget: IChatWidget, session: IObservable<ISession | undefined>, chatResource: IObservable<URI | undefined>, canSend: IObservable<boolean>): IDisposable;
	scheduleChatInput(widget: IChatWidget): Promise<void>;
	assertChatInputUnscheduled(widget: IChatWidget, query: string): void;
}

export class ScheduledChatsService extends Disposable implements IScheduledChatsService {
	declare readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly items: IObservable<readonly IScheduledChatItem[]>;
	readonly claimedDraftIds: IObservable<ReadonlySet<string>>;
	readonly availableProviders: IAutomationService['availableProviders'];
	private readonly chatInputs = new Map<IChatWidget, { schedule(): Promise<void>; assertUnscheduled(query: string): void }>();
	private readonly automationsEnabled: IObservable<boolean>;
	private readonly editingRequest = observableValue<{ id: string; state: IChatScheduledRequestEditing } | undefined>(this, undefined);
	private readonly toolRequests = new SequencerByKey<string>();

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IAutomationService private readonly automationService: IAutomationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionDraftsService private readonly draftsService: ISessionDraftsService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService private readonly storageService: IStorageService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IFileService private readonly fileService: IFileService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IChatService private readonly chatService: IChatService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionGroupsService groupsService: ISessionGroupsService,
	) {
		super();
		const configured = observableConfigValue(SESSIONS_SEND_LATER_ENABLED_SETTING, false, configurationService);
		this.automationsEnabled = observableConfigValue(CHAT_AUTOMATIONS_ENABLED_SETTING, false, configurationService);
		const hidden = observableFromEvent(this, entitlementService.onDidChangeSentiment, () => entitlementService.sentiment.hidden);
		this.enabled = derived(this, reader => configured.read(reader) && !hidden.read(reader));
		this.availableProviders = automationService.availableProviders;
		const handoffsChanged = observableSignalFromEvent(this, storageService.onDidChangeValue(StorageScope.PROFILE, handoffStorageKey, this._store));
		this.claimedDraftIds = derived(this, reader => {
			handoffsChanged.read(reader);
			return new Set(this.enabled.read(reader) ? this.readHandoffs().filter(handoff => !handoff.conversation && !handoff.toolOperationId).map(handoff => handoff.compositionId) : []);
		});
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			handoffsChanged.read(reader);
			sessionsChanged.read(reader);
			const automations = automationService.automations.read(reader);
			const runs = automationService.runs.read(reader);
			const catalogueState = automationService.catalogueState.read(reader);
			const providers = automationService.availableProviders.read(reader);
			for (const handoff of this.readHandoffs()) {
				if (handoff.toolOperationId) {
					const automation = automations.find(automation => automation.target.providerId === handoff.target.providerId
						&& (automation.id === handoff.automationId || automation.id === handoff.requestedAutomationId || automation.creationId === handoff.id));
					if (automation && !handoff.automationId) {
						this.writeHandoff({ ...handoff, automationId: automation.id });
					}
					if (handoff.automationId && (automation?.oneTimeDispatchedAt
						|| !automation && catalogueState === 'ready' && providers.some(provider => provider.id === handoff.target.providerId))) {
						this.removeHandoff(handoff.id);
					}
				}
				if (!handoff.target.groupId || handoff.conversation || handoff.groupApplied) {
					continue;
				}
				const automation = automations.find(automation => automation.id === handoff.automationId && automation.oneTimeDispatchedAt);
				const resource = runs.find(run => run.id === automation?.oneTimeRunId)?.sessionResource;
				const session = resource && sessionsManagementService.getSession(resource);
				if (session) {
					if (groupsService.getGroup(handoff.target.groupId) && !groupsService.getGroupOfSession(session.sessionId)) {
						groupsService.addToGroup(session.sessionId, handoff.target.groupId);
					}
					this.writeHandoff({ ...handoff, groupApplied: true });
				}
			}
		}));
		this.items = derived(this, reader => {
			if (!this.enabled.read(reader)) {
				return [];
			}
			const runs = automationService.runs.read(reader);
			handoffsChanged.read(reader);
			const automations = automationService.automations.read(reader);
			const handoffs = this.readHandoffs();
			const editing = this.editingRequest.read(reader);
			const items = automationService.automations.read(reader)
				.filter(automation => automation.purpose === 'scheduledChat' && (!automation.oneTimeDispatchedAt || editing?.id === automation.id))
				.sort((a, b) => (a.schedule.runAt ?? '').localeCompare(b.schedule.runAt ?? ''))
				.map((automation): IScheduledChatItem => {
					const handoff = handoffs.find(handoff => handoff.id === automation.creationId);
					const conversation = automation.conversation ?? handoff?.conversation;
					const requestEditing = editing?.id === automation.id ? editing.state : undefined;
					const editAction = toAction({
						id: 'sessions.scheduled.edit',
						label: conversation ? localize('scheduledChat.editMessage', "Edit") : localize('scheduledChat.edit', "Edit as Draft"),
						class: ThemeIcon.asClassName(Codicon.edit),
						enabled: !automation.readOnlyReason && (!automation.oneTimeRunId || !conversation && !!automation.oneTimeDispatchRejectedAt),
						run: () => conversation ? this.startEditing(automation) : this.cancel(automation, true),
					});
					return {
						pendingSession: true, id: automation.id, kind: 'scheduled',
						title: automation.name,
						text: automation.request?.text ?? automation.prompt,
						attachments: automation.request?.attachments?.map(attachment => attachment.label) ?? [],
						conversation,
						description: automation.readOnlyReason ?? (automation.oneTimeRunId
							? runs.find(run => run.id === automation.oneTimeRunId)?.errorMessage ?? localize('scheduledChat.startedOrFailed', "Starting or needs attention")
							: automation.enabled ? localize('scheduledChat.at', "Scheduled for {0}", formatTime(automation.schedule.runAt)) : localize('scheduledChat.cancelled', "Not scheduled")),
						folderUri: automation.target.kind === 'workspace' ? automation.target.folderUri : undefined,
						providerId: automation.target.providerId,
						sessionType: automation.target.sessionTypeId,
						environmentId: handoff?.target.environmentId,
						harness: handoff?.target.harness,
						applicationId: handoff?.target.applicationId,
						isQuickChat: automation.target.kind === 'quickChat',
						open: async () => { if (conversation) { this.startEditing(automation); } else { await this.cancel(automation, true); } },
						editAction: conversation ? editAction : undefined,
						editing: requestEditing,
						actions: requestEditing ? [
							toAction({ id: 'sessions.scheduled.save', label: localize('scheduledChat.save', "Save"), class: ThemeIcon.asClassName(Codicon.check), run: () => requestEditing.save() }),
							requestEditing.selectTime,
							toAction({ id: 'sessions.scheduled.cancelEdit', label: localize('scheduledChat.cancelEdit', "Cancel Edit"), class: ThemeIcon.asClassName(Codicon.closeSmall), run: () => requestEditing.cancel() }),
						] : [
							...(conversation ? [editAction] : [toAction({ id: 'sessions.scheduled.preview', label: localize('scheduledChat.preview', "Preview"), run: () => this.preview(automation) })]),
							toAction({ id: 'sessions.scheduled.sendNow', label: localize('scheduledChat.sendNow', "Send Now"), class: ThemeIcon.asClassName(Codicon.newLine), enabled: !automation.readOnlyReason && !automation.oneTimeRunId && automationService.canRunAutomation(automation.id), run: () => this.sendNow(automation) }),
							toAction({ id: 'sessions.scheduled.reschedule', label: localize('scheduledChat.reschedule', "Reschedule..."), class: ThemeIcon.asClassName(Codicon.clock), enabled: !automation.readOnlyReason && !automation.oneTimeRunId, run: (anchor?: HTMLElement) => this.reschedule(automation, isHTMLElement(anchor) ? anchor : undefined) }),
							...(conversation ? [] : [editAction]),
							toAction({ id: 'sessions.scheduled.cancel', label: localize('scheduledChat.cancel', "Cancel Schedule"), class: ThemeIcon.asClassName(Codicon.closeSmall), enabled: !automation.readOnlyReason && (!automation.oneTimeRunId || !!automation.oneTimeDispatchRejectedAt), run: () => this.cancel(automation, false) }),
						],
					};
				});
			for (const handoff of handoffs) {
				if (handoff.automationId || automations.some(automation => automation.creationId === handoff.id && automation.target.providerId === handoff.target.providerId)) {
					continue;
				}
				items.push({
					pendingSession: true, id: `handoff:${handoff.id}`, kind: 'scheduled',
					title: handoff.input.inputText.trim().split('\n')[0] || localize('sendLater.attachmentTitle', "Scheduled Request"),
					text: handoff.input.inputText,
					attachments: handoff.request.attachments?.map(attachment => attachment.label) ?? [],
					conversation: handoff.conversation,
					description: localize('sendLater.confirming', "Scheduling outcome not yet confirmed"),
					folderUri: handoff.target.folderUri, providerId: handoff.target.providerId, sessionType: handoff.target.sessionTypeId, isQuickChat: !handoff.target.folderUri,
					environmentId: handoff.target.environmentId, harness: handoff.target.harness, applicationId: handoff.target.applicationId,
					open: async () => { await this.retryHandoff(handoff); },
					actions: [toAction({ id: 'sessions.scheduled.reconcile', label: localize('sendLater.reconcile', "Reconcile Schedule"), class: ThemeIcon.asClassName(Codicon.sync), run: async () => { await this.retryHandoff(handoff); } })],
				});
			}
			return items;
		});
	}

	canSchedule(session: ISession | undefined, conversation?: IAutomationDescriptor['conversation']): boolean {
		return !!session && this.enabled.get() && !this.entitlementService.sentiment.hidden
			&& this.automationsEnabled.get()
			&& this.availableProviders.get().some(provider => provider.id === session.providerId && provider.supportsOneTimeAutomation && (!conversation || provider.supportsExistingChatAutomation))
			&& this.automationService.canCreateAutomation(session.providerId);
	}

	registerChatInput(widget: IChatWidget, session: IObservable<ISession | undefined>, chatResource: IObservable<URI | undefined>, canSend: IObservable<boolean>): IDisposable {
		const store = new DisposableStore();
		const modelChanged = observableSignalFromEvent(this, widget.onDidChangeViewModel);
		store.add(autorun(reader => {
			modelChanged.read(reader);
			const currentSession = session.read(reader);
			const resource = chatResource.read(reader);
			const requests = this.items.read(reader).filter(item => item.conversation
				&& isEqual(item.conversation.sessionResource, currentSession?.resource)
				&& isEqual(item.conversation.chatResource, resource));
			widget.viewModel?.setScheduledRequests(requests);
		}));
		store.add(toDisposable(() => widget.viewModel?.setScheduledRequests([])));
		const busy = observableValue(this, false);
		let compositionId = generateUuid();
		const available = derived(this, reader => {
			this.enabled.read(reader);
			this.automationsEnabled.read(reader);
			this.availableProviders.read(reader);
			const currentSession = session.read(reader);
			const resource = chatResource.read(reader);
			const chat = currentSession?.chats.read(reader).find(chat => isEqual(chat.resource, resource));
			return !!currentSession && !!chat && canSend.read(reader)
				&& !this.items.read(reader).some(item => item.editing && isEqual(item.conversation?.chatResource, resource))
				&& currentSession.status.read(reader) !== SessionStatus.Untitled
				&& !currentSession.isArchived.read(reader) && !chat.isArchived.read(reader)
				&& chat.interactivity.read(reader) === ChatInteractivity.Full
				&& this.canSchedule(currentSession, { sessionResource: currentSession.resource, chatResource: chat.resource });
		});
		const key = ChatInputCanScheduleContext.bindTo(widget.scopedContextKeyService);
		store.add(autorun(reader => key.set(available.read(reader))));
		const registration = {
			schedule: async () => {
				const currentSession = session.get();
				const resource = chatResource.get();
				const model = widget.viewModel?.model;
				if (busy.get() || !available.get() || !currentSession || !resource || !model || widget.viewModel?.editing) {
					throw new Error(localize('sendLater.chatUnavailable', "Send Later is not available for this conversation."));
				}
				const input = captureChatInput(widget);
				if (!hasSessionDraftContent(input)) {
					throw new Error(localize('sendLater.empty', "Enter a request before choosing Send Later."));
				}
				const state = model.inputModel.state.get();
				const conversation = { sessionResource: currentSession.resource, chatResource: resource };
				const target: ISavedSessionDraftTarget = {
					providerId: currentSession.providerId, sessionTypeId: currentSession.sessionType,
					folderUri: currentSession.isQuickChat?.get() ? undefined : currentSession.workspace.get()?.folders[0]?.root,
					environmentId: currentSession.environment, harness: currentSession.harness, applicationId: currentSession.application.get().id,
				};
				busy.set(true, undefined);
				widget.input.setInputEnabled(false);
				try {
					if (await this.schedule(input, target, currentSession, compositionId, conversation, widget.input.executeToolbarElement)) {
						if (widget.viewModel?.model === model && stringify(toStoredChatDraft(captureChatInput(widget))) === stringify(toStoredChatDraft(input))) {
							widget.setInput('');
							widget.attachmentModel.clearAndSetContext();
						}
						const latestState = model.inputModel.state.get();
						if (latestState === state || latestState?.inputText === input.inputText
							&& stringify(latestState.attachments) === stringify(input.attachments)
							&& stringify(latestState.contrib?.[ChatDynamicVariableModel.ID] ?? []) === stringify(input.references ?? [])) {
							model.inputModel.setState({ inputText: '', attachments: [], contrib: { ...state?.contrib, [ChatDynamicVariableModel.ID]: [] } });
						}
						for (const handoff of this.readHandoffs()) {
							if (handoff.automationId && !handoff.sourceReleased
								&& isEqual(handoff.conversation?.sessionResource, conversation.sessionResource)
								&& isEqual(handoff.conversation?.chatResource, conversation.chatResource)
								&& stringify(toStoredChatDraft(handoff.input)) === stringify(toStoredChatDraft(input))) {
								this.writeHandoff({ ...handoff, sourceReleased: true });
							}
						}
						compositionId = generateUuid();
					}
				} finally {
					busy.set(false, undefined);
					if (this.chatInputs.get(widget) === registration && widget.viewModel?.model === model) {
						widget.input.setInputEnabled(canSend.get(), true);
					}
				}
			},
			assertUnscheduled: (query: string) => {
				if (query !== widget.getInput()) {
					return;
				}
				const currentSession = session.get();
				const resource = chatResource.get();
				if (busy.get() || currentSession && resource && this.readHandoffs().some(handoff =>
					!handoff.recoverySaved && !handoff.sourceReleased && isEqual(handoff.conversation?.sessionResource, currentSession.resource)
					&& isEqual(handoff.conversation?.chatResource, resource)
					&& stringify(toStoredChatDraft(handoff.input)) === stringify(toStoredChatDraft(captureChatInput(widget))))) {
					throw new Error(localize('sendLater.chatHandedOff', "This request is being scheduled. Reconcile or cancel it in this chat or Automations before sending it again."));
				}
			},
		};
		this.chatInputs.set(widget, registration);
		store.add(toDisposable(() => { this.chatInputs.delete(widget); key.reset(); }));
		return store;
	}

	async scheduleChatInput(widget: IChatWidget): Promise<void> {
		const registration = this.chatInputs.get(widget);
		if (!registration) {
			throw new Error(localize('sendLater.noChatInput', "Send Later is not available in this chat input."));
		}
		await registration.schedule();
	}

	assertChatInputUnscheduled(widget: IChatWidget, query: string): void {
		this.chatInputs.get(widget)?.assertUnscheduled(query);
	}

	private assertEnabled(): void {
		if (!this.enabled.get() || this.entitlementService.sentiment.hidden) {
			throw new Error(localize('sendLater.disabled', "Send Later is disabled. Manage existing scheduled requests in Automations."));
		}
	}

	private readHandoffs(): IScheduledChatHandoff[] {
		const raw = this.storageService.get(handoffStorageKey, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		const value: { version?: number; handoffs?: IScheduledChatHandoff[] } = parse(raw);
		if (value.version !== 1 || !Array.isArray(value.handoffs)) {
			throw new Error(localize('sendLater.invalidStorage', "The saved scheduling handoff could not be read. Its stored content has not been changed."));
		}
		return value.handoffs.map(handoff => ({ ...handoff, input: fromStoredChatDraft(handoff.input) }));
	}

	private writeHandoff(handoff: IScheduledChatHandoff): void {
		const handoffs = this.readHandoffs().filter(candidate => candidate.id !== handoff.id);
		this.storageService.store(handoffStorageKey, stringify({
			version: 1,
			handoffs: [...handoffs, handoff].map(value => ({ ...value, input: toStoredChatDraft(value.input) })),
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private removeHandoff(id: string): void {
		const handoffs = this.readHandoffs();
		const handoff = handoffs.find(handoff => handoff.id === id);
		if (handoff?.toolOperationId && handoff.automationId) {
			const receipts = this.readReceipts().filter(receipt => receipt.operationId !== handoff.toolOperationId);
			this.storageService.store(receiptStorageKey, stringify({
				version: 1, receipts: [...receipts, { operationId: handoff.toolOperationId, automationId: handoff.automationId }],
			}), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		this.storageService.store(handoffStorageKey, stringify({
			version: 1, handoffs: handoffs.filter(handoff => handoff.id !== id).map(handoff => ({ ...handoff, input: toStoredChatDraft(handoff.input) })),
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private readReceipts(): IScheduledChatReceipt[] {
		const raw = this.storageService.get(receiptStorageKey, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		const value: { version?: number; receipts?: IScheduledChatReceipt[] } = parse(raw);
		if (value.version !== 1 || !Array.isArray(value.receipts)) {
			throw new Error(localize('sendLater.invalidReceipts', "The saved scheduling receipts could not be read. Their stored content has not been changed."));
		}
		return value.receipts;
	}

	hasRequest(operationId: string): boolean {
		return this.readHandoffs().some(handoff => handoff.toolOperationId === operationId)
			|| this.readReceipts().some(receipt => receipt.operationId === operationId);
	}

	private async acceptedRequest(automationId: string): Promise<ScheduledChatSubmission> {
		await this.automationService.refresh?.();
		const automation = this.automationService.getAutomation(automationId);
		if (!automation) {
			throw new AutomationUnavailableError(localize('sendLater.previousRequestUnavailable', "This request was already accepted. Its definition is no longer available; it will not be recreated."));
		}
		return { status: 'accepted', automation };
	}

	hasPendingHandoff(compositionId: string, input: IChatDraft): boolean {
		const serialized = stringify(toStoredChatDraft(input));
		return this.readHandoffs().some(handoff => !handoff.toolOperationId && !handoff.conversation && !handoff.automationId && (handoff.compositionId === compositionId || stringify(toStoredChatDraft(handoff.input)) === serialized));
	}

	assertUnscheduled(compositionId: string, input: IChatDraft): void {
		if (this.hasPendingHandoff(compositionId, input) || this.readHandoffs().some(handoff => handoff.compositionId === compositionId)) {
			throw new Error(localize('sendLater.alreadyHandedOff', "This request has a scheduling handoff. Reconcile or cancel it in the sessions list or Automations before sending it again."));
		}
	}

	releaseSource(compositionId: string): void {
		for (const handoff of this.readHandoffs()) {
			if (handoff.compositionId === compositionId && handoff.automationId && !handoff.sourceReleased) {
				this.writeHandoff({ ...handoff, sourceReleased: true });
			}
		}
	}

	async schedule(input: IChatDraft, target: ISavedSessionDraftTarget, session: ISession, compositionId: string, conversation?: IAutomationDescriptor['conversation'], anchor?: HTMLElement): Promise<boolean> {
		this.assertEnabled();
		if (!this.canSchedule(session, conversation) || target.requireDevContainer) {
			throw new Error(localize('sendLater.unavailable', "Send Later requires a supported local agent host with Automations enabled."));
		}
		const previous = this.readHandoffs().find(handoff => !handoff.toolOperationId && !handoff.sourceReleased && !handoff.recoverySaved
			&& isEqual(handoff.conversation?.sessionResource, conversation?.sessionResource) && isEqual(handoff.conversation?.chatResource, conversation?.chatResource)
			&& stringify(handoff.sourceTarget ?? handoff.target) === stringify(target)
			&& (handoff.compositionId === compositionId || stringify(toStoredChatDraft(handoff.input)) === stringify(toStoredChatDraft(input))));
		if (previous) {
			if (!previous.automationId) {
				await this.retryHandoff(previous);
			}
			return true;
		}
		const date = await this.pickTime(anchor);
		if (!date) {
			return false;
		}
		const capturedConfiguration = conversation ? undefined : await this.sessionsManagementService.getAutomationSessionConfiguration(session);
		if (!conversation && !capturedConfiguration) {
			throw new Error(localize('sendLater.configurationUnavailable', "The agent configuration is not ready. Your input has been kept."));
		}
		const configuration = conversation ? undefined : { ...target.configuration, ...capturedConfiguration };
		const capturedInput = fromStoredChatDraft(parse(stringify(toStoredChatDraft(input))));
		const request = await this.captureRequest(capturedInput);
		const schedule: IAutomationSchedule = { interval: 'once', runAt: date.toISOString(), scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
		const automationTarget: AutomationTarget = target.folderUri
			? {
				kind: 'workspace', folderUri: target.folderUri, providerId: session.providerId, sessionTypeId: session.sessionType,
				isolation: configuration?.isolationMode === 'worktree'
					? { kind: 'worktree', branch: configuration.branch ?? '' }
					: configuration?.isolationMode === 'workspace' ? { kind: 'folder' } : { kind: 'default' },
			}
			: { kind: 'quickChat', providerId: session.providerId, sessionTypeId: session.sessionType };
		const handoff: IScheduledChatHandoff = { id: generateUuid(), compositionId, input: capturedInput, sourceTarget: target, target: { ...target, configuration }, request, automationTarget, schedule, conversation };
		this.writeHandoff(handoff);
		await this.submitHandoff(handoff, false);
		return true;
	}

	scheduleRequest(options: IScheduledChatRequestOptions, operationId: string, mutationGuard?: AutomationMutationGuard, captureTemplate?: () => Promise<IScheduledChatRequestOptions['sessionTemplate']>): Promise<ScheduledChatSubmission> {
		return this.toolRequests.queue(operationId, async () => {
			this.assertEnabled();
			mutationGuard?.();
			const runAt = validateAutomationRunAt(options.schedule.runAt);
			if (options.schedule.interval !== 'once' || !options.prompt.trim() || !operationId) {
				throw new Error(localize('sendLater.invalidRequest', "Scheduling requires a one-time request and a stable operation identity."));
			}
			let handoff = this.readHandoffs().find(candidate => candidate.toolOperationId === operationId);
			const retry = !!handoff;
			if (handoff) {
				if (handoff.name !== options.name || handoff.request.text !== options.prompt || handoff.schedule.runAt !== runAt
					|| !captureTemplate && stableStringify(handoff.target.configuration?.sessionTemplate) !== stableStringify(options.sessionTemplate)
					|| !equalScheduledTargets(handoff.automationTarget, options.target)
					|| !isEqual(handoff.conversation?.sessionResource, options.conversation?.sessionResource)
					|| !isEqual(handoff.conversation?.chatResource, options.conversation?.chatResource)) {
					throw new Error(localize('sendLater.changedOperation', "This scheduling operation already has a different saved request. Reconcile it before scheduling another request."));
				}
				if (handoff.automationId) {
					return this.acceptedRequest(handoff.automationId);
				}
			} else {
				const receipt = this.readReceipts().find(receipt => receipt.operationId === operationId);
				if (receipt) {
					return this.acceptedRequest(receipt.automationId);
				}
				if (Date.parse(runAt) <= Date.now()) {
					throw new AutomationUnavailableError(localize('sendLater.timePassed', "Choose a future send time."));
				}
				if (captureTemplate) {
					options = { ...options, sessionTemplate: await captureTemplate() };
				}
				mutationGuard?.();
				const target: ISavedSessionDraftTarget = {
					providerId: options.target.providerId,
					sessionTypeId: options.target.sessionTypeId,
					...(options.target.kind === 'workspace' ? { folderUri: options.target.folderUri } : {}),
					configuration: options.conversation ? undefined : {
						sessionTemplate: options.sessionTemplate,
						...(options.target.kind === 'workspace' ? {
							isolationMode: options.target.isolation.kind === 'worktree' ? 'worktree' : options.target.isolation.kind === 'folder' ? 'workspace' : undefined,
							branch: options.target.isolation.kind === 'worktree' ? options.target.isolation.branch : undefined,
						} : {}),
					},
				};
				handoff = {
					id: generateUuid(), toolOperationId: operationId, name: options.name, compositionId: operationId,
					input: { inputText: options.prompt, attachments: [] }, sourceReleased: true,
					target, automationTarget: options.target, conversation: options.conversation,
					request: { text: options.prompt, origin: { kind: MessageKind.User } },
					schedule: { interval: 'once', runAt, scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				};
				this.writeHandoff(handoff);
			}
			let dispatchAuthorized = false;
			const guard = () => {
				mutationGuard?.();
				dispatchAuthorized = true;
			};
			try {
				const automation = retry ? await this.retryHandoff(handoff, guard) : await this.submitHandoff(handoff, false, guard);
				return { status: 'accepted', automation };
			} catch (error) {
				const saved = this.readHandoffs().find(candidate => candidate.id === handoff.id);
				const receipt = !saved && this.readReceipts().find(receipt => receipt.operationId === operationId);
				if (receipt) {
					return this.acceptedRequest(receipt.automationId);
				}
				if (!retry && !dispatchAuthorized) {
					this.removeHandoff(handoff.id);
					throw error;
				}
				if (saved?.automationId) {
					return this.acceptedRequest(saved.automationId);
				}
				return { status: 'unknown', pending: this.toPendingRequest(saved ?? handoff), message: error instanceof Error ? error.message : String(error) };
			}
		});
	}

	getPendingRequests(): readonly IPendingScheduledChatRequest[] {
		return this.readHandoffs().filter(handoff => handoff.toolOperationId && !handoff.automationId)
			.map(handoff => this.toPendingRequest(handoff));
	}

	private toPendingRequest(handoff: IScheduledChatHandoff): IPendingScheduledChatRequest {
		return {
			handoffId: handoff.id, automationId: handoff.requestedAutomationId, providerId: handoff.target.providerId,
			name: handoff.name ?? handoff.input.inputText, prompt: handoff.request.text,
			runAt: handoff.schedule.runAt!, conversation: handoff.conversation,
		};
	}

	async updateRequest(automation: IAutomationDescriptor, patch: IUpdateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		const result = await this.automationService.updateAutomationIfUnchanged(automation.id, patch, automation, mutationGuard);
		if (result.kind === 'updated') {
			const handoff = this.readHandoffs().find(candidate => candidate.automationId === automation.id || candidate.id === automation.creationId);
			if (handoff) {
				this.writeHandoff({
					...handoff, name: result.automation.name, schedule: result.automation.schedule,
					request: result.automation.request ?? handoff.request,
					input: { ...handoff.input, inputText: result.automation.prompt },
				});
			}
		}
		return result;
	}

	private captureRequest(input: IChatDraft): Promise<Message> {
		return captureScheduledChatRequest(input, async (uri, range) => {
			const reference = await this.textModelService.createModelReference(uri);
			try {
				return range ? reference.object.textEditorModel.getValueInRange(range) : reference.object.textEditorModel.getValue();
			} finally {
				reference.dispose();
			}
		}, async uri => (await this.fileService.readFile(uri)).value, uri => this.workingCopyService.isDirty(uri));
	}

	private async retryHandoff(handoff: IScheduledChatHandoff, mutationGuard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
		this.assertEnabled();
		mutationGuard?.();
		await this.automationService.refresh?.();
		const existing = this.automationService.automations.get().find(automation =>
			(automation.id === handoff.requestedAutomationId || automation.creationId === handoff.id) &&
			automation.target.providerId === handoff.target.providerId);
		if (existing) {
			this.writeHandoff({ ...handoff, automationId: existing.id });
			status(localize('sendLater.reconciled', "The agent host has accepted this scheduled request."));
			return existing;
		}
		return this.submitHandoff(handoff, true, mutationGuard);
	}

	private async submitHandoff(handoff: IScheduledChatHandoff, retry: boolean, mutationGuard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
		const guard = () => {
			this.assertEnabled();
			if (!this.automationsEnabled.get() || !this.automationService.canCreateAutomation(handoff.target.providerId) || !this.availableProviders.get().some(provider => provider.id === handoff.target.providerId && provider.supportsOneTimeAutomation && (!handoff.conversation || provider.supportsExistingChatAutomation))
				|| (!retry && Date.parse(handoff.schedule.runAt!) <= Date.now())) {
				throw new AutomationUnavailableError(localize('sendLater.noLongerAvailable', "The scheduled time has passed or Send Later is no longer available. Your input has been kept."));
			}
			mutationGuard?.();
		};
		const automation = await this.automationService.createAutomation({
			creationId: handoff.id,
			onWillCreate: id => {
				handoff = { ...handoff, requestedAutomationId: id };
				this.writeHandoff(handoff);
			},
			name: handoff.name ?? (handoff.input.inputText.trim().split('\n')[0].slice(0, 100) || localize('sendLater.attachmentTitle', "Scheduled Request")),
			prompt: handoff.request.text,
			purpose: 'scheduledChat',
			request: handoff.request,
			conversation: handoff.conversation,
			schedule: handoff.schedule, target: handoff.automationTarget,
			sessionTemplate: handoff.target.configuration?.sessionTemplate,
			enabled: true,
		}, guard);
		this.writeHandoff({ ...handoff, automationId: automation.id });
		status(localize('sendLater.saved', "Request scheduled for {0}", formatTime(handoff.schedule.runAt)));
		return automation;
	}

	private async pickTime(anchor?: HTMLElement): Promise<Date | undefined> {
		const now = Date.now();
		const choices = [30, 60, 24 * 60].map(minutes => {
			const date = new Date(now + minutes * 60_000);
			return { label: minutes === 30 ? localize('sendLater.thirtyMinutes', "In 30 Minutes") : minutes === 60 ? localize('sendLater.oneHour', "In 1 Hour") : localize('sendLater.tomorrow', "In 24 Hours"), description: formatTime(date.toISOString()), date };
		});
		const picked = await this.quickInputService.pick([...choices, { label: localize('sendLater.customTime', "Choose Date and Time..."), description: '', date: undefined }], { title: localize('sendLater.title', "Send Later"), placeHolder: localize('sendLater.pickTime', "Choose when to send. Times use this device's time zone."), anchor, anchorPosition: anchor ? 'above' : undefined });
		if (!picked || picked.date) {
			return picked?.date;
		}
		const value = await this.quickInputService.input({
			anchor, anchorPosition: anchor ? 'above' : undefined,
			title: localize('sendLater.customTitle', "Send Later - Local Date and Time"),
			prompt: localize('sendLater.timeFormat', "Enter YYYY-MM-DD HH:mm in this device's time zone. The local agent host sends when available."),
			validateInput: async value => {
				const date = parseScheduledChatTime(value);
				return date && date.getTime() > Date.now() ? undefined : localize('sendLater.invalidTime', "Enter a valid future local date and time, for example 2027-01-15 09:30.");
			},
		});
		return value ? parseScheduledChatTime(value) : undefined;
	}

	private async preview(automation: IAutomationDescriptor): Promise<void> {
		this.assertEnabled();
		await this.dialogService.prompt({
			message: automation.name,
			detail: [
				localize('scheduledChat.previewTime', "Scheduled: {0}", formatTime(automation.schedule.runAt)),
				localize('scheduledChat.previewTarget', "Target: {0}", automation.target.kind === 'workspace' ? basename(automation.target.folderUri) : localize('scheduledChat.noWorkspace', "No Workspace")),
				localize('scheduledChat.previewModel', "Model: {0}", automation.sessionTemplate?.modelId ?? localize('scheduledChat.defaultModel', "Provider Default")),
				localize('scheduledChat.previewAttachments', "Attachments: {0}", automation.request?.attachments?.map(attachment => attachment.label).join(', ') || localize('scheduledChat.noAttachments', "None")),
				'', automation.prompt,
			].join('\n'),
			buttons: [],
			cancelButton: localize('scheduledChat.close', "Close"),
		});
	}

	private async sendNow(automation: IAutomationDescriptor): Promise<void> {
		this.assertEnabled();
		this.assertWritable(automation);
		await this.automationService.runAutomation(automation.id);
	}

	private async reschedule(automation: IAutomationDescriptor, anchor?: HTMLElement): Promise<void> {
		this.assertEnabled();
		this.assertWritable(automation);
		const date = await this.pickTime(anchor);
		if (!date) {
			return;
		}
		const result = await this.automationService.updateAutomationIfUnchanged(automation.id, { schedule: { ...automation.schedule, runAt: date.toISOString() } }, automation, () => this.assertEnabled());
		if (result.kind !== 'updated') {
			throw new Error(localize('scheduledChat.changed', "The scheduled request changed or has started. Refresh the scheduled messages before trying again."));
		}
		status(localize('scheduledChat.rescheduled', "Request rescheduled for {0}", formatTime(date.toISOString())));
	}

	private startEditing(automation: IAutomationDescriptor): void {
		this.assertEnabled();
		this.assertWritable(automation);
		const current = this.editingRequest.get();
		if (current?.id === automation.id) {
			return;
		}
		if (current && this.automationService.automations.get().some(item => item.id === current.id && !item.oneTimeDispatchedAt)) {
			throw new Error(localize('scheduledChat.finishEditing', "Save or cancel your other scheduled-message edit first."));
		}
		if (automation.oneTimeRunId) {
			throw new Error(localize('scheduledChat.changed', "The scheduled request changed or has started. Refresh the scheduled messages before trying again."));
		}
		if ([...this.chatInputs.keys()].some(widget => widget.viewModel?.editing && isEqual(widget.viewModel.sessionResource, automation.conversation?.chatResource))) {
			throw new Error(localize('scheduledChat.finishRequestEditing', "Save or cancel your other message edit first."));
		}
		const handoff = this.readHandoffs().find(candidate => candidate.automationId === automation.id || candidate.id === automation.creationId);
		const saving = observableValue(this, false);
		const state: IChatScheduledRequestEditing = {
			isSaving: saving,
			text: automation.request?.text ?? automation.prompt,
			input: handoff && fromStoredChatDraft(parse(stringify(toStoredChatDraft(handoff.input)))),
			retainedAttachments: handoff ? [] : automation.request?.attachments?.map(attachment => attachment.label),
			runAt: automation.schedule.runAt ?? '',
			description: formatTime(automation.schedule.runAt),
			selectTime: toAction({
				id: 'sessions.scheduled.editTime', label: localize('scheduledChat.editTime', "Change Send Time..."), class: ThemeIcon.asClassName(Codicon.clock), run: async (anchor?: HTMLElement) => {
					const date = await this.pickTime(isHTMLElement(anchor) ? anchor : undefined);
					if (date && this.editingRequest.get()?.state === state) {
						state.runAt = date.toISOString();
						state.description = formatTime(state.runAt);
						this.editingRequest.set({ id: automation.id, state }, undefined);
					}
				}
			}),
			save: async () => {
				if (saving.get()) {
					return;
				}
				saving.set(true, undefined);
				try {
					await this.saveEditedRequest(automation, state);
				} finally {
					saving.set(false, undefined);
				}
			},
			cancel: () => {
				if (!saving.get() && this.editingRequest.get()?.state === state) {
					this.editingRequest.set(undefined, undefined);
				}
			},
		};
		this.editingRequest.set({ id: automation.id, state }, undefined);
	}

	private async saveEditedRequest(automation: IAutomationDescriptor, state: IChatScheduledRequestEditing): Promise<void> {
		this.assertEnabled();
		this.assertWritable(automation);
		if (this.editingRequest.get()?.state !== state) {
			throw new Error(localize('scheduledChat.editClosed', "This scheduled-message edit is no longer open."));
		}
		const text = state.text;
		const schedule = { ...automation.schedule, runAt: state.runAt };
		if (!(Date.parse(schedule.runAt) > Date.now())) {
			throw new Error(localize('scheduledChat.editTimePassed', "Choose a future send time before saving."));
		}
		const handoff = this.readHandoffs().find(candidate => candidate.automationId === automation.id || candidate.id === automation.creationId);
		const original = automation.request ?? handoff?.request;
		if (!original) {
			throw new Error(localize('scheduledChat.editUnavailable', "The saved request content is unavailable. Manage this request in Automations."));
		}
		const textChanged = text !== original.text;
		const input = state.input && fromStoredChatDraft(parse(stringify(toStoredChatDraft(state.input))));
		const retained = original.attachments?.map(attachment => textChanged ? { ...attachment, range: undefined } : attachment);
		const attachments = input ? [
			...(!handoff ? retained ?? [] : []),
			...await Promise.all(input.attachments.map(async entry => {
				const originalIndex = handoff?.input.attachments.findIndex(attachment => attachment.id === entry.id) ?? -1;
				if (originalIndex >= 0 && retained?.[originalIndex]) {
					return retained[originalIndex];
				}
				const captured = await this.captureRequest({ ...input, inputText: text, attachments: [entry] });
				return captured.attachments![0];
			})),
		] : retained;
		if (!text.trim() && !attachments?.length) {
			throw new Error(localize('scheduledChat.emptyEdit', "Enter a message or keep an attachment before saving."));
		}
		const request = { ...original, text, attachments };
		const result = await this.automationService.updateAutomationIfUnchanged(automation.id, {
			name: text.trim().split('\n')[0].slice(0, 100) || automation.name,
			prompt: text, request, schedule,
		}, automation, () => {
			this.assertEnabled();
			if (this.editingRequest.get()?.state !== state || !(Date.parse(schedule.runAt) > Date.now())) {
				throw new Error(localize('scheduledChat.editTimePassed', "Choose a future send time before saving."));
			}
		});
		if (result.kind !== 'updated') {
			throw new Error(localize('scheduledChat.changed', "The scheduled request changed or has started. Refresh the scheduled messages before trying again."));
		}
		if (handoff) {
			const recovery = input ?? handoff.input;
			this.writeHandoff({
				...handoff, request, schedule,
				input: {
					...recovery, inputText: text,
					attachments: textChanged ? recovery.attachments.map(attachment => ({ ...attachment, range: undefined })) : recovery.attachments,
					references: textChanged ? [] : recovery.references,
				},
			});
		}
		if (this.editingRequest.get()?.state === state) {
			this.editingRequest.set(undefined, undefined);
		}
		status(localize('scheduledChat.edited', "Scheduled message saved for {0}", formatTime(schedule.runAt)));
	}

	private async cancel(automation: IAutomationDescriptor, edit: boolean): Promise<void> {
		this.assertEnabled();
		this.assertWritable(automation);
		const handoff = this.readHandoffs().find(candidate => candidate.automationId === automation.id || candidate.id === automation.creationId);
		if (!handoff) {
			throw new Error(localize('scheduledChat.recoveryUnavailable', "The original composition is unavailable on this device. Manage this request in Automations."));
		}
		// The recovery copy is durable before cancellation; an uncertain result never becomes a sendable draft.
		this.writeHandoff({ ...handoff, automationId: automation.id });
		if (automation.oneTimeRunId && !automation.oneTimeDispatchRejectedAt) {
			throw new AutomationMutationUncertainError(localize('scheduledChat.cancellationLost', "The scheduled request changed or has started. Its content is retained; check Automations before sending it again."));
		}
		if (automation.enabled && !automation.oneTimeDispatchRejectedAt) {
			const result = await this.automationService.updateAutomationIfUnchanged(automation.id, { enabled: false }, automation, () => this.assertEnabled());
			if (result.kind !== 'updated' || result.automation.oneTimeRunId) {
				throw new AutomationMutationUncertainError(localize('scheduledChat.cancellationLost', "The scheduled request changed or has started. Its content is retained; check Automations before sending it again."));
			}
		}
		if (handoff.conversation) {
			const session = this.sessionsManagementService.getSession(handoff.conversation.sessionResource);
			if (!session) {
				throw new Error(localize('scheduledChat.conversationUnavailable', "The schedule is cancelled and its content is retained. Open the original conversation before recovering it."));
			}
			const reference = await this.chatService.acquireOrLoadSession(handoff.conversation.chatResource, ChatAgentLocation.Chat, CancellationToken.None, 'scheduledChatRecovery');
			if (!reference) {
				throw new Error(localize('scheduledChat.chatUnavailable', "The original chat could not be loaded. The cancelled request is retained."));
			}
			try {
				const state = reference.object.inputModel.state.get();
				if (!handoff.recoverySaved) {
					if (state?.inputText.trim() || state?.attachments.length) {
						throw new Error(localize('scheduledChat.chatOccupied', "The schedule is cancelled and its content is retained. Clear the original chat input before recovering this request."));
					}
					reference.object.inputModel.setState({ inputText: handoff.input.inputText, attachments: handoff.input.attachments, contrib: { ...state?.contrib, [ChatDynamicVariableModel.ID]: handoff.input.references ?? [] } });
					this.writeHandoff({ ...handoff, recoverySaved: true });
				}
				await this.automationService.deleteAutomation(automation.id);
				this.removeHandoff(handoff.id);
				if (edit) {
					await this.sessionsService.openChat(session, handoff.conversation.chatResource);
				}
			} finally {
				reference.dispose();
			}
		} else if (this.draftsService.enabled.get()) {
			if (!handoff.recoverySaved) {
				this.draftsService.save(handoff.input, handoff.target, handoff.id);
				this.writeHandoff({ ...handoff, recoverySaved: true });
			}
			await this.automationService.deleteAutomation(automation.id);
			this.removeHandoff(handoff.id);
			if (edit) {
				await this.draftsService.open(handoff.id, { removeFromDrafts: true });
			}
		} else {
			if (!handoff.recoverySaved) {
				await this.draftsService.restoreRecovery(handoff.input, handoff.target);
				this.writeHandoff({ ...handoff, recoverySaved: true });
			}
			await this.automationService.deleteAutomation(automation.id);
			this.removeHandoff(handoff.id);
		}
		status(localize('scheduledChat.cancelledAnnouncement', "Schedule cancelled. The request content has been kept."));
	}

	private assertWritable(automation: IAutomationDescriptor): void {
		if (automation.readOnlyReason) {
			throw new Error(automation.readOnlyReason);
		}
	}
}

function captureChatInput(widget: IChatWidget): IChatDraft {
	return fromStoredChatDraft(parse(stringify(toStoredChatDraft({
		inputText: widget.getInput(),
		attachments: widget.input.getAttachedContext().asArray(),
		references: [...getDynamicVariablesForWidget(widget)],
	}))));
}

function equalScheduledTargets(a: AutomationTarget, b: AutomationTarget): boolean {
	return a.kind === b.kind && a.providerId === b.providerId && a.sessionTypeId === b.sessionTypeId
		&& (a.kind === 'quickChat' || b.kind === 'workspace' && isEqual(a.folderUri, b.folderUri) && equals(a.isolation, b.isolation));
}

function formatTime(value: string | undefined): string {
	return value ? new Date(value).toLocaleString(undefined, { timeZoneName: 'short' }) : localize('scheduledChat.timeUnavailable', "Time unavailable");
}
