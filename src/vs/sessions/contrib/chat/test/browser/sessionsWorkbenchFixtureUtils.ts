/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getWindow } from '../../../../../base/browser/dom.js';
import { Direction, ISerializableView, SerializableGrid } from '../../../../../base/browser/ui/grid/grid.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestCommandService } from '../../../../../editor/test/browser/editorTestServices.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IMenuService, registerAction2, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICodexAccountService } from '../../../../../workbench/services/agentHost/browser/codexAccountService.js';
import { IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/browser/environmentService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ComponentFixtureContext, createEditorServices, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { TestProductService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { OpenInVSCodeAction, OpenInVSCodeWidgetContribution } from '../../../../browser/actions/vscodeActions.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { AGENTS_CARD_SURFACE_CLASS, AGENTS_PART_CARD_CLASS, AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS } from '../../../../../workbench/browser/parts/sessions/agentsPartCard.js';
import { SessionsPart } from '../../../../../workbench/browser/parts/sessions/sessionsPart.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';
import { SessionsGridContent } from '../../../../../workbench/contrib/sessions/browser/parts/sessionsGridContent.js';
import '../../../../browser/parts/sessionsPartContent.registration.js';
import { TitlebarPart } from '../../../../browser/parts/titlebarPart.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../../../workbench/contrib/sessions/common/layoutConstants.js';
import { CanGoBackContext, MultipleSessionsVisibleContext, SessionWorkspaceIsVirtualContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { ISessionsChatBackground, ISessionsChatBackgroundService } from '../../../../../workbench/contrib/sessions/browser/chatBackgroundService.js';
import { ISessionsPartService } from '../../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { chatOfShown, focusedSessionHostServiceOf, ITestSessionsGridState, stubSessionHosts } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { ISessionGridPane } from '../../../../../workbench/services/sessions/browser/sessionGridPane.js';
import { IFocusedSessionHostService, ISessionHost } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { createSessionViewTestServices } from '../../../../test/browser/sessionViewTestUtils.js';
import { AccountWidgetContribution } from '../../../accountMenu/browser/account.contribution.js';
import { BaseLayoutController } from '../../../layout/browser/baseSessionLayoutController.js';
import { BlockedSessionsIndicatorModel } from '../../../sessions/browser/blockedSessionsIndicatorModel.js';
import { SessionActionFeedback } from '../../../sessions/browser/sessionActionFeedback.js';
import { NEW_SESSION_BUTTON_STYLE_SETTING, NewSessionActionViewItemContribution } from '../../../sessions/browser/sessionsActions.js';
import { registerSessionsTitleBarMenus, SessionsTitleBarWidget } from '../../../sessions/browser/sessionsTitleBarWidget.js';
import { acquireArchiveActions, FixtureActionViewItemService, FixtureContextMenuService } from '../../../sessions/test/browser/sessionsListFixtureUtils.js';
import { NewChatInSessionsWindowAction } from '../../../../../workbench/contrib/sessions/browser/chat/newSessionAction.js';
import { appendNewSessionTitleBarMenuItem } from '../../browser/newSessionTitleBarMenu.js';

import '../../../../browser/layoutActions.js';
import '../../browser/runScriptAction.js';
import '../../../../../workbench/contrib/modernUI/browser/media/tabs.css';
import '../../../../common/sizes.js';
import '../../../../browser/media/workbench.css';

let actionReferences = 0;
let sharedActions: DisposableStore | undefined;

function acquireWorkbenchActions() {
	if (actionReferences++ === 0) {
		sharedActions = new DisposableStore();
		sharedActions.add(registerSessionsTitleBarMenus());
		sharedActions.add(BaseLayoutController.registerSidePaneToggleAction());
		sharedActions.add(registerAction2(OpenInVSCodeAction));
		sharedActions.add(registerAction2(NewChatInSessionsWindowAction));
		sharedActions.add(appendNewSessionTitleBarMenuItem());
		sharedActions.add(acquireArchiveActions());
	}
	return toDisposable(() => {
		if (--actionReferences === 0) {
			sharedActions?.dispose();
			sharedActions = undefined;
		}
	});
}

/** Renders the visible desktop workbench parts without bootstrapping global workbench contributions. */
export function createSessionsWorkbenchFixture(context: ComponentFixtureContext, width: number, height: number, sessionsService: ISessionsService & ITestSessionsGridState, options: {
	readonly sidePane?: ISerializableView;
	readonly sidePaneWidth?: number;
	readonly bottomPanel?: ISerializableView;
	readonly bottomPanelHeight?: number;
	readonly chatBackground?: ISessionsChatBackground;
	readonly chatTabsMode?: SessionsChatTabsMode;
	readonly compactDensity?: boolean;
	readonly connectedEditorTabs?: boolean;
	readonly sidePaneShowTabs?: 'multiple' | 'single';
} = {}) {
	const { container, disposableStore, theme } = context;
	const sidePaneVisible = !!options.sidePane;
	const bottomPanelVisible = !!options.bottomPanel;
	container.classList.add('monaco-workbench', 'agent-sessions-workbench', 'modern-ui-tabs', 'nosidebar', 'noauxiliarybar', 'panel-alignment-justify');
	container.classList.toggle('modern-ui-compact', options.compactDensity === true);
	container.classList.toggle('modern-ui-connected-editor-tabs', options.connectedEditorTabs !== false);
	container.classList.toggle('noeditorpane', !sidePaneVisible);
	container.classList.toggle('nopanel', !bottomPanelVisible);
	container.classList.toggle('dock-detail-panel', sidePaneVisible);
	container.classList.toggle(AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS, sidePaneVisible && options.sidePaneShowTabs !== 'single');
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;

	const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
		override registerPart() { return Disposable.None; }
		override readonly mainContainer = container;
		override readonly mainContainerDimension = { width, height };
		override readonly onDidChangePartVisibility = Event.None;
		override readonly onDidChangePanelAlignment = Event.None;
		override isVisible(part: Parts) {
			return part === Parts.SESSIONS_PART
				|| part === Parts.TITLEBAR_PART
				|| (sidePaneVisible && part === Parts.EDITOR_PART)
				|| (bottomPanelVisible && part === Parts.PANEL_PART);
		}
		override isEditorPaneVisible() { return sidePaneVisible; }
		override isModernUICompact() { return options.compactDensity === true; }
		override getPanelAlignment() { return 'justify' as const; }
		override getContainer() { return container; }
	}();
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		fileIconTheme: context.fileIconTheme,
		additionalServices: registerWorkbenchServices,
	});
	const services = createSessionViewTestServices(disposableStore, instantiationService);
	services.configurationService.setUserConfiguration('window', { titleBarStyle: 'custom', controlsStyle: 'hidden' });
	services.configurationService.setUserConfiguration('accounts.showAvatar', false);
	services.configurationService.setUserConfiguration(NEW_SESSION_BUTTON_STYLE_SETTING, 'default');
	services.configurationService.setUserConfiguration(SESSIONS_CHAT_TABS_SETTING, options.chatTabsMode ?? SessionsChatTabsMode.Multiple);
	ChatContextKeys.enabled.bindTo(services.contextKeyService).set(true);
	IsSessionsWindowContext.bindTo(services.contextKeyService).set(true);
	CanGoBackContext.bindTo(services.contextKeyService).set(true);
	const multipleSessions = MultipleSessionsVisibleContext.bindTo(services.contextKeyService);
	const virtualWorkspace = SessionWorkspaceIsVirtualContext.bindTo(services.contextKeyService);
	disposableStore.add(autorun(reader => {
		multipleSessions.set(sessionsService.slotPanes.read(reader).length > 1);
		virtualWorkspace.set(chatOfShown(sessionsService.activeSession?.read(reader), reader)?.workspace.read(reader)?.isVirtualWorkspace ?? false);
	}));
	disposableStore.add(acquireWorkbenchActions());
	instantiationService.stub(ICommandService, new TestCommandService(instantiationService));
	instantiationService.stub(IMenuService, disposableStore.add(instantiationService.createInstance(MenuService)));
	const actionViewItems = disposableStore.add(new FixtureActionViewItemService());
	instantiationService.stub(IActionViewItemService, actionViewItems);
	instantiationService.stub(IContextMenuService, disposableStore.add(instantiationService.createInstance(FixtureContextMenuService, container, context.focus)));
	instantiationService.stub(IWorkbenchLayoutService, layoutService);
	instantiationService.stub(IAgentWorkbenchLayoutService, layoutService);
	// ISessionsHostLayoutService is left to the fixture default, which resolves it to this layout with the layout as the
	// docked side pane, as the Agents workbench does.
	instantiationService.stub(ISessionsService, sessionsService);
	// The main window shows the grid's active session: the host UI of its parts, such as the title bar, injects, and the
	// focused host, which grid commands check.
	stubSessionHosts(instantiationService, disposableStore, { session: sessionsService.activeSession });
	instantiationService.stub(IFocusedSessionHostService, focusedSessionHostServiceOf(sessionsService.activeSession ?? constObservable(undefined)));
	instantiationService.stub(ISessionsChatBackgroundService, new class extends mock<ISessionsChatBackgroundService>() {
		override readonly onDidChangeBackground = Event.None;
		override getBackground() { return options.chatBackground; }
	}());
	instantiationService.stub(IHostService, new class extends mock<IHostService>() {
		override readonly onDidChangeFocus = Event.None;
		override readonly onDidChangeActiveWindow = Event.None;
	}());
	instantiationService.stub(IBrowserWorkbenchEnvironmentService, new class extends mock<IBrowserWorkbenchEnvironmentService>() {
		override readonly sessionTitle = 'Sessions grid';
	}());
	instantiationService.stub(IEnvironmentService, new class extends mock<IEnvironmentService>() {
		override readonly isBuilt = false;
	}());
	instantiationService.stub(IProductService, TestProductService);
	instantiationService.stub(IWorkbenchAssignmentService, new class extends mock<IWorkbenchAssignmentService>() {
		override readonly onDidRefetchAssignments = Event.None;
		override async getTreatment() { return undefined; }
	}());
	instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
		override readonly onDidChangeSessions = Event.None;
		override async getSessions() {
			return [{ id: 'fixture', accessToken: '', scopes: [], account: { id: 'fixture', label: 'Developer' } }];
		}
	}());
	instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
		override readonly entitlement = ChatEntitlement.Pro;
		override readonly sentiment = { completed: true, installed: true };
		override readonly quotas = {};
		override readonly onDidChangeEntitlement = Event.None;
		override readonly onDidChangeSentiment = Event.None;
		override readonly onDidChangeQuotaExceeded = Event.None;
		override readonly onDidChangeQuotaRemaining = Event.None;
	}());
	instantiationService.stub(ICodexAccountService, new class extends mock<ICodexAccountService>() {
		override readonly account = { status: 'unknown' as const };
		override readonly onDidChangeAccount = Event.None;
	}());
	instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() { }());
	instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() {
		override readonly extUri = extUri;
	}());
	const host = $(`.part.sessionspart.basepanel.right.${AGENTS_PART_CARD_CLASS}.${AGENTS_CARD_SURFACE_CLASS}`);
	const feedback = disposableStore.add(new SessionActionFeedback());
	const blockedIndicator = new class extends mock<BlockedSessionsIndicatorModel>() {
		override readonly onDidRequestBlink = Event.None;
		override readonly blockedSessions = constObservable([]);
		override readonly requiresInputKind = constObservable(undefined);
		override consumePendingBlink() { return false; }
	}();
	disposableStore.add(actionViewItems.register(AgentsWindowMenus.CommandCenter, AgentsWindowMenus.TitleBarSessionTitle, (action, options) => action instanceof SubmenuItemAction
		? instantiationService.createInstance(SessionsTitleBarWidget, action, options, feedback, blockedIndicator)
		: undefined));
	disposableStore.add(instantiationService.createInstance(NewSessionActionViewItemContribution));
	disposableStore.add(instantiationService.createInstance(OpenInVSCodeWidgetContribution));
	disposableStore.add(instantiationService.createInstance(AccountWidgetContribution));

	const part = disposableStore.add(instantiationService.createInstance(SessionsPart, SessionsGridContent.ID));
	const content = assertReturnsDefined(part.getContent(SessionsGridContent));
	instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
		override getSessionView(id: string | undefined) { return content.getSessionView(id); }
		// The pane commands resolve the view of the host their menu passes.
		override getSessionViewOfHost(host: ISessionHost) { return content.getSessionViewOfHost(host); }
		override getActiveSessionView() { return content.getActiveSessionView(); }
		override toggleMaximizePane(pane: ISessionGridPane) { content.toggleMaximizePane(pane); }
		override focusNewSessionSlot() { content.focusNewSessionSlot(); }
	}());
	part.create(host);
	const titlebar = disposableStore.add(instantiationService.createInstance(TitlebarPart, Parts.TITLEBAR_PART, getWindow(container)));
	titlebar.create($('.part.titlebar'));
	const grid = disposableStore.add(new SerializableGrid<ISerializableView>(part, { proportionalLayout: false }));
	grid.addView(titlebar, titlebar.minimumHeight, part, Direction.Up);
	if (options.bottomPanel) {
		grid.addView(options.bottomPanel, options.bottomPanelHeight ?? 240, part, Direction.Down);
	}
	if (options.sidePane) {
		grid.addView(options.sidePane, options.sidePaneWidth ?? 360, part, Direction.Right);
	}
	append(container, grid.element);
	const workbenchGap = options.compactDensity ? 0 : AGENTS_FLOATING_PANEL_GAP;
	return { ...services, part, content, grid, layout: () => grid.layout(width - workbenchGap, height - workbenchGap) };
}
