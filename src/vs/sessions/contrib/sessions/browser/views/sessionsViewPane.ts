/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionsViewPane.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorsVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, IViewPaneLocationColors, ViewPane } from '../../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../../workbench/common/views.js';
import { sessionsSidebarBackground } from '../../../../common/theme.js';
import { SessionsCategories } from '../../../../common/categories.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { localize, localize2 } from '../../../../../nls.js';
import { SessionsListControl, SessionsGrouping, SessionsSorting } from '../sessionsListControl.js';
import { SessionStatus } from '../../common/sessionData.js';
import { ISessionsManagementService, IsNewChatSessionContext } from '../sessionsManagementService.js';
import { AICustomizationShortcutsWidget } from '../aiCustomizationShortcutsWidget.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';

const $ = DOM.$;
export const SessionsViewPaneId = 'agentic.workbench.view.sessionsViewPane';
const ACTION_ID_NEW_SESSION = 'workbench.action.chat.newChat';
const SessionsViewFilterSubMenu = new MenuId('SessionsViewPaneFilterSubMenu');
const SessionsViewFilterOptionsSubMenu = new MenuId('SessionsViewPaneFilterOptionsSubMenu');
const SessionsViewGroupingContext = new RawContextKey<string>('sessionsViewPane.grouping', SessionsGrouping.Repository);
const SessionsViewSortingContext = new RawContextKey<string>('sessionsViewPane.sorting', SessionsSorting.Created);
const GROUPING_STORAGE_KEY = 'sessionsViewPane.grouping';
const SORTING_STORAGE_KEY = 'sessionsViewPane.sorting';

export class SessionsViewPane extends ViewPane {

	private viewPaneContainer: HTMLElement | undefined;
	private sessionsControlContainer: HTMLElement | undefined;
	sessionsControl: SessionsListControl | undefined;
	private currentGrouping: SessionsGrouping = SessionsGrouping.Repository;
	private currentSorting: SessionsSorting = SessionsSorting.Created;
	private groupingContextKey: IContextKey | undefined;
	private sortingContextKey: IContextKey | undefined;

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
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IHostService private readonly hostService: IHostService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Restore persisted grouping
		const storedGrouping = this.storageService.get(GROUPING_STORAGE_KEY, StorageScope.PROFILE);
		if (storedGrouping && Object.values(SessionsGrouping).includes(storedGrouping as SessionsGrouping)) {
			this.currentGrouping = storedGrouping as SessionsGrouping;
		}

		// Restore persisted sorting
		const storedSorting = this.storageService.get(SORTING_STORAGE_KEY, StorageScope.PROFILE);
		if (storedSorting && Object.values(SessionsSorting).includes(storedSorting as SessionsSorting)) {
			this.currentSorting = storedSorting as SessionsSorting;
		}

		// Ensure context keys reflect restored state immediately
		this.groupingContextKey = SessionsViewGroupingContext.bindTo(contextKeyService);
		this.groupingContextKey.set(this.currentGrouping);
		this.sortingContextKey = SessionsViewSortingContext.bindTo(contextKeyService);
		this.sortingContextKey.set(this.currentSorting);
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

		// Sessions section (top, fills available space)
		const sessionsSection = DOM.append(sessionsContainer, $('.agent-sessions-section'));

		// Sessions content container
		const sessionsContent = DOM.append(sessionsSection, $('.agent-sessions-content'));

		// New Session Button
		const newSessionButtonContainer = DOM.append(sessionsContent, $('.agent-sessions-new-button-container'));
		const newSessionButton = this._register(new Button(newSessionButtonContainer, { ...defaultButtonStyles, secondary: true }));
		newSessionButton.label = localize('newSession', "New Session");
		this._register(newSessionButton.onDidClick(() => this.sessionsManagementService.openNewSessionView()));

		// Keybinding hint inside the button
		const keybinding = this.keybindingService.lookupKeybinding(ACTION_ID_NEW_SESSION);
		if (keybinding) {
			const keybindingHint = DOM.append(newSessionButton.element, $('span.new-session-keybinding-hint'));
			keybindingHint.textContent = keybinding.getLabel() ?? '';
		}

		// Sessions List Control
		this.sessionsControlContainer = DOM.append(sessionsContent, $('.agent-sessions-control-container'));
		const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(SessionsListControl, this.sessionsControlContainer, {
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
			grouping: () => this.currentGrouping,
			sorting: () => this.currentSorting,
			onSessionOpen: (resource) => this.sessionsManagementService.openSession(resource),
		}));
		this._register(this.onDidChangeBodyVisibility(visible => sessionsControl.setVisible(visible)));

		// Register session type filter actions (re-register when session types change)
		this.registerSessionTypeFilters(sessionsControl);
		this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => {
			this.registerSessionTypeFilters(sessionsControl);
		}));

		// Register status filter actions (static set, registered once)
		this.registerStatusFilters(sessionsControl);

		// Refresh sessions when window gets focus to compensate for missing events
		this._register(this.hostService.onDidChangeFocus(hasFocus => {
			if (hasFocus) {
				sessionsControl.refresh();
			}
		}));

		// Listen to list updates and restore selection if nothing is selected
		this._register(sessionsControl.onDidUpdate(() => {
			if (!sessionsControl.hasFocusOrSelection()) {
				this.restoreLastSelectedSession();
			}
		}));

		// When the active session changes, select it in the list
		this._register(autorun(reader => {
			const activeSession = this.sessionsManagementService.activeSession.read(reader);
			if (activeSession) {
				if (!sessionsControl.reveal(activeSession.resource)) {
					sessionsControl.clearFocus();
				}
			} else {
				sessionsControl.clearFocus();
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
		const activeSession = this.sessionsManagementService.activeSession.get();
		if (activeSession && this.sessionsControl) {
			this.sessionsControl.reveal(activeSession.resource);
		}
	}

	private readonly registeredFilterTypeIds = new Set<string>();

	private registerSessionTypeFilters(sessionsControl: SessionsListControl): void {
		const sessionTypes = this.sessionsManagementService.getAllSessionTypes();
		for (let i = 0; i < sessionTypes.length; i++) {
			const type = sessionTypes[i];

			// Skip if already registered (action IDs are global and can't be re-registered)
			if (this.registeredFilterTypeIds.has(type.id)) {
				continue;
			}
			this.registeredFilterTypeIds.add(type.id);

			const contextKey = new RawContextKey<boolean>(`sessionsViewPane.filterType.${type.id}`, !sessionsControl.isSessionTypeExcluded(type.id));
			const contextKeyInstance = contextKey.bindTo(this.scopedContextKeyService);

			this._register(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: `sessionsViewPane.filterType.${type.id}`,
						title: type.label,
						toggled: ContextKeyExpr.equals(contextKey.key, true),
						menu: [{
							id: SessionsViewFilterOptionsSubMenu,
							group: '1_types',
							order: i,
						}]
					});
				}
				override run() {
					const isExcluded = sessionsControl.isSessionTypeExcluded(type.id);
					sessionsControl.setSessionTypeExcluded(type.id, !isExcluded);
					contextKeyInstance.set(isExcluded); // was excluded, now included (toggle)
				}
			}));
		}
	}

	private registerStatusFilters(sessionsControl: SessionsListControl): void {
		const statusFilters: { status: SessionStatus; label: string }[] = [
			{ status: SessionStatus.Completed, label: localize('statusCompleted', "Completed") },
			{ status: SessionStatus.InProgress, label: localize('statusInProgress', "In Progress") },
			{ status: SessionStatus.NeedsInput, label: localize('statusNeedsInput', "Input Needed") },
			{ status: SessionStatus.Error, label: localize('statusFailed', "Failed") },
		];
		for (let i = 0; i < statusFilters.length; i++) {
			const { status, label } = statusFilters[i];
			const contextKey = new RawContextKey<boolean>(`sessionsViewPane.filterStatus.${status}`, !sessionsControl.isStatusExcluded(status));
			const contextKeyInstance = contextKey.bindTo(this.scopedContextKeyService);

			this._register(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: `sessionsViewPane.filterStatus.${status}`,
						title: label,
						toggled: ContextKeyExpr.equals(contextKey.key, true),
						menu: [{
							id: SessionsViewFilterOptionsSubMenu,
							group: '2_status',
							order: i,
						}]
					});
				}
				override run() {
					const isExcluded = sessionsControl.isStatusExcluded(status);
					sessionsControl.setStatusExcluded(status, !isExcluded);
					contextKeyInstance.set(isExcluded);
				}
			}));
		}
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

	setGrouping(grouping: SessionsGrouping): void {
		if (this.currentGrouping === grouping) {
			return;
		}

		this.currentGrouping = grouping;
		this.storageService.store(GROUPING_STORAGE_KEY, this.currentGrouping, StorageScope.PROFILE, StorageTarget.USER);
		this.groupingContextKey?.set(this.currentGrouping);
		this.sessionsControl?.resetSectionCollapseState();
		this.sessionsControl?.update();
	}

	setSorting(sorting: SessionsSorting): void {
		if (this.currentSorting === sorting) {
			return;
		}

		this.currentSorting = sorting;
		this.storageService.store(SORTING_STORAGE_KEY, this.currentSorting, StorageScope.PROFILE, StorageTarget.USER);
		this.sortingContextKey?.set(this.currentSorting);
		this.sessionsControl?.update();
	}
}

// -- Keybindings --

KeybindingsRegistry.registerKeybindingRule({
	id: ACTION_ID_NEW_SESSION,
	weight: KeybindingWeight.WorkbenchContrib + 1,
	primary: KeyMod.CtrlCmd | KeyCode.KeyN,
});

const CLOSE_SESSION_COMMAND_ID = 'sessionsViewPane.closeSession';
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

KeybindingsRegistry.registerKeybindingRule({
	id: CLOSE_SESSION_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib + 1,
	when: ContextKeyExpr.and(IsNewChatSessionContext.negate(), EditorsVisibleContext.negate()),
	primary: KeyMod.CtrlCmd | KeyCode.KeyW,
	win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
});

// -- Sort / Group Menus --

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	submenu: SessionsViewFilterSubMenu,
	title: localize2('filterSessions', "Filter Sessions"),
	group: 'navigation',
	order: 3,
	icon: Codicon.settings,
	when: ContextKeyExpr.equals('view', SessionsViewPaneId)
});

MenuRegistry.appendMenuItem(SessionsViewFilterSubMenu, {
	submenu: SessionsViewFilterOptionsSubMenu,
	title: localize2('filter', "Filter"),
	group: '0_filter',
	order: 0,
});

registerAction2(class SortByCreatedAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.sortByCreated',
			title: localize2('sortByCreated', "Sort by Created"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewSortingContext.key, SessionsSorting.Created),
			menu: [{ id: SessionsViewFilterSubMenu, group: '1_sort', order: 0 }]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsViewPane>(SessionsViewPaneId);
		view?.setSorting(SessionsSorting.Created);
	}
});

registerAction2(class SortByUpdatedAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.sortByUpdated',
			title: localize2('sortByUpdated', "Sort by Updated"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewSortingContext.key, SessionsSorting.Updated),
			menu: [{ id: SessionsViewFilterSubMenu, group: '1_sort', order: 1 }]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsViewPane>(SessionsViewPaneId);
		view?.setSorting(SessionsSorting.Updated);
	}
});

registerAction2(class GroupByProjectAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.groupByProject',
			title: localize2('groupByProject', "Group by Project"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Repository),
			menu: [{ id: SessionsViewFilterSubMenu, group: '2_group', order: 0 }]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsViewPane>(SessionsViewPaneId);
		view?.setGrouping(SessionsGrouping.Repository);
	}
});

registerAction2(class GroupByTimeAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.groupByTime',
			title: localize2('groupByTime', "Group by Time"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Date),
			menu: [{ id: SessionsViewFilterSubMenu, group: '2_group', order: 1 }]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsViewPane>(SessionsViewPaneId);
		view?.setGrouping(SessionsGrouping.Date);
	}
});

registerAction2(class RefreshSessionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.refresh',
			title: localize2('refresh', "Refresh Sessions"),
			icon: Codicon.refresh,
			f1: true,
			category: SessionsCategories.Sessions,
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsViewPane>(SessionsViewPaneId);
		return view?.sessionsControl?.refresh();
	}
});

registerAction2(class FindSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.find',
			title: localize2('find', "Find Session"),
			icon: Codicon.search,
			category: SessionsCategories.Sessions,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.equals('view', SessionsViewPaneId),
			}]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsViewPane>(SessionsViewPaneId);
		return view?.openFind();
	}
});
