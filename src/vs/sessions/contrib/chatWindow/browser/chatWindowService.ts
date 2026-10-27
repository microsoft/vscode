/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getActiveWindow } from '../../../../base/browser/dom.js';
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, ISettableObservable, observableFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { isNative } from '../../../../base/common/platform.js';
import { isEqual } from '../../../../base/common/resources.js';
import { DeepPartial } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { hasCustomTitlebar } from '../../../../platform/window/common/window.js';
import { IEditorGroupViewOptions } from '../../../../workbench/browser/parts/editor/editor.js';
import { IAuxiliaryTitlebarPart } from '../../../../workbench/browser/parts/titlebar/titlebarPart.js';
import { EditorCloseContext, EditorsOrder, GroupModelChangeKind, IEditorPartOptions } from '../../../../workbench/common/editor.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { bindEditorPartsToWindow } from '../../../../workbench/services/editor/browser/editorPartWindowBinding.js';
import { IEditorGroup, IEditorGroupsService, IEmbeddedEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService, LayoutSettings, ModernUIDensity, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ITitleService } from '../../../../workbench/services/title/browser/titleService.js';
import { Menus } from '../../../browser/menus.js';
import { applyAgentsPartCardStyles } from '../../../browser/parts/agentsPartCard.js';
import { registerSessionActivityBarExternalHost, SESSION_ACTIVITY_BAR_COLUMN_WIDTH, SessionActivityBarHostOccupancy } from '../../../browser/parts/sessionActivityBar.js';
import { SessionView } from '../../../browser/parts/sessionView.js';
import { TitlebarPart } from '../../../browser/parts/titlebarPart.js';
import { IsQuickChatSessionContext, SessionWorkspaceIsVirtualContext } from '../../../common/contextkeys.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../common/layoutConstants.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../../common/sessionConfig.js';
import { computeSessionGridLayout, SessionGridCell, SessionLayoutMode, SessionTerminalPosition } from '../../../common/sessionGridLayout/sessionGridLayout.js';
import { ChatWindowContext, ChatWindowEditorAreaEditorContext, ChatWindowEditorGroupContext, ChatWindowHasEditorAreaContext, ChatWindowHasEditorContext, ChatWindowHasSessionActivityBarContext, ChatWindowHasSessionHeaderContext, ChatWindowIdContext, ChatWindowSessionHasWorkspaceContext, ChatWindowTerminalPositionContext, ChatWindowTerminalShownContext, IChatWindow, IChatWindowContent, IChatWindowEditorArea, IChatWindowHandle, IChatWindowKind, IChatWindowOpenOptions, IChatWindowService, isChatWindowHandle, SessionLayoutModeContext, SessionSplitLayout, SessionSplitLayoutContext } from '../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionsPartService, IWindowSessionViewHost } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';
import { ChatModelHold, closeChatWindowsOfGoneChats, followReplacedWindowSessions, IChatWindowOpening, InFlightOperations, openCleaningUpOnFailure } from './chatWindowOpening.js';
import { deserializeChatWindowEditors, serializeChatWindowEditors } from './chatWindowEditors.js';
import { ChatWindowCellView, ChatWindowCellSizing, ChatWindowGridHost, IChatWindowCellConstraints } from './chatWindowGridHost.js';
import { ChatWindowInputOnlyController } from './chatWindowInputOnly.js';
import { ChatWindowChatLayouts, ChatWindowChatSizes, ChatWindowDefaults, ChatWindowState } from './chatWindowState.js';

/** The size of a chat window, unless its kind has one. */
const CHAT_WINDOW_DEFAULT_SIZE = { width: 1200, height: 800 };

/** The least a cell of a chat window can be sized to: the grid host sets the sizes and never measures what a cell shows. */
const CELL_CONSTRAINTS: Record<SessionGridCell, IChatWindowCellConstraints> = {
	[SessionGridCell.Chat]: { minimumWidth: 280, maximumWidth: Number.POSITIVE_INFINITY, minimumHeight: 120, maximumHeight: Number.POSITIVE_INFINITY },
	[SessionGridCell.SidePane]: { minimumWidth: 220, maximumWidth: Number.POSITIVE_INFINITY, minimumHeight: 120, maximumHeight: Number.POSITIVE_INFINITY },
	[SessionGridCell.Terminals]: { minimumWidth: 220, maximumWidth: Number.POSITIVE_INFINITY, minimumHeight: 80, maximumHeight: Number.POSITIVE_INFINITY },
	[SessionGridCell.Column]: { minimumWidth: SESSION_ACTIVITY_BAR_COLUMN_WIDTH, maximumWidth: SESSION_ACTIVITY_BAR_COLUMN_WIDTH, minimumHeight: 0, maximumHeight: Number.POSITIVE_INFINITY },
};

/** How the cells of a chat window share its room until the user sizes them: the editor area wider than the chat, the terminals a third of the height. */
export function getChatWindowDefaultSizing(cell: SessionGridCell, axis: 'row' | 'column'): ChatWindowCellSizing {
	switch (cell) {
		case SessionGridCell.Column: return axis === 'row' ? { kind: 'fixed', size: SESSION_ACTIVITY_BAR_COLUMN_WIDTH } : { kind: 'share', share: 1 };
		case SessionGridCell.Terminals: return { kind: 'share', share: axis === 'column' ? 0.3 : 1 };
		case SessionGridCell.SidePane: return { kind: 'share', share: axis === 'row' ? 0.6 : 0.55 };
		case SessionGridCell.Chat: return { kind: 'share', share: axis === 'row' ? 0.4 : 0.45 };
	}
}

/**
 * The options a chat window enforces on its editor area. Its tabs follow `workbench.editor.showTabs`, live; `none` shows as
 * `single`, so that the editor area keeps its title with its actions. Double-clicking a tab must not maximize or expand a
 * group: the window arranges its cells.
 */
export function chatWindowPartOptions(showTabs?: string): DeepPartial<IEditorPartOptions> {
	return { doubleClickTabToToggleEditorGroupSizes: 'off', ...(showTabs === 'none' ? { showTabs: 'single' } : undefined) };
}

/** The options of the groups of the editor area of a chat window: as the main window's editor area of the Agents window. */
function getEditorAreaGroupViewOptions(): IEditorGroupViewOptions {
	return {
		menuIds: {
			headerPrimary: Menus.SessionsEditorHeaderPrimary,
			headerLayout: Menus.SessionsEditorHeaderLayout,
			editorActions: Menus.SessionsEditorTitle,
			tabsBarContext: Menus.SessionsEditorTabsBarContext,
			tabsBarAddTab: Menus.SessionsEditorTabsBarAddTab
		},
		showHeader: true,
		useModernUITabs: true,
	};
}

/**
 * Binds on `contextKeyService` what the menus of a chat window read about the session it shows. Only those values are read,
 * and compared by value: a streaming response or a stats change leaves the keys alone, so the title bar does not re-render.
 */
export function bindChatWindowTitleBarContext(session: IObservable<IActiveSession | undefined>, contextKeyService: IContextKeyService): IDisposable {
	const hasWorkspaceContext = ChatWindowSessionHasWorkspaceContext.bindTo(contextKeyService);
	const workspaceIsVirtualContext = SessionWorkspaceIsVirtualContext.bindTo(contextKeyService);
	const isQuickChatContext = IsQuickChatSessionContext.bindTo(contextKeyService);
	const state = derivedOpts<{ readonly hasWorkspace: boolean; readonly isVirtual: boolean; readonly isQuickChat: boolean }>({
		equalsFn: (a, b) => a.hasWorkspace === b.hasWorkspace && a.isVirtual === b.isVirtual && a.isQuickChat === b.isQuickChat
	}, reader => {
		const active = session.read(reader);
		const workspace = active?.activeChat.read(reader).workspace.read(reader);
		const isQuickChat = !!active?.isQuickChat?.read(reader);
		return { hasWorkspace: !!active && !isQuickChat && !!active.workspace.read(reader), isVirtual: workspace?.isVirtualWorkspace ?? true, isQuickChat };
	});
	return autorun(reader => {
		const { hasWorkspace, isVirtual, isQuickChat } = state.read(reader);
		contextKeyService.bufferChangeEvents(() => {
			isQuickChatContext.set(isQuickChat);
			hasWorkspaceContext.set(hasWorkspace);
			workspaceIsVirtualContext.set(isVirtual);
		});
	});
}

/**
 * How the session of a chat window is focused, such as when it becomes the active session: its window, and its chat only
 * while the chat shows. Focusing the chat while only the editor area shows would not show it; only the user's choice of a
 * layout does.
 */
export function createChatWindowSessionViewHost(focusWindow: () => void, focusChat: () => void, isChatVisible: () => boolean): IWindowSessionViewHost {
	return {
		focus: () => {
			focusWindow();
			if (isChatVisible()) {
				focusChat();
			}
		},
	};
}

/** What the chat window binds for its menus, keybindings and title bar on a context key service of its own. */
interface IChatWindowContextValues {
	readonly kind: IChatWindowKind;
	readonly windowId: number;
	readonly hasEditorArea: boolean;
	readonly state: ChatWindowState;
	readonly session: IObservable<IActiveSession | undefined>;
	readonly editorGroup: IObservable<IEditorGroup | undefined>;
	readonly editorAreaEditor: IObservable<string>;
}

/**
 * Binds the context of a chat window on `contextKeyService`: the window's own, and those of the editor parts in it, which
 * are scoped to the global context rather than to the window's.
 */
export function bindChatWindowContext(contextKeyService: IContextKeyService, values: IChatWindowContextValues): IDisposable {
	const store = new DisposableStore();
	ChatWindowContext.bindTo(contextKeyService).set(values.kind.id);
	ChatWindowIdContext.bindTo(contextKeyService).set(values.windowId);
	ChatWindowHasSessionHeaderContext.bindTo(contextKeyService).set(values.kind.showSessionHeader ?? true);
	ChatWindowHasSessionActivityBarContext.bindTo(contextKeyService).set(!!values.kind.showActivityBar);
	ChatWindowHasEditorAreaContext.bindTo(contextKeyService).set(values.hasEditorArea);
	ChatWindowHasEditorContext.bindTo(contextKeyService).set(values.hasEditorArea);
	const layoutContext = SessionLayoutModeContext.bindTo(contextKeyService);
	const splitLayoutContext = SessionSplitLayoutContext.bindTo(contextKeyService);
	const terminalPositionContext = ChatWindowTerminalPositionContext.bindTo(contextKeyService);
	const terminalShownContext = ChatWindowTerminalShownContext.bindTo(contextKeyService);
	const editorGroupContext = ChatWindowEditorGroupContext.bindTo(contextKeyService);
	const editorAreaEditorContext = ChatWindowEditorAreaEditorContext.bindTo(contextKeyService);
	store.add(autorun(reader => {
		const layout = values.state.layout.read(reader);
		const splitLayout = values.state.splitLayout.read(reader);
		const terminalPosition = values.state.terminalPosition.read(reader);
		const terminalShown = values.state.terminalShown.read(reader);
		const editorGroup = values.editorGroup.read(reader);
		const editorAreaEditor = values.editorAreaEditor.read(reader);
		contextKeyService.bufferChangeEvents(() => {
			layoutContext.set(layout);
			splitLayoutContext.set(splitLayout);
			terminalPositionContext.set(terminalPosition);
			terminalShownContext.set(terminalShown);
			editorGroupContext.set(editorGroup?.id ?? -1);
			editorAreaEditorContext.set(editorAreaEditor);
		});
	}));
	store.add(bindChatWindowTitleBarContext(values.session, contextKeyService));
	return store;
}

/**
 * Follows the editors of the editor area: shows it when an editor opens in it while only the chat shows, and shows only the
 * chat once its last editor closed, as the main window's side pane does. Not when the editor moved, or the window closes.
 */
export function trackEditorAreaEditors(part: IEmbeddedEditorPart, handlers: { onDidOpenEditor(): void; onDidCloseLastEditor(): void; isClosing(): boolean }): IDisposable {
	const store = new DisposableStore();
	const groups = store.add(new DisposableStore());
	const isEmpty = () => part.groups.every(group => group.isEmpty);
	const track = () => {
		groups.clear();
		for (const group of part.groups) {
			groups.add(group.onDidModelChange(e => {
				if (e.kind === GroupModelChangeKind.EDITOR_OPEN) {
					handlers.onDidOpenEditor();
				}
			}));
			groups.add(group.onDidCloseEditor(e => {
				if (e.context !== EditorCloseContext.MOVE && !handlers.isClosing() && isEmpty()) {
					handlers.onDidCloseLastEditor();
				}
			}));
		}
	};
	track();
	store.add(part.onDidAddGroup(track));
	store.add(part.onDidRemoveGroup(track));
	return store;
}

/** An open chat window: its window, its grid of cells and the state that lays them out. */
class ChatWindow implements IChatWindow {

	private readonly _content: ISettableObservable<IChatWindowContent>;
	readonly content: IObservable<IChatWindowContent>;

	private readonly _onDidClose = new Emitter<void>();
	readonly onDidClose: Event<void> = this._onDidClose.event;

	readonly handle: IChatWindowHandle;

	readonly terminalShown: IObservable<boolean>;

	private _closed = false;
	/** Set while it closes, so that editors closing with it do not change its layout. */
	closing = false;
	private _inputOnly: ChatWindowInputOnlyController | undefined;

	constructor(
		readonly state: ChatWindowState,
		readonly auxiliaryWindow: IAuxiliaryWindow,
		readonly editorArea: IEmbeddedEditorPart | undefined,
		readonly sessionView: SessionView,
		content: IChatWindowContent,
		private readonly _session: ISettableObservable<IActiveSession | undefined>,
		private readonly _closeParts: () => boolean,
	) {
		this._content = observableValue(this, content);
		this.content = this._content;
		this.handle = Object.freeze({ chatWindowId: auxiliaryWindow.window.vscodeWindowId });
		this.terminalShown = state.terminalShown;
	}

	get windowId(): number { return this.auxiliaryWindow.window.vscodeWindowId; }
	get kind(): IChatWindowKind { return this.state.kind; }
	get session(): IObservable<IActiveSession | undefined> { return this._session; }
	get layout(): IObservable<SessionLayoutMode> { return this.state.layout; }
	get splitLayout(): IObservable<SessionSplitLayout> { return this.state.splitLayout; }
	get layouts(): readonly SessionLayoutMode[] { return this.state.layouts; }
	get inputOnly(): IObservable<boolean> { return this.state.inputOnly; }
	get terminalPosition(): IObservable<SessionTerminalPosition> { return this.state.terminalPosition; }
	get editorGroup(): IEditorGroup | undefined { return this.editorArea?.activeGroup; }

	setSession(session: IActiveSession | undefined): void {
		this._session.set(session, undefined);
	}

	setContent(content: IChatWindowContent): void {
		this._content.set(content, undefined);
	}

	/** Whether the chat shows: not while only the editor area does. */
	get chatVisible(): boolean {
		return this.state.layout.get() !== SessionLayoutMode.EditorOnly;
	}

	setLayout(layout: SessionLayoutMode): void {
		this.state.setLayout(layout);
	}

	setSplitLayout(splitLayout: SessionSplitLayout): void {
		this.state.setSplitLayout(splitLayout);
	}

	attachInputOnly(inputOnly: ChatWindowInputOnlyController): void {
		this._inputOnly = inputOnly;
	}

	toggleConversation(): void {
		if (this.state.layout.get() === SessionLayoutMode.Stacked) {
			// Toggles what shows, which the window may have chosen while it was too short, not what was last chosen.
			this._inputOnly?.toggleConversation();
		}
	}

	showEditor(): void {
		if (this.editorArea && this.state.layout.get() === SessionLayoutMode.ChatOnly) {
			this.state.showBoth();
		}
	}

	setTerminalPosition(position: SessionTerminalPosition): void {
		this.state.setTerminalPosition(position);
	}

	/** Focuses the chat while it shows, else the editor area, so that focusing a window that shows only its editor area keeps it so. */
	focus(): void {
		if (this.chatVisible) {
			this.sessionView.focus();
		} else {
			this.editorArea?.activeGroup.focus();
		}
	}

	close(): boolean {
		if (this._closed) {
			return true;
		}
		this.closing = true;
		if (!this._closeParts()) {
			this.closing = false;
			return false;
		}
		this.auxiliaryWindow.window.close();
		this.didClose();
		return true;
	}

	/** Ends the chat window: it closed, or its window went away. */
	didClose(): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		this.closing = true;
		this._onDidClose.fire();
		this._onDidClose.dispose();
	}
}

export class ChatWindowService extends Disposable implements IChatWindowService {

	declare readonly _serviceBrand: undefined;

	private readonly _windows = observableValue<readonly ChatWindow[]>(this, []);
	readonly windows: IObservable<readonly IChatWindow[]> = this._windows;

	private readonly _opening = new InFlightOperations<IChatWindow | undefined>();
	private readonly _chatLayouts: ChatWindowChatLayouts;
	private readonly _chatSizes: ChatWindowChatSizes;

	/** What each chat window holds on to while its view binds to the chat: the loaded model of the chat; see {@link ChatModelHold}. */
	private readonly _heldChats = new Map<ChatWindow, ChatModelHold>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IAuxiliaryWindowService private readonly _auxiliaryWindowService: IAuxiliaryWindowService,
		@ITitleService private readonly _titleService: ITitleService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
		@ISessionEditorWorkingSetService private readonly _editorWorkingSetService: ISessionEditorWorkingSetService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IThemeService private readonly _themeService: IThemeService,
		@IChatService private readonly _chatService: IChatService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IHostService private readonly _hostService: IHostService,
	) {
		super();

		this._chatLayouts = new ChatWindowChatLayouts(_storageService);
		this._chatSizes = new ChatWindowChatSizes(_storageService);

		// A chat window shows its session for as long as the session shows in a window: closing the session closes it.
		this._register(followReplacedWindowSessions(this._windows, this._sessionsService.windowSessions));

		// A chat window shows its chat for as long as the chat exists and is not archived: deleting or archiving it closes the window.
		this._register(closeChatWindowsOfGoneChats(this._windows, () => false));
	}

	open(kind: IChatWindowKind, content: IChatWindowContent, options?: IChatWindowOpenOptions): Promise<IChatWindow | undefined> {
		return this._opening.run(this._chatKey(content).toString(), () => this._openOrReveal(kind, content, options));
	}

	getWindow(windowId: number): IChatWindow | undefined {
		return this._windows.get().find(window => window.windowId === windowId);
	}

	resolveWindow(context: unknown): IChatWindow | undefined {
		if (isChatWindowHandle(context)) {
			return this.getWindow(context.chatWindowId);
		}
		// Without a handle, such as from a keybinding or the Command Palette: the chat window whose window is active.
		return this.getWindow(getActiveWindow().vscodeWindowId);
	}

	/** The chat a window shows: the one asked for, or the main chat of its session. */
	private _chatKey(content: IChatWindowContent): URI {
		return content.chat ?? this._sessionsManagementService.getSession(content.session)?.mainChat.get().resource ?? content.session;
	}

	private async _openOrReveal(kind: IChatWindowKind, content: IChatWindowContent, options?: IChatWindowOpenOptions): Promise<IChatWindow | undefined> {
		const chatKey = this._chatKey(content);
		const opened = this._windows.get().find(window => isEqual(window.content.get().session, content.session) && isEqual(this._chatKey(window.content.get()), chatKey));
		if (opened) {
			if (!options?.preserveFocus) {
				await this._hostService.focus(opened.auxiliaryWindow.window);
				opened.focus();
			}
			return opened;
		}
		const session = this._sessionsManagementService.getSession(content.session);
		if (!session) {
			return undefined;
		}
		return openCleaningUpOnFailure(opening => this._openWindow(kind, content, options, session, opening));
	}

	private async _openWindow(kind: IChatWindowKind, content: IChatWindowContent, options: IChatWindowOpenOptions | undefined, session: ISession, opening: IChatWindowOpening): Promise<ChatWindow> {
		const disposables = opening.disposables;
		const hasEditorArea = !!content.editorArea;

		// The chat the window opens with, as `ISessionsService.showSessionInWindow` picks it, whose layout is remembered.
		const gridSession = this._sessionsService.visibleSessions.get().find(candidate => candidate?.sessionId === session.sessionId && !candidate.scopedChatResource);
		const chatResource = content.chat ?? gridSession?.activeChat.get().resource ?? session.mainChat.get().resource;
		const sessionObs = observableValue<IActiveSession | undefined>(this, undefined);
		const state = new ChatWindowState(kind, hasEditorArea, new ChatWindowDefaults(kind, this._storageService), {
			initial: this._chatLayouts.get(chatResource),
			// For the chat the window shows when the user chooses, which a replaced session changes.
			set: layout => {
				const chat = sessionObs.get()?.activeChat.get().resource ?? chatResource;
				this._chatLayouts.set(chat, layout);
			},
		});

		const auxiliaryWindow = disposables.add(await this._auxiliaryWindowService.open({ bounds: kind.windowSize ?? CHAT_WINDOW_DEFAULT_SIZE }));
		opening.close = () => {
			auxiliaryWindow.window.close();
			return true;
		};
		const windowId = auxiliaryWindow.window.vscodeWindowId;
		const container = auxiliaryWindow.container;
		container.classList.add('chat-window');

		// The window's own context, which its title bar, its chat and its Session Activity Bar are scoped to.
		const windowContextKeyService = disposables.add(this._contextKeyService.createScoped(container));

		// The editor area, created first: the title bar shows its editors' title, and what the chat opens goes to it.
		const parts: IEmbeddedEditorPart[] = [];
		let editorArea: IEmbeddedEditorPart | undefined;
		if (hasEditorArea) {
			const editorAreaElement = append(container, $('.part.editor.chat-window-editor-area'));
			editorArea = this._editorGroupsService.createEditorPart({
				container: editorAreaElement,
				label: localize('chatWindow.editorArea', "Editor Area"),
				groupViewOptions: getEditorAreaGroupViewOptions(),
				// When focus is in the chat, which is in no editor part, editors open here.
				primary: true,
			});
			const part = editorArea;
			parts.push(part);
			disposables.add(toDisposable(() => {
				// Closed with the window, merging what it cannot close to the main window; the part disposes itself as it closes.
				if (this._editorGroupsService.parts.includes(part)) {
					part.close();
				}
			}));
			const partOptions = disposables.add(new MutableDisposable());
			const enforcePartOptions = () => partOptions.value = part.enforcePartOptions(chatWindowPartOptions(this._configurationService.getValue<string>('workbench.editor.showTabs')));
			enforcePartOptions();
			disposables.add(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('workbench.editor.showTabs')) {
					enforcePartOptions();
				}
			}));
		}
		// Registered before the parts are bound to the window, which close them, and their editors, as it unloads: editors
		// closing with the window must not change its layout.
		let unloading = false;
		disposables.add(auxiliaryWindow.onUnload(() => unloading = true));
		disposables.add(bindEditorPartsToWindow(auxiliaryWindow, parts, this._editorGroupsService));

		// What the chat opens, such as files and its changes, opens in the editor area.
		const editorAreaEditorService = editorArea ? this._editorGroupsService.getScopedInstantiationService(editorArea).invokeFunction(accessor => accessor.get(IEditorService)) : this._editorService;
		const windowInstantiationService = disposables.add(this._instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, windowContextKeyService],
			[IEditorService, editorAreaEditorService],
		)));

		// The window's context, bound on the window and on its editor parts, which are scoped to the global context.
		const editorGroup = editorArea ? observableFromEvent(this, editorArea.onDidActivateGroup, () => editorArea!.activeGroup) : observableValue<IEditorGroup | undefined>(this, undefined);
		const editorAreaEditor = observableFromEvent(this, editorAreaEditorService.onDidActiveEditorChange, () => editorArea ? editorAreaEditorService.activeEditorPane?.getId() ?? '' : '');
		const contextValues: IChatWindowContextValues = { kind, windowId, hasEditorArea, state, session: sessionObs, editorGroup, editorAreaEditor };
		disposables.add(bindChatWindowContext(windowContextKeyService, contextValues));
		for (const part of parts) {
			const partContextKeyService = this._editorGroupsService.getScopedInstantiationService(part).invokeFunction(accessor => accessor.get(IContextKeyService));
			disposables.add(bindChatWindowContext(partContextKeyService, contextValues));
		}


		// The title bar, as other windows of the Agents window have one; it shows the title of the chat.
		let titlebar: IAuxiliaryTitlebarPart | undefined;
		if (isNative && hasCustomTitlebar(this._configurationService)) {
			titlebar = disposables.add(this._titleService.createAuxiliaryTitlebarPart(container, editorArea ?? this._editorGroupsService.mainPart, windowInstantiationService));
			disposables.add(titlebar.onDidChange(() => auxiliaryWindow.layout()));
		}

		// The cells of the window's grid: the chat, the editor area, the terminals and the Session Activity Bar.
		const hostElement = append(container, $('.chat-window-host.sessions-window-host'));
		const detached = append(hostElement, $('.chat-window-detached'));
		detached.setAttribute('aria-hidden', 'true');
		const cells = new Map<SessionGridCell, ChatWindowCellView>();
		for (const cell of [SessionGridCell.Chat, SessionGridCell.SidePane, SessionGridCell.Terminals, SessionGridCell.Column]) {
			cells.set(cell, disposables.add(new ChatWindowCellView(cell, CELL_CONSTRAINTS[cell])));
		}
		const chatCell = cells.get(SessionGridCell.Chat)!;
		chatCell.element.setAttribute('role', 'main');
		chatCell.element.setAttribute('aria-label', localize('chatWindow.chat', "Chat"));

		const sessionView = disposables.add(windowInstantiationService.createInstance(SessionView, {
			showHeader: kind.showSessionHeader ?? true,
			showActivityBar: kind.showActivityBar ?? false,
			input: { placeholder: kind.inputPlaceholder, minLines: kind.inputMinLines, showPills: kind.showPills ?? true },
		}));
		// The one session view of its window: styled as the active one of the grid is.
		sessionView.element.classList.add('is-active');
		sessionView.setActive(true);
		chatCell.setContent(sessionView);
		if (editorArea) {
			const part = editorArea;
			cells.get(SessionGridCell.SidePane)!.setContent({ element: part.element as HTMLElement, layout: (width, height, top, left) => part.layout(width, height, top, left) });
		}
		cells.get(SessionGridCell.Terminals)!.setContent({ element: $('.chat-window-terminals'), layout: () => { } });

		// The Session Activity Bar takes a column of its own beside the editor area while the chat is below the editor area
		// or hidden; beside the chat otherwise, as in the main window.
		const columnElement = $('.chat-window-activity-bar-column');
		const columnHeight = observableValue<number>(this, 0);
		cells.get(SessionGridCell.Column)!.setContent({ element: columnElement, layout: (_width, height) => columnHeight.set(height, undefined) });
		const occupancy = new SessionActivityBarHostOccupancy();
		const activityBarEnabled = observableFromEvent(this, this._configurationService.onDidChangeConfiguration, () => !!kind.showActivityBar && this._configurationService.getValue<boolean>(SESSION_ACTIVITY_BAR_SETTING) !== false);

		const gridHost = disposables.add(new ChatWindowGridHost(hostElement, cells, (cell, axis) => getChatWindowDefaultSizing(cell, axis)));
		// The sizes the cells last showed with for this chat come back, also after a reload.
		const sizes = this._chatSizes.get(chatResource);
		if (sizes) {
			gridHost.importSizes(sizes);
		}
		// What the window shows is what it shows again, for its chat: its layout and the sizes of its cells.
		const saveSizes = () => {
			const chat = sessionObs.get()?.activeChat.get().resource ?? chatResource;
			this._chatSizes.set(chat, gridHost.exportSizes());
			if (hasEditorArea) {
				this._chatLayouts.set(chat, { mode: state.layout.get(), splitLayout: state.splitLayout.get(), inputOnly: state.inputOnly.get() });
			}
		};
		disposables.add(this._storageService.onWillSaveState(saveSizes));
		disposables.add(auxiliaryWindow.onBeforeUnload(saveSizes));

		const gridLayout = derived(this, reader => computeSessionGridLayout({
			mode: state.layout.read(reader),
			terminalPosition: state.terminalPosition.read(reader),
			terminalsVisible: state.terminalShown.read(reader),
			activityBar: activityBarEnabled.read(reader),
			inputOnly: state.inputOnly.read(reader),
		}));
		disposables.add(registerSessionActivityBarExternalHost(container, {
			element: columnElement,
			active: derived(this, reader => gridLayout.read(reader).column !== 'none'),
			height: columnHeight,
			setOccupied: (occupant, occupied) => occupancy.set(occupant, occupied),
		}));
		disposables.add(autorun(reader => {
			const layout = gridLayout.read(reader);
			gridHost.apply(layout);
			// Without the chat, its view stays in the window, hidden, so that its Session Activity Bar finds the column.
			const chatShown = layout.tabOrder.includes(SessionGridCell.Chat);
			if (!chatShown) {
				detached.appendChild(chatCell.element);
			}
			sessionView.setPartVisible(chatShown);
		}));

		const inputOnly = disposables.add(new ChatWindowInputOnlyController(sessionView, state, gridHost, chatCell, hostElement, gridLayout, CELL_CONSTRAINTS[SessionGridCell.Chat], CELL_CONSTRAINTS[SessionGridCell.SidePane].minimumHeight));

		// The cells are cards, as the main window's parts are, unless Layout Density is compact, which keeps them flush.
		const applyCardStyles = () => {
			for (const view of cells.values()) {
				applyAgentsPartCardStyles(view.element.firstElementChild as HTMLElement, this._themeService.getColorTheme());
			}
		};
		applyCardStyles();
		disposables.add(this._themeService.onDidColorThemeChange(applyCardStyles));
		const updateGap = () => gridHost.setGap(this._configurationService.getValue<ModernUIDensity>(LayoutSettings.MODERN_UI_DENSITY) === ModernUIDensity.Compact ? 0 : AGENTS_FLOATING_PANEL_GAP);
		updateGap();
		disposables.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.MODERN_UI_DENSITY)) {
				updateGap();
			}
		}));

		disposables.add(auxiliaryWindow.onWillLayout(dimension => {
			const titlebarHeight = titlebar?.height ?? 0;
			titlebar?.layout(dimension.width, titlebarHeight, 0, 0);
			hostElement.style.top = `${titlebarHeight}px`;
			hostElement.style.height = `${Math.max(0, dimension.height - titlebarHeight)}px`;
			hostElement.style.width = `${dimension.width}px`;
			gridHost.layoutGrid(dimension.width, Math.max(0, dimension.height - titlebarHeight));
		}));

		const window = new ChatWindow(state, auxiliaryWindow, editorArea, sessionView, content, sessionObs, () => parts.every(part => part.close()));
		window.attachInputOnly(inputOnly);

		if (editorArea) {
			const part = editorArea;
			disposables.add(trackEditorAreaEditors(part, {
				onDidOpenEditor: () => window.showEditor(),
				onDidCloseLastEditor: () => window.setLayout(SessionLayoutMode.ChatOnly),
				isClosing: () => window.closing || unloading || disposables.isDisposed,
			}));
			this._moveEditors(content.editorArea?.moveEditorsFrom ?? [], part.activeGroup);
			this._openEditors(content.editorArea ?? {}, part.activeGroup);
		}

		// The session it shows becomes its session once its window exists, so that focusing it activates it.
		disposables.add(this._sessionsPartService.registerWindowSessionView(sessionView, createChatWindowSessionViewHost(
			() => void this._hostService.focus(auxiliaryWindow.window),
			() => sessionView.focus(),
			() => window.chatVisible,
		)));
		const heldChat = disposables.add(new ChatModelHold(resource => this._chatService.acquireExistingSession(resource, 'ChatWindow#move')));
		heldChat.hold(this._chatToHold(session, content.chat), this._boundCheck(session));
		this._heldChats.set(window, heldChat);
		disposables.add(toDisposable(() => this._heldChats.delete(window)));
		const windowSession = this._sessionsService.showSessionInWindow(session, { chatResource: content.chat, activates: kind.activatesSession ?? true });
		window.setContent({ ...content, chat: windowSession.scopedChatResource, editorArea: content.editorArea ? {} : undefined });
		window.setSession(windowSession);
		sessionView.openSession(windowSession, {});

		disposables.add(autorun(reader => {
			const title = window.content.read(reader).title?.read(reader) || kind.title;
			if (titlebar instanceof TitlebarPart) {
				titlebar.setTitle(title);
			} else {
				auxiliaryWindow.window.document.title = title;
			}
		}));

		this._windows.set([...this._windows.get(), window], undefined);
		disposables.add(toDisposable(() => this._remove(window)));
		disposables.add(Event.once(auxiliaryWindow.onUnload)(() => {
			window.didClose();
			disposables.dispose();
		}));
		disposables.add(window.onDidClose(() => this._remove(window)));

		auxiliaryWindow.layout();
		if (!options?.preserveFocus) {
			window.focus();
			if (kind.activatesSession ?? true) {
				this._sessionsService.setActive(windowSession);
			}
		}
		if (options?.showTerminal && hasEditorArea) {
			state.setTerminalShown(true);
		}
		return window;
	}

	async moveToMainWindow(window: IChatWindow): Promise<void> {
		const chatWindow = this._windows.get().find(candidate => candidate === window);
		const content = chatWindow?.content.get();
		const session = content && this._sessionsManagementService.getSession(content.session);
		if (!chatWindow || !content || !session) {
			return;
		}
		// Serialized, as closing the chat window disposes them, and opened again once the main window shows the session.
		const editors = chatWindow.editorArea ? chatWindow.editorArea.groups.flatMap(group => serializeChatWindowEditors(group)) : [];
		if (!chatWindow.close()) {
			return;
		}
		await (content.chat ? this._sessionsService.openChat(session, content.chat) : this._sessionsService.openSession(session.resource));
		const restored = deserializeChatWindowEditors(this._instantiationService, editors);
		if (restored.editors.length) {
			// Once the main window is laid out for the session: laying it out restores the session's last editors, which would replace these.
			await waitForState(this._sessionsService.mainWindowActiveSession, active => active?.sessionId === session.sessionId);
			await timeout(0);
			await waitForState(this._editorWorkingSetService.restoreState, restoreState => !restoreState.restoring);
			const active = restored.activeEditor ?? restored.editors.at(-1);
			this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			await this._editorService.openEditors(restored.editors.map(editor => ({ editor, options: { pinned: true, preserveFocus: true, inactive: editor !== active } })), this._editorGroupsService.mainPart.activeGroup);
		}
	}

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

	private _remove(window: ChatWindow): void {
		const windows = this._windows.get();
		if (windows.includes(window)) {
			this._windows.set(windows.filter(candidate => candidate !== window), undefined);
		}
		window.didClose();
		this._releaseSession(window.session.get());
	}

	/** Closes a window session once no chat window shows it. */
	private _releaseSession(session: IActiveSession | undefined): void {
		if (session && this._sessionsService.windowSessions.get().includes(session) && !this._windows.get().some(window => window.session.get() === session)) {
			this._sessionsService.closeSession(session);
		}
	}
}

