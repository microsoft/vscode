/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { Direction } from '../../../../../base/browser/ui/grid/grid.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { NewSessionActionViewItem, type NewSessionButtonStyle } from '../../../sessions/browser/sessionsActions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { MenuActivityBarSize } from '../../../../../workbench/browser/parts/activitybar/menuActivityBar.js';
import { CONNECTED_EDITOR_TABS_CLASS } from '../../../../../workbench/browser/parts/editor/editor.js';
import { IPartGridView, PartGrid } from '../../../../../workbench/browser/parts/partGrid/partGrid.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { AgentSessionApprovalModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { IAgentHostFilterService } from '../../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { BlockedSessions } from '../../../../../workbench/contrib/sessions/browser/blockedSessions.js';
import { Menus, SessionActivityBarGroup } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { ChatViewSessionActivityBar } from '../../../../../workbench/contrib/sessions/browser/parts/sessionActivityBar.js';
import { registerSessionActivityBarExternalHost, setSessionActivityBarSize } from '../../../../../workbench/browser/parts/sessions/sessionActivityBarHost.js';
import { AgentWorkbenchLayout } from '../../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../../../workbench/contrib/sessions/common/layoutConstants.js';
import { ISessionActivityBarActivityService, SessionActivityBarActivityService } from '../../../../../workbench/contrib/sessions/common/sessionActivityBarActivityService.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ITestSessionWithChat, stubSessionHosts, testGridPanes } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService, LayoutSettings, ModernUIDensity } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { AuxiliaryTitlebarPart, TitlebarPart } from '../../../../browser/parts/titlebarPart.js';
import { FixtureContextViewService, FixtureKeybindingService, FixtureMenuService, fixtureBrowser, fixtureCanvas, fixtureChanges, fixtureFiles, fixtureTerminal, fixtureTogglePanel, fixtureToggleSidePanel, IFixtureEntry } from '../../../../test/browser/addTabFixtureUtils.js';
import { BlockedSessionsCIFixModel } from '../../../sessions/browser/blockedSessionsCIFixModel.js';
import { BlockedSessionsIndicatorModel } from '../../../sessions/browser/blockedSessionsIndicatorModel.js';
import { SessionActionFeedback } from '../../../sessions/browser/sessionActionFeedback.js';
import { SessionsTitleBarWidget } from '../../../sessions/browser/sessionsTitleBarWidget.js';
import { AGENTS_CHAT_WINDOW_CLASS, getChatWindowStripWidth } from '../../browser/sessionsChatWindowProvider.js';
import '../../../../../workbench/contrib/modernUI/browser/media/connectedEditorTabs.css';
import '../../../../../workbench/contrib/modernUI/browser/media/titlebar.css';
import '../../../../browser/parts/media/editorPart.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/chatCompositeBar.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/chatGroupsView.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/sessionView.css';
import '../../../../../workbench/browser/parts/sessions/media/sessionsPart.css';
import '../../browser/media/chatWindow.css';

/**
 * A chat window as it shows the Agents window's title bar across its top, in each layout mode and density: the real title
 * bar of its window, with its command center showing the session of the window's active chat and the actions of the window,
 * above the cards of its parts, laid out on the real part grid and framed as in production, and the real Session Activity
 * Bar of its chat in the strip's column at the right, starting below the title bar.
 */

interface IFixtureOptions {
	readonly mode: ChatWindowLayoutMode;
	readonly density: ModernUIDensity;
	/** The size chosen for the Session Activity Bar, which its column follows. Compact unless chosen. */
	readonly size?: MenuActivityBarSize;
	/** The chats of its chat part: with more than one, its group shows their tabs, and the chat hides its session header. */
	readonly chats?: number;
	/** Its parts show a single tab, as with `workbench.editor.showTabs` set to `single` or `none`: their groups draw no frames, their cards do. */
	readonly singleTab?: boolean;
	/** Its Session Activity Bar shows the layout actions, which leave the title bar: its session actions end the title bar. */
	readonly layoutActionsInStrip?: boolean;
}

const WIDTH = 960;
const HEIGHT = 360;
const SESSION_TITLE = 'Fix authentication redirect loop';
const highContrastThemes: ['darkHighContrast', 'lightHighContrast'] = ['darkHighContrast', 'lightHighContrast'];

function titleBarFixture(options: IFixtureOptions, additionalThemes?: typeof highContrastThemes) {
	return defineComponentFixture({ additionalThemes, render: context => renderChatWindow(context, options) });
}

export default defineThemedFixtureGroup({ path: 'sessions/chatWindow/titleBar/' }, {
	SideBySide: titleBarFixture({ mode: ChatWindowLayoutMode.SideBySide, density: ModernUIDensity.Default }, highContrastThemes),
	ChatOnly: titleBarFixture({ mode: ChatWindowLayoutMode.ChatOnly, density: ModernUIDensity.Default }),
	Stacked: titleBarFixture({ mode: ChatWindowLayoutMode.Stacked, density: ModernUIDensity.Default }),
	EditorOnly: titleBarFixture({ mode: ChatWindowLayoutMode.EditorOnly, density: ModernUIDensity.Default }),
	SideBySideCompact: titleBarFixture({ mode: ChatWindowLayoutMode.SideBySide, density: ModernUIDensity.Compact }, highContrastThemes),
	ChatOnlyCompact: titleBarFixture({ mode: ChatWindowLayoutMode.ChatOnly, density: ModernUIDensity.Compact }),
	StackedCompact: titleBarFixture({ mode: ChatWindowLayoutMode.Stacked, density: ModernUIDensity.Compact }),
	EditorOnlyCompact: titleBarFixture({ mode: ChatWindowLayoutMode.EditorOnly, density: ModernUIDensity.Compact }),
	// The Session Activity Bar at the normal size: its column is wider, the title bar spans the window as at any size.
	SideBySideNormalSize: titleBarFixture({ mode: ChatWindowLayoutMode.SideBySide, density: ModernUIDensity.Default, size: MenuActivityBarSize.Normal }),
	StackedCompactNormalSize: titleBarFixture({ mode: ChatWindowLayoutMode.Stacked, density: ModernUIDensity.Compact, size: MenuActivityBarSize.Normal }),
	// Two chats in the chat part: its group frames its tabs and the chat as the main part's group frames its own, and its
	// active tab flows into the chat, which shows no session header of its own.
	SideBySideTwoChats: titleBarFixture({ mode: ChatWindowLayoutMode.SideBySide, density: ModernUIDensity.Default, chats: 2 }, highContrastThemes),
	SideBySideTwoChatsCompact: titleBarFixture({ mode: ChatWindowLayoutMode.SideBySide, density: ModernUIDensity.Compact, chats: 2 }, highContrastThemes),
	SideBySideSingleTab: titleBarFixture({ mode: ChatWindowLayoutMode.SideBySide, density: ModernUIDensity.Default, singleTab: true }, highContrastThemes),
	// The layout actions in the Session Activity Bar: the session actions end the title bar, with the same inset to the
	// window's edge as the layout actions have.
	SideBySideLayoutActionsInStrip: titleBarFixture({ mode: ChatWindowLayoutMode.SideBySide, density: ModernUIDensity.Default, layoutActionsInStrip: true }, highContrastThemes),
	SideBySideLayoutActionsInStripCompact: titleBarFixture({ mode: ChatWindowLayoutMode.SideBySide, density: ModernUIDensity.Compact, layoutActionsInStrip: true }, highContrastThemes),
});

interface IMenuEntry {
	readonly id: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly submenu?: MenuId;
}

/** What the title bar menus of a chat window show: its New Session, the command center and the actions of its session and window. */
const CHAT_WINDOW_MENUS = new Map<MenuId, readonly IMenuEntry[]>([
	[AgentsWindowMenus.TitleBarLeftLayout, [{ id: NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID, title: 'New Session', icon: Codicon.plus }]],
	[AgentsWindowMenus.CommandCenter, [{ id: AgentsWindowMenus.TitleBarSessionTitle.id, title: 'Agent Sessions', icon: Codicon.copilot, submenu: AgentsWindowMenus.TitleBarSessionTitle }]],
	[AgentsWindowMenus.TitleBarCenterRight, [{ id: 'run', title: 'Run', icon: Codicon.play }, { id: 'sessions.openInVSCode', title: 'Open in Editor', icon: Codicon.vscodeInsiders }]],
	[AgentsWindowMenus.TitleBarSessionMenu, [{ id: 'createPullRequest', title: 'Create Pull Request', icon: Codicon.gitPullRequestCreate }]],
	[AgentsWindowMenus.TitleBarWindowLayout, [{ id: 'workbench.action.chatWindow.toggleEditor', title: 'Show Editor', icon: Codicon.layoutSidebarRight }, { id: 'layout', title: 'Configure Layout', icon: Codicon.layout, submenu: AgentsWindowMenus.WindowLayout }]],
]);

/** The entries of the chat's Session Activity Bar, as the strip's chat-window fixtures show them. */
const sidePanelGroup = (entries: readonly IFixtureEntry[]) => entries.map(entry => ({ ...entry, group: SessionActivityBarGroup.SidePanel }));
const ACTIVITY_BAR_ENTRIES: readonly IFixtureEntry[] = [fixtureToggleSidePanel, ...sidePanelGroup([fixtureChanges, fixtureFiles, fixtureBrowser, fixtureCanvas]), fixtureTerminal, fixtureTogglePanel];
/** The entries of the Session Activity Bar while it shows the layout actions of the window, at its top. */
const ACTIVITY_BAR_ENTRIES_WITH_LAYOUT_ACTIONS: readonly IFixtureEntry[] = [
	...CHAT_WINDOW_MENUS.get(AgentsWindowMenus.TitleBarWindowLayout)!.map(({ id, title, icon }) => ({ id, title, icon, group: SessionActivityBarGroup.WindowLayout })),
	...ACTIVITY_BAR_ENTRIES,
];

/** Each title bar menu of the window shows its own entries, as the menus of a chat window do, and the strip its entries. */
class ChatWindowMenuService extends mock<IMenuService>() {

	private readonly activityBarMenus: FixtureMenuService;
	private _commandService: ICommandService | undefined;

	constructor(private readonly layoutActionsInStrip: boolean) {
		super();
		this.activityBarMenus = new FixtureMenuService(layoutActionsInStrip ? ACTIVITY_BAR_ENTRIES_WITH_LAYOUT_ACTIONS : ACTIVITY_BAR_ENTRIES);
	}

	setCommandService(commandService: ICommandService): void {
		this._commandService = commandService;
		this.activityBarMenus.commandService = commandService;
	}

	override createMenu(id: MenuId, contextKeyService: IContextKeyService): IMenu {
		if (id.id === Menus.SessionActivityBar.id) {
			return this.activityBarMenus.createMenu(id, contextKeyService);
		}
		const entries = this.layoutActionsInStrip && id.id === AgentsWindowMenus.TitleBarWindowLayout.id ? [] : CHAT_WINDOW_MENUS.get(id) ?? [];
		return {
			onDidChange: Event.None,
			dispose: () => { },
			getActions: () => entries.length ? [['navigation', entries.map(entry => entry.submenu
				? new SubmenuItemAction({ submenu: entry.submenu, title: entry.title, icon: entry.icon }, undefined, [])
				: new MenuItemAction({ id: entry.id, title: entry.title, icon: entry.icon }, undefined, undefined, undefined, undefined, contextKeyService, this._commandService!))]] : [],
		};
	}

	override resetHiddenStates(): void { }
}

/** The session of the window's active chat. */
function createSession(): ITestSessionWithChat {
	const workspace = new class extends mock<ISessionWorkspace>() {
		override readonly label = 'vscode';
		override readonly folders = [{
			root: URI.file('/src/vscode'),
			workingDirectory: URI.file('/src/vscode.worktrees/feature'),
			name: 'vscode',
			description: undefined,
			gitRepository: {
				uri: URI.file('/src/vscode'),
				workTreeUri: URI.file('/src/vscode.worktrees/feature'),
				branchName: 'fix-redirect-loop',
				baseBranchName: 'main',
				gitHubInfo: constObservable(undefined),
			},
		}];
		override readonly isVirtualWorkspace = false;
	}();
	const activeChat = new class extends mock<IChat>() {
		override readonly title: IObservable<string> = constObservable(SESSION_TITLE);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(workspace);
	}();
	return new class extends mock<ITestSessionWithChat>() {
		override readonly icon = Codicon.copilot;
		override readonly title: IObservable<string> = constObservable(SESSION_TITLE);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(workspace);
		override readonly activeChat: IObservable<IChat> = constObservable(activeChat);
		override readonly isCreated: IObservable<boolean> = constObservable(true);
		override readonly status = this.isCreated.map(created => created ? SessionStatus.Completed : SessionStatus.Untitled);
		override readonly isQuickChat: IObservable<boolean> = constObservable(false);
	}();
}

function renderChatWindow(context: ComponentFixtureContext, options: IFixtureOptions): void {
	const { container, disposableStore, theme } = context;
	const compact = options.density === ModernUIDensity.Compact;
	container.style.width = `${WIDTH}px`;
	container.style.height = `${HEIGHT}px`;
	container.classList.add('agent-sessions-workbench', 'modern-ui-tabs', CONNECTED_EDITOR_TABS_CLASS, 'dock-detail-panel');
	container.classList.toggle('modern-ui-compact', compact);
	const session = createSession();
	const menuService = new ChatWindowMenuService(!!options.layoutActionsInStrip);
	const size = options.size ?? MenuActivityBarSize.Compact;
	const storage = disposableStore.add(new InMemoryStorageService());
	setSessionActivityBarSize(storage, size);
	const contextViewService = new FixtureContextViewService(container);
	disposableStore.add(toDisposable(() => contextViewService.hideContextView()));

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IConfigurationService, new TestConfigurationService({ [LayoutSettings.MODERN_UI_DENSITY]: options.density, [SESSION_ACTIVITY_BAR_SETTING]: true }));
			reg.defineInstance(IMenuService, menuService);
			reg.defineInstance(IStorageService, storage);
			reg.defineInstance(ISessionActivityBarActivityService, disposableStore.add(new SessionActivityBarActivityService()));
			reg.defineInstance(IKeybindingService, new FixtureKeybindingService(options.layoutActionsInStrip ? ACTIVITY_BAR_ENTRIES_WITH_LAYOUT_ACTIONS : ACTIVITY_BAR_ENTRIES));
			reg.defineInstance(IContextViewService, contextViewService);
			reg.defineInstance(IEditorGroupsService, new class extends mock<IEditorGroupsService>() { }());
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
				override readonly agentWorkbenchLayout = AgentWorkbenchLayout.Desktop;
				override readonly mainContainer = container;
				override readonly onDidLayoutMainContainer = Event.None;
				override readonly onDidChangePartVisibility = Event.None;
				override registerPart() { return Disposable.None; }
				override getContainer() { return container; }
				override isFloatingPanelsEnabled() { return false; }
			}());
			reg.defineInstance(IHostService, new class extends mock<IHostService>() {
				override readonly onDidChangeFocus = Event.None;
				override readonly onDidChangeActiveWindow = Event.None;
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				readonly gridShown: IObservable<readonly (ITestSessionWithChat | undefined)[]> = constObservable<readonly (ITestSessionWithChat | undefined)[]>([]);
				override readonly slotPanes = testGridPanes(this.gridShown);
			}());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = Event.None;
				override readonly onDidChangeSessionTypes = Event.None;
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProvider(): undefined { return undefined; }
			}());
			reg.defineInstance(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
				override readonly onDidChange = Event.None;
				override readonly selectedHostId = undefined;
				override readonly selectedHost = undefined;
			}());
			reg.defineInstance(IQuickInputService, new class extends mock<IQuickInputService>() {
				override readonly onShow = Event.None;
			}());
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly quality = 'insider';
				override readonly nameShort = 'Code - OSS';
			}());
			// The command center renders the session of the window, as the Agents window's title bar contribution does.
			reg.defineInstance(IActionViewItemService, new class extends mock<IActionViewItemService>() {
				override readonly onDidChange = Event.None;
				override lookUp(menu: MenuId, commandOrSubmenu: MenuId | string): IActionViewItemFactory | undefined {
					const id = typeof commandOrSubmenu === 'string' ? commandOrSubmenu : commandOrSubmenu.id;
					// The window's New Session, as the New button of the main window's title bar
					if (menu.id === AgentsWindowMenus.TitleBarLeftLayout.id && id === NEW_SESSION_IN_CHAT_WINDOW_COMMAND_ID) {
						return (action, _actionOptions, scopedInstantiationService) => scopedInstantiationService.createInstance(NewSessionActionViewItem, action, 'titleBar', constObservable<NewSessionButtonStyle>('default'));
					}
					if (menu.id !== AgentsWindowMenus.CommandCenter.id || id !== AgentsWindowMenus.TitleBarSessionTitle.id) {
						return undefined;
					}
					return (action, actionOptions, scopedInstantiationService) => action instanceof SubmenuItemAction ? scopedInstantiationService.createInstance(SessionsTitleBarWidget, action, actionOptions, sessionActionFeedback, blockedIndicator) : undefined;
				}
			}());
		},
	});
	menuService.setCommandService(instantiationService.get(ICommandService));
	// The host of the window: the session of its active chat.
	stubSessionHosts(instantiationService, disposableStore, { session: constObservable(session) });
	const sessionActionFeedback = new class extends mock<SessionActionFeedback>() {
		override readonly approvedCount: IObservable<number> = constObservable<number>(0);
	}();
	const blockedIndicator = disposableStore.add(instantiationService.createInstance(
		BlockedSessionsIndicatorModel,
		new class extends mock<AgentSessionApprovalModel>() { }(),
		new class extends mock<BlockedSessions>() {
			override readonly blockedSessions: IObservable<readonly ISession[]> = constObservable([]);
			override readonly blockedSessionsWithReasons = constObservable([]);
		}(),
		new class extends mock<BlockedSessionsCIFixModel>() {
			override readonly hiddenSessions: IObservable<ReadonlySet<string>> = constObservable<ReadonlySet<string>>(new Set());
		}(),
	));

	const frame = append(container, $(`.${AGENTS_CHAT_WINDOW_CLASS}`));
	frame.style.cssText = 'position: relative; width: 100%; height: 100%;';

	// The title bar of the window, created into its title row as the title service creates the title bars of auxiliary
	// windows. As the window's grid lays it out: first in the window, across it from edge to edge, over the cell that keeps
	// its room in the grid.
	const titleRow = append(frame, $('.chat-window-title-row'));
	titleRow.style.cssText = 'position: absolute; top: 0; left: 0; z-index: 1;';
	const titleBarElement = append(titleRow, $('.part.titlebar', { role: 'none' }));
	titleBarElement.style.position = 'relative';
	const titleBar = disposableStore.add(instantiationService.createInstance(AuxiliaryTitlebarPart, titleBarElement, new class extends mock<TitlebarPart>() {
		override get hasZoomableElements() { return true; }
	}()));
	titleBar.create(titleBarElement);
	titleBarElement.style.height = `${titleBar.height}px`;

	const view = (element: HTMLElement, size?: { readonly width?: number; readonly height?: number }, onLayout?: (width: number, height: number) => void): IPartGridView => ({
		element,
		// Parts as least as large as those of a chat window; chrome as large as it is
		minimumWidth: size?.width ?? 280,
		maximumWidth: size?.width ?? Number.POSITIVE_INFINITY,
		minimumHeight: size?.height ?? 100,
		maximumHeight: size?.height ?? Number.POSITIVE_INFINITY,
		onDidChange: Event.None,
		layout: (width, height) => onLayout?.(width, height),
	});
	const grid = disposableStore.add(instantiationService.createInstance(PartGrid, frame));
	const { card: chat, sessionView } = createChatCard(options.chats ?? 1);
	const main = createMainCard();
	if (options.singleTab) {
		chat.classList.remove('editor-tabs-multiple');
		main.classList.remove('editor-tabs-multiple');
	}
	const stacked = options.mode === ChatWindowLayoutMode.Stacked || options.mode === ChatWindowLayoutMode.EditorOnly;
	const showsChat = options.mode !== ChatWindowLayoutMode.EditorOnly;
	const showsMain = options.mode !== ChatWindowLayoutMode.ChatOnly;
	grid.addView(stacked ? 'main' : 'chat', view(stacked ? main : chat));
	// The main part wider, and taller, than the chat, as a chat window opens them
	grid.addView(stacked ? 'chat' : 'main', view(stacked ? chat : main), { reference: stacked ? 'main' : 'chat', direction: stacked ? Direction.Down : Direction.Right }, stacked ? 130 : 540);
	grid.setCellVisible('chat', showsChat);
	grid.setCellVisible('main', showsMain);
	const stripWidth = getChatWindowStripWidth(compact, size);
	// The strip's column, which the window registers as the host of its chats' Session Activity Bar, at full size.
	const strip = $('.chat-window-strip.session-activity-bar-host');
	disposableStore.add(registerSessionActivityBarExternalHost(frame, { element: strip, active: constObservable(true), fullSize: true, setOccupied: () => { } }));
	grid.addView('strip', view(strip, { width: stripWidth }), { edge: Direction.Right }, stripWidth, { edgeChrome: Direction.Right, keepsNoGap: true });
	grid.addView('titleRow', view($('.chat-window-title-row-cell'), { height: titleBar.height }, (_width, height) => {
		titleRow.style.width = `${WIDTH}px`;
		titleRow.style.height = `${height}px`;
		titleBar.layout(WIDTH, height);
	}), { edge: Direction.Up }, titleBar.height, { keepsNoGap: true });
	grid.setPinnedTopView('titleRow');
	const gap = compact ? 0 : AGENTS_FLOATING_PANEL_GAP;
	grid.setGap(gap);
	grid.setOuterInsets({ top: 0, right: gap, bottom: gap, left: gap });
	grid.layout(WIDTH, HEIGHT);

	// The Session Activity Bar of the window's active chat, as its session view creates it: it shows in the strip's column,
	// also while the window shows only its editor and hides the chat.
	const activityBar = disposableStore.add(instantiationService.createInstance(ChatViewSessionActivityBar, sessionView));
	activityBar.setActive(true, !showsChat);
}

/**
 * The chat's card: the chat's editor part, whose group frames the chat. With one chat, the group shows no tabs, and the chat
 * shows its session header at the top, as in the main window; with more, the group shows their tabs, and the chat does not.
 */
function createChatCard(chats: number): { readonly card: HTMLElement; readonly sessionView: HTMLElement } {
	const card = $('.fixture-chat-window-chat.part.editor.editor-tabs-multiple');
	card.style.cssText = 'position: relative; width: 100%; height: 100%;';
	const group = append(append(card, $('.content')), $('.editor-group-container.active'));
	group.style.display = 'flex';
	group.style.flexDirection = 'column';
	if (chats > 1) {
		// Its tabs, as the main part's card shows its own
		const tabs = append(group, $('.title.tabs'));
		tabs.style.display = 'flex';
		tabs.style.gap = '12px';
		for (let index = 0; index < chats; index++) {
			append(tabs, $(index === 0 ? '.tab.active' : '.tab')).textContent = index === 0 ? SESSION_TITLE : `Chat ${index + 1}`;
		}
	} else {
		group.classList.add('title-provided-by-editor');
	}
	const host = append(append(group, $('.editor-container')), $('.session-chat-view-editor.sessions-window-host'));
	const sessionView = append(host, $('.session-view.chat-editor-content.modern-ui-editor-tab-group.is-active'));
	host.parentElement!.style.flex = '1';
	for (const element of [group.parentElement!, group, host, sessionView]) {
		element.style.width = element.style.height = '100%';
	}
	if (chats === 1) {
		const header = append(append(append(sessionView, $('.session-view-centered-content')), $('.chat-composite-bar.session-header-bar')), $('.chat-composite-bar-header'));
		append(header, $('.chat-composite-bar-header-main')).textContent = SESSION_TITLE;
	}
	return { card, sessionView };
}

/** The main part's card: its editor group, which frames it, with an editor open in it. */
function createMainCard(): HTMLElement {
	const card = $('.fixture-chat-window-main.part.editor.editor-tabs-multiple');
	card.style.cssText = 'position: relative; width: 100%; height: 100%;';
	const group = append(append(card, $('.content')), $('.editor-group-container.active'));
	for (const element of [group.parentElement!, group]) {
		element.style.width = element.style.height = '100%';
	}
	append(append(group, $('.title.tabs')), $('.tab.active')).textContent = 'authService.ts';
	return card;
}
