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
import { autorun, constObservable, derived, IObservable, IReader, observableFromEvent, observableSignalFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { extUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
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
import { IChat, ISession } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionPaneContent } from '../../../../workbench/services/sessions/common/sessionPane.js';
import { ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';

/** A side chat in the side pane shows only its chat: its tab names it, and the grid's chat has the Session Activity Bar. */
const SIDE_CHAT_HOST_OPTIONS: ISessionViewHostOptions = {
	showHeader: false,
	showActivityBar: false,
	input: { showPills: true },
};

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
 * {@link ISideChatPlacementService.inSidePane}, and claims them, so that opening one shows its tab.
 */
export class SideChatPaneContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.sideChatPane';

	/** The tabs whose editors the side pane shows, by side chat. */
	private readonly _tabs = new ResourceMap<{ readonly tab: SideChatTab; readonly store: DisposableStore }>();
	private readonly _opener: IChatHostOpener;
	private readonly _pendingOpen = this._register(new MutableDisposable());

	constructor(
		@ISideChatPlacementService private readonly _placementService: ISideChatPlacementService,
		@IChatHostOpenerService private readonly _chatHostOpenerService: IChatHostOpenerService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionEditorWorkingSetService private readonly _workingSetService: ISessionEditorWorkingSetService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
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
				if (!entry || !await this._closeTab(entry.tab)) {
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
					return;
				}
			}
		}));

		this._register(autorun(reader => {
			if (!this._placementService.inSidePane.read(reader)) {
				this._closeAllTabs();
			}
		}));
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

		const cancellation = new CancellationTokenSource();
		this._pendingOpen.value = toDisposable(() => cancellation.dispose(true));
		try {
			// Applying a working set replaces the side pane's editors: the side chat opens once it settles.
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
		await this._openTab(chat, { preserveFocus: !!preserveFocus, inactive: false });
	}

	/** Opens the tab of `chat` in the side pane, or reveals it; `inactive` opens it behind the active editor. */
	private async _openTab(chat: URI, options: { readonly preserveFocus: boolean; readonly inactive: boolean }): Promise<void> {
		let entry = this._tabs.get(chat);
		if (!entry) {
			const store = new DisposableStore();
			const tab = store.add(this._instantiationService.createInstance(SideChatTab, chat, () => void this._closeTab(tab).catch(onUnexpectedError)));
			// Side chats stay in the main window's side pane.
			tab.input.setMoveRestriction({
				reason: localize('sideChatPane.moveRestriction', "Side chats stay in the side panel."),
				canMoveTo: group => this._editorGroupsService.mainPart.groups.some(candidate => candidate.id === group),
			});
			// A Details-only collapse keeps the chat alive in the hidden editor group.
			store.add(this._workingSetService.registerEditorToRetain(tab.input));
			store.add(tab.onDidEnd(() => void this._closeTab(tab).catch(onUnexpectedError)));
			entry = { tab, store };
			this._tabs.set(chat, entry);
		}
		await this._editorGroupsService.whenReady;
		if (this._tabs.get(chat) !== entry) {
			return;
		}
		await this._editorService.openEditor(entry.tab.input, {
			pinned: true,
			revealIfOpened: true,
			preserveFocus: options.preserveFocus,
			inactive: options.inactive,
			activation: options.inactive ? EditorActivation.PRESERVE : undefined,
		}, this._editorGroupsService.mainPart.activeGroup);
	}

	/** Closes the tab of `tab`'s chat. */
	private async _closeTab(tab: SideChatTab): Promise<boolean> {
		const editors = this._editorService.findEditors(tab.chatResource).filter(editor => editor.editor === tab.input);
		if (!editors.length) {
			this._disposeTab(tab.chatResource);
			return true;
		}
		await this._editorService.closeEditors(editors);
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
		for (const { tab } of [...this._tabs.values()]) {
			void this._closeTab(tab).catch(onUnexpectedError);
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
