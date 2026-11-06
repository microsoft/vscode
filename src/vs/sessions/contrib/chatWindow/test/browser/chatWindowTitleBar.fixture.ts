/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { Direction } from '../../../../../base/browser/ui/grid/grid.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { MenuActivityBarSize } from '../../../../../workbench/browser/parts/activitybar/menuActivityBar.js';
import { IPartGridView, PartGrid } from '../../../../../workbench/browser/parts/partGrid/partGrid.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { AgentSessionApprovalModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { IAgentHostFilterService } from '../../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { BlockedSessions } from '../../../../../workbench/contrib/sessions/browser/blockedSessions.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../../../workbench/contrib/sessions/common/layoutConstants.js';
import { IChat, ISession, ISessionWorkspace } from '../../../../../workbench/contrib/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { stubSessionHosts } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService, LayoutSettings, ModernUIDensity } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { AuxiliaryTitlebarPart, TitlebarPart } from '../../../../browser/parts/titlebarPart.js';
import { BlockedSessionsCIFixModel } from '../../../sessions/browser/blockedSessionsCIFixModel.js';
import { BlockedSessionsIndicatorModel } from '../../../sessions/browser/blockedSessionsIndicatorModel.js';
import { SessionActionFeedback } from '../../../sessions/browser/sessionActionFeedback.js';
import { SessionsTitleBarWidget } from '../../../sessions/browser/sessionsTitleBarWidget.js';
import { AGENTS_CHAT_WINDOW_CLASS, getChatWindowStripWidth } from '../../browser/sessionsChatWindowProvider.js';
import '../../../../../workbench/contrib/modernUI/browser/media/titlebar.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/chatCompositeBar.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/chatGroupsView.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/sessionView.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/sessionsPart.css';
import '../../browser/media/chatWindow.css';

/**
 * A chat window as it shows the Agents window's title bar across its top, in each layout mode and density: the real title
 * bar of its window, with its command center showing the session of the window's active chat and the actions of the window,
 * above the cards of its parts, laid out on the real part grid, and the strip's column at the right.
 */

interface IFixtureOptions {
	readonly mode: ChatWindowLayoutMode;
	readonly density: ModernUIDensity;
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
});

interface IMenuEntry {
	readonly id: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly submenu?: MenuId;
}

/** What the title bar menus of a chat window show: the command center and the actions of its session and window. */
const CHAT_WINDOW_MENUS = new Map<MenuId, readonly IMenuEntry[]>([
	[AgentsWindowMenus.CommandCenter, [{ id: AgentsWindowMenus.TitleBarSessionTitle.id, title: 'Agent Sessions', icon: Codicon.copilot, submenu: AgentsWindowMenus.TitleBarSessionTitle }]],
	[AgentsWindowMenus.TitleBarCenterRight, [{ id: 'run', title: 'Run', icon: Codicon.play }, { id: 'sessions.openInVSCode', title: 'Open in Editor', icon: Codicon.vscodeInsiders }]],
	[AgentsWindowMenus.TitleBarSessionMenu, [{ id: 'createPullRequest', title: 'Create Pull Request', icon: Codicon.gitPullRequestCreate }]],
	[AgentsWindowMenus.TitleBarWindowLayout, [{ id: 'workbench.action.chatWindow.toggleEditor', title: 'Show Editor', icon: Codicon.layoutSidebarRight }, { id: 'layout', title: 'Layout', icon: Codicon.layout, submenu: AgentsWindowMenus.WindowLayout }]],
]);

/** Each title bar menu of the window shows its own entries, as the menus of a chat window do. */
class ChatWindowMenuService extends mock<IMenuService>() {

	commandService: ICommandService | undefined;

	override createMenu(id: MenuId, contextKeyService: IContextKeyService): IMenu {
		const entries = CHAT_WINDOW_MENUS.get(id) ?? [];
		return {
			onDidChange: Event.None,
			dispose: () => { },
			getActions: () => entries.length ? [['navigation', entries.map(entry => entry.submenu
				? new SubmenuItemAction({ submenu: entry.submenu, title: entry.title, icon: entry.icon }, undefined, [])
				: new MenuItemAction({ id: entry.id, title: entry.title, icon: entry.icon }, undefined, undefined, undefined, undefined, contextKeyService, this.commandService!))]] : [],
		};
	}

	override resetHiddenStates(): void { }
}

/** The session of the window's active chat. */
function createSession(): IActiveSession {
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
	return new class extends mock<IActiveSession>() {
		override readonly icon = Codicon.copilot;
		override readonly title: IObservable<string> = constObservable(SESSION_TITLE);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(workspace);
		override readonly activeChat: IObservable<IChat> = constObservable(activeChat);
		override readonly isCreated: IObservable<boolean> = constObservable(true);
		override readonly isQuickChat: IObservable<boolean> = constObservable(false);
	}();
}

function renderChatWindow(context: ComponentFixtureContext, options: IFixtureOptions): void {
	const { container, disposableStore, theme } = context;
	const compact = options.density === ModernUIDensity.Compact;
	container.style.width = `${WIDTH}px`;
	container.style.height = `${HEIGHT}px`;
	container.classList.add('agent-sessions-workbench', 'modern-ui-tabs');
	container.classList.toggle('modern-ui-compact', compact);
	const session = createSession();
	const menuService = new ChatWindowMenuService();

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IConfigurationService, new TestConfigurationService({ [LayoutSettings.MODERN_UI_DENSITY]: options.density }));
			reg.defineInstance(IMenuService, menuService);
			reg.defineInstance(IEditorGroupsService, new class extends mock<IEditorGroupsService>() { }());
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
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
				override readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = constObservable<readonly (IActiveSession | undefined)[]>([]);
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
			}());
			// The command center renders the session of the window, as the Agents window's title bar contribution does.
			reg.defineInstance(IActionViewItemService, new class extends mock<IActionViewItemService>() {
				override readonly onDidChange = Event.None;
				override lookUp(menu: MenuId, commandOrSubmenu: MenuId | string): IActionViewItemFactory | undefined {
					const id = typeof commandOrSubmenu === 'string' ? commandOrSubmenu : commandOrSubmenu.id;
					if (menu.id !== AgentsWindowMenus.CommandCenter.id || id !== AgentsWindowMenus.TitleBarSessionTitle.id) {
						return undefined;
					}
					return (action, actionOptions, scopedInstantiationService) => action instanceof SubmenuItemAction ? scopedInstantiationService.createInstance(SessionsTitleBarWidget, action, actionOptions, sessionActionFeedback, blockedIndicator) : undefined;
				}
			}());
		},
	});
	menuService.commandService = instantiationService.get(ICommandService);
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
	frame.style.cssText = 'width: 100%; height: 100%;';

	// The title bar of the window, created into its title row as the title service creates the title bars of auxiliary
	// windows.
	const titleRow = $('.chat-window-title-row');
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
	const chat = createChatCard();
	const main = createMainCard();
	const stacked = options.mode === ChatWindowLayoutMode.Stacked || options.mode === ChatWindowLayoutMode.EditorOnly;
	const showsChat = options.mode !== ChatWindowLayoutMode.EditorOnly;
	const showsMain = options.mode !== ChatWindowLayoutMode.ChatOnly;
	grid.addView(stacked ? 'main' : 'chat', view(stacked ? main : chat));
	// The main part wider, and taller, than the chat, as a chat window opens them
	grid.addView(stacked ? 'chat' : 'main', view(stacked ? chat : main), { reference: stacked ? 'main' : 'chat', direction: stacked ? Direction.Down : Direction.Right }, stacked ? 130 : 540);
	grid.setCellVisible('chat', showsChat);
	grid.setCellVisible('main', showsMain);
	const stripWidth = getChatWindowStripWidth(compact, MenuActivityBarSize.Compact);
	grid.addView('strip', view($('.chat-window-strip.session-activity-bar-host'), { width: stripWidth }), { edge: Direction.Right }, stripWidth, { edgeChrome: Direction.Right, keepsNoGap: true });
	grid.addView('titleRow', view(titleRow, { height: titleBar.height }, (width, height) => titleBar.layout(width, height)), { edge: Direction.Up }, titleBar.height, { keepsNoGap: true });
	grid.setPinnedTopView('titleRow');
	const gap = compact ? 0 : AGENTS_FLOATING_PANEL_GAP;
	grid.setGap(gap);
	grid.setOuterInsets({ top: 0, right: gap, bottom: gap, left: gap });
	frame.style.setProperty('--chat-window-outer-inset-left', `${gap}px`);
	grid.layout(WIDTH, HEIGHT);
}

/** The chat's card: its session header at the top, as in the main window, above the chat. */
function createChatCard(): HTMLElement {
	const card = $('.fixture-chat-window-chat');
	card.style.cssText = 'position: relative; width: 100%; height: 100%;';
	const sessionView = append(append(card, $('.part.sessionspart')), $('.session-view.is-active'));
	const header = append(append(append(sessionView, $('.session-view-centered-content')), $('.chat-composite-bar.session-header-bar')), $('.chat-composite-bar-header'));
	append(header, $('.chat-composite-bar-header-main')).textContent = SESSION_TITLE;
	return card;
}

/** The main part's card, with an editor open in it. */
function createMainCard(): HTMLElement {
	const card = $('.fixture-chat-window-main.part.editor');
	card.style.cssText = 'position: relative; width: 100%; height: 100%;';
	append(append(card, $('.title.tabs')), $('.tab.active')).textContent = 'authService.ts';
	return card;
}
