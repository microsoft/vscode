/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsViewPane.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { autorun } from '../../../../base/common/observable.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorsVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, IViewPaneLocationColors, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../workbench/common/views.js';
import { sessionsSidebarBackground } from '../../../common/theme.js';
import { SessionsCategories } from '../../../common/categories.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { localize, localize2 } from '../../../../nls.js';
import { AgentSessionsControl } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsControl.js';
import { AgentSessionsFilter, AgentSessionsGrouping } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsFilter.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ISessionsManagementService, IsNewChatSessionContext } from './sessionsManagementService.js';
import { Action2, ISubmenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ACTION_ID_NEW_CHAT } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { AICustomizationShortcutsWidget } from './aiCustomizationShortcutsWidget.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';

const $ = DOM.$;
export const SessionsViewId = 'agentic.workbench.view.sessionsView';
const SessionsViewFilterSubMenu = new MenuId('AgentSessionsViewFilterSubMenu');
const IsGroupedByRepositoryContext = new RawContextKey<boolean>('sessionsView.isGroupedByRepository', false);
const GROUPING_STORAGE_KEY = 'agentSessions.grouping';

export class AgenticSessionsViewPane extends ViewPane {

	private viewPaneContainer: HTMLElement | undefined;
	private sessionsControlContainer: HTMLElement | undefined;
	sessionsControl: AgentSessionsControl | undefined;
	private currentGrouping: AgentSessionsGrouping = AgentSessionsGrouping.Date;
	private isGroupedByRepoKey: ReturnType<typeof IsGroupedByRepositoryContext.bindTo> | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ISessionsManagementService private readonly activeSessionService: ISessionsManagementService,
		@IHostService private readonly hostService: IHostService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Restore persisted grouping
		const stored = this.storageService.get(GROUPING_STORAGE_KEY, StorageScope.PROFILE);
		if (stored && Object.values(AgentSessionsGrouping).includes(stored as AgentSessionsGrouping)) {
			this.currentGrouping = stored as AgentSessionsGrouping;
		}
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		this.viewPaneContainer = parent;
		this.viewPaneContainer.classList.add('agent-sessions-viewpane');

		this.createControls(parent);
	}

	protected override getLocationBasedColors(): IViewPaneLocationColors {
		const colors = super.getLocationBasedColors();
		return {
			...colors,
			background: sessionsSidebarBackground,
			listOverrideStyles: {
				...colors.listOverrideStyles,
				listBackground: sessionsSidebarBackground,
			}
		};
	}

	private createControls(parent: HTMLElement): void {
		const sessionsContainer = DOM.append(parent, $('.agent-sessions-container'));

		// Track grouping state via context key for the toggle button
		const isGroupedByRepoKey = this.isGroupedByRepoKey = IsGroupedByRepositoryContext.bindTo(this.contextKeyService);
		isGroupedByRepoKey.set(this.currentGrouping === AgentSessionsGrouping.Repository);

		// Sessions Filter (actions go to view title bar via menu registration)
		const sessionsFilter = this._register(this.instantiationService.createInstance(AgentSessionsFilter, {
			filterMenuId: SessionsViewFilterSubMenu,
			groupResults: () => this.currentGrouping,
			allowedProviders: [AgentSessionProviders.Background, AgentSessionProviders.Cloud],
			providerLabelOverrides: new Map([
				[AgentSessionProviders.Background, localize('chat.session.providerLabel.local', "Local")],
			]),
		}));

		// Sessions section (top, fills available space)
		const sessionsSection = DOM.append(sessionsContainer, $('.agent-sessions-section'));

		// Sessions content container
		const sessionsContent = DOM.append(sessionsSection, $('.agent-sessions-content'));

		// New Session Button
		const newSessionButtonContainer = DOM.append(sessionsContent, $('.agent-sessions-new-button-container'));
		const newSessionButton = this._register(new Button(newSessionButtonContainer, { ...defaultButtonStyles, secondary: true }));
		newSessionButton.label = localize('newSession', "New Session");
		this._register(newSessionButton.onDidClick(() => this.activeSessionService.openNewSessionView()));

		// Keybinding hint inside the button
		const keybinding = this.keybindingService.lookupKeybinding(ACTION_ID_NEW_CHAT);
		if (keybinding) {
			const keybindingHint = DOM.append(newSessionButton.element, $('span.new-session-keybinding-hint'));
			keybindingHint.textContent = keybinding.getLabel() ?? '';
		}

		// Sessions Control
		this.sessionsControlContainer = DOM.append(sessionsContent, $('.agent-sessions-control-container'));
		const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(AgentSessionsControl, this.sessionsControlContainer, {
			source: 'agentSessionsViewPane',
			filter: sessionsFilter,
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
			disableHover: true,
			enableApprovalRow: true,
			getHoverPosition: () => this.getSessionHoverPosition(),
			trackActiveEditorSession: () => true,
			collapseOlderSections: () => true,
			overrideSessionOpen: (resource, openOptions) => this.activeSessionService.openSession(resource, openOptions),
		}));
		this._register(this.onDidChangeBodyVisibility(visible => sessionsControl.setVisible(visible)));

		// Refresh sessions when window gets focus to compensate for missing events
		this._register(this.hostService.onDidChangeFocus(hasFocus => {
			if (hasFocus) {
				sessionsControl.refresh();
			}
		}));

		// Listen to tree updates and restore selection if nothing is selected
		this._register(sessionsControl.onDidUpdate(() => {
			if (!sessionsControl.hasFocusOrSelection()) {
				this.restoreLastSelectedSession();
			}
		}));

		// When the active session changes, select it in the tree
		this._register(autorun(reader => {
			const activeSession = this.activeSessionService.activeSession.read(reader);
			if (activeSession) {
				if (!sessionsControl.reveal(activeSession.resource)) {
					sessionsControl.clearFocus();
				}
			} else {
				sessionsControl.clearFocus(); // clear selection when a new session is created
			}
		}));

		// AI Customization toolbar (bottom, fixed height)
		this._register(this.instantiationService.createInstance(AICustomizationShortcutsWidget, sessionsContainer, {
			onDidToggleCollapse: () => {
				if (this.viewPaneContainer) {
					const { offsetHeight, offsetWidth } = this.viewPaneContainer;
					this.layoutBody(offsetHeight, offsetWidth);
				}
			},
		}));
	}

	private restoreLastSelectedSession(): void {
		const activeSession = this.activeSessionService.getActiveSession();
		if (activeSession && this.sessionsControl) {
			this.sessionsControl.reveal(activeSession.resource);
		}
	}

	private getSessionHoverPosition(): HoverPosition {
		const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
		const sideBarPosition = this.layoutService.getSideBarPosition();

		return {
			[ViewContainerLocation.Sidebar]: sideBarPosition === 0 ? HoverPosition.RIGHT : HoverPosition.LEFT,
			[ViewContainerLocation.AuxiliaryBar]: sideBarPosition === 0 ? HoverPosition.LEFT : HoverPosition.RIGHT,
			[ViewContainerLocation.ChatBar]: HoverPosition.RIGHT,
			[ViewContainerLocation.Panel]: HoverPosition.ABOVE
		}[viewLocation ?? ViewContainerLocation.AuxiliaryBar];
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		if (!this.sessionsControl || !this.sessionsControlContainer) {
			return;
		}

		this.sessionsControl.layout(this.sessionsControlContainer.offsetHeight, width);
	}

	override focus(): void {
		super.focus();

		this.sessionsControl?.focus();
	}

	refresh(): void {
		this.sessionsControl?.refresh();
	}

	openFind(): void {
		this.sessionsControl?.openFind();
	}

	toggleGroupByRepository(): void {
		if (this.currentGrouping === AgentSessionsGrouping.Repository) {
			this.currentGrouping = AgentSessionsGrouping.Date;
		} else {
			this.currentGrouping = AgentSessionsGrouping.Repository;
		}

		this.storageService.store(GROUPING_STORAGE_KEY, this.currentGrouping, StorageScope.PROFILE, StorageTarget.USER);
		this.isGroupedByRepoKey?.set(this.currentGrouping === AgentSessionsGrouping.Repository);
		this.sessionsControl?.update();
	}
}

// Register Cmd+N / Ctrl+N keybinding for new session in the agent sessions window
KeybindingsRegistry.registerKeybindingRule({
	id: ACTION_ID_NEW_CHAT,
	weight: KeybindingWeight.WorkbenchContrib + 1,
	primary: KeyMod.CtrlCmd | KeyCode.KeyN,
});

const CLOSE_SESSION_COMMAND_ID = 'agentSession.close';
registerAction2(class CloseSessionAction extends Action2 {
	constructor() {
		super({
			id: CLOSE_SESSION_COMMAND_ID,
			title: localize2('closeSession', "Close Session"),
			f1: true,
			precondition: ContextKeyExpr.and(IsNewChatSessionContext.negate(), EditorsVisibleContext.negate()),
			category: SessionsCategories.Sessions,
		});
	}
	override async run(accessor: ServicesAccessor) {
		const sessionsService = accessor.get(ISessionsManagementService);
		await sessionsService.openNewSessionView();
	}
});

// Register Cmd+W / Ctrl+W to close the current session and navigate to the new-session view,
// mirroring how Cmd+W closes the active editor in the normal workbench.
KeybindingsRegistry.registerKeybindingRule({
	id: CLOSE_SESSION_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib + 1,
	when: ContextKeyExpr.and(IsNewChatSessionContext.negate(), EditorsVisibleContext.negate()),
	primary: KeyMod.CtrlCmd | KeyCode.KeyW,
	win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
});

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	submenu: SessionsViewFilterSubMenu,
	title: localize2('filterAgentSessions', "Filter Sessions"),
	group: 'navigation',
	order: 3,
	icon: Codicon.filter,
	when: ContextKeyExpr.equals('view', SessionsViewId)
} satisfies ISubmenuItem);

registerAction2(class GroupByRepositoryAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.groupByRepository',
			title: localize2('groupByRepository', "Group by Repository"),
			icon: Codicon.repo,
			category: SessionsCategories.Sessions,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', SessionsViewId), IsGroupedByRepositoryContext.negate()),
			}]
		});
	}

	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<AgenticSessionsViewPane>(SessionsViewId);
		view?.toggleGroupByRepository();
	}
});

registerAction2(class GroupByDateAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.groupByDate',
			title: localize2('groupByDate', "Group by Date"),
			icon: Codicon.history,
			category: SessionsCategories.Sessions,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', SessionsViewId), IsGroupedByRepositoryContext),
			}]
		});
	}

	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<AgenticSessionsViewPane>(SessionsViewId);
		view?.toggleGroupByRepository();
	}
});

registerAction2(class RefreshAgentSessionsViewerAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.refresh',
			title: localize2('refresh', "Refresh Sessions"),
			icon: Codicon.refresh,
			f1: true,
			category: SessionsCategories.Sessions,
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<AgenticSessionsViewPane>(SessionsViewId);
		return view?.sessionsControl?.refresh();
	}
});

registerAction2(class FindAgentSessionInViewerAction extends Action2 {

	constructor() {
		super({
			id: 'sessionsView.find',
			title: localize2('find', "Find Session"),
			icon: Codicon.search,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.equals('view', SessionsViewId),
			}]
		});
	}

	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<AgenticSessionsViewPane>(SessionsViewId);
		return view?.sessionsControl?.openFind();
	}
});
