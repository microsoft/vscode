/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, constObservable, derived, IObservable, IReader, observableFromEvent, observableSignalFromEvent, observableValue, runOnChange, waitForState } from '../../../../base/common/observable.js';
import { extUri, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
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
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IChatHostOpener, IChatHostOpenerService } from '../../../../workbench/services/sessions/browser/chatHostOpener.js';
import { SessionGridPaneKind } from '../../../../workbench/services/sessions/browser/sessionGridPane.js';
import { ISessionsHostLayoutService } from '../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { IChat, ISession } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionPaneContent } from '../../../../workbench/services/sessions/common/sessionPane.js';
import { ISessionEditorWorkingSetOwner, ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';

/** A side chat in the side pane shows only its chat: its tab names it, and the grid's chat has the Session Activity Bar. */
const SIDE_CHAT_HOST_OPTIONS: ISessionViewHostOptions = {
	showHeader: false,
	showActivityBar: false,
	input: { showPills: true },
};

/** The side chats each owner of the side pane's editors shows, by owner key; see {@link ownerKeyOf}. */
const OPEN_SIDE_CHATS_STORAGE_KEY = 'sessions.sideChatPane.openSideChats';

interface IOwnerSideChats {
	/** The side chats the owner shows, in the order they opened. */
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
		// Its group always shows its tabs: the side pane's tab strip names the chat, as it has no header.
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
			this.input.setDetails(shown && getChatEditorInputDetails(shown.session, shown.chat, title.read(reader), reader, sessionsListModelService,
				() => getSessionAgentMergeConfigurationObservable(shown.session, sessionsProvidersService, configurationService, shown.chat)));
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
	}

	private _update(reader: IReader): void {
		if (this._ended) {
			return;
		}
		// The chats of the session it was in change without the sessions changing, such as as one is deleted.
		this._knownSession?.chats.read(reader);
		this._knownSession?.loading.read(reader);
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

	/** The tabs whose editors the side pane shows, by side chat. */
	private readonly _tabs = new ResourceMap<{ readonly tab: SideChatTab; readonly store: DisposableStore }>();
	private readonly _owners: Map<string, IOwnerSideChats>;
	/** The owner whose side chats the side pane shows, once the editors of its working set settled. */
	private readonly _shownOwner = observableValue<ISessionEditorWorkingSetOwner | undefined>(this, undefined);
	/**
	 * Which side chat the shown owner showed when it was last shown, and whether the side pane showed it, until that side chat
	 * opens, such as once its chat loads after a reload, or the user chooses what the side pane shows.
	 */
	private _restoreIntent: { readonly ownerKey: string; readonly active: string; readonly revealed: boolean } | undefined;
	/** Closes that do not change which side chats an owner shows, such as when another owner's side chats show. */
	private _closingForOwner = 0;
	/** Opens of an owner's side chats, which change the side pane's active editor without the user choosing it. */
	private _openingForOwner = 0;
	/** Whether what the side pane showed of the shown owner was captured, as the editors of another owner are about to show. */
	private _shownOwnerCaptured = false;
	private readonly _opener: IChatHostOpener;
	private readonly _pendingOpen = this._register(new MutableDisposable());

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
	) {
		super();
		this._owners = this._loadOwners();
		this._register(registerSessionChatViewEditor());

		this._opener = {
			showsChat: chat => this._tabs.has(chat),
			claimsChat: chat => this._claimsChat(chat),
			reveal: (chat, options) => this._reveal(chat, options?.preserveFocus),
			// Other chats started from a side chat, such as forks, open where they would without the side pane.
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
					// Closed by the user: its owner shows it no more. Restoring the working set of an owner closes it too.
					if (!this._closingForOwner && !this._workingSetService.restoreState.get().restoring) {
						this._forget(chat);
					}
					return;
				}
			}
		}));
		this._register(_editorService.onDidActiveEditorChange(() => this._onDidChangeActiveEditor()));

		this._register(autorun(reader => {
			if (this._placementService.inSidePane.read(reader)) {
				this._restoreShownOwner();
			} else {
				this._closeAllTabs();
			}
		}));
		this._register(runOnChange(_workingSetService.restoreState, state => {
			if (state.restoring) {
				this._captureShownOwner();
			} else {
				this._showOwner(state.owner);
			}
		}));
		// The shown owner's side chats open as they load, such as after a reload: its session loads, then its chats.
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

		// The side chat joins the side chats of the owner whose working set shows now, or is about to, once the side pane settles.
		const requested = this._workingSetService.restoreState.get().owner;
		const cancellation = new CancellationTokenSource();
		this._pendingOpen.value = toDisposable(() => cancellation.dispose(true));
		try {
			if (this._workingSetService.restoreState.get().restoring) {
				await waitForState(this._workingSetService.restoreState, state => !state.restoring, undefined, cancellation.token);
			}
		} catch (error) {
			if (isCancellationError(error)) {
				return;
			}
			throw error;
		}
		if (cancellation.token.isCancellationRequested) {
			return;
		}
		this._pendingOpen.clear();
		const owner = this._workingSetService.restoreState.get().owner;
		if (ownerKeyOf(owner) !== ownerKeyOf(requested)) {
			// The grid moved on while the side pane settled: the side chat shows once the owner it was opened for shows again.
			if (requested) {
				this._remember(requested, chat, true);
			}
			return;
		}
		// What the user opens shows, rather than what the owner showed before.
		this._restoreIntent = undefined;
		if (owner) {
			this._remember(owner, chat, true);
		}
		await this._openTab(chat, { preserveFocus: !!preserveFocus, inactive: false });
	}

	/**
	 * Opens the tab of `chat` in the side pane, or reveals it; `inactive` opens it behind the active editor, and `append` as
	 * the last tab rather than beside the active editor.
	 */
	private async _openTab(chat: URI, options: { readonly preserveFocus: boolean; readonly inactive: boolean; readonly append?: boolean }): Promise<void> {
		let entry = this._tabs.get(chat);
		if (!entry) {
			const store = new DisposableStore();
			const tab = store.add(this._instantiationService.createInstance(SideChatTab, chat, () => void this._closeTab(tab, false).catch(onUnexpectedError)));
			// Side chats stay in the main window's side pane.
			tab.input.setMoveRestriction({
				reason: localize('sideChatPane.moveRestriction', "Side chats stay in the side panel."),
				canMoveTo: group => this._editorGroupsService.mainPart.groups.some(candidate => candidate.id === group),
			});
			// A Details-only collapse keeps the chat alive in the hidden editor group.
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
		const group = this._editorGroupsService.mainPart.activeGroup;
		await this._editorService.openEditor(entry.tab.input, {
			pinned: true,
			revealIfOpened: true,
			preserveFocus: options.preserveFocus,
			inactive: options.inactive,
			activation: options.inactive ? EditorActivation.PRESERVE : undefined,
			index: options.append && !group.contains(entry.tab.input) ? group.count : undefined,
		}, group);
	}

	/** Closes the tab of `tab`'s chat; `forOwner` keeps the side chat among those its owner shows. */
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
		// Not closed when vetoed.
		return !this._editorService.findEditors(tab.chatResource).some(editor => editor.editor === tab.input);
	}

	private _disposeTab(chat: URI): void {
		const entry = this._tabs.get(chat);
		if (entry) {
			this._tabs.delete(chat);
			entry.store.dispose();
		}
	}

	private _closeAllTabs(): void {
		this._pendingOpen.clear();
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
		// Showing the owner opens its side chats as they load, the one it showed last as the active editor.
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
		if (intent && (!record?.open.includes(intent.active) || this._tabs.has(URI.parse(intent.active)))) {
			// It shows that side chat no more, or already.
			this._restoreIntent = intent = undefined;
		}
		if (!record) {
			return;
		}
		const toOpen = record.open.map(chat => URI.parse(chat)).filter(chat => !this._tabs.has(chat) && this._claimsChat(chat));
		if (!toOpen.length) {
			return;
		}
		// Until its chat loads, the owner's active side chat stays to open.
		const active = intent && toOpen.find(chat => chat.toString() === intent.active);
		const revealActive = !!active && !!intent?.revealed;
		if (active) {
			this._restoreIntent = undefined;
		}
		const open = async () => {
			// Showing an owner's side chats again does not reveal a closed side pane, but for the one it showed
			const suppression = this._hostLayoutService.suppressEditorPartAutoVisibility();
			try {
				// One after another, each as the last tab, so they show in the order the owner showed them.
				for (const chat of toOpen) {
					if (this._shownOwner.get() !== owner) {
						return;
					}
					await this._openTab(chat, { preserveFocus: true, inactive: revealActive || !isEqual(chat, active), append: true });
				}
			} finally {
				suppression.dispose();
			}
			if (active && revealActive && this._shownOwner.get() === owner) {
				await this._openTab(active, { preserveFocus: true, inactive: false });
				// The layout may still suppress revealing the side pane on open while it restores the owner's editors.
				if (this._shownOwner.get() === owner && this._tabs.has(active)) {
					this._hostLayoutService.revealEditorPartExplicitly();
				}
			}
		};
		this._openingForOwner++;
		open().catch(error => this._logService.error('[SideChatPane] Restoring side chats failed', error)).finally(() => this._openingForOwner--);
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
		// Until the side chat it showed opens, the owner shows what it showed before.
		if (!key || !record || this._restoreIntent?.ownerKey === key) {
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
		if (!owner || this._workingSetService.restoreState.get().restoring || this._openingForOwner || this._closingForOwner) {
			return;
		}
		// The user chose what the side pane shows: what the owner showed before does not open as active anymore.
		this._restoreIntent = undefined;
		const key = ownerKeyOf(owner);
		const record = this._owners.get(key);
		if (!record) {
			return;
		}
		const activeEditor = this._editorGroupsService.mainPart.activeGroup.activeEditor;
		if (!activeEditor) {
			return;
		}
		const active = [...this._tabs.values()].find(({ tab }) => tab.input === activeEditor)?.tab.chatResource.toString();
		if (active !== record.active) {
			this._owners.set(key, { ...record, active });
		}
	}

	private _remember(owner: ISessionEditorWorkingSetOwner, chat: URI, active: boolean): void {
		const key = ownerKeyOf(owner);
		const record = this._owners.get(key);
		const resource = chat.toString();
		const open = record?.open.includes(resource) ? record.open : [...record?.open ?? [], resource];
		this._owners.set(key, { open, active: active ? resource : record?.active, revealed: record?.revealed });
	}

	/** No owner shows `chat` anymore, such as once it was closed or deleted. */
	private _forget(chat: URI): void {
		const resource = chat.toString();
		for (const [key, record] of [...this._owners]) {
			if (!record.open.includes(resource)) {
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
		// What the side pane shows now, such as after it was hidden, shows after a reload.
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
