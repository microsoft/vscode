/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, constObservable, derived, IObservable, IReader, observableFromEvent, observableSignalFromEvent, observableValue, runOnChange, waitForState } from '../../../../base/common/observable.js';
import { extUri, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { EditorCloseContext } from '../../../../workbench/common/editor.js';
import { ChatEditorInput, getChatEditorInputDetails, ISessionChatViewHost, registerSessionChatViewEditor, registerSessionChatViewHost } from '../../../../workbench/contrib/sessions/browser/chatEditor/chatEditor.js';
import { ChatEditorContent } from '../../../../workbench/contrib/sessions/browser/chatEditor/chatEditorContent.js';
import { isChatWindowChatGone } from '../../../../workbench/contrib/sessions/browser/chatEditor/sessionChatOpening.js';
import { ISessionViewHostOptions } from '../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { getSessionAgentMergeConfigurationObservable } from '../../../../workbench/contrib/sessions/browser/sessionAgentMerge.js';
import { ISessionsListModelService } from '../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ShownChatReadMarker } from '../../../../workbench/contrib/sessions/browser/shownChatReadMarker.js';
import { isSideChat, ISideChatPlacementService } from '../../../../workbench/contrib/sessions/browser/sideChatPlacement.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IChatHostOpener, IChatHostOpenerService } from '../../../../workbench/services/sessions/browser/chatHostOpener.js';
import { SessionGridPaneKind } from '../../../../workbench/services/sessions/browser/sessionGridPane.js';
import { ISessionsHostLayoutService } from '../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { IChat, ISession, SessionStatus } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionPaneContent } from '../../../../workbench/services/sessions/common/sessionPane.js';
import { ISessionEditorWorkingSetOwner, ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';
import { ActiveSideChatTabContext } from '../../../common/agentsWindowContextKeys.js';

/** A side chat in the side pane shows only its chat: its tab names it, and the grid's chat has the Session Activity Bar. */
const SIDE_CHAT_HOST_OPTIONS: ISessionViewHostOptions = {
	showHeader: false,
	showActivityBar: false,
	input: { showPills: true },
};

/** The side chats each owner of the side pane's editors shows, by owner key; see {@link ownerKeyOf}. */
const OPEN_SIDE_CHATS_STORAGE_KEY = 'sessions.sideChatPane.openSideChats';

interface IOwnerSideChats {
	/** The owner's side chats, in tab order. */
	readonly open: readonly string[];
	/** The side chat that was the side pane's active editor when the owner was last shown. */
	readonly active?: string;
	/** Whether the side pane showed {@link active} when the owner was last shown, which shows it again when the owner does. */
	readonly revealed?: boolean;
}

function ownerKeyOf(owner: ISessionEditorWorkingSetOwner): string;
function ownerKeyOf(owner: ISessionEditorWorkingSetOwner | undefined): string | undefined;
function ownerKeyOf(owner: ISessionEditorWorkingSetOwner | undefined): string | undefined {
	return owner && `${owner.sessionResource.toString()}\n${owner.chatResource?.toString() ?? ''}`;
}

/** Whether a side chat's tab shows its status rather than the side chat icon: while it works, waits, failed, or is unread. */
function sideChatNeedsAttention(chat: IChat, reader: IReader): boolean {
	const status = chat.status.read(reader);
	return status === SessionStatus.InProgress || status === SessionStatus.NeedsInput || status === SessionStatus.Error || !chat.isRead.read(reader);
}

/** One side chat that the side pane shows as a tab: its editor, which shows the chat of the provider's session. */
export class SideChatTab extends Disposable implements ISessionChatViewHost {

	readonly input: ChatEditorInput;
	readonly content: IObservable<ISessionPaneContent | undefined>;
	readonly window = constObservable(undefined);
	readonly active = constObservable(true);
	readonly hostOptions = SIDE_CHAT_HOST_OPTIONS;

	private readonly _onDidEnd = this._register(new Emitter<void>());
	/** Fires once the chat is deleted or archived. */
	readonly onDidEnd = this._onDidEnd.event;
	private _ended = false;

	private readonly _shown = observableValue<{ readonly session: ISession; readonly chat: IChat } | undefined>(this, undefined);
	private _knownSession: ISession | undefined;

	private readonly _attachedViews: ChatEditorContent[] = [];
	private readonly _view = observableValue<ChatEditorContent | undefined>(this, undefined);
	readonly view: IObservable<ChatEditorContent | undefined> = this._view;

	constructor(
		readonly chatResource: URI,
		close: () => void,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsListModelService sessionsListModelService: ISessionsListModelService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super();
		this.input = this._register(new ChatEditorInput(chatResource));
		this.input.setRendersTitle(false);
		this._register(registerSessionChatViewHost(this.input, this));
		this.content = derived(this, reader => {
			const shown = this._shown.read(reader);
			if (!shown) {
				return undefined;
			}
			const chats = constObservable([shown.chat]);
			return {
				session: shown.session,
				chat: constObservable(shown.chat),
				state: {
					sticky: constObservable(false),
					tabs: { openChats: chats, closedChats: constObservable([]), lastClosedChat: undefined, visibleChatTabs: chats, shouldShowChatTabs: constObservable(false) },
					isDetached: true,
				},
				close: () => {
					if (!this._store.isDisposed && this._shown.get() === shown) {
						close();
					}
				},
			} satisfies ISessionPaneContent;
		});

		const title = derived(this, reader => this._shown.read(reader)?.chat.title.read(reader) || localize('sideChatPane.untitled', "Side Chat"));
		this._register(autorun(reader => this.input.setName(title.read(reader))));
		this._register(autorun(reader => {
			const shown = this._shown.read(reader);
			if (!shown) {
				this.input.setDetails(undefined);
				return;
			}
			const details = getChatEditorInputDetails(shown.session, shown.chat, title.read(reader), reader, sessionsListModelService,
				() => getSessionAgentMergeConfigurationObservable(shown.session, sessionsProvidersService, configurationService, shown.chat));
			this.input.setDetails(sideChatNeedsAttention(shown.chat, reader) ? details : { ...details, icon: Codicon.commentDiscussion });
		}));

		// It is read once its tab shows while the side pane shows its editors, not while it is hidden or shows only Details.
		const editorPartVisible = observableFromEvent(this, layoutService.onDidChangePartVisibility, () => layoutService.isVisible(Parts.EDITOR_PART, mainWindow));
		const readMarker = new ShownChatReadMarker(_sessionsManagementService, extUri);
		this._register(autorun(reader => {
			const shown = this._shown.read(reader);
			if (!shown) {
				readMarker.reset();
				return;
			}
			const visible = editorPartVisible.read(reader) && !!this._view.read(reader)?.visible.read(reader);
			readMarker.update(shown.session, visible ? shown.chat : undefined, reader);
		}));

		const sessionsChanged = observableSignalFromEvent(this, _sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			this._update(reader);
		}));
		this._register(_sessionsManagementService.onDidChangeSessions(event => {
			const known = this._knownSession;
			if (known && event.removed.some(session => extUri.isEqual(session.resource, known.resource))) {
				this._end();
			}
		}));
	}

	private _update(reader: IReader): void {
		if (this._ended) {
			return;
		}
		// `getSessionForChatResource` is untracked: deleting a chat changes `chats` without firing `onDidChangeSessions`.
		this._knownSession?.chats.read(reader);
		this._knownSession?.loading.read(reader);
		// A provider can replace the session it was in, whose chats then load into the replacement.
		const current = this._knownSession && this._sessionsManagementService.getSession(this._knownSession.resource);
		if (current !== this._knownSession) {
			current?.chats.read(reader);
		}
		const owner = this._sessionsManagementService.getSessionForChatResource(this.chatResource);
		if (owner) {
			if (this._knownSession !== owner.session) {
				owner.session.chats.read(reader);
				owner.session.loading.read(reader);
			}
			this._knownSession = owner.session;
			if (isChatWindowChatGone(owner.session, this.chatResource, reader) || owner.session.isArchived.read(reader)) {
				this._end();
				return;
			}
			const shown = this._shown.get();
			if (shown?.session !== owner.session || shown.chat !== owner.chat) {
				this._shown.set({ session: owner.session, chat: owner.chat }, undefined);
			}
			return;
		}
		if (this._knownSession && isChatWindowChatGone(this._knownSession, this.chatResource, reader)) {
			this._end();
		}
	}

	private _end(): void {
		if (!this._ended) {
			this._ended = true;
			this._onDidEnd.fire();
		}
	}

	attach(view: ChatEditorContent): IDisposable {
		this._attachedViews.push(view);
		this._view.set(view, undefined);
		return toDisposable(() => {
			const index = this._attachedViews.indexOf(view);
			if (index >= 0) {
				this._attachedViews.splice(index, 1);
			}
			this._view.set(this._attachedViews.at(-1), undefined);
		});
	}
}

/**
 * Shows side chats, such as those started with `/btw`, as tabs of the main window's side pane while
 * {@link ISideChatPlacementService.inSidePane}. Each owner of the side pane's editor working set (a chat, or a session,
 * of the grid) has its own side chats, which show while the side pane shows its editors and are restored after a reload.
 */
export class SideChatPaneContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.sideChatPane';

	private readonly _tabs = new ResourceMap<{ readonly tab: SideChatTab; readonly store: DisposableStore }>();
	private readonly _owners: Map<string, IOwnerSideChats>;
	/** The owner whose side chats the side pane shows, once the editors of its working set settled. */
	private readonly _shownOwner = observableValue<ISessionEditorWorkingSetOwner | undefined>(this, undefined);
	/**
	 * The side chat to reopen as the active editor for `ownerKey`, and whether to reveal the side pane for it. Cleared once it
	 * opens or the user activates another editor.
	 */
	private _restoreIntent: { readonly ownerKey: string; readonly active: string; readonly revealed: boolean } | undefined;
	/** Closes that do not change which side chats an owner shows, such as when another owner's side chats show. */
	private _closingForOwner = 0;
	/**
	 * Opens of an owner's side chats, which change the side pane's active editor to their side chats without the user
	 * choosing it. Once the user chooses another editor meanwhile, an open keeps it active.
	 */
	private readonly _openingForOwner = new Set<{ readonly chats: readonly URI[]; userChose: boolean }>();
	/** Whether what the side pane showed of the shown owner was captured, as the editors of another owner are about to show. */
	private _shownOwnerCaptured = false;
	private readonly _opener: IChatHostOpener;
	/** Opens that wait for the working set to settle, cancelled once side chats stop showing in the side pane. */
	private readonly _pendingOpens = this._register(new DisposableStore());
	private readonly _activeSideChatTab: IContextKey<string>;

	constructor(
		@ISideChatPlacementService private readonly _placementService: ISideChatPlacementService,
		@IChatHostOpenerService private readonly _chatHostOpenerService: IChatHostOpenerService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionEditorWorkingSetService private readonly _workingSetService: ISessionEditorWorkingSetService,
		@ISessionsHostLayoutService private readonly _hostLayoutService: ISessionsHostLayoutService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._owners = this._loadOwners();
		this._register(registerSessionChatViewEditor());

		this._opener = {
			showsChat: chat => this._tabs.has(chat),
			claimsChat: chat => this._claimsChat(chat),
			reveal: (chat, options) => this._reveal(chat, options?.preserveFocus),
			opensBeside: chat => this._claimsChat(chat),
			openBeside: (chat, _reference, options) => this._reveal(chat, options?.preserveFocus),
			close: async chat => {
				const entry = this._tabs.get(chat);
				if (!entry || !await this._closeTab(entry.tab, false)) {
					return undefined;
				}
				return { restore: () => this._reveal(chat, true) };
			},
		};
		this._register(_chatHostOpenerService.register(this._opener));

		this._register(_editorService.onDidCloseEditor(event => {
			if (event.context === EditorCloseContext.MOVE) {
				return;
			}
			for (const [chat, entry] of this._tabs) {
				if (entry.tab.input === event.editor) {
					this._disposeTab(chat);
					const owner = this._shownOwner.get();
					if (owner && this._isUserClose()) {
						this._forget(chat, owner);
					}
					return;
				}
			}
		}));
		this._activeSideChatTab = ActiveSideChatTabContext.bindTo(contextKeyService);
		this._register(_editorService.onDidActiveEditorChange(() => {
			this._onDidChangeActiveEditor();
			this._updateActiveSideChatTab();
		}));

		this._register(autorun(reader => {
			if (this._placementService.inSidePane.read(reader)) {
				this._restoreShownOwner();
			} else {
				this._closeAllTabs();
			}
		}));
		const inSidePaneContext = ChatContextKeys.sideChatsInSidePane.bindTo(contextKeyService);
		this._register(autorun(reader => inSidePaneContext.set(this._placementService.inSidePane.read(reader))));
		this._register(runOnChange(_workingSetService.restoreState, state => {
			if (state.restoring) {
				this._captureShownOwner();
			} else {
				this._showOwner(state.owner);
			}
		}));
		const sessionsChanged = observableSignalFromEvent(this, _sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			const owner = this._shownOwner.read(reader);
			if (owner) {
				this._sessionsManagementService.getSession(owner.sessionResource)?.chats.read(reader);
				this._openOwnerSideChats();
			}
		}));
		this._register(_storageService.onWillSaveState(() => this._saveOwners()));

		const initial = _workingSetService.restoreState.get();
		if (!initial.restoring) {
			this._showOwner(initial.owner);
		}
	}

	private _claimsChat(chat: URI): boolean {
		if (!this._placementService.inSidePane.get()) {
			return false;
		}
		const found = this._sessionsManagementService.getSessionForChatResource(chat);
		return !!found && isSideChat(found.chat) && !found.chat.isArchived.get() && !found.session.isArchived.get()
			// A side chat that a detached pane of the grid shows stays there.
			&& !this._sessionsService.panes.get().some(pane => pane.kind === SessionGridPaneKind.Detached && extUri.isEqual(pane.chat.get()?.resource, chat));
	}

	/** Shows `chat` as a tab of the side pane, beside its source chat where another surface, such as a chat window, shows that. */
	private async _reveal(chat: URI, preserveFocus: boolean | undefined): Promise<void> {
		const found = this._sessionsManagementService.getSessionForChatResource(chat);
		const parent = found?.chat.origin?.parentChat;
		const parentOpener = parent && !this._tabs.has(chat) ? this._chatHostOpenerService.getOpenerOf(parent) : undefined;
		if (parent && parentOpener && parentOpener !== this._opener && parentOpener.opensBeside?.(chat) !== false) {
			await parentOpener.openBeside(chat, parent, { preserveFocus });
			return;
		}

		const requestedOwner = this._workingSetService.restoreState.get().owner;
		if (!await this._whenWorkingSetSettled()) {
			return;
		}
		const owner = this._workingSetService.restoreState.get().owner;
		if (ownerKeyOf(owner) !== ownerKeyOf(requestedOwner)) {
			if (requestedOwner) {
				this._remember(requestedOwner, chat, true);
			}
			return;
		}
		this._restoreIntent = undefined;
		if (owner) {
			this._remember(owner, chat, true);
		}
		await this._openTab(chat, { preserveFocus: !!preserveFocus, inactive: false });
	}

	/** Waits until the side pane's working set settles; false when side chats stop showing in the side pane meanwhile. */
	private async _whenWorkingSetSettled(): Promise<boolean> {
		if (!this._workingSetService.restoreState.get().restoring) {
			return true;
		}
		const cancellation = new CancellationTokenSource();
		const pending = this._pendingOpens.add(toDisposable(() => cancellation.dispose(true)));
		try {
			await waitForState(this._workingSetService.restoreState, state => !state.restoring, undefined, cancellation.token);
			return true;
		} catch (error) {
			if (isCancellationError(error)) {
				return false;
			}
			throw error;
		} finally {
			this._pendingOpens.delete(pending);
		}
	}

	/**
	 * Opens the tab of `chat` in the side pane, or reveals it in the group that shows it; `inactive` opens it behind the
	 * active editor, and `order` among the tabs of the side chats it lists rather than beside the active editor.
	 */
	private async _openTab(chat: URI, options: { readonly preserveFocus: boolean; readonly inactive: boolean; readonly order?: readonly string[] }): Promise<void> {
		// An open that waited may continue after side chats stopped showing in the side pane.
		if (!this._placementService.inSidePane.get()) {
			return;
		}
		let entry = this._tabs.get(chat);
		if (!entry) {
			const store = new DisposableStore();
			const tab = store.add(this._instantiationService.createInstance(SideChatTab, chat, () => void this._closeTab(tab, false).catch(onUnexpectedError)));
			tab.input.setMoveRestriction({
				reason: localize('sideChatPane.moveRestriction', "Side chats stay in the side panel."),
				canMoveTo: group => this._editorGroupsService.mainPart.groups.some(candidate => candidate.id === group),
			});
			store.add(this._workingSetService.registerEditorToRetain(tab.input));
			store.add(tab.onDidEnd(() => {
				this._forget(chat);
				void this._closeTab(tab, true).catch(onUnexpectedError);
			}));
			entry = { tab, store };
			this._tabs.set(chat, entry);
		}
		await this._editorGroupsService.whenReady;
		if (this._tabs.get(chat) !== entry) {
			return;
		}
		const input = entry.tab.input;
		const shownIn = this._editorGroupsService.mainPart.groups.find(candidate => candidate.contains(input));
		const group = shownIn ?? this._editorGroupsService.mainPart.activeGroup;
		await this._editorService.openEditor(input, {
			pinned: true,
			revealIfOpened: true,
			preserveFocus: options.preserveFocus,
			inactive: options.inactive,
			activation: options.inactive ? EditorActivation.PRESERVE : undefined,
			index: options.order && !shownIn ? this._indexInOrder(options.order, chat, group) : undefined,
		}, group);
	}

	/** Where `chat` goes among the tabs of `group` to keep `order`: before the tab of the next side chat in `order`, else last. */
	private _indexInOrder(order: readonly string[], chat: URI, group: IEditorGroup): number {
		for (const later of order.slice(order.indexOf(chat.toString()) + 1)) {
			const input = this._tabs.get(URI.parse(later))?.tab.input;
			if (input && group.contains(input)) {
				return group.getIndexOfEditor(input);
			}
		}
		return group.count;
	}

	/**
	 * Closes the tab of `tab`'s chat; `forOwner` keeps the side chat among those its owner shows. Returns whether the tab
	 * closed, which it does not when its close is vetoed.
	 */
	private async _closeTab(tab: SideChatTab, forOwner: boolean): Promise<boolean> {
		const editors = this._editorService.findEditors(tab.chatResource).filter(editor => editor.editor === tab.input);
		if (!editors.length) {
			this._disposeTab(tab.chatResource);
			return true;
		}
		if (forOwner) {
			this._closingForOwner++;
		}
		try {
			await this._editorService.closeEditors(editors);
		} finally {
			if (forOwner) {
				this._closingForOwner--;
			}
		}
		return !this._editorService.findEditors(tab.chatResource).some(editor => editor.editor === tab.input);
	}

	private _disposeTab(chat: URI): void {
		const entry = this._tabs.get(chat);
		if (entry) {
			this._tabs.delete(chat);
			entry.store.dispose();
			this._updateActiveSideChatTab();
		}
	}

	/** Publishes the side chat whose tab is the side pane's active editor, if one is. */
	private _updateActiveSideChatTab(): void {
		const activeEditor = this._editorGroupsService.mainPart.activeGroup.activeEditor;
		const active = activeEditor && [...this._tabs.values()].find(({ tab }) => tab.input === activeEditor);
		this._activeSideChatTab.set(active ? active.tab.chatResource.toString() : '');
	}

	private _closeAllTabs(): void {
		this._pendingOpens.clear();
		this._restoreIntent = undefined;
		for (const { tab } of [...this._tabs.values()]) {
			void this._closeTab(tab, true).catch(onUnexpectedError);
		}
	}

	/** Shows the side chats of `owner`, whose working set the side pane shows now, and closes those of others. */
	private _showOwner(owner: ISessionEditorWorkingSetOwner | undefined): void {
		this._captureShownOwner();
		this._shownOwnerCaptured = false;
		for (const [chat, { tab }] of [...this._tabs]) {
			if (!owner || !this._ownerShows(owner, chat)) {
				void this._closeTab(tab, true).catch(onUnexpectedError);
			}
		}
		this._setRestoreIntent(owner);
		this._shownOwner.set(owner, undefined);
		this._openOwnerSideChats();
	}

	/** Opens the side chats of the shown owner that are not open yet, the one it showed last as the active editor. */
	private _restoreShownOwner(): void {
		this._setRestoreIntent(this._shownOwner.get());
		this._openOwnerSideChats();
	}

	private _setRestoreIntent(owner: ISessionEditorWorkingSetOwner | undefined): void {
		const record = owner && this._owners.get(ownerKeyOf(owner));
		this._restoreIntent = owner && record?.active ? { ownerKey: ownerKeyOf(owner), active: record.active, revealed: !!record.revealed } : undefined;
	}

	/** Opens the side chats the shown owner shows that are not open yet, behind its active editor but for {@link _restoreIntent}. */
	private _openOwnerSideChats(): void {
		const owner = this._shownOwner.get();
		if (!owner || !this._placementService.inSidePane.get() || this._workingSetService.restoreState.get().restoring) {
			return;
		}
		const key = ownerKeyOf(owner);
		const record = this._owners.get(key);
		let intent = this._restoreIntent?.ownerKey === key ? this._restoreIntent : undefined;
		const intentSettled = !!intent && (!record?.open.includes(intent.active) || this._tabs.has(URI.parse(intent.active)));
		if (intentSettled) {
			this._restoreIntent = intent = undefined;
		}
		if (!record) {
			return;
		}
		const toOpen = record.open.map(chat => URI.parse(chat)).filter(chat => !this._tabs.has(chat) && !this._chatHostOpenerService.getOpenerOf(chat) && this._claimsChat(chat));
		if (!toOpen.length) {
			return;
		}
		// `_claimsChat` is false until the chat loads, so keep the intent until the active side chat can open.
		const active = intent && toOpen.find(chat => chat.toString() === intent.active);
		const revealActive = !!active && !!intent?.revealed;
		if (active) {
			this._restoreIntent = undefined;
		}
		const opening = { chats: toOpen, userChose: false };
		const open = async () => {
			// Reopening an owner's side chats does not reveal a closed side pane. Only the active one does, below, if the side pane showed it.
			const suppression = this._hostLayoutService.suppressEditorPartAutoVisibility();
			try {
				// One after another, so each finds its place among those already open.
				for (const chat of toOpen) {
					if (this._shownOwner.get() !== owner) {
						return;
					}
					if (this._claimsChat(chat)) {
						await this._openTab(chat, { preserveFocus: true, inactive: opening.userChose || revealActive || !isEqual(chat, active), order: record.open });
					}
				}
			} finally {
				suppression.dispose();
			}
			if (active && revealActive && !opening.userChose && this._shownOwner.get() === owner) {
				await this._openTab(active, { preserveFocus: true, inactive: false });
				// The layout may still suppress revealing the side pane on open while it restores the owner's editors.
				if (this._shownOwner.get() === owner && this._tabs.has(active)) {
					this._hostLayoutService.revealEditorPartExplicitly();
				}
			}
		};
		this._openingForOwner.add(opening);
		open().catch(error => this._logService.error('[SideChatPane] Restoring side chats failed', error)).finally(() => this._openingForOwner.delete(opening));
	}

	/** Remembers what the side pane shows of the shown owner, once, before the editors of another owner show. */
	private _captureShownOwner(): void {
		if (!this._shownOwnerCaptured) {
			this._shownOwnerCaptured = true;
			this._recordShownOwner();
		}
	}

	/**
	 * Remembers the order the side pane shows the side chats of the shown owner in, which of them is its active editor, and
	 * whether the side pane shows it.
	 */
	private _recordShownOwner(): void {
		const owner = this._shownOwner.get();
		const key = ownerKeyOf(owner);
		const record = key && this._owners.get(key);
		// While a restore intent is pending, or side chats do not show in the side pane, the tabs do not show the owner's side chats.
		if (!key || !record || this._restoreIntent?.ownerKey === key || !this._placementService.inSidePane.get()) {
			return;
		}
		const group = this._editorGroupsService.mainPart.activeGroup;
		const activeEditor = group.activeEditor;
		const active = [...this._tabs.values()].find(({ tab }) => tab.input === activeEditor)?.tab.chatResource.toString();
		const revealed = !!active && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
		// Side chats whose tabs show take the order of their tabs, such as after the user moved one; the others keep their place.
		const indexOf = (chat: string) => {
			const entry = this._tabs.get(URI.parse(chat));
			return entry ? group.getIndexOfEditor(entry.tab.input) : -1;
		};
		const shownInOrder = record.open.filter(chat => indexOf(chat) >= 0).sort((a, b) => indexOf(a) - indexOf(b));
		let next = 0;
		const open = record.open.map(chat => indexOf(chat) >= 0 ? shownInOrder[next++] : chat);
		if (active !== record.active || revealed !== !!record.revealed || open.some((chat, index) => chat !== record.open[index])) {
			this._owners.set(key, { ...record, open, active, revealed });
		}
	}

	private _ownerShows(owner: ISessionEditorWorkingSetOwner, chat: URI): boolean {
		return !!this._owners.get(ownerKeyOf(owner))?.open.includes(chat.toString());
	}

	/** Remembers which side chat the user made the side pane's active editor for the shown owner. */
	private _onDidChangeActiveEditor(): void {
		const owner = this._shownOwner.get();
		if (!owner || this._workingSetService.restoreState.get().restoring || this._closingForOwner) {
			return;
		}
		const activeEditor = this._editorGroupsService.mainPart.activeGroup.activeEditor;
		const active = activeEditor ? [...this._tabs.values()].find(({ tab }) => tab.input === activeEditor)?.tab.chatResource : undefined;
		if (this._openingForOwner.size) {
			// Those opens suppress the layout's auto-visibility themselves: an editor other than the side chats they open is the user's choice.
			if (active && [...this._openingForOwner].some(opening => opening.chats.some(chat => isEqual(chat, active)))) {
				return;
			}
			for (const opening of this._openingForOwner) {
				opening.userChose = true;
			}
		} else if (this._hostLayoutService.isEditorPartAutoVisibilitySuppressed()) {
			// The layout opens editors too, such as the Changes tab once a working set restores: those are not the user's choice.
			return;
		}
		this._restoreIntent = undefined;
		const key = ownerKeyOf(owner);
		const record = this._owners.get(key);
		if (!record || !activeEditor) {
			return;
		}
		if (active?.toString() !== record.active) {
			this._owners.set(key, { ...record, active: active?.toString() });
		}
	}

	private _remember(owner: ISessionEditorWorkingSetOwner, chat: URI, active: boolean): void {
		const key = ownerKeyOf(owner);
		const record = this._owners.get(key);
		const resource = chat.toString();
		const open = record?.open.includes(resource) ? record.open : [...record?.open ?? [], resource];
		this._owners.set(key, { open, active: active ? resource : record?.active, revealed: record?.revealed });
	}

	/** Whether a side chat tab that closes was closed by the user, not by showing another owner's side chats. */
	private _isUserClose(): boolean {
		return !this._closingForOwner && !this._workingSetService.restoreState.get().restoring;
	}

	/** `owner` shows `chat` no more, such as once the user closed its tab; without `owner`, no owner does, such as once it was deleted. */
	private _forget(chat: URI, owner?: ISessionEditorWorkingSetOwner): void {
		const resource = chat.toString();
		const ownerKey = ownerKeyOf(owner);
		for (const [key, record] of [...this._owners]) {
			if ((ownerKey && key !== ownerKey) || !record.open.includes(resource)) {
				continue;
			}
			const open = record.open.filter(candidate => candidate !== resource);
			if (open.length) {
				this._owners.set(key, record.active === resource ? { open } : { ...record, open });
			} else {
				this._owners.delete(key);
			}
		}
	}

	private _loadOwners(): Map<string, IOwnerSideChats> {
		const owners = new Map<string, IOwnerSideChats>();
		const stored = this._storageService.getObject<Record<string, IOwnerSideChats>>(OPEN_SIDE_CHATS_STORAGE_KEY, StorageScope.WORKSPACE);
		for (const [key, record] of Object.entries(stored ?? {})) {
			if (Array.isArray(record?.open) && record.open.every(chat => typeof chat === 'string')) {
				owners.set(key, { open: record.open, active: typeof record.active === 'string' ? record.active : undefined, revealed: record.revealed === true });
			}
		}
		return owners;
	}

	private _saveOwners(): void {
		if (!this._shownOwnerCaptured && !this._workingSetService.restoreState.get().restoring) {
			this._recordShownOwner();
		}
		if (this._owners.size) {
			this._storageService.store(OPEN_SIDE_CHATS_STORAGE_KEY, JSON.stringify(Object.fromEntries(this._owners)), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(OPEN_SIDE_CHATS_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	override dispose(): void {
		for (const chat of [...this._tabs.keys()]) {
			this._disposeTab(chat);
		}
		super.dispose();
	}
}

registerWorkbenchContribution2(SideChatPaneContribution.ID, SideChatPaneContribution, WorkbenchPhase.BlockRestore);
