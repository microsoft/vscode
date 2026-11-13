/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionsViewPane.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { Orientation } from '../../../../../base/browser/ui/sash/sash.js';
import { IView, Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../../base/common/color.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, IViewPaneLocationColors, ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, getChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { localize } from '../../../../../nls.js';
import { SessionsList, SessionsGrouping, SessionsSorting } from './sessionsList.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionComparisonService } from '../../common/sessionComparison.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { getSessionFilterOptions, ISessionFilterOption, sessionFilterKey } from './sessionsListFilters.js';
import { AICustomizationShortcutsWidget } from '../aiCustomizationShortcutsWidget.js';
import { AgentHostShortcutsWidget } from '../agentHostShortcutsWidget.js';
import { Action2, IMenuService, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { getFlatContextMenuActions, SubmenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { agentsBackground } from '../../common/theme.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { Parts, IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { PANEL_SECTION_BORDER } from '../../../../common/theme.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { getMainWindowHost, ISessionHost, ISessionHostService } from '../../../../services/sessions/browser/sessionHost.js';
import { ISessionsService } from '../sessionsService.js';
import { ISessionDraftsService } from '../sessionDraftsService.js';
import { IScheduledChatsService } from '../scheduledChatsService.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { Menus } from '../menus.js';
import { MobileSessionFilterChips } from '../mobile/mobileSessionFilterChips.js';
import { IMobileSortGroupSheetItem, showMobileSortGroupSheet } from '../mobile/mobileSortGroupSheet.js';
import { isPhoneLayout } from '../../../../browser/parts/sessions/mobileLayout.js';
import { IsPhoneLayoutContext, SessionsListRearrangeContext } from '../../common/contextkeys.js';
import { ISessionsHostLayoutService } from '../../../../services/sessions/browser/sessionsHostLayoutService.js';
import { ISessionsListPresentation } from '../sessionsListPresentation.js';
import { logSessionsListCompactViewState } from '../../common/sessionsTelemetry.js';
import { SESSIONS_LIST_INBOX_ENABLED_SETTING, SESSIONS_SEND_LATER_ENABLED_SETTING, SESSIONS_SIDEBAR_CUSTOMIZATIONS_AT_BOTTOM_SETTING, SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING } from '../../common/sessionConfig.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { CustomizationsNavigationState } from '../customizationsNavigationState.js';
import { createSessionsListNotices, ISessionsListNoticeHost } from './sessionsListNotice.js';
import { SessionStorageCleanupNotice } from './sessionStorageCleanupNotice.js';
import { SessionsListNotification } from './sessionsListNotification.js';
import { SessionsInboxScope } from './sessionsInboxScope.js';
import { readPaneSessions } from '../../../../services/sessions/browser/sessionGridPane.js';
import { ChatCustomizationsLocation, resolveChatCustomizationsLocation } from '../../../chat/common/customizationsLocation.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';

const $ = DOM.$;
export const SessionsViewId = 'sessions.workbench.view.sessionsView';
const GROUPING_STORAGE_KEY = 'sessionsViewPane.grouping';
const SORTING_STORAGE_KEY = 'sessionsViewPane.sorting';
const COMPACT_STORAGE_KEY = 'sessionsViewPane.compact';
const CUSTOMIZATIONS_MIN_HEIGHT = 129;
const SESSIONS_SECTION_MIN_HEIGHT = 120;
const SESSIONS_HEADER_ELLIPSIS_MIN_WIDTH = 8;
export type CustomizationsPresentation = 'hidden' | 'control' | 'treatment';

export function getCustomizationsPresentation(phoneLayout: boolean, aiEnabled: boolean, aiHidden: boolean, navigationIncludesCustomizations: boolean, location: ChatCustomizationsLocation = 'auto'): CustomizationsPresentation {
	if (phoneLayout || !aiEnabled || aiHidden) {
		return 'hidden';
	}
	const resolved = resolveChatCustomizationsLocation(location, true, navigationIncludesCustomizations);
	return resolved === 'sidebar' ? 'control' : resolved === 'sessionsHeader' ? 'treatment' : 'hidden';
}

export const SessionsViewGroupingContext = new RawContextKey<string>('sessionsViewPane.grouping', SessionsGrouping.Workspace);
export const SessionsViewSortingContext = new RawContextKey<string>('sessionsViewPane.sorting', SessionsSorting.Created);
export const SessionsViewCompactContext = new RawContextKey<boolean>('sessionsViewPane.compact', false);
export const IsWorkspaceGroupCappedContext = new RawContextKey<boolean>('sessionsViewPane.workspaceGroupCapped', true);

export interface ISessionsHeaderElements {
	readonly row: HTMLElement;
	readonly label: HTMLElement;
	readonly actions: HTMLElement;
	readonly toolbar: MenuWorkbenchToolBar | undefined;
}

export function renderSessionsHeader(
	parent: HTMLElement,
	phoneLayout: boolean,
	instantiationService: IInstantiationService,
	contextKeyService: IContextKeyService,
	disposables: DisposableStore,
	onDidShowFilters?: () => void,
	getGrouping: () => SessionsGrouping = () => SessionsGrouping.Workspace,
): ISessionsHeaderElements {
	const row = DOM.append(parent, $('.agent-sessions-header-row'));
	const label = DOM.append(row, $('.agent-sessions-header-label'));
	const actions = DOM.append(row, $('.agent-sessions-header-actions'));
	let toolbar: MenuWorkbenchToolBar | undefined;

	if (!phoneLayout) {
		const inbox = getGrouping() === SessionsGrouping.Inbox;
		row.classList.toggle('inbox-layout', inbox);
		label.textContent = inbox ? localize('inboxHeader', "Inbox") : localize('sessionsHeader', "Sessions");
		const scopedInstantiationService = disposables.add(instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actions, Menus.SidebarSessionsHeader, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'sessionsView.header',
			toolbarOptions: { primaryGroup: group => group.startsWith('navigation') },
			actionViewItemProvider: (action, options) => onDidShowFilters && action instanceof SubmenuItemAction && action.item.submenu === Menus.SessionsViewFilter
				? scopedInstantiationService.createInstance(SessionsFilterActionViewItem, action, options, onDidShowFilters)
				: undefined,
		}));
	} else {
		row.classList.add('phone-layout-empty');
	}

	return { row, label, actions, toolbar };
}

/** The Filter Sessions dropdown, which reports whenever it shows. */
class SessionsFilterActionViewItem extends SubmenuEntryActionViewItem {

	constructor(
		action: SubmenuItemAction,
		options: IDropdownMenuActionViewItemOptions | undefined,
		onDidShow: () => void,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService,
	) {
		super(action, options, keybindingService, contextMenuService, themeService);
		this._register(this.onDidChangeVisibility(visible => {
			if (visible) {
				onDidShow();
			}
		}));
	}
}

export class SessionsView extends ViewPane {

	private viewPaneContainer: HTMLElement | undefined;
	private sidebarSplitViewContainer: HTMLElement | undefined;
	private sidebarSplitView: SplitView | undefined;
	private readonly customizationsPaneDisposables = this._register(new MutableDisposable<DisposableStore>());
	private sessionsControlContainer: HTMLElement | undefined;
	private findWidgetContainer: HTMLElement | undefined;
	private readonly sessionsHeaders = new Set<ISessionsHeaderElements>();
	private isFindWidgetOpen = false;
	sessionsControl: SessionsList | undefined;
	listNotification: SessionsListNotification | undefined;
	private _customizationsWidget: AICustomizationShortcutsWidget | undefined;
	private readonly separateNavigation: IObservable<boolean>;
	private readonly customizationsAtBottom: IObservable<boolean>;
	private readonly sessionsListRearrangeContext: IContextKey<boolean>;
	private readonly customizationsNavigationVisible = observableValue(this, false);
	private readonly customizationsNavigationState: CustomizationsNavigationState;
	private customizationsPresentation: CustomizationsPresentation = 'hidden';
	private navigationShortcutsVisible = false;
	private readonly customizationsLocation: IObservable<ChatCustomizationsLocation>;
	private currentGrouping: SessionsGrouping | undefined;
	private currentSorting: SessionsSorting = SessionsSorting.Created;
	private currentCompact = false;
	private groupingContextKey: IContextKey | undefined;
	private sortingContextKey: IContextKey | undefined;
	private compactContextKey: IContextKey<boolean> | undefined;
	private workspaceGroupCappedContextKey: IContextKey<boolean> | undefined;
	/** Context keys of filter menu toggles, each with a reader of the list state it mirrors. */
	private readonly filterContextKeys = new Map<string, { key: IContextKey<boolean>; read: () => boolean }>();
	private currentBodyHeight = 0;
	private currentBodyWidth = 0;
	private didInitializePaneSizes = false;

	/** The host of the main window, whose session the list reveals. */
	private readonly _mainWindowHost: ISessionHost;

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
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionHostService sessionHostService: ISessionHostService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionComparisonService private readonly sessionComparisonService: ISessionComparisonService,
		@IHostService private readonly hostService: IHostService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ISessionsHostLayoutService private readonly hostLayoutService: ISessionsHostLayoutService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IMenuService private readonly menuService: IMenuService,
		@ISessionsListPresentation private readonly presentation: ISessionsListPresentation,
		@ISessionDraftsService private readonly sessionDraftsService: ISessionDraftsService,
		@IScheduledChatsService private readonly scheduledChatsService: IScheduledChatsService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._mainWindowHost = getMainWindowHost(sessionHostService);
		this.separateNavigation = observableConfigValue(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, false, configurationService);
		this.customizationsAtBottom = observableConfigValue(SESSIONS_SIDEBAR_CUSTOMIZATIONS_AT_BOTTOM_SETTING, false, configurationService);
		this.customizationsLocation = observableConfigValue<ChatCustomizationsLocation>(ChatConfiguration.ChatCustomizationsLocation, 'auto', configurationService);
		this.customizationsNavigationState = this._register(instantiationService.createInstance(CustomizationsNavigationState, this.customizationsNavigationVisible));
		this.sessionsListRearrangeContext = SessionsListRearrangeContext.bindTo(this.scopedContextKeyService);

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
		this.currentCompact = this.storageService.getBoolean(COMPACT_STORAGE_KEY, StorageScope.PROFILE, false);
		logSessionsListCompactViewState(telemetryService, this.currentCompact);

		// Ensure context keys reflect restored state immediately
		this.groupingContextKey = SessionsViewGroupingContext.bindTo(contextKeyService);
		this.groupingContextKey.set(this.grouping);
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING) && this.currentGrouping === undefined) {
				this.groupingContextKey?.set(this.grouping);
				this.sessionsControl?.update(true);
				this.updateHeaderLayout();
			}
		}));
		this.sortingContextKey = SessionsViewSortingContext.bindTo(contextKeyService);
		this.sortingContextKey.set(this.currentSorting);
		this.compactContextKey = SessionsViewCompactContext.bindTo(contextKeyService);
		this.compactContextKey.set(this.currentCompact);

		// Bind workspace group capped context key (will be synced with persisted state in renderBody)
		this.workspaceGroupCappedContextKey = IsWorkspaceGroupCappedContext.bindTo(contextKeyService);
	}

	private _handleSessionOpened(session: ISession): void {
		const comparison = this.sessionComparisonService.getComparisonForSession(session.resource);
		// The open may have been cancelled or superseded; only hide the side pane for a session that is actually shown.
		const isShown = readPaneSessions(this.sessionsService.slotPanes, undefined).some(visible => visible.sessionId === session.sessionId);
		if (comparison && comparison.archivedAt === undefined && isShown) {
			this.hostLayoutService.sidePane?.hideSidePane();
		}
		if (isWeb && isPhoneLayout(this.layoutService)) {
			this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
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
			background: undefined!,
			listOverrideStyles: {
				...colors.listOverrideStyles,
				listBackground: undefined!,
				treeStickyScrollBackground: agentsBackground,
			}
		};
	}

	private createControls(parent: HTMLElement): void {
		const sessionsContainer = DOM.append(parent, $('.agent-sessions-container'));
		this.sidebarSplitViewContainer = DOM.append(sessionsContainer, $('.agent-sessions-sidebar-splitview-container'));

		// Sessions section (top, fills available space)
		const sessionsSection = DOM.append(this.sidebarSplitViewContainer, $('.agent-sessions-section'));

		// Sessions content container
		const sessionsContent = DOM.append(sessionsSection, $('.agent-sessions-content'));

		// On phone, the desktop header content (label + new button + filter/find toolbar)
		// is hidden in favor of the mobile filter chip row + the (+) button in the
		// MobileTitlebarPart. We still create the row container because the find
		// widget mounts inside it.
		const phoneLayout = isPhoneLayout(this.layoutService);
		const navigationContainer = DOM.append(sessionsContent, $('.agent-sessions-navigation-container'));
		const sessionsHeaderContainer = DOM.append(sessionsContent, $('.agent-sessions-header-container'));
		const header = this.createSessionsHeader(sessionsHeaderContainer, phoneLayout, this._register(new DisposableStore()));
		const topNoticesContainer = DOM.append(sessionsContent, $('.agent-sessions-top-notices'));

		// Container for the tree's find widget (toggled by the toolbar's Find action)
		const findWidgetContainer = this.findWidgetContainer = DOM.append(header.row, $('.agent-sessions-find-widget-container'));
		findWidgetContainer.style.display = 'none';

		// Reserve DOM slot for mobile filter chips (phone layout only).
		// The actual widget is created after sessionsControl is available.
		this._register(this.presentation.renderHeader(sessionsContent));
		const filterChipsContainer = isPhoneLayout(this.layoutService)
			? DOM.append(sessionsContent, $('.mobile-session-filter-chips-slot'))
			: undefined;
		const inboxScopeContainer = DOM.append(sessionsContent, $('.agent-sessions-inbox-scope-container'));

		// Sessions List Control
		this.sessionsControlContainer = DOM.append(sessionsContent, $('.agent-sessions-control-container'));
		this._register(this.presentation.decorateList(
			this.sessionsControlContainer,
			() => this.sessionsControl?.refresh(),
			() => !this.sessionsControl || this.sessionsControl.scrollTop === 0,
		));
		const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(SessionsList, this.sessionsControlContainer, {
			pendingSections: derived(this, reader => {
				const claimedDraftIds = this.scheduledChatsService.claimedDraftIds.read(reader);
				const drafts = this.sessionDraftsService.sections.read(reader)
					.map(section => ({ ...section, items: section.items.filter(item => !claimedDraftIds.has(item.id)) }))
					.filter(section => section.items.length);
				return drafts;
			}),
			schedulingEnabled: this.scheduledChatsService.enabled,
			scheduledSessions: derived(this, reader => this.scheduledChatsService.items.read(reader).filter(item => !item.conversation)),
			scheduledSessionResources: derived(this, reader => new Set(this.scheduledChatsService.items.read(reader)
				.flatMap(item => item.conversation ? [item.conversation.sessionResource.toString()] : []))),
			sectionRowHeight: this.presentation.sectionRowHeight,
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
			grouping: () => this.grouping,
			sorting: () => this.currentSorting,
			compact: () => this.currentCompact,
			showNavigationShortcuts: () => this.navigationShortcutsVisible,
			showCustomizations: () => this.customizationsPresentation === 'treatment',
			customizationsCount: this.customizationsNavigationState.totalCount,
			customizationMigrationsAvailable: this.customizationsNavigationState.migrationAvailable,
			customizationsBadge: this.customizationsNavigationState.badge,
			navigationContainer,
			onDidChangeNavigationHeight: () => this.layoutSidebarSplitView(),
			pinnedCanvases: this.presentation.pinnedCanvases,
			focusNewSessionInput: () => this.sessionsService.focusActiveSession(),
			findWidgetContainer,
			onSessionOpen: (resource, preserveFocus, sideBySide) => {
				const session = this.sessionsManagementService.getSession(resource);
				if (!session) {
					onUnexpectedError(new Error(`Unable to open session because '${resource.toString()}' is not available`));
					return;
				}
				const onOpened = () => this._handleSessionOpened(session);
				if (sideBySide) {
					// Alt-click: open the session to the right of the last visible session in the grid.
					return this.sessionsService.openSessionToSide(session, { preserveFocus, source: 'sessionsList', forceMainChat: true }).then(onOpened).catch(onUnexpectedError);
				}
				return this.sessionsService.openSession(session.resource, { preserveFocus, source: 'sessionsList', forceMainChat: true }).then(onOpened).catch(onUnexpectedError);
			},
			canOpenSession: session => this.sessionsService.canOpenSession(session),
			onChatOpen: (session, chat, preserveFocus, sideBySide) => {
				const onOpened = () => {
					if (isWeb && isPhoneLayout(this.layoutService)) {
						this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
					}
				};
				if (sideBySide) {
					return this.sessionsService.openChatToSide(session, chat.resource, { preserveFocus }).then(onOpened).catch(onUnexpectedError);
				}
				return this.sessionsService.openChat(session, chat.resource, { preserveFocus }).then(onOpened).catch(onUnexpectedError);
			},
		}));
		const scopeChanged = observableSignalFromEvent(this, Event.any(
			this.sessionsManagementService.onDidChangeSessions,
			this.sessionsProvidersService.onDidChangeProviders,
			sessionsControl.onDidUpdate,
			this.scopedContextKeyService.onDidChangeContext,
		));
		const scopeSessions = derived(this, reader => {
			scopeChanged.read(reader);
			return this.sessionsManagementService.getSessions().filter(session => sessionsControl.isSessionListed(session, reader));
		});
		const scopeEnvironments = derived(this, reader => {
			scopeChanged.read(reader);
			return this.sessionsProvidersService.getProviders().map(provider => provider.environment);
		});
		const inboxScope = this._register(this.instantiationService.createInstance(SessionsInboxScope, inboxScopeContainer, sessionsControl.filters, scopeSessions, scopeEnvironments));
		this._register(autorun(reader => {
			scopeChanged.read(reader);
			const hidden = this.chatEntitlementService.sentimentObs.read(reader).hidden;
			inboxScope.setVisible(this.grouping === SessionsGrouping.Inbox && !hidden && this.scopedContextKeyService.contextMatchesRules(ChatContextKeys.enabled));
		}));
		let scopeHeight = -1;
		const scopeResizeObserver = this._register(new DOM.DisposableResizeObserver('SessionsView.inboxScope', entries => {
			const height = entries[0]?.contentRect.height ?? 0;
			if (height !== scopeHeight) {
				scopeHeight = height;
				this.layoutSidebarSplitView();
			}
		}, DOM.getWindow(inboxScope.element)));
		this._register(scopeResizeObserver.observe(inboxScope.element));
		const storageCleanupNotice = this._register(this.instantiationService.createInstance(SessionStorageCleanupNotice, () => sessionsControl.focus(), status));
		sessionsContent.appendChild(storageCleanupNotice.domNode);
		const createNoticeHost = (container: HTMLElement): ISessionsListNoticeHost => ({
			container,
			relayout: () => this.layoutSidebarSplitView(),
			onDidChangeVisibility: this.onDidChangeBodyVisibility,
			isVisible: () => this.isBodyVisible(),
			focusSessionsList: () => sessionsControl.focus(),
			onDidOpenSession: sessionsControl.onDidOpenSession,
			revealSession: resource => {
				const session = this.sessionsManagementService.getSession(resource);
				if (!session) { throw new Error('Session is no longer available'); }
				const reveal = sessionsControl.revealSessionForOnboarding(session);
				return {
					targetId: reveal.targetId,
					open: async token => {
						if (token.isCancellationRequested || !await this.sessionsService.canOpenSession(session) || token.isCancellationRequested) { return false; }
						await this.sessionsService.openSession(session.resource, { forceMainChat: true, source: 'sessionsList' });
						return true;
					},
					dispose: () => reveal.dispose(),
				};
			},
			announce: status,
		});
		for (const notice of createSessionsListNotices(this.instantiationService, {
			top: createNoticeHost(topNoticesContainer),
			bottom: createNoticeHost(sessionsContent),
		})) { this._register(notice); }
		this._register(this.onDidChangeBodyVisibility(visible => sessionsControl.setVisible(visible)));
		this.listNotification = this._register(this.instantiationService.createInstance(SessionsListNotification, sessionsContent, () => sessionsControl.focus()));

		// Toggle header label/actions visibility when find widget opens/closes
		this._register(sessionsControl.onDidChangeFindOpenState(open => {
			this.isFindWidgetOpen = open;
			findWidgetContainer.style.display = open ? '' : 'none';
			this.updateHeaderLayout();
		}));
		// Close find widget on Escape
		this._register(DOM.addDisposableListener(findWidgetContainer, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				sessionsControl.closeFind();
				e.stopPropagation();
			}
		}));

		// Sync workspace group capped context key with persisted state
		this.workspaceGroupCappedContextKey?.set(sessionsControl.isWorkspaceGroupCapped());

		this.registerSessionFilters(sessionsControl);
		this.registerAutomationFilter(sessionsControl);
		this.registerScheduledFilter(sessionsControl);
		this.registerArchivedFilter(sessionsControl);
		this.registerResetFiltersAction();

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

		if (filterChipsContainer) {
			const chips = this._register(new MobileSessionFilterChips(filterChipsContainer));
			this._register(chips.onDidRequestSortGroup(() => {
				this.openSortGroupSheet();
			}));
			this._register(chips.onDidRequestFind(() => {
				this.openFind();
			}));
		}

		// When the session the main window shows changes, reveal it in the sessions list: chat windows, which are other
		// windows, do not select theirs.
		this._register(this.sessionDraftsService.onDidOpenDraft(id => sessionsControl.revealPendingSession(id)));
		this._register(autorun(reader => {
			const activeSession = this._mainWindowHost.session.read(reader);
			if (activeSession) {
				if (!sessionsControl.reveal(activeSession.resource)) {
					sessionsControl.clearFocus();
				}
			} else {
				sessionsControl.clearFocus();
			}
		}));

		this.sidebarSplitView = this._register(new SplitView(this.sidebarSplitViewContainer, {
			orientation: Orientation.VERTICAL,
			proportionalLayout: false,
		}));

		const sessionsPane: IView = {
			element: sessionsSection,
			minimumSize: SESSIONS_SECTION_MIN_HEIGHT,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: height => {
				sessionsSection.style.height = `${height}px`;
				this.sessionsControl?.layout(this.sessionsControlContainer?.offsetHeight ?? 0, this.currentBodyWidth);
			},
		};

		this.sidebarSplitView.addView(sessionsPane, Sizing.Distribute, 0, true);
		const aiVisibilityChanged = observableSignalFromEvent(this, this.scopedContextKeyService.onDidChangeContext);
		this._register(autorun(reader => {
			aiVisibilityChanged.read(reader);
			this.refreshCustomizationsPresentation(reader);
		}));

		const updateSplitViewStyles = () => {
			const borderColor = this.themeService.getColorTheme().getColor(PANEL_SECTION_BORDER);
			this.sidebarSplitView?.style({ separatorBorder: borderColor ?? Color.transparent });
		};
		updateSplitViewStyles();
		this._register(this.themeService.onDidColorThemeChange(updateSplitViewStyles));

		// Agent Host toolbar (bottom, below customizations). Only rendered
		// in the sessions window on web desktop layouts: electron has no
		// host picker today (gated out at the menu level), phone layout
		// uses the mobile titlebar pill instead, and auxiliary windows do
		// not contribute any host actions — without this gate they would
		// show an empty toolbar shell.
		if (isWeb && this.scopedContextKeyService.contextMatchesRules(ContextKeyExpr.and(
			IsSessionsWindowContext,
			IsAuxiliaryWindowContext.toNegated(),
			IsPhoneLayoutContext.negate(),
		))) {
			this._register(this.instantiationService.createInstance(AgentHostShortcutsWidget, sessionsContainer, {
				onDidChangeLayout: () => {
					this.layoutSidebarSplitView();
				},
			}));
		}

		this._register(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(parent), () => this.layoutSidebarSplitView()));
	}

	private createSessionsHeader(parent: HTMLElement, phoneLayout: boolean, disposables: DisposableStore): ISessionsHeaderElements {
		const header = renderSessionsHeader(parent, phoneLayout, this.instantiationService, this.scopedContextKeyService, disposables, () => this.sessionsControl?.reportFilterMenuShown(), () => this.grouping);
		this.sessionsHeaders.add(header);
		disposables.add(toDisposable(() => this.sessionsHeaders.delete(header)));
		this.updateHeaderLayout();
		return header;
	}

	showApplicationFilters(): void {
		const header = [...this.sessionsHeaders].find(header => DOM.isHTMLElement(header.row.offsetParent));
		const anchor = header?.actions ?? this.sessionsControlContainer;
		if (!anchor) {
			return;
		}
		this.hoverService.hideHover(true);
		const actions = getFlatContextMenuActions(this.menuService.getMenuActions(Menus.SessionsViewFilter, this.scopedContextKeyService));
		const applicationIndex = actions.findIndex(action => action instanceof SubmenuItemAction && action.item.submenu === Menus.SessionsViewSource);
		this.sessionsControl?.reportFilterMenuShown();
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			autoSelectItem: applicationIndex >= 0 ? applicationIndex : true,
			onHide: () => this.sessionsControl?.focus(),
		});
	}

	private refreshCustomizationsPresentation(reader?: IReader): void {
		const phone = isPhoneLayout(this.layoutService);
		const enabled = this.scopedContextKeyService.contextMatchesRules(ChatContextKeys.enabled);
		const hidden = this.chatEntitlementService.sentimentObs.read(reader).hidden === true;
		const navigation = this.separateNavigation.read(reader);
		const navigationIncludesCustomizations = navigation && !this.customizationsAtBottom.read(reader);
		this.updateCustomizationsPresentation(
			getCustomizationsPresentation(phone, enabled, hidden, navigationIncludesCustomizations, this.customizationsLocation.read(reader)),
			navigation && !phone && enabled && !hidden,
		);
	}

	private updateCustomizationsPresentation(presentation: CustomizationsPresentation, navigationShortcutsVisible = presentation === 'treatment'): void {
		const compact = this.configurationService.getValue<ChatCustomizationsLocation>(ChatConfiguration.ChatCustomizationsLocation) === 'sidebar';
		if (this.customizationsPresentation === presentation && this.navigationShortcutsVisible === navigationShortcutsVisible && (presentation !== 'control' || this._customizationsWidget?.compact === compact)) {
			return;
		}

		const customizationsFocused = this._customizationsWidget?.hasFocus() === true || this.sessionsControl?.isCustomizationsFocused() === true;
		const automationsFocused = this.sessionsControl?.isAutomationsFocused() === true;
		const wasTreatment = this.customizationsPresentation === 'treatment';
		const navigationChanged = this.navigationShortcutsVisible !== navigationShortcutsVisible;
		this.customizationsPresentation = presentation;
		this.navigationShortcutsVisible = navigationShortcutsVisible;
		this.sessionsListRearrangeContext.set(navigationShortcutsVisible);
		this.customizationsNavigationVisible.set(presentation === 'treatment', undefined);
		this.updateHeaderLayout();

		if (wasTreatment !== (presentation === 'treatment') || navigationChanged) {
			this.sessionsControl?.updateNavigationVisibility();
		}

		this.removeCustomizationsPane();

		if (presentation === 'control') {
			this.updateCustomizationsPane();
		}

		if (customizationsFocused) {
			if (presentation === 'control') {
				this._customizationsWidget?.focus();
			} else if (presentation === 'treatment') {
				this.sessionsControl?.focusCustomizations();
			} else {
				this.sessionsControl?.focus();
			}
		} else if (automationsFocused) {
			if (presentation === 'treatment' || presentation === 'control') {
				this.sessionsControl?.focusAutomations();
			} else {
				this.sessionsControl?.focus();
			}
		}

		this.layoutSidebarSplitView();
	}

	private removeCustomizationsPane(): void {
		if (!this.sidebarSplitView || !this._customizationsWidget) {
			return;
		}
		this.sidebarSplitView.removeView(1, Sizing.Distribute);
		this._customizationsWidget = undefined;
		this.customizationsPaneDisposables.clear();
		this.didInitializePaneSizes = false;
	}

	private updateCustomizationsPane(): void {
		if (!this.sidebarSplitView || !this.sidebarSplitViewContainer) {
			return;
		}
		if (this.customizationsPresentation !== 'control' || isPhoneLayout(this.layoutService)) {
			this.removeCustomizationsPane();
			return;
		}
		if (this._customizationsWidget) {
			return;
		}

		const store = new DisposableStore();
		this.customizationsPaneDisposables.value = store;
		const customizationsSection = DOM.append(this.sidebarSplitViewContainer, $('.agent-sessions-customizations-section'));
		store.add(toDisposable(() => customizationsSection.remove()));
		const customizationsSizeChange = store.add(new Emitter<void>());
		const customizationsWidget = this._customizationsWidget = store.add(this.instantiationService.createInstance(AICustomizationShortcutsWidget, customizationsSection, {
			compact: this.configurationService.getValue<ChatCustomizationsLocation>(ChatConfiguration.ChatCustomizationsLocation) === 'sidebar',
			onDidChangeLayout: () => {
				customizationsSizeChange.fire();
				this.layoutSidebarSplitView();
			},
		}));
		const customizationsPane: IView = {
			element: customizationsSection,
			get minimumSize() { return customizationsWidget.collapsed ? customizationsWidget.collapsedHeight : CUSTOMIZATIONS_MIN_HEIGHT; },
			get maximumSize() { return customizationsWidget.collapsed ? customizationsWidget.collapsedHeight : Math.max(CUSTOMIZATIONS_MIN_HEIGHT, customizationsWidget.desiredHeight); },
			onDidChange: Event.map(Event.any(customizationsWidget.onDidChangeHeight, customizationsSizeChange.event), () => this.getCustomizationsPaneHeight()),
			layout: height => {
				customizationsSection.style.height = `${height}px`;
				customizationsWidget.layout(height, this.currentBodyWidth);
			},
		};
		this.sidebarSplitView.addView(customizationsPane, this.getCustomizationsPaneHeight(), 1, true);

		let savedCustomizationsPaneHeight = this.getCustomizationsPaneHeight();
		store.add(customizationsWidget.onDidToggleCollapsed(collapsed => {
			if (!this.sidebarSplitView) {
				return;
			}
			if (collapsed) {
				const currentSize = this.sidebarSplitView.getViewSize(1);
				if (currentSize > customizationsWidget.collapsedHeight) {
					savedCustomizationsPaneHeight = currentSize;
				}
				this.sidebarSplitView.resizeView(1, customizationsWidget.collapsedHeight);
			} else {
				this.sidebarSplitView.resizeView(1, savedCustomizationsPaneHeight);
			}
			this.layoutSidebarSplitView();
		}));
		this.didInitializePaneSizes = false;
	}

	focusCustomizations(): void {
		if (!isPhoneLayout(this.layoutService)) {
			if (this.customizationsPresentation === 'treatment') {
				this.sessionsControl?.focusCustomizations();
			} else {
				this._customizationsWidget?.focus();
			}
		}
	}

	private restoreLastSelectedSession(): void {
		const activeSession = this._mainWindowHost.session.get();
		if (activeSession && this.sessionsControl) {
			this.sessionsControl.reveal(activeSession.resource, true);
		}
	}

	private readonly archivedFilterRegistration = this._register(new DisposableStore());

	private registerAutomationFilter(sessionsControl: SessionsList): void {
		const contextKey = new RawContextKey<boolean>('sessionsViewPane.filter.showAutomationRuns', sessionsControl.filters.isShowAutomationRuns());
		const contextKeyInstance = contextKey.bindTo(this.scopedContextKeyService);
		this.filterContextKeys.set(contextKey.key, { key: contextKeyInstance, read: () => sessionsControl.filters.isShowAutomationRuns() });
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'sessionsViewPane.filterAutomationRuns',
					title: localize('showAutomationRuns', "Show Automation Runs"),
					toggled: ContextKeyExpr.equals(contextKey.key, true),
					menu: [{
						id: Menus.SessionsViewFilter,
						group: '3_visibility',
						order: 0.5,
					}],
				});
			}
			override run() {
				const show = !sessionsControl.filters.isShowAutomationRuns();
				sessionsControl.filters.setShowAutomationRuns(show);
				contextKeyInstance.set(show);
			}
		}));
	}

	private registerScheduledFilter(sessionsControl: SessionsList): void {
		const contextKey = new RawContextKey<boolean>('sessionsViewPane.filter.scheduledOnly', sessionsControl.filters.isScheduledOnly());
		const contextKeyInstance = contextKey.bindTo(this.scopedContextKeyService);
		this.filterContextKeys.set(contextKey.key, { key: contextKeyInstance, read: () => sessionsControl.filters.isScheduledOnly() });
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'sessionsViewPane.filterScheduled',
					title: localize('scheduledOnly', "Scheduled Only"),
					toggled: ContextKeyExpr.equals(contextKey.key, true),
					precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${SESSIONS_SEND_LATER_ENABLED_SETTING}`, true)),
					menu: [{
						id: Menus.SessionsViewFilter,
						group: '3_visibility',
						order: 0.6,
						when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${SESSIONS_SEND_LATER_ENABLED_SETTING}`, true)),
					}],
				});
			}
			override run() {
				const scheduledOnly = !sessionsControl.filters.isScheduledOnly();
				sessionsControl.filters.setScheduledOnly(scheduledOnly);
				contextKeyInstance.set(scheduledOnly);
			}
		}));
	}

	private registerSessionFilters(sessionsControl: SessionsList): void {
		const changed = observableSignalFromEvent(this, Event.any(
			this.sessionsManagementService.onDidChangeSessions,
			this.sessionsManagementService.onDidChangeSessionTypes,
			this.sessionsProvidersService.onDidChangeProviders,
			sessionsControl.filters.onDidChange,
			sessionsControl.onDidUpdate,
		));
		const menuState = derivedOpts<{
			readonly options: readonly (ISessionFilterOption & { readonly checked: boolean })[];
			readonly emptySourcesTitle: string | undefined;
		}>({ owner: this, equalsFn: structuralEquals }, reader => {
			changed.read(reader);
			const environments = this.sessionsProvidersService.getProviders().map(provider => provider.environment);
			const options = getSessionFilterOptions(
				this.sessionsManagementService.getSessions(),
				environments,
				(session, reader) => sessionsControl.isSessionListed(session, reader),
				reader,
			);
			const environmentLabels = new Map(options
				.filter(option => option.filter.kind === 'environment')
				.map(option => [option.filter.id, option.label]));
			for (const environment of environments) {
				if (options.some(option => option.filter.kind === 'application' && option.filter.environment === environment.id)) {
					environmentLabels.set(environment.id, environment.label);
				}
			}
			const isEnvironmentIncluded = (id: string) => this.grouping === SessionsGrouping.Inbox
				? !sessionsControl.filters.inboxScope.environment || sessionsControl.filters.inboxScope.environment.id === id
				: !sessionsControl.filters.isExcluded({ kind: 'environment', id });
			const includedEnvironments = [...environmentLabels].filter(([id]) => isEnvironmentIncluded(id));
			const scopedOptions = options
				.filter(option => option.filter.kind !== 'application' || isEnvironmentIncluded(option.filter.environment))
				.map(option => ({ ...option, checked: !sessionsControl.filters.isExcluded(option.filter) }));
			return {
				options: scopedOptions,
				emptySourcesTitle: scopedOptions.some(option => option.filter.kind === 'application') ? undefined
					: includedEnvironments.length === 0 ? localize('selectEnvironmentFirst', "Select an Environment First")
						: localize('noCreatingApplications', "No Applications Found"),
			};
		});
		this._register(autorun(reader => {
			const { options, emptySourcesTitle } = menuState.read(reader);
			reader.store.add(MenuRegistry.appendMenuItem(Menus.SessionsViewFilter, {
				submenu: Menus.SessionsViewEnvironment,
				title: localize('environment', "Environment"),
				when: SessionsViewGroupingContext.notEqualsTo(SessionsGrouping.Inbox),
				group: '2_filters',
				order: 0,
			}));
			if (emptySourcesTitle) {
				reader.store.add(MenuRegistry.appendMenuItem(Menus.SessionsViewSource, {
					command: {
						id: 'sessionsViewPane.noApplicationFilters',
						title: emptySourcesTitle,
						precondition: ContextKeyExpr.false(),
					},
					group: '3_applications',
				}));
			}
			for (const [index, option] of options.entries()) {
				const menuId = option.filter.kind === 'environment' ? Menus.SessionsViewEnvironment
					: option.filter.kind === 'application' ? Menus.SessionsViewSource
						: Menus.SessionsViewHarness;
				const id = `sessionsViewPane.filter.${encodeURIComponent(sessionFilterKey(option.filter))}`;
				const contextKey = new RawContextKey(id, option.checked).bindTo(this.scopedContextKeyService);
				contextKey.set(option.checked);
				reader.store.add(toDisposable(() => contextKey.reset()));
				reader.store.add(registerAction2(class extends Action2 {
					constructor() {
						super({
							id,
							title: option.label,
							toggled: ContextKeyExpr.equals(id, true),
							menu: [{ id: menuId, group: option.group, order: index }],
						});
					}
					override run() {
						sessionsControl.filters.setExcluded(option.filter, !sessionsControl.filters.isExcluded(option.filter));
					}
				}));
			}
		}));
	}

	private registerArchivedFilter(sessionsControl: SessionsList): void {
		// Archived toggle
		const archivedContextKey = new RawContextKey<boolean>('sessionsViewPane.filter.showArchived', !sessionsControl.isExcludeArchived());
		const archivedContextKeyInstance = archivedContextKey.bindTo(this.scopedContextKeyService);
		this.filterContextKeys.set(archivedContextKey.key, { key: archivedContextKeyInstance, read: () => !sessionsControl.isExcludeArchived() });

		// The archived filter label follows the configured archive action wording,
		// so the action is re-registered whenever that setting changes.
		const registerArchivedFilter = () => {
			this.archivedFilterRegistration.clear();
			const title = getChatSessionArchiveActionWording(this.configurationService) === ChatSessionArchiveActionWording.MarkAsDone
				? localize('showDone', "Show Done")
				: localize('showArchived', "Show Archived");
			this.archivedFilterRegistration.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: 'sessionsViewPane.filterArchived',
						title,
						toggled: ContextKeyExpr.equals(archivedContextKey.key, true),
						menu: [{
							id: Menus.SessionsViewFilter,
							group: '3_visibility',
							order: 1,
						}]
					});
				}
				override run() {
					const excluding = sessionsControl.isExcludeArchived();
					sessionsControl.setExcludeArchived(!excluding);
					archivedContextKeyInstance.set(excluding); // was excluding → now showing
				}
			}));
		};
		registerArchivedFilter();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatSessionArchiveActionWordingSettingId)) {
				registerArchivedFilter();
			}
		}));
	}

	private registerResetFiltersAction(): void {
		const resetFilters = () => this.resetFilters();
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'sessionsViewPane.resetFilters',
					title: localize('resetFilters', "Reset Filters"),
					menu: [{
						id: Menus.SessionsViewFilter,
						group: '5_reset',
						order: 0,
					}]
				});
			}
			override run() {
				resetFilters();
			}
		}));
	}

	/** Returns every filter and display option to its default, offering Undo. */
	resetFilters(): void {
		const sessionsControl = this.sessionsControl;
		if (!sessionsControl) {
			return;
		}
		const restore = sessionsControl.resetFilters();
		this.syncFilterContextKeys(sessionsControl);
		this.listNotification?.show({
			message: localize('filtersReset', "Filters reset"),
			help: localize('filtersResetHelp', "This notice appears after resetting the filters. Undo restores the previous filters, including which sessions are shown and how many each section lists."),
			undo: async () => {
				restore();
				this.syncFilterContextKeys(sessionsControl);
				status(localize('filtersRestored', "Filters restored."));
			},
		});
	}

	/** Shows or hides archived sessions, as the filter menu's toggle does. */
	setShowArchived(show: boolean): void {
		if (this.sessionsControl && this.sessionsControl.isExcludeArchived() === show) {
			this.sessionsControl.setExcludeArchived(!show);
			this.syncFilterContextKeys(this.sessionsControl);
		}
	}

	/** Caps workspace, repository, and environment sections to their recent sessions, or shows all of them. */
	setWorkspaceGroupCapped(capped: boolean): void {
		if (this.sessionsControl && this.sessionsControl.isWorkspaceGroupCapped() !== capped) {
			this.sessionsControl.setWorkspaceGroupCapped(capped);
			this.syncFilterContextKeys(this.sessionsControl);
		}
	}

	/** Updates the filter menu context keys to the list's current state, such as after resetting the filters or undoing that. */
	private syncFilterContextKeys(sessionsControl: SessionsList): void {
		for (const { key, read } of this.filterContextKeys.values()) {
			key.set(read());
		}
		this.workspaceGroupCappedContextKey?.set(sessionsControl.isWorkspaceGroupCapped());
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.currentBodyHeight = height;
		this.currentBodyWidth = width;
		this.updateHeaderLayout();
		this.refreshCustomizationsPresentation();
		this.layoutSidebarSplitView();

		if (this.sidebarSplitView || !this.sessionsControl || !this.sessionsControlContainer) {
			return;
		}

		this.sessionsControl.layout(this.sessionsControlContainer.offsetHeight, width);
	}

	private layoutSidebarSplitView(): void {
		if (!this.sidebarSplitView || !this.sidebarSplitViewContainer) {
			return;
		}

		const height = this.sidebarSplitViewContainer.offsetHeight || this.currentBodyHeight || this.viewPaneContainer?.offsetHeight || 0;
		if (height <= 0) {
			return;
		}

		if (this.sidebarSplitViewContainer.offsetHeight === 0) {
			this.sidebarSplitViewContainer.style.height = `${height}px`;
		}
		this.sidebarSplitView.layout(height);
		if (!this.didInitializePaneSizes) {
			this.didInitializePaneSizes = true;
			if (this._customizationsWidget) {
				this.sidebarSplitView.resizeView(1, this.getCustomizationsPaneHeight());
			}
		}
	}

	private getCustomizationsPaneHeight(): number {
		if (this._customizationsWidget?.collapsed) {
			return this._customizationsWidget.collapsedHeight;
		}
		const desiredHeight = this._customizationsWidget?.desiredHeight ?? 0;
		return Math.max(CUSTOMIZATIONS_MIN_HEIGHT, Number.isFinite(desiredHeight) ? desiredHeight : 0);
	}

	override focus(): void {
		super.focus();

		this.sessionsControl?.focus();
	}

	refresh(): void {
		this.sessionsControl?.refresh();
	}

	openFind(): void {
		this.isFindWidgetOpen = true;
		if (this.findWidgetContainer) {
			// Show container before opening find so the widget can be focused
			this.findWidgetContainer.style.display = '';
		}
		this.updateHeaderLayout();
		this.sessionsControl?.openFind();
	}

	private updateHeaderLayout(): void {
		for (const header of this.sessionsHeaders) {
			const inbox = this.grouping === SessionsGrouping.Inbox;
			if (header.row.classList.contains('inbox-layout') !== inbox) {
				header.row.classList.toggle('inbox-layout', inbox);
				header.toolbar?.refresh();
			}
			header.label.textContent = inbox ? localize('inboxHeader', "Inbox") : localize('sessionsHeader', "Sessions");
			// On phone the desktop header content is hidden; the row is only
			// visible when the find widget is open (so the user can search).
			if (isPhoneLayout(this.layoutService)) {
				header.row.classList.toggle('phone-layout-empty', !this.isFindWidgetOpen);
				continue;
			}

			if (this.isFindWidgetOpen) {
				header.label.style.display = 'none';
				header.actions.style.display = 'none';
				continue;
			}

			header.label.style.display = '';
			header.actions.style.display = '';
			if (header.row.clientWidth > 0 && header.label.clientWidth < SESSIONS_HEADER_ELLIPSIS_MIN_WIDTH) {
				header.label.style.display = 'none';
			}
		}
	}

	/**
	 * Phone-only: present a bottom sheet with the sort and group toggles.
	 * The sheet omits the desktop filtering, capping, and collapse actions.
	 */
	private openSortGroupSheet(): void {
		const sortTitle = localize('sortGroupSheet.sort', "Sort");
		const groupTitle = localize('sortGroupSheet.group', "Group");

		const items: IMobileSortGroupSheetItem[] = [
			{
				id: SessionsSorting.Created,
				label: localize('sortByCreated', "Sort by Created"),
				checked: this.currentSorting === SessionsSorting.Created,
				group: 'sort',
				groupTitle: sortTitle,
			},
			{
				id: SessionsSorting.Updated,
				label: localize('sortByUpdated', "Sort by Updated"),
				checked: this.currentSorting === SessionsSorting.Updated,
				group: 'sort',
			},
			{
				id: SessionsGrouping.Workspace,
				label: localize('groupByWorkspace', "Group by Workspace"),
				checked: this.grouping === SessionsGrouping.Workspace,
				group: 'group',
				groupTitle: groupTitle,
			},
			{
				id: SessionsGrouping.Repository,
				label: localize('groupByRepository', "Group by Repository"),
				checked: this.grouping === SessionsGrouping.Repository,
				group: 'group',
			},
			{
				id: SessionsGrouping.Environment,
				label: localize('groupByEnvironment', "Group by Environment"),
				checked: this.grouping === SessionsGrouping.Environment,
				group: 'group',
			},
			{
				id: SessionsGrouping.Date,
				label: localize('groupByTime', "Group by Time"),
				checked: this.grouping === SessionsGrouping.Date,
				group: 'group',
			},
		];
		if (!this.chatEntitlementService.sentiment.hidden) {
			items.push({
				id: SessionsGrouping.Inbox,
				label: localize('inboxMode', "Inbox Mode"),
				checked: this.grouping === SessionsGrouping.Inbox,
				group: 'group',
			});
		}

		showMobileSortGroupSheet(this.layoutService.mainContainer, localize('sortGroupSheet.title', "Sort"), items).then(selectedId => {
			if (!selectedId) {
				return;
			}
			if (selectedId === SessionsSorting.Created || selectedId === SessionsSorting.Updated) {
				this.setSorting(selectedId);
			} else if (selectedId === SessionsGrouping.Workspace || selectedId === SessionsGrouping.Repository || selectedId === SessionsGrouping.Environment || selectedId === SessionsGrouping.Date || selectedId === SessionsGrouping.Inbox) {
				this.setGrouping(selectedId);
			}
		}).catch(onUnexpectedError);
	}

	get grouping(): SessionsGrouping {
		return this.currentGrouping ?? (this.configurationService.getValue<boolean>(SESSIONS_LIST_INBOX_ENABLED_SETTING)
			? SessionsGrouping.Inbox
			: SessionsGrouping.Workspace);
	}

	get sorting(): SessionsSorting {
		return this.currentSorting;
	}

	get compact(): boolean {
		return this.currentCompact;
	}

	setGrouping(grouping: SessionsGrouping): void {
		if (this.currentGrouping === grouping) {
			return;
		}

		const preserveCollapseState = this.grouping === SessionsGrouping.Inbox || grouping === SessionsGrouping.Inbox;
		this.currentGrouping = grouping;
		this.storageService.store(GROUPING_STORAGE_KEY, this.currentGrouping, StorageScope.PROFILE, StorageTarget.USER);
		this.groupingContextKey?.set(this.currentGrouping);
		if (!preserveCollapseState) {
			this.sessionsControl?.resetSectionCollapseState();
		}
		this.sessionsControl?.update(true);
		this.updateHeaderLayout();
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

	setCompact(compact: boolean): void {
		if (this.currentCompact === compact) {
			return;
		}

		this.currentCompact = compact;
		this.storageService.store(COMPACT_STORAGE_KEY, compact, StorageScope.PROFILE, StorageTarget.USER);
		this.compactContextKey?.set(compact);
		this.sessionsControl?.setCompact();
	}

	toggleCompact(): void {
		this.setCompact(!this.currentCompact);
	}
}
