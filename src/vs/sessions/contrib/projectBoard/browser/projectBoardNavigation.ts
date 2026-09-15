/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindowById } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { IEditorPane } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { ChatEditorInput } from '../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';
import { ChatEditor, IChatEditorOptions } from '../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditor.js';
import { IChatModelReference, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModelInputState } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getNewChatSessionResource, LocalChatSessionUri } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { AUX_WINDOW_GROUP, IEditorService, PreferredGroup } from '../../../../workbench/services/editor/common/editorService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionTypeAuthRequirement } from '../../../services/sessions/common/session.js';
import { IProjectBoardCard } from '../common/projectBoardModel.js';

export interface IProjectBoardDraft {
	readonly id: string;
	readonly resource: URI;
	readonly hasContent: boolean;
	readonly submitted: boolean;
}

interface IDraftEntry {
	readonly id: string;
	readonly lifetime: DisposableStore;
	readonly editorListeners: MutableDisposable<DisposableStore>;
	readonly modelRef: MutableDisposable<IChatModelReference>;
	resource: URI;
	inputState?: IChatModelInputState;
	input?: ChatEditorInput;
	group?: number;
	hasContent: boolean;
	submitted: boolean;
	deleting: boolean;
}

export class ProjectBoardChatWindows extends Disposable {
	private readonly opening = new Map<string, Promise<void>>();
	private readonly entries = new Map<string, IDraftEntry>();
	readonly drafts = observableValue<readonly IProjectBoardDraft[]>(this, []);

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IHostService private readonly hostService: IHostService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IChatService private readonly chatService: IChatService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IAgentHostUntitledProvisionalSessionService private readonly provisionalSessions: IAgentHostUntitledProvisionalSessionService,
		@IAgentHostConnectionsService private readonly agentConnections: IAgentHostConnectionsService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._register(this.sessionsManagementService.onDidChangeSessions(() => this.publishDrafts()));
		this._register(this.provisionalSessions.onDidChange(() => this.publishDrafts()));
		this._register(this.chatService.onDidSubmitRequest(event => {
			for (const entry of this.entries.values()) {
				const resource = this.publishedResource(entry.resource);
				if (isEqual(resource, event.chatSessionResource)) {
					entry.resource = resource;
					entry.submitted = true;
				}
			}
			this.publishDrafts();
		}));
	}

	async open(card: IProjectBoardCard): Promise<void> {
		let pending = this.opening.get(card.id);
		if (!pending) {
			pending = this.openEditor(card).finally(() => this.opening.delete(card.id));
			this.opening.set(card.id, pending);
		}

		await pending;
	}

	async closeActiveSession(windowId: number): Promise<URI | undefined> {
		if (windowId === mainWindow.vscodeWindowId) {
			return undefined;
		}
		const group = this.editorGroupsService.parts.find(part => part.windowId === windowId)?.activeGroup;
		const input = group?.activeEditor;
		if (group?.activeEditorPane?.getId() !== ChatEditorInput.EditorID || !input?.resource) {
			return undefined;
		}
		// Draft card IDs retain the original editor URI even when the input model rebinds.
		const resource = this.entries.has(input.resource.toString()) ? input.resource : this.publishedResource(input.resource);
		return await group.closeEditor(input) ? resource : undefined;
	}

	async createNewSession(): Promise<void> {
		const types = this.sessionsManagementService.getQuickChatSessionTypes();
		const active = this.sessionsService.activeSession.get();
		const target = types.find(type => type.providerId === active?.providerId && type.sessionType.id === active.sessionType)
			?? types.find(type => type.sessionType.authRequirement !== SessionTypeAuthRequirement.Unusable);
		if (!target) {
			throw new Error(localize('projectBoard.noSessionProvider', "No available provider can create a standalone session."));
		}
		const resource = getNewChatSessionResource(target.sessionType.chatSessionType ?? target.sessionType.id);
		const lifetime = this._register(new DisposableStore());
		const entry: IDraftEntry = {
			id: resource.toString(), resource, lifetime,
			editorListeners: lifetime.add(new MutableDisposable<DisposableStore>()),
			modelRef: lifetime.add(new MutableDisposable<IChatModelReference>()),
			hasContent: false, submitted: false, deleting: false,
		};
		this.entries.set(entry.id, entry);
		this.publishDrafts();
		try {
			await this.openDraft(entry.id);
		} catch (error) {
			if (!entry.hasContent && !entry.submitted) {
				await this.discardDraft(entry);
			}
			throw error;
		}
	}

	async openDraft(id: string): Promise<void> {
		const entry = this.entries.get(id);
		if (!entry) {
			throw new Error(localize('projectBoard.draftGone', "This session draft is no longer available."));
		}
		const existing = this.opening.get(id);
		if (existing) {
			return existing;
		}
		const pending = this.openDraftEditor(entry).finally(() => this.opening.delete(id));
		this.opening.set(id, pending);
		return pending;
	}

	private async openDraftEditor(entry: IDraftEntry): Promise<void> {
		const title = localize('projectBoard.newSession', "New Session");
		const savedInputState = entry.input ? undefined : entry.inputState;
		const input = entry.input ?? this.instantiationService.createInstance(ChatEditorInput, entry.resource, { title: { fallback: title } });
		entry.input = input;
		const listeners = new DisposableStore();
		entry.editorListeners.value = listeners;
		listeners.add(input.onWillDispose(() => {
			const model = entry.modelRef.value?.object ?? (input.sessionResource && this.chatService.getSession(input.sessionResource));
			const state = model?.inputModel.state.get();
			entry.hasContent ||= !!state?.inputText.length || !!state?.attachments.length;
			entry.submitted ||= !!model?.hasRequests;
			entry.input = undefined;
			entry.group = undefined;
			if (!entry.hasContent && !entry.submitted && !entry.deleting) {
				void this.discardDraft(entry);
			} else {
				entry.editorListeners.clear();
				this.publishDrafts();
			}
		}));
		let pane: IEditorPane;
		try {
			pane = await this.openInput(input, entry.group, savedInputState);
		} catch (error) {
			if (!this.entries.has(entry.id) || !entry.input) {
				return;
			}
			throw error;
		}
		if (!this.entries.has(entry.id) || !entry.input) {
			return;
		}
		if (!(pane instanceof ChatEditor) || !pane.widget.viewModel) {
			throw new Error(localize('projectBoard.draftLoadFailed', "The new session composer could not be loaded."));
		}
		entry.group = pane.group.id;
		const widget = pane.widget;
		const capture = () => {
			const resource = widget.viewModel?.sessionResource;
			if (resource && !isEqual(entry.modelRef.value?.object.sessionResource, resource)) {
				entry.modelRef.value = this.chatService.acquireExistingSession(resource, 'ProjectBoard.draft');
				entry.resource = resource;
			}
			entry.inputState = widget.getInputState();
			entry.hasContent ||= !!widget.getInput().length || !!entry.inputState?.attachments?.length;
			entry.submitted ||= !!widget.viewModel?.model.hasRequests;
			this.publishDrafts();
		};
		listeners.add(widget.inputEditor.onDidChangeModelContent(capture));
		listeners.add(widget.attachmentModel.onDidChange(capture));
		listeners.add(widget.onDidChangeViewModel(capture));
		listeners.add(widget.onDidSubmitAgent(() => {
			entry.submitted = true;
			capture();
		}));
		capture();
	}

	private publishDrafts(): void {
		for (const entry of this.entries.values()) {
			const resource = this.publishedResource(entry.resource);
			if (entry.submitted && this.sessionsManagementService.getSessionForChatResource(resource)) {
				this.entries.delete(entry.id);
				this._store.delete(entry.lifetime);
			}
		}
		this.drafts.set([...this.entries.values()].map(({ id, resource, hasContent, submitted }) => ({ id, resource, hasContent, submitted })), undefined);
	}

	async deleteDraft(id: string): Promise<boolean> {
		const entry = this.entries.get(id);
		if (!entry || entry.deleting) {
			return false;
		}
		entry.deleting = true;
		try {
			if (entry.input && entry.group !== undefined) {
				const group = this.editorGroupsService.getGroup(entry.group);
				if (!group) {
					throw new Error(localize('projectBoard.draftEditorMissing', "The draft editor group is no longer available."));
				}
				if (!await group.closeEditor(entry.input)) {
					return false;
				}
			}
			await this.discardDraft(entry);
			return this.entries.get(id) === undefined;
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to close draft for deletion', error);
			this.notificationService.error(localize('projectBoard.deleteDraftFailed', "The session draft could not be deleted."));
			return false;
		} finally {
			entry.deleting = false;
		}
	}

	private async discardDraft(entry: IDraftEntry): Promise<void> {
		this.entries.delete(entry.id);
		this.publishDrafts();
		try {
			if (this.provisionalSessions.get(entry.resource)) {
				await this.provisionalSessions.disposeSession(entry.resource);
			} else if (LocalChatSessionUri.isLocalSession(entry.resource)) {
				await this.chatService.removeHistoryEntry(entry.resource);
			}
			this._store.delete(entry.lifetime);
		} catch (error) {
			this.entries.set(entry.id, entry);
			this.publishDrafts();
			this.logService.error('[ProjectBoard] Failed to discard untouched session draft', error);
			this.notificationService.error(localize('projectBoard.discardFailed', "The empty session draft could not be removed."));
		}
	}

	private publishedResource(resource: URI): URI {
		const materialized = this.chatSessionsService.getMaterializedSessionResource(resource);
		if (materialized) {
			return materialized;
		}
		const provisional = this.provisionalSessions.get(resource);
		const connection = provisional && this.agentConnections.resolveSessionResource(resource);
		if (connection) {
			for (const session of this.sessionsManagementService.getSessions()) {
				const candidate = this.agentConnections.resolveSessionResource(session.resource);
				if (candidate?.connectionAuthority === connection.connectionAuthority && isEqual(candidate.backendSession, provisional)) {
					return session.mainChat.get().resource;
				}
			}
		}
		return resource;
	}

	private async openEditor(card: IProjectBoardCard): Promise<void> {
		if (!await this.sessionsService.canOpenSession(card.session)) {
			return;
		}
		const identifier = { resource: card.chat.resource, typeId: ChatEditorInput.TypeID, editorId: ChatEditorInput.EditorID };
		const existing = this.editorService.findEditors(identifier).find(({ groupId }) => {
			const group = this.editorGroupsService.getGroup(groupId);
			return group && group.windowId !== mainWindow.vscodeWindowId;
		}) ?? this.editorGroupsService.groups
			.filter(group => group.windowId !== mainWindow.vscodeWindowId)
			.flatMap(group => group.editors.map(editor => ({ editor, groupId: group.id })))
			.find(({ editor }) => editor instanceof ChatEditorInput && editor.sessionResource && isEqual(
				this.publishedResource(editor.sessionResource),
				card.chat.resource));
		// A typed input avoids the resolver moving a matching editor out of the main window.
		const input = existing?.editor ?? this.instantiationService.createInstance(ChatEditorInput, card.chat.resource, { title: { fallback: card.title } });
		try {
			await this.openInput(input, existing?.groupId);
		} finally {
			if (!existing && !this.editorService.isOpened(identifier)) {
				input.dispose();
			}
		}
		try {
			await this.sessionsManagementService.markRead(card.session);
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to mark opened chat read', error);
			this.notificationService.error(localize('projectBoard.markReadFailed', "The chat opened, but its read state could not be updated."));
		}
	}

	private async openInput(input: EditorInput, group?: PreferredGroup, modelInputState?: IChatModelInputState): Promise<IEditorPane> {
		const options: IChatEditorOptions = {
			pinned: true,
			revealIfOpened: false,
			auxiliary: { compact: true, bounds: { width: 800, height: 640 } },
			...(modelInputState ? { modelInputState } : {}),
		};
		const pane = await this.editorService.openEditor(input, options, group ?? AUX_WINDOW_GROUP);
		const targetWindow = pane && getWindowById(pane.group.windowId)?.window;
		if (!pane || pane.getId() !== ChatEditorInput.EditorID || !targetWindow || targetWindow === mainWindow) {
			throw new Error(localize('projectBoard.chatWindowFailed', "The chat could not be opened in a separate window."));
		}
		await this.hostService.focus(targetWindow);
		pane.focus();
		return pane;
	}
}
