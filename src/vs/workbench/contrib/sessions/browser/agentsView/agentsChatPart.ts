/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { raceTimeout } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableFromEvent, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { GroupDirection, IContentPart, IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ISessionHost } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IChatWidget } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { getChatWindowMainPartOptions } from '../../../chatWindow/browser/chatWindow.js';
import { enforceChatPartOptions } from '../../../chatWindow/browser/chatWindowService.js';
import { ChatWindowLayoutMode } from '../../../chatWindow/common/chatWindowLayout.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { IChatEditorWindow, registerSessionChatViewEditor } from '../chatEditor/chatEditor.js';
import { ChatWindowComposerModel, ChatWindowComposers, createChatWindowComposerResource, isChatWindowComposerResource } from '../chatEditor/chatWindowComposer.js';
import { SessionChatEditorEntry, waitForSessionChat } from '../chatEditor/sessionChatEditorHost.js';
import { IChatViewFactory } from '../chatViewFactory.js';
import { INewSessionTarget } from '../parts/chatView.js';
import { ISessionsListModelService } from '../sessionsListModelService.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { IAgentsChatPartFrame } from './agentsChatPartFrame.js';
import { AgentsChatPartAction, logAgentsChatPartAction } from './agentsChatPartTelemetry.js';
import { IAgentsViewFolderLocationService } from './agentsViewFolderLocation.js';
import { AgentsViewAvailable, InAgentsChatPartContext } from './agentsView.js';
import { EditorWindowMainSessionHost } from './editorWindowMainSessionHost.js';

/** The chats of the chat part, which it shows again as the window restores. */
const CHAT_PART_EDITORS_STORAGE_KEY = 'workbench.chatPart.editors';

/** How long restoring a chat of the chat part waits for its session to load. */
const RESTORE_SESSION_TIMEOUT = 30_000;

/** How long the chat part waits for the view of a composer to show. */
const COMPOSER_VIEW_TIMEOUT = 5_000;

/** A chat that the chat part shows, with its session. */
export interface IAgentsChatPartChat {
	readonly session: ISession;
	readonly chat: IChat;
}

export interface IAgentsChatPartOpenOptions {
	readonly preserveFocus?: boolean;
	/** Opens beside the active chat, in a group of its own. */
	readonly sideBySide?: boolean;
	/** Opens a new composer, also while the active tab is one that has not sent its session yet. */
	readonly newComposer?: boolean;
}

export const IAgentsChatPartService = createDecorator<IAgentsChatPartService>('agentsChatPartService');

/**
 * The chat part of an editor window with the Sessions view: it shows chats of sessions, from any workspace, each in a tab
 * of its own, beside the editor area, as a chat window shows them. The chat of its active tab is the window's active chat.
 */
export interface IAgentsChatPartService {
	readonly _serviceBrand: undefined;

	/** The host of the window, whose session and chat are those of the active tab of the chat part. */
	readonly mainWindowHost: ISessionHost;

	/** The chat of the active tab of the chat part, with its session. */
	readonly activeChat: IObservable<IAgentsChatPartChat | undefined>;

	/** Shows `chatResource` of `session`, or its main chat, in the chat part: in its tab, or in a new one. */
	openChat(session: ISession, chatResource: URI | undefined, options?: IAgentsChatPartOpenOptions): Promise<void>;

	/** Opens a new-session composer in a tab of the chat part, aimed at `target`. */
	openComposer(target: INewSessionTarget | undefined, options?: IAgentsChatPartOpenOptions): Promise<void>;

	/** Closes the tab of `chatResource`, where the chat part shows it. */
	closeChat(chatResource: URI): Promise<void>;

	/** Whether the chat part shows `chatResource` in one of its tabs. */
	isShowing(chatResource: URI): boolean;

	/** Whether one of its tabs is a new-session composer that has not sent its session yet. */
	hasComposer(): boolean;

	/** Closes the tabs of new-session composers with nothing typed or attached, and no send under way. */
	closeIdleComposers(): Promise<void>;

	/** Moves focus into the chat part. */
	focus(): void;

	/**
	 * Shows the chat part with the chats it had as it closed, also those of before a reload, and moves focus into it unless
	 * `preserveFocus`. Without any, it shows a new-session composer, aimed at `target`.
	 */
	show(target: INewSessionTarget | undefined, options?: { readonly preserveFocus?: boolean }): Promise<void>;

	/** The chat widget of the input of the composer in the active tab, once it shows: its submits create the session. */
	getComposerWidget(): Promise<IChatWidget | undefined>;

	/** Shows again the chats the chat part showed as the window last closed, when the layout restores it shown. */
	restore(): Promise<void>;
}

/**
 * Shows again the chats of the chat part that the layout restored shown. With chat hidden or disabled as the window starts,
 * such as with AI features off, it hides the chat part instead, without its chats.
 */
export async function restoreAgentsChatPart(layoutService: IWorkbenchLayoutService, contextKeyService: IContextKeyService, chatPart: () => IAgentsChatPartService): Promise<void> {
	if (!layoutService.isVisible(Parts.CHAT_PART)) {
		return;
	}
	if (!contextKeyService.contextMatchesRules(AgentsViewAvailable)) {
		layoutService.setPartHidden(true, Parts.CHAT_PART);
		return;
	}
	await chatPart().restore();
}

/**
 * One chat of the chat part: a tab of it that shows a session's chat, or a new-session composer until a request it sends
 * starts its session (see {@link SessionChatEditorEntry}). It closes its tab as the chat ends.
 */
class AgentsChatPartChat extends SessionChatEditorEntry {

	readonly active: IObservable<boolean>;

	constructor(
		chatResource: URI,
		composer: ChatWindowComposerModel | undefined,
		readonly window: IObservable<IChatEditorWindow | undefined>,
		activeInput: IObservable<EditorInput | undefined>,
		private readonly _close: (chat: AgentsChatPartChat) => void,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IChatService chatService: IChatService,
		@ISessionsListModelService sessionsListModelService: ISessionsListModelService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(chatResource, sessionsManagementService, chatService, sessionsListModelService, sessionsProvidersService, configurationService);
		this.active = derived(this, reader => activeInput.read(reader) === this.input);
		this._register(this.onDidEnd(() => this._close(this)));
		this.start(composer, 'AgentsChatPart#open');
	}

	protected closeShown(): void {
		this._close(this);
	}
}

interface IStoredChatPartEditors {
	readonly chats: readonly string[];
	readonly active: number;
}

export class AgentsChatPartService extends Disposable implements IAgentsChatPartService {

	declare readonly _serviceBrand: undefined;

	private readonly _activeInput = observableValue<EditorInput | undefined>(this, undefined);
	readonly activeChat: IObservable<IAgentsChatPartChat | undefined>;

	private _part: IContentPart | undefined;
	private readonly _partStore = this._register(new DisposableStore());
	private readonly _chats = this._register(new DisposableMap<EditorInput, AgentsChatPartChat>());
	/** Set while tabs change other than as the user picks one: as chats restore, open or close. Only a picked tab moves the window's folder. */
	private _restoringChats = false;
	private _openingChat = false;
	private _closingTabs = 0;
	private _composers: ChatWindowComposers | undefined;
	private readonly _window: IChatEditorWindow;
	private _restored = false;
	/** Whether the chat part changes its visibility as it restores, which it reports as restoring, not opening or closing. */
	private _restoring = false;

	constructor(
		@ISessionHost readonly mainWindowHost: ISessionHost,
		@IAgentsChatPartFrame private readonly _frame: IAgentsChatPartFrame,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IChatViewFactory private readonly _chatViewFactory: IChatViewFactory,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentsViewFolderLocationService private readonly _folderLocationService: IAgentsViewFolderLocationService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this._windowFolders = observableFromEvent(this, workspaceContextService.onDidChangeWorkspaceFolders, () => workspaceContextService.getWorkspace().folders.map(folder => folder.uri));

		this.activeChat = derived(this, reader => {
			const input = this._activeInput.read(reader);
			return input ? this._chats.get(input)?.shown.read(reader) : undefined;
		});
		// The window's host, as its service, shows the active tab's chat
		if (this.mainWindowHost instanceof EditorWindowMainSessionHost) {
			this._register(this.mainWindowHost.bindShownChat(this.activeChat));
		}

		// The chats show beside the editor area, whose editors their Session Activity Bars read
		this._window = {
			layoutMode: constObservable(ChatWindowLayoutMode.SideBySide),
			inputOnly: constObservable(false),
			resizing: constObservable(false),
			mainPart: this._editorGroupsService.mainPart,
			toggleConversation: () => { },
		};

		this._register(this._layoutService.onDidChangePartVisibility(({ partId, visible }) => {
			if (partId === Parts.CHAT_PART && !this._restoring) {
				this._log(visible ? 'open' : 'close');
			}
		}));
		this._register(this._storageService.onWillSaveState(() => this._save()));

		// Chat turned off, such as as AI features are disabled, closes the chat part; it is off until chat starts
		const chatEnabledKeys = new Set([ChatContextKeys.enabled.key]);
		let chatEnabled = !!ChatContextKeys.enabled.getValue(_contextKeyService);
		this._register(_contextKeyService.onDidChangeContext(e => {
			if (!e.affectsSome(chatEnabledKeys)) {
				return;
			}
			const enabled = !!ChatContextKeys.enabled.getValue(_contextKeyService);
			if (chatEnabled && !enabled) {
				this._layoutService.setPartHidden(true, Parts.CHAT_PART);
			}
			chatEnabled = enabled;
		}));
	}

	/** The folders of the window, the only ones its composers create sessions in, besides the folder each aims at. */
	private readonly _windowFolders: IObservable<readonly URI[]>;

	private get composers(): ChatWindowComposers {
		if (!this._composers) {
			this._composers = this._register(this._instantiationService.createInstance(ChatWindowComposers, (resource: URI) => this._waitForSession(resource)));
		}
		return this._composers;
	}

	async openChat(session: ISession, chatResource: URI | undefined, options?: IAgentsChatPartOpenOptions): Promise<void> {
		const resource = chatResource ?? session.mainChat.get().resource;
		const chat = this._findChat(resource) ?? this._addChat(resource, undefined);
		await this._open(chat, options);
		if (!this._restoringChats) {
			// Opening a session moves the window's folder to where it works, when that is one of the folder's locations
			void this._folderLocationService.switchToSession(session);
		}
	}

	async openComposer(target: INewSessionTarget | undefined, options?: IAgentsChatPartOpenOptions): Promise<void> {
		// A new session in the active tab while it is a composer that has not sent its session yet, as a chat window does
		const active = this._activeInput.get();
		const activeChat = active && this._chats.get(active);
		if (activeChat?.isComposer && !options?.sideBySide && !options?.newComposer) {
			return this._open(activeChat, options);
		}
		const resource = createChatWindowComposerResource();
		const composer = this.composers.create(resource, { target, allowedFolders: this._windowFolders }, session => this.openChat(session, undefined));
		await this._open(this._addChat(resource, composer), options);
	}

	async closeChat(chatResource: URI): Promise<void> {
		const chat = this._findChat(chatResource);
		if (chat) {
			this._closeChat(chat);
		}
	}

	isShowing(chatResource: URI): boolean {
		return !!this._findChat(chatResource);
	}

	async closeIdleComposers(): Promise<void> {
		const closes: Promise<unknown>[] = [];
		for (const chat of [...this._chats.values()]) {
			if (chat.isIdleComposer) {
				const group = this._groupOf(chat.input);
				if (group) {
					closes.push(group.closeEditor(chat.input));
				} else {
					this._chats.deleteAndDispose(chat.input);
				}
			}
		}
		await Promise.all(closes);
	}

	hasComposer(): boolean {
		for (const chat of this._chats.values()) {
			if (chat.isComposer) {
				return true;
			}
		}
		return false;
	}

	focus(): void {
		this._part?.activeGroup.focus();
	}

	async show(target: INewSessionTarget | undefined, options?: { readonly preserveFocus?: boolean }): Promise<void> {
		await this.restore();
		if (!this._tabCount()) {
			return this.openComposer(target, { preserveFocus: options?.preserveFocus });
		}
		this._layoutService.setPartHidden(false, Parts.CHAT_PART);
		if (!options?.preserveFocus) {
			this.focus();
		}
	}

	async getComposerWidget(): Promise<IChatWidget | undefined> {
		const active = this._activeInput.get();
		const chat = active && this._chats.get(active);
		if (!chat?.isComposer) {
			return undefined;
		}
		// Its view, and the widget of its input, show once its editor renders
		const widget = derived(reader => chat.view.read(reader)?.composerView.read(reader)?.chatWidget);
		const cts = new CancellationTokenSource();
		try {
			return await raceTimeout(waitForState(widget, widget => !!widget, undefined, cts.token).catch(() => undefined), COMPOSER_VIEW_TIMEOUT, () => cts.cancel());
		} finally {
			cts.dispose();
		}
	}

	async restore(): Promise<void> {
		// Once it shows chats opened since the window started, those of before are no longer the ones to show again
		if (this._restored || this._part) {
			return;
		}
		this._restored = true;
		this._restoring = true;
		try {
			await this._restoreChats();
		} finally {
			this._restoring = false;
		}
	}

	private async _restoreChats(): Promise<void> {
		this._restoringChats = true;
		try {
			await this._doRestoreChats();
		} finally {
			this._restoringChats = false;
		}
	}

	private async _doRestoreChats(): Promise<void> {
		const stored = this._readStored();
		const claimed: URI[] = [];
		const chats: AgentsChatPartChat[] = [];
		for (const value of stored?.chats ?? []) {
			let resource: URI;
			try {
				resource = URI.parse(value);
			} catch {
				continue;
			}
			if (isChatWindowComposerResource(resource)) {
				claimed.push(resource);
				const restored = await this.composers.restore(resource, session => this.openChat(session, undefined), this._windowFolders);
				if (restored?.kind === 'composer') {
					chats.push(this._addChat(resource, restored.composer));
				} else if (restored?.kind === 'session') {
					chats.push(this._findChat(restored.session.mainChat.get().resource) ?? this._addChat(restored.session.mainChat.get().resource, undefined));
				}
			} else {
				chats.push(this._findChat(resource) ?? this._addChat(resource, undefined));
			}
		}
		this.composers.didFinishRestore(claimed);

		if (!chats.length) {
			// Nothing to show again: the layout's chat part, shown or not, is closed
			this._layoutService.setPartHidden(true, Parts.CHAT_PART);
			return;
		}

		const part = this._ensurePart();
		const active = chats[Math.min(Math.max(stored?.active ?? 0, 0), chats.length - 1)];
		// Only the active tab shows its chat: the others create their views once they show. A group activates the first editor
		// it opens, inactive or not, so the active tab opens last.
		await this._editorService.openEditors(chats.map(chat => ({ editor: chat.input, options: { pinned: true, preserveFocus: true, inactive: true } })), part.activeGroup);
		await this._editorService.openEditor(active.input, { pinned: true, preserveFocus: true }, part.activeGroup);
		this.composers.didOpen(chats.map(chat => chat.chat.get()));
		if (this._layoutService.isVisible(Parts.CHAT_PART)) {
			this._log('restore');
		}
	}

	/** How many chats the chat part shows in its tabs, shown or not. */
	private _tabCount(): number {
		return this._part?.groups.reduce((count, group) => count + group.editors.filter(input => this._chats.has(input)).length, 0) ?? 0;
	}

	private _log(action: AgentsChatPartAction): void {
		logAgentsChatPartAction(this._telemetryService, action, this._tabCount());
	}

	private async _open(chat: AgentsChatPartChat, options: IAgentsChatPartOpenOptions | undefined): Promise<void> {
		const part = this._ensurePart();
		this._layoutService.setPartHidden(false, Parts.CHAT_PART);
		const group = this._groupOf(chat.input)
			?? (options?.sideBySide && !part.activeGroup.isEmpty ? part.addGroup(part.activeGroup, GroupDirection.RIGHT) : part.activeGroup);
		this._openingChat = true;
		try {
			await this._editorService.openEditor(chat.input, { pinned: true, preserveFocus: options?.preserveFocus }, group);
		} finally {
			this._openingChat = false;
		}
		this.composers.didOpen([chat.chat.get()]);
	}

	private _findChat(resource: URI): AgentsChatPartChat | undefined {
		for (const [, chat] of this._chats) {
			if (isEqual(chat.chat.get(), resource)) {
				return chat;
			}
		}
		return undefined;
	}

	private _groupOf(input: EditorInput): IEditorGroup | undefined {
		return this._part?.groups.find(group => group.contains(input));
	}

	private _addChat(resource: URI, composer: ChatWindowComposerModel | undefined): AgentsChatPartChat {
		const chat = this._instantiationService.createInstance(AgentsChatPartChat, resource, composer, constObservable(this._window), this._activeInput, (chat: AgentsChatPartChat) => this._closeChat(chat));
		this._chats.set(chat.input, chat);
		// It stays in the chat part: its editor shows there
		chat.input.setMoveRestriction({
			reason: localize('agentsChatPart.cannotMove', "A chat stays in the chat part."),
			canMoveTo: group => !!this._part?.groups.some(candidate => candidate.id === group),
		});
		Event.once(chat.input.onWillDispose)(() => this._chats.deleteAndDispose(chat.input));
		return chat;
	}

	private _closeChat(chat: AgentsChatPartChat): void {
		const group = this._groupOf(chat.input);
		if (group) {
			void group.closeEditor(chat.input).catch(onUnexpectedError);
		} else {
			this._chats.deleteAndDispose(chat.input);
		}
	}

	private _ensurePart(): IContentPart {
		if (this._part) {
			return this._part;
		}

		this._partStore.add(registerSessionChatViewEditor());
		// The part fills the chat part, which lays it out
		const container = $('.agents-chat-part');
		container.style.width = '100%';
		container.style.height = '100%';
		// The menus of its groups tell it apart from the editor area, such as its More Actions, which offer to close it
		const scopedContextKeyService = this._contextKeyService.createScoped(container);
		InAgentsChatPartContext.bindTo(scopedContextKeyService).set(true);
		const part = this._part = this._editorGroupsService.createEditorPart({
			container,
			label: localize('agentsChatPart.label', "Chat"),
			services: new ServiceCollection([ISessionHost, this.mainWindowHost], [IContextKeyService, scopedContextKeyService]),
		});
		this._partStore.add(this._frame.part.setContent(part));
		// It shows its chats as a chat window's chat part does: over the chat surface, with the same options of its tabs
		const background = this._chatViewFactory.createChatBackground?.(container, this._instantiationService);
		if (background) {
			this._partStore.add(background);
		}
		const showTabs = observableConfigValue<string | undefined>('workbench.editor.showTabs', undefined, this._configurationService);
		this._partStore.add(enforceChatPartOptions(part, derived(reader => getChatWindowMainPartOptions(showTabs.read(reader)))));
		// The part goes with the window; its chats are not dirty, so nothing moves back to the editor area
		this._partStore.add(toDisposable(() => part.forceClose()));
		// After the part, whose context is scoped in it
		this._partStore.add(scopedContextKeyService);

		// The active tab is the window's active chat
		const groupListeners = this._partStore.add(new DisposableMap<IEditorGroup>());
		const updateActive = () => this._activeInput.set(part.activeGroup.activeEditor ?? undefined, undefined);
		const trackGroup = (group: IEditorGroup) => {
			const listeners = new DisposableStore();
			listeners.add(Event.any(group.onDidActiveEditorChange, group.onDidCloseEditor)(() => {
				updateActive();
				this._hideIfEmpty();
			}));
			// A tab that becomes active as another closes was not picked
			listeners.add(group.onWillCloseEditor(() => this._closingTabs++));
			listeners.add(group.onDidCloseEditor(() => queueMicrotask(() => this._closingTabs = Math.max(0, this._closingTabs - 1))));
			listeners.add(group.onDidActiveEditorChange(() => this._onDidPickTab(group)));
			groupListeners.set(group, listeners);
		};
		part.groups.forEach(trackGroup);
		this._partStore.add(part.onDidAddGroup(trackGroup));
		this._partStore.add(part.onDidRemoveGroup(group => groupListeners.deleteAndDispose(group)));
		this._partStore.add(part.onDidChangeActiveGroup(group => {
			updateActive();
			this._onDidPickTab(group);
		}));
		updateActive();

		return part;
	}

	/** A tab the user picked shows its session: the window's folder moves to where that session works, as opening it does. */
	private _onDidPickTab(group: IEditorGroup): void {
		if (this._restoringChats || this._openingChat || this._closingTabs > 0 || !group.activeEditor) {
			return;
		}
		const session = this._chats.get(group.activeEditor)?.shown.get()?.session;
		if (session) {
			void this._folderLocationService.switchToSession(session);
		}
	}

	/** Closing the last chat closes the chat part, which gives the editor area its width back. */
	private _hideIfEmpty(): void {
		if (this._lifecycleService.willShutdown || !this._part || this._part.groups.some(group => !group.isEmpty)) {
			return;
		}
		this._layoutService.setPartHidden(true, Parts.CHAT_PART);
	}

	private _readStored(): IStoredChatPartEditors | undefined {
		const raw = this._storageService.get(CHAT_PART_EDITORS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return undefined;
		}
		try {
			const value = JSON.parse(raw) as Partial<IStoredChatPartEditors>;
			return Array.isArray(value.chats) && value.chats.every(chat => typeof chat === 'string') ? { chats: value.chats, active: typeof value.active === 'number' ? value.active : 0 } : undefined;
		} catch {
			return undefined;
		}
	}

	private _save(): void {
		// Not yet restored, it keeps what it stored
		if (!this._part) {
			return;
		}
		const inputs = this._part.groups.flatMap(group => group.editors).filter(input => this._chats.has(input));
		if (!inputs.length) {
			this._storageService.remove(CHAT_PART_EDITORS_STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}
		const value: IStoredChatPartEditors = {
			chats: inputs.map(input => this._chats.get(input)!.chat.get().toString()),
			active: Math.max(0, inputs.indexOf(this._activeInput.get() ?? inputs[0])),
		};
		this._storageService.store(CHAT_PART_EDITORS_STORAGE_KEY, JSON.stringify(value), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private async _waitForSession(resource: URI): Promise<ISession | undefined> {
		return (await waitForSessionChat(this._sessionsManagementService, resource, RESTORE_SESSION_TIMEOUT))?.session;
	}

}

/**
 * The folder a composer of the chat part aims at: the window's folder of the active editor, else the window's first. Its
 * composers create sessions only in the window's folders (see `IChatWindowComposerInit.allowedFolders`).
 */
export function getAgentsChatPartComposerTarget(workspaceContextService: IWorkspaceContextService, editorService: IEditorService): INewSessionTarget | undefined {
	const activeResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
	const folder = (activeResource && workspaceContextService.getWorkspaceFolder(activeResource)) ?? workspaceContextService.getWorkspace().folders.at(0);
	return folder ? { folderUri: folder.uri } : undefined;
}
