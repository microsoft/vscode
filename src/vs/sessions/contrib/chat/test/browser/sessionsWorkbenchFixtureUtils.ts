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
import { Menus } from '../../../../browser/menus.js';
import { AGENTS_PART_CARD_CLASS } from '../../../../browser/parts/agentsPartCard.js';
import { SessionsPart } from '../../../../browser/parts/sessionsPart.js';
import { TitlebarPart } from '../../../../browser/parts/titlebarPart.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../../common/layoutConstants.js';
import { CanGoBackContext, MultipleSessionsVisibleContext, SessionWorkspaceIsVirtualContext } from '../../../../common/contextkeys.js';
import { ISessionsChatBackgroundService } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionContext, SessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { createSessionViewTestServices } from '../../../../test/browser/sessionViewTestUtils.js';
import { AccountWidgetContribution } from '../../../accountMenu/browser/account.contribution.js';
import { BaseLayoutController } from '../../../layout/browser/baseSessionLayoutController.js';
import { BlockedSessionsIndicatorModel } from '../../../sessions/browser/blockedSessionsIndicatorModel.js';
import { SessionActionFeedback } from '../../../sessions/browser/sessionActionFeedback.js';
import { NEW_SESSION_BUTTON_STYLE_SETTING, NewSessionActionViewItemContribution } from '../../../sessions/browser/sessionsActions.js';
import { registerSessionsTitleBarMenus, SessionsTitleBarWidget } from '../../../sessions/browser/sessionsTitleBarWidget.js';
import { acquireArchiveActions, FixtureActionViewItemService, FixtureContextMenuService } from '../../../sessions/test/browser/sessionsListFixtureUtils.js';
import { NewChatInSessionsWindowAction } from '../../browser/newSessionAction.js';

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
export function createSessionsWorkbenchFixture(context: ComponentFixtureContext, width: number, height: number, sessionsService: ISessionsService) {
	const { container, disposableStore, theme } = context;
	container.classList.add('monaco-workbench', 'agent-sessions-workbench', 'modern-ui-tabs', 'nosidebar', 'noauxiliarybar', 'nopanel', 'noeditorpane');
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;

	const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
		override registerPart() { return Disposable.None; }
		override readonly mainContainer = container;
		override readonly mainContainerDimension = { width, height };
		override readonly onDidChangePartVisibility = Event.None;
		override isVisible(part: Parts) { return part === Parts.SESSIONS_PART || part === Parts.TITLEBAR_PART; }
		override isEditorPaneVisible() { return false; }
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
	ChatContextKeys.enabled.bindTo(services.contextKeyService).set(true);
	IsSessionsWindowContext.bindTo(services.contextKeyService).set(true);
	CanGoBackContext.bindTo(services.contextKeyService).set(true);
	const multipleSessions = MultipleSessionsVisibleContext.bindTo(services.contextKeyService);
	const virtualWorkspace = SessionWorkspaceIsVirtualContext.bindTo(services.contextKeyService);
	disposableStore.add(autorun(reader => {
		multipleSessions.set(sessionsService.visibleSessions.read(reader).length > 1);
		virtualWorkspace.set(sessionsService.activeSession.read(reader)?.activeChat.read(reader).workspace.read(reader)?.isVirtualWorkspace ?? false);
	}));
	disposableStore.add(acquireWorkbenchActions());
	instantiationService.stub(ICommandService, new TestCommandService(instantiationService));
	instantiationService.stub(IMenuService, disposableStore.add(instantiationService.createInstance(MenuService)));
	const actionViewItems = disposableStore.add(new FixtureActionViewItemService());
	instantiationService.stub(IActionViewItemService, actionViewItems);
	instantiationService.stub(IContextMenuService, disposableStore.add(instantiationService.createInstance(FixtureContextMenuService, container, context.focus)));
	instantiationService.stub(IWorkbenchLayoutService, layoutService);
	instantiationService.stub(IAgentWorkbenchLayoutService, layoutService);
	instantiationService.stub(ISessionsService, sessionsService);
	instantiationService.stub(ISessionContext, new SessionContext(sessionsService.activeSession));
	instantiationService.stub(ISessionsChatBackgroundService, new class extends mock<ISessionsChatBackgroundService>() {
		override readonly onDidChangeBackground = Event.None;
		override getBackground() { return undefined; }
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
	const host = $(`.part.sessionspart.basepanel.right.${AGENTS_PART_CARD_CLASS}`);
	const feedback = disposableStore.add(new SessionActionFeedback());
	const blockedIndicator = new class extends mock<BlockedSessionsIndicatorModel>() {
		override readonly onDidRequestBlink = Event.None;
		override readonly blockedSessions = constObservable([]);
		override readonly requiresInputKind = constObservable(undefined);
		override consumePendingBlink() { return false; }
	}();
	disposableStore.add(actionViewItems.register(Menus.CommandCenter, Menus.TitleBarSessionTitle, (action, options) => action instanceof SubmenuItemAction
		? instantiationService.createInstance(SessionsTitleBarWidget, action, options, feedback, blockedIndicator)
		: undefined));
	disposableStore.add(instantiationService.createInstance(NewSessionActionViewItemContribution));
	disposableStore.add(instantiationService.createInstance(OpenInVSCodeWidgetContribution));
	disposableStore.add(instantiationService.createInstance(AccountWidgetContribution));

	const part = disposableStore.add(instantiationService.createInstance(SessionsPart, 'main'));
	instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
		override startSessionDrag(): void { }
		override getSessionView(id: string | undefined) { return part.getSessionView(id); }
		override toggleMaximizeSession(session: IActiveSession | undefined) { part.toggleMaximizeSession(session?.sessionId); }
		override focusSession(session: IActiveSession | undefined) { part.focusSession(session?.sessionId); }
	}());
	part.create(host);
	const titlebar = disposableStore.add(instantiationService.createInstance(TitlebarPart, Parts.TITLEBAR_PART, getWindow(container)));
	titlebar.create($('.part.titlebar'));
	const grid = disposableStore.add(new SerializableGrid<ISerializableView>(part, { proportionalLayout: false }));
	grid.addView(titlebar, titlebar.minimumHeight, part, Direction.Up);
	append(container, grid.element);
	return { ...services, part, grid, layout: () => grid.layout(width - AGENTS_FLOATING_PANEL_GAP, height - AGENTS_FLOATING_PANEL_GAP) };
}
