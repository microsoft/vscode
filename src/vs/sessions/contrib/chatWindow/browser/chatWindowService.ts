/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { timeout } from '../../../../base/common/async.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatWindowCards } from './chatWindowCards.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IEditorGroupView } from '../../../../workbench/browser/parts/editor/editor.js';
import { EmptyEditorGroupAddTab } from '../../../browser/parts/emptyEditorGroupAddTab.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IAuxiliaryWindowService } from '../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { EditorsOrder, GroupModelChangeKind } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { completeTerminalReturn, decideTerminalRowMove, TerminalRowMoveAction } from './chatWindowTerminalRowPolicy.js';
import { TerminalEditorInput } from '../../../../workbench/contrib/terminal/browser/terminalEditorInput.js';
import { EditorPartFixedGroupsContext } from '../../../../workbench/common/contextkeys.js';
import { GroupDirection, IEditorGroup, IEditorGroupsService, IEditorPart, IFloatingEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorResolverService } from '../../../../workbench/services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ITitleService } from '../../../../workbench/services/title/browser/titleService.js';
import { Menus } from '../../../browser/menus.js';
import { TitlebarPart } from '../../../browser/parts/titlebarPart.js';
import { CHAT_WINDOW_TEXT_EDITOR, ChatWindowContext, ChatWindowDockableContext, ChatWindowDockedContext, ChatWindowDockedOpenContext, ChatWindowDockedResizedContext, ChatWindowEditorAreaEditorContext, ChatWindowEditorGroupContext, ChatWindowHasEditorAreaContext, ChatWindowSessionHasWorkspaceContext, ChatWindowTerminalShownContext, ChatWindowTerminalRowContext, ChatWindowEditorViewTypeContext, ChatWindowHasEditorContext, ChatWindowLayout, ChatWindowLayoutContext, ChatWindowSplitLayout, ChatWindowSplitLayoutContext, ChatWindowTerminalPosition, ChatWindowTerminalPositionContext, IChatWindow, IChatWindowContent, IChatWindowEditor, IChatWindowEditorArea, IChatWindowKind, IChatWindowOpenOptions, IChatWindowService, IChatWindowTerminalHost } from '../../../services/chatWindow/browser/chatWindowService.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { InFlightOperations, IChatWindowOpening, ChatModelHold, openCleaningUpOnFailure } from './chatWindowOpening.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { URI } from '../../../../base/common/uri.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ChatWindowCustomEditorInput } from './chatWindowCustomEditorInput.js';
import { deserializeChatWindowEditors, serializeChatWindowEditors } from './chatWindowEditors.js';
import { ChatWindowChatInput } from './chatWindowEditor.js';
import { ChatWindowDefaults, ChatWindowState } from './chatWindowState.js';

/** The size of a chat window in a window of its own, unless its kind has one. */
const CHAT_WINDOW_DEFAULT_SIZE = { width: 720, height: 760 };

/** The least size a docked chat window can be resized to, unless its kind has one: room for an editor above the chat input. */
const CHAT_WINDOW_DOCKED_MINIMUM_SIZE = { width: 320, height: 320 };

/**
 * An open chat window: its editor part, the group of its chat, and the group of its editor, above or beside the chat,
 * when it shows one. Its groups are locked, so other editors open in the main window, and neither the chat nor the
 * editor can be closed on its own; closing the chat window does.
 */
class ChatWindow implements IChatWindow {

	private readonly _content: ISettableObservable<IChatWindowContent>;
	readonly content: IObservable<IChatWindowContent>;

	private readonly _onDidClose = new Emitter<void>();
	readonly onDidClose: Event<void> = this._onDidClose.event;

	/** Keeps the editor the chat window shows from being closed on its own. */
	readonly editorKept = new MutableDisposable<IDisposable>();

	get windowId(): number {
		return this.part.windowId;
	}

	private _closed = false;

	constructor(
		readonly state: ChatWindowState,
		readonly part: IEditorPart,
		readonly chatGroup: IEditorGroup,
		readonly editorGroup: IEditorGroup | undefined,
		content: IChatWindowContent,
		private readonly _session: ISettableObservable<IActiveSession | undefined>,
		private readonly _service: ChatWindowService,
		private readonly _close: () => boolean,
		private readonly _resetSize: () => void = () => { },
	) {
		this._content = observableValue(this, content);
		this.content = this._content;
	}

	get session(): IObservable<IActiveSession | undefined> { return this._session; }

	setSession(session: IActiveSession | undefined): void {
		this._session.set(session, undefined);
	}

	get kind(): IChatWindowKind { return this.state.kind; }
	get docked(): boolean { return this.state.docked; }
	get layout(): IObservable<ChatWindowLayout> { return this.state.layout; }
	get splitLayout(): IObservable<ChatWindowSplitLayout> { return this.state.splitLayout; }
	get layouts(): readonly ChatWindowLayout[] { return this.state.layouts; }

	/** The group that shows: focusing or revealing a hidden group would show it. */
	get visibleGroup(): IEditorGroup {
		return this.state.layout.get() === ChatWindowLayout.EditorOnly && this.editorGroup ? this.editorGroup : this.chatGroup;
	}

	setLayout(layout: ChatWindowLayout): void {
		this.state.setLayout(layout);
	}

	showEditor(): void {
		if (this.editorGroup && this.state.layout.get() === ChatWindowLayout.ChatOnly) {
			this.state.showBoth();
		}
	}

	resetSize(): void {
		this._resetSize();
	}

	get terminalGroup(): IObservable<IEditorGroup | undefined> { return this.state.terminalGroup; }

	readonly terminalShown: IObservable<boolean> = derived(this, reader => !!this.state.terminalGroup.read(reader));

	get terminalPosition(): IObservable<ChatWindowTerminalPosition> { return this.state.terminalPosition; }

	setTerminalPosition(position: ChatWindowTerminalPosition): void {
		this.state.setTerminalPosition(position);
	}

	setTerminalShown(shown: boolean, options?: { readonly focus?: boolean }): Promise<void> {
		return this._service.setTerminalShown(this, shown, options?.focus ?? false);
	}

	setEditor(editor: IChatWindowEditor): Promise<void> {
		return this._service.setEditor(this, editor);
	}

	toggleConversation(): void {
		if (!this.docked && this.state.layout.get() === ChatWindowLayout.EditorAboveChat) {
			this.state.setInputOnly(!this.state.inputOnly.get());
		}
	}

	replace(content: IChatWindowContent | Promise<IChatWindowContent | undefined>): Promise<void> {
		return this._service.replace(this, content);
	}

	setContent(content: IChatWindowContent): void {
		this._content.set(content, undefined);
	}

	focus(): void {
		this.visibleGroup.focus();
	}

	close(): boolean {
		// Its terminal keeps running for its session: closing the window would close it.
		this._service.releaseTerminal(this);
		if (!this._close()) {
			this._service.showTerminalAgain(this);
			return false;
		}
		this.didClose();
		return true;
	}

	/** Ends the chat window: it is closing, or its editor part is going away. */
	didClose(): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		this.editorKept.dispose();
		this._onDidClose.fire();
		this._onDidClose.dispose();
	}
}

export class ChatWindowService extends Disposable implements IChatWindowService {

	declare readonly _serviceBrand: undefined;

	private readonly _windows = observableValue<readonly ChatWindow[]>(this, []);
	readonly windows: IObservable<readonly IChatWindow[]> = this._windows;

	private readonly _dockedOpen: IContextKey<boolean>;

	/** Chat windows waiting for content to replace theirs with, which stay open meanwhile; see {@link replace}. */
	private readonly _replacing = new Set<ChatWindow>();

	private _terminalHost: IChatWindowTerminalHost | undefined;
	/** What each terminal row holds on to while it shows. */
	private readonly _terminalRows = new Map<ChatWindow, DisposableStore>();
	/** Chat windows whose terminal row is being emptied on purpose, rather than by its terminal exiting. */
	private readonly _emptyingTerminalRows = new Set<ChatWindow>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorResolverService private readonly _editorResolverService: IEditorResolverService,
		@IAuxiliaryWindowService private readonly _auxiliaryWindowService: IAuxiliaryWindowService,
		@ITitleService private readonly _titleService: ITitleService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionEditorWorkingSetService private readonly _editorWorkingSetService: ISessionEditorWorkingSetService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IThemeService private readonly _themeService: IThemeService,
		@IChatService private readonly _chatService: IChatService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
	) {
		super();

		// A chat window shows its session for as long as the session shows in a window: closing the session closes it.
		this._register(autorun(reader => {
			const windowSessions = this._sessionsService.windowSessions.read(reader);
			for (const window of this._windows.read(undefined)) {
				const session = window.session.read(undefined);
				if (!session || windowSessions.includes(session) || this._replacing.has(window)) {
					continue;
				}
				// Replaced by the provider, such as when its resource changes: the chat window shows the replacement.
				const replacement = windowSessions.find(candidate => isEqual(candidate.scopedChatResource, session.scopedChatResource));
				window.setSession(replacement);
				if (!replacement) {
					window.close();
				}
			}
		}));

		// A docked chat window covers the bottom right corner of the main window, and what floats there.
		this._dockedOpen = ChatWindowDockedOpenContext.bindTo(contextKeyService);
		this._register(autorun(reader => this._dockedOpen.set(this._windows.read(reader).some(window => window.docked))));
	}

	/** The chat windows being opened, by session: opening a session again meanwhile gives the same chat window. */
	private readonly _opening = new InFlightOperations<IChatWindow | undefined>();

	open(kind: IChatWindowKind, content: IChatWindowContent, options?: IChatWindowOpenOptions): Promise<IChatWindow | undefined> {
		return this._opening.run(content.session.toString(), () => this._openOrReveal(kind, content, options));
	}

	private async _openOrReveal(kind: IChatWindowKind, content: IChatWindowContent, options?: IChatWindowOpenOptions): Promise<IChatWindow | undefined> {
		const opened = this._windows.get().find(window => isEqual(window.content.get().session, content.session));
		if (opened) {
			await this._reveal(opened);
			return opened;
		}
		return this._open(kind, content, options);
	}

	/** Opens a chat window; see {@link open}. `replacing` is a chat window it replaces, which closes once it opens. */
	private async _open(kind: IChatWindowKind, content: IChatWindowContent, options: IChatWindowOpenOptions | undefined, replacing?: ChatWindow): Promise<ChatWindow | undefined> {
		const session = this._sessionsManagementService.getSession(content.session);
		if (!session) {
			return undefined;
		}
		return openCleaningUpOnFailure(opening => this._openWindow(kind, content, options, replacing, session, opening));
	}

	private async _openWindow(kind: IChatWindowKind, content: IChatWindowContent, options: IChatWindowOpenOptions | undefined, replacing: ChatWindow | undefined, session: ISession, created: IChatWindowOpening): Promise<ChatWindow> {

		const defaults = new ChatWindowDefaults(kind, this._storageService);
		let docked = !!kind.dockable && (options?.docked ?? defaults.getDocked(kind.dockedByDefault ?? false));
		if (docked && this._windows.get().some(window => window.docked && window !== replacing)) {
			// One chat window docks at a time, in the corner it covers.
			docked = false;
		}
		const state = new ChatWindowState(kind, docked, !!content.editor || !!content.editorArea, defaults);
		const sessionObs = observableValue<IActiveSession | undefined>(this, undefined);
		const input = new ChatWindowChatInput(sessionObs, state);
		const windowDisposables = created.disposables;
		let part: IEditorPart;
		let floatingPart: IFloatingEditorPart | undefined;
		let chatGroup: IEditorGroup | undefined;
		let close: () => boolean;
		let resetSize: (() => void) | undefined;
		if (docked) {
			floatingPart = await this._editorGroupsService.createFloatingEditorPart({
				title: content.title?.get() ?? kind.title,
				titleMenu: Menus.ChatWindowTitle,
				customizableTitleMenu: { menu: Menus.ChatWindowTitleLayout, alwaysShownItems: [Menus.ChatWindowLayout.id] },
				size: defaults.getDockedSize(),
				minimumSize: kind.dockedMinimumSize ?? CHAT_WINDOW_DOCKED_MINIMUM_SIZE,
			});
			part = floatingPart;
			const dockedPart = floatingPart;
			close = created.close = () => dockedPart.close();
			const resizedContext = ChatWindowDockedResizedContext.bindTo(this._editorGroupsService.getScopedInstantiationService(floatingPart).invokeFunction(accessor => accessor.get(IContextKeyService)));
			resizedContext.set(!!defaults.getDockedSize());
			windowDisposables.add(floatingPart.onDidChangeSize(size => {
				defaults.setDockedSize(size);
				resizedContext.set(true);
			}));
			resetSize = () => {
				dockedPart.resetSize();
				defaults.setDockedSize(undefined);
				resizedContext.set(false);
			};
			chatGroup = (await this._editorService.openEditor(input, { pinned: true }, floatingPart.activeGroup))?.group ?? floatingPart.activeGroup;
		} else {
			// Not compact: a compact window sends editors opened next to it to the main window. Kept out of working sets,
			// which the Agents window applies as it switches sessions, and which would close it.
			const auxiliaryPart = await this._editorGroupsService.createAuxiliaryEditorPart({ bounds: kind.windowSize ?? CHAT_WINDOW_DEFAULT_SIZE, excludeFromWorkingSets: true });
			part = auxiliaryPart;
			close = created.close = () => auxiliaryPart.close();
			chatGroup = (await this._editorService.openEditor(input, { pinned: true }, auxiliaryPart.activeGroup))?.group ?? auxiliaryPart.activeGroup;
		}

		// Bound for the chat window's editor area and title bar or header, which share the editor area's context.
		const windowContextKeyService = this._editorGroupsService.getScopedInstantiationService(part).invokeFunction(accessor => accessor.get(IContextKeyService));
		ChatWindowContext.bindTo(windowContextKeyService).set(kind.id);
		// Its groups are the chat window's: the chat, and its editor or editor area.
		EditorPartFixedGroupsContext.bindTo(windowContextKeyService).set(true);
		ChatWindowDockableContext.bindTo(windowContextKeyService).set(!!kind.dockable);
		ChatWindowDockedContext.bindTo(windowContextKeyService).set(docked);
		ChatWindowHasEditorContext.bindTo(windowContextKeyService).set(!!content.editor || !!content.editorArea);
		const editorViewTypeContext = ChatWindowEditorViewTypeContext.bindTo(windowContextKeyService);
		const layoutContext = ChatWindowLayoutContext.bindTo(windowContextKeyService);
		windowDisposables.add(autorun(reader => layoutContext.set(state.layout.read(reader))));
		const splitLayoutContext = ChatWindowSplitLayoutContext.bindTo(windowContextKeyService);
		windowDisposables.add(autorun(reader => splitLayoutContext.set(state.splitLayout.read(reader))));
		const terminalPositionContext = ChatWindowTerminalPositionContext.bindTo(windowContextKeyService);
		windowDisposables.add(autorun(reader => terminalPositionContext.set(state.terminalPosition.read(reader))));
		// An editor area shows its editors in tabs, and stays when its last editor closes. Tabs show for the whole part.
		// Double-clicking a tab must not maximize or expand a group: the window arranges its groups.
		// Editor actions stay on every group, so that the terminal row keeps its New Terminal action while another group has focus.
		windowDisposables.add(part.enforcePartOptions(content.editorArea
			? { showTabs: 'multiple', closeEmptyGroups: false, alwaysShowEditorActions: true, doubleClickTabToToggleEditorGroupSizes: 'off' }
			: { showTabs: 'none', showBreadcrumbs: false, editorActionsLocation: 'hidden', doubleClickTabToToggleEditorGroupSizes: 'off' }));
		// The chat shows as a chat view, not as an editor: no tab, lock or editor actions.
		windowDisposables.add(part.hideGroupTitle(chatGroup));
		chatGroup.lock(true);

		const editorGroup = content.editor || content.editorArea ? part.addGroup(chatGroup, GroupDirection.UP) : undefined;
		// One editor is kept in its group; an editor area takes the editors opened from the chat window.
		editorGroup?.lock(!!content.editor);
		const chatGroupRoot = (chatGroup as IEditorGroupView).element.closest<HTMLElement>('.monaco-workbench');
		if (!docked && chatGroupRoot) {
			// Standalone windows only: the docked part is one floating card. Follows Layout Density while the window is open.
			windowDisposables.add(new ChatWindowCards(part, chatGroupRoot, this._themeService));
		}
		const window = new ChatWindow(state, part, chatGroup, editorGroup, content, sessionObs, this, close, resetSize);
		windowDisposables.add(autorun(reader => editorViewTypeContext.set(window.content.read(reader).editor?.viewType ?? '')));
		ChatWindowHasEditorAreaContext.bindTo(windowContextKeyService).set(!!content.editorArea);
		if (content.editorArea && editorGroup) {
			ChatWindowEditorGroupContext.bindTo(windowContextKeyService).set(editorGroup.id);
		}
		const terminalShownContext = ChatWindowTerminalShownContext.bindTo(windowContextKeyService);
		windowDisposables.add(autorun(reader => terminalShownContext.set(window.terminalShown.read(reader))));
		windowDisposables.add(toDisposable(() => this._terminalRows.get(window)?.dispose()));
		if (content.editorArea && editorGroup) {
			// What extensions open in a numbered view column, such as `ViewColumn.One`, opens in its editor area while it is
			// the active window, rather than in the main window.
			windowDisposables.add(part.setViewColumnGroup(editorGroup));
			// Terminals show in the terminal row only: one opened in the editor area, such as by a New Terminal action
			// that targets the active group, moves to the row.
			windowDisposables.add(editorGroup.onDidModelChange(e => {
				if (e.kind === GroupModelChangeKind.EDITOR_OPEN && e.editor?.typeId === TerminalEditorInput.ID) {
					// After the move that opened it completes: a terminal dragged out of the row is still closed in the row, and moving it
					// back meanwhile would leave it in no group.
					void timeout(0).then(() => {
						if (!windowDisposables.isDisposed) {
							return this._moveTerminalToRow(window, editorGroup, e.editor!);
						}
						return undefined;
					});
				}
			}));
			// Its empty editor area offers the same Add Tab actions as the main window's. The terminal row, which holds terminals only, does not.
			windowDisposables.add(this._instantiationService.createInstance(EmptyEditorGroupAddTab, editorGroup as IEditorGroupView, Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab));
			// What the Session Activity Bar of the chat window shows as checked, and offers, as it does for the main window.
			const editorAreaEditorContext = ChatWindowEditorAreaEditorContext.bindTo(windowContextKeyService);
			const activeEditor = observableFromEvent(this, editorGroup.onDidActiveEditorChange, () => editorGroup.activeEditorPane?.getId() ?? '');
			windowDisposables.add(autorun(reader => editorAreaEditorContext.set(activeEditor.read(reader))));
			const hasWorkspaceContext = ChatWindowSessionHasWorkspaceContext.bindTo(windowContextKeyService);
			windowDisposables.add(autorun(reader => {
				const session = window.session.read(reader);
				hasWorkspaceContext.set(!!session && !session.isQuickChat?.read(reader) && !!session.workspace.read(reader));
			}));
		}
		windowDisposables.add(toDisposable(() => this._remove(window)));
		Event.once(part.onWillDispose)(() => windowDisposables.dispose());
		this._windows.set([...this._windows.get(), window], undefined);
		windowDisposables.add(window.onDidClose(() => this._remove(window)));

		if (content.editor) {
			await this._showEditor(window, content.editor);
		} else if (content.editorArea && editorGroup) {
			this._moveEditors(content.editorArea.moveEditorsFrom ?? [], editorGroup);
			this._openEditors(content.editorArea, editorGroup);
		}

		// Taken out of the main window's grid once its editors moved along, which switching sessions there would close.
		// The main window's view of the chat lets go of its model as the session leaves the grid: held, so that the window's view binds to it rather than loading the chat again.
		const heldChat = windowDisposables.add(new ChatModelHold(resource => this._chatService.acquireExistingSession(resource, 'ChatWindow#move')));
		heldChat.hold(this._chatToHold(session, content.chat), this._boundCheck(session));
		this._heldChats.set(window, heldChat);
		windowDisposables.add(toDisposable(() => this._heldChats.delete(window)));
		const windowSession = this._sessionsService.showSessionInWindow(session, { chatResource: content.chat, activates: kind.activatesSession ?? true });
		// What moved or opened is the editor area's now.
		window.setContent({ ...content, chat: windowSession.scopedChatResource, editorArea: content.editorArea ? {} : undefined });
		window.setSession(windowSession);
		if (!options?.preserveFocus) {
			window.focus();
			if (kind.activatesSession ?? true) {
				this._sessionsService.setActive(windowSession);
			}
		}

		// The title of its content, or of its kind, in its title bar, or its header when docked.
		const auxiliaryWindow = docked ? undefined : this._auxiliaryWindowService.getWindow(part.windowId);
		if (auxiliaryWindow) {
			// Closed from its window: the terminal keeps running for its session before its editors close.
			windowDisposables.add(auxiliaryWindow.onBeforeUnload(() => this.releaseTerminal(window)));
		}
		const titlebar = auxiliaryWindow ? this._titleService.getPart(auxiliaryWindow.container) : undefined;
		const dockedPart = floatingPart;
		windowDisposables.add(autorun(reader => {
			const title = window.content.read(reader).title?.read(reader) || kind.title;
			if (dockedPart) {
				dockedPart.setTitle(title);
			} else if (titlebar instanceof TitlebarPart) {
				titlebar.setTitle(title);
			}
		}));
		if (options?.showTerminal && content.editorArea) {
			void window.setTerminalShown(true);
		}
		return window;
	}

	getActiveWindow(): IChatWindow | undefined {
		const windows = this._windows.get();
		// A chat window of its own is the one its window shows: its title bar acts on it, though focus is elsewhere.
		const activeWindowId = getActiveWindow().vscodeWindowId;
		const ownWindow = windows.find(window => !window.docked && window.part.windowId === activeWindowId);
		if (ownWindow) {
			return ownWindow;
		}
		const activePart = this._editorGroupsService.getPart(this._editorGroupsService.activeGroup);
		const focused = windows.find(window => window.part === activePart);
		if (focused) {
			return focused;
		}
		// A docked chat window shares the main window, where at most one docks.
		const inActiveWindow = windows.filter(window => window.part.windowId === activeWindowId);
		if (inActiveWindow.length === 1) {
			return inActiveWindow[0];
		}
		return windows.length === 1 ? windows[0] : undefined;
	}

	async setDocked(window: IChatWindow, docked: boolean): Promise<IChatWindow | undefined> {
		if (docked && !window.kind.dockable) {
			return window;
		}
		new ChatWindowDefaults(window.kind, this._storageService).setDocked(docked);
		const chatWindow = this._windows.get().find(candidate => candidate === window);
		if (!chatWindow || chatWindow.docked === docked) {
			return chatWindow;
		}
		if (docked) {
			// One chat window docks at a time: the one docked moves to a window of its own, as its kind keeps opening.
			const dockedWindow = this._windows.get().find(candidate => candidate.docked);
			if (dockedWindow && !await this._move(dockedWindow, false)) {
				return chatWindow;
			}
		}
		return this._move(chatWindow, docked);
	}

	/** Shows `window` docked, or in a window of its own, in a new chat window; see {@link setDocked}. */
	private async _move(window: ChatWindow, docked: boolean): Promise<ChatWindow | undefined> {
		const content = window.content.get();
		if (content.editorArea) {
			// The editors of the editor area move straight to the new chat window, which opens before this one closes.
			const reopened = await this._open(window.kind, { ...content, editorArea: { moveEditorsFrom: window.editorGroup ? [window.editorGroup] : [] } }, { docked }, window);
			window.close();
			return reopened;
		}
		// Saved first, so the editor moves without asking.
		await window.editorGroup?.activeEditor?.save(window.editorGroup.id);
		if (!window.close()) {
			return window;
		}
		return this._open(window.kind, content, { docked });
	}

	async moveToMainWindow(window: IChatWindow): Promise<void> {
		const chatWindow = this._windows.get().find(candidate => candidate === window);
		const content = chatWindow?.content.get();
		const session = content && this._sessionsManagementService.getSession(content.session);
		if (!chatWindow || !content || !session) {
			return;
		}
		// Serialized, as closing the chat window disposes them, and opened again once the main window shows the session.
		const editors = content.editorArea && chatWindow.editorGroup ? serializeChatWindowEditors(chatWindow.editorGroup) : [];
		if (!chatWindow.close()) {
			return;
		}
		await (content.chat ? this._sessionsService.openChat(session, content.chat) : this._sessionsService.openSession(session.resource));
		const restored = deserializeChatWindowEditors(this._instantiationService, editors);
		if (restored.editors.length) {
			// Once the main window is laid out for the session: laying it out restores the session's last editors, which
			// would replace these.
			await waitForState(this._sessionsService.mainWindowActiveSession, active => active?.sessionId === session.sessionId);
			await timeout(0);
			await waitForState(this._editorWorkingSetService.restoreState, state => !state.restoring);
			const active = restored.activeEditor ?? restored.editors.at(-1);
			this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			await this._editorService.openEditors(restored.editors.map(editor => ({ editor, options: { pinned: true, preserveFocus: true, inactive: editor !== active } })), this._editorGroupsService.mainPart.activeGroup);
		}
	}

	registerTerminalHost(host: IChatWindowTerminalHost): IDisposable {
		this._terminalHost = host;
		// Terminal rows restored before it registered.
		for (const window of this._windows.get()) {
			this.showTerminalAgain(window);
		}
		return toDisposable(() => {
			if (this._terminalHost === host) {
				this._terminalHost = undefined;
			}
		});
	}

	/** See {@link IChatWindow.setTerminalShown}: the row is a group across the bottom of the window, which the chat lays out. */
	async setTerminalShown(window: ChatWindow, shown: boolean, focus: boolean): Promise<void> {
		if (!window.editorGroup || !window.content.get().editorArea) {
			return;
		}
		const group = window.state.terminalGroup.get();
		if (shown) {
			if (group) {
				if (group.isEmpty) {
					await this._terminalHost?.show(window, group, focus);
				} else if (focus) {
					group.focus();
				}
				return;
			}
			const row = window.part.addGroup(window.chatGroup, GroupDirection.DOWN);
			// Only terminals show there, in tabs.
			row.lock(true);
			const store = new DisposableStore();
			ChatWindowTerminalRowContext.bindTo(row.scopedContextKeyService).set(true);
			this._terminalRows.set(window, store);
			// A terminal dragged out of the row, such as onto a locked group that refuses it and so opens a window of its own, would
			// otherwise be out of sight: it goes back once that move completes.
			// The row empties while it does, which must not hide it: the terminal is on its way back.
			let returningTerminals = 0;
			store.add(row.onWillMoveEditor(e => {
				if (decideTerminalRowMove(e.editor.typeId === TerminalEditorInput.ID, row.id, e.target) === TerminalRowMoveAction.ReturnToRow) {
					returningTerminals++;
					void timeout(0).then(() => {
						const target = this._editorGroupsService.getGroup(e.target);
						completeTerminalReturn({
							isCurrent: () => !store.isDisposed && window.state.terminalGroup.get() === row,
							canMove: () => !!target?.contains(e.editor) && !row.contains(e.editor),
							move: () => target!.moveEditor(e.editor, row, { pinned: true }),
							end: () => --returningTerminals,
							rowIsEmpty: () => row.isEmpty,
							isEmptying: () => this._emptyingTerminalRows.has(window),
							hideRow: () => void this.setTerminalShown(window, false, false),
						});
					});
				}
			}));
			// Its last terminal exited or closed.
			store.add(row.onDidCloseEditor(() => {
				if (row.isEmpty && !returningTerminals && !this._emptyingTerminalRows.has(window)) {
					void this.setTerminalShown(window, false, false);
				}
			}));
			window.state.terminalGroup.set(row, undefined);
			await this._terminalHost?.show(window, row, focus);
		} else if (group) {
			this._emptyTerminalRow(window, host => host.hide(window));
			window.state.terminalGroup.set(undefined, undefined);
			this._terminalRows.get(window)?.dispose();
			this._terminalRows.delete(window);
			window.part.removeGroup(group);
		}
	}

	private async _moveTerminalToRow(window: ChatWindow, from: IEditorGroup, editor: EditorInput): Promise<void> {
		if (!window.terminalGroup.get()) {
			await this.setTerminalShown(window, true, false);
		}
		const row = window.terminalGroup.get();
		if (row && row !== from && from.contains(editor)) {
			from.moveEditor(editor, row, { pinned: true });
		}
	}

	/** Gives the terminal of `window` back to its session, before the window closes or its chat moves. */
	releaseTerminal(window: ChatWindow): void {
		this._emptyTerminalRow(window, host => host.release(window));
	}

	/** Shows the terminal of `window` again in its row, after the window stayed open. */
	showTerminalAgain(window: ChatWindow): void {
		const group = window.state.terminalGroup.get();
		if (group?.isEmpty) {
			void this._terminalHost?.show(window, group, false);
		}
	}

	private _emptyTerminalRow(window: ChatWindow, empty: (host: IChatWindowTerminalHost) => void): void {
		if (!this._terminalHost || !window.state.terminalGroup.get()) {
			return;
		}
		this._emptyingTerminalRows.add(window);
		try {
			empty(this._terminalHost);
		} finally {
			this._emptyingTerminalRows.delete(window);
		}
	}

	/** Shows `content` in `window` in place of what it shows. See {@link IChatWindow.replace}. */
	async replace(window: ChatWindow, next: IChatWindowContent | Promise<IChatWindowContent | undefined>): Promise<void> {
		this._replacing.add(window);
		let replaced = false;
		try {
			const content = await next;
			if (!content) {
				return;
			}
			const current = window.content.get();
			if (!!content.editor !== !!current.editor || !!content.editorArea !== !!current.editorArea) {
				throw new Error('What a chat window shows beside its chat keeps its form for as long as it is open.');
			}
			const session = this._sessionsManagementService.getSession(content.session);
			if (!session) {
				return;
			}
			const previous = window.session.get();
			const held = this._heldChats.get(window);
			if (held) {
				held.hold(this._chatToHold(session, content.chat), this._boundCheck(session));
			}
			const windowSession = this._sessionsService.showSessionInWindow(session, { chatResource: content.chat, activates: window.kind.activatesSession ?? true });
			window.setSession(windowSession);
			replaced = true;
			this._releaseSession(previous);
			if (content.editor) {
				await this._showEditor(window, content.editor);
			} else if (content.editorArea && window.editorGroup) {
				this._moveEditors(content.editorArea.moveEditorsFrom ?? [], window.editorGroup);
			}
			window.setContent({ ...content, chat: windowSession.scopedChatResource });
			window.focus();
		} finally {
			this._replacing.delete(window);
			// Its session went while it waited, and nothing replaced it.
			const session = window.session.get();
			if (!replaced && session && !this._sessionsService.windowSessions.get().includes(session)) {
				window.setSession(undefined);
				window.close();
			}
		}
	}


	/** What each chat window holds on to while its view binds to the chat: the loaded model of the chat; see {@link ChatModelHold}. */
	private readonly _heldChats = new Map<ChatWindow, ChatModelHold>();

	/** The chat that moves, when it is given and the session has it: no other chat is held in its place. */
	private _chatToHold(session: ISession, chat: URI | undefined): URI | undefined {
		return chat && session.chats.get().find(candidate => isEqual(candidate.resource, chat))?.resource;
	}

	/** Whether the chat view of the window of `session` has bound to its model: it loaded, or showed that it was loading and is done. */
	private _boundCheck(session: ISession): () => boolean {
		let loading = false;
		return () => {
			const view = this._sessionsPartService.getSessionView(session.sessionId)?.primaryChatView.get();
			if (!view) {
				return false;
			}
			if (view.isLoadingTranscript.get()) {
				loading = true;
				return false;
			}
			return loading;
		};
	}

	/** Brings `window` to the front with the group it shows. */
	private async _reveal(window: ChatWindow): Promise<void> {
		const group = window.visibleGroup;
		const editor = group.activeEditor;
		if (editor) {
			await this._editorService.openEditor(editor, { pinned: true }, group);
		} else {
			group.focus();
		}
	}

	/** Opens the editors given to the editor area in `target`. */
	private _openEditors(editorArea: IChatWindowEditorArea, target: IEditorGroup): void {
		const editors = editorArea.editors ?? [];
		const active = editorArea.activeEditor ?? editors.at(-1);
		if (editors.length) {
			void target.openEditors(editors.map(editor => ({ editor, options: { pinned: true, preserveFocus: true, inactive: editor !== active } })));
		}
	}

	/** Moves the editors of `groups` to `target`, keeping the active one active. */
	private _moveEditors(groups: readonly IEditorGroup[], target: IEditorGroup): void {
		let active: { readonly group: IEditorGroup; readonly editor: NonNullable<IEditorGroup['activeEditor']> } | undefined;
		for (const group of groups) {
			if (group === target) {
				continue;
			}
			const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
			if (!active && group.activeEditor) {
				active = { group, editor: group.activeEditor };
			}
			if (editors.length) {
				group.moveEditors(editors.map(editor => ({ editor, options: { pinned: true, preserveFocus: true, inactive: editor !== active?.editor } })), target);
			}
		}
		if (active && target.contains(active.editor)) {
			void target.openEditor(active.editor, { preserveFocus: true });
		}
	}

	async setEditor(window: ChatWindow, editor: IChatWindowEditor): Promise<void> {
		const content = window.content.get();
		if (!content.editor || !window.editorGroup) {
			return;
		}
		// Saved first, as the editor it shows in now is replaced.
		const previous = window.editorGroup.activeEditor;
		if (previous?.isDirty()) {
			await previous.save(window.editorGroup.id);
		}
		await this._showEditor(window, editor);
		window.setContent({ ...content, editor });
	}

	/** Shows `editor` in the editor group of `window`, in place of the editor it shows. */
	private async _showEditor(window: ChatWindow, editor: IChatWindowEditor): Promise<void> {
		const { editorGroup, editorKept } = window;
		if (!editorGroup) {
			return;
		}
		const previous = editorGroup.activeEditor ?? undefined;
		const options = { pinned: true, preserveFocus: true };
		// Without the custom editor, the resource opens in the text editor, or its default editor, which can be closed.
		const asText = editor.viewType === CHAT_WINDOW_TEXT_EDITOR;
		const input = editor.viewType && !asText && this._editorResolverService.getEditors(editor.resource).some(candidate => candidate.id === editor.viewType)
			? ChatWindowCustomEditorInput.createInput(this._instantiationService, editor.resource, editor.viewType)
			: undefined;
		const override = asText ? CHAT_WINDOW_TEXT_EDITOR : undefined;
		editorKept.value = input?.keepIn(editorGroup);
		if (input) {
			await (previous
				? editorGroup.replaceEditors([{ editor: previous, replacement: input, options, forceReplaceDirty: true }])
				: this._editorService.openEditor(input, options, editorGroup));
		} else {
			await (previous
				? this._editorService.replaceEditors([{ editor: previous, replacement: { resource: editor.resource, options: { ...options, override } }, forceReplaceDirty: true }], editorGroup)
				: this._editorService.openEditor({ resource: editor.resource, options: { ...options, override } }, editorGroup));
		}
	}

	private _remove(window: ChatWindow): void {
		const windows = this._windows.get();
		if (windows.includes(window)) {
			this._windows.set(windows.filter(candidate => candidate !== window), undefined);
		}
		// Also when its part is disposed without the window having been closed.
		this.releaseTerminal(window);
		window.didClose();
		this._releaseSession(window.session.get());
	}

	/** Closes a window session once no chat window shows it: moving a chat window shows it in the next one first. */
	private _releaseSession(session: IActiveSession | undefined): void {
		if (session && this._sessionsService.windowSessions.get().includes(session) && !this._windows.get().some(window => window.session.get() === session)) {
			this._sessionsService.closeSession(session);
		}
	}
}
