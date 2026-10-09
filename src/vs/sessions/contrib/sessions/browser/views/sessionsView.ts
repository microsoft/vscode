/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionsViewPane.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { Orientation } from '../../../../../base/browser/ui/sash/sash.js';
import { IView, Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../../base/common/color.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, IViewPaneLocationColors, ViewPane } from '../../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../../workbench/common/views.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, getChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { localize } from '../../../../../nls.js';
import { type ISessionsFlatListOptions, SessionsFlatList, SessionsInboxEmptyState, SessionsList, SessionsGrouping, SessionsSorting } from './sessionsList.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionComparisonService } from '../../../../services/sessions/common/sessionComparison.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { getSessionFilterOptions, ISessionFilterOption, sessionFilterKey } from './sessionsListFilters.js';
import { AICustomizationShortcutsWidget } from '../aiCustomizationShortcutsWidget.js';
import { AgentHostShortcutsWidget } from '../agentHostShortcutsWidget.js';
import { Action2, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { SubmenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { agentsBackground } from '../../../../common/theme.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { PANEL_SECTION_BORDER } from '../../../../../workbench/common/theme.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsListModelService, SessionInboxDisposition } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { Menus } from '../../../../browser/menus.js';
import { MobileSessionFilterChips } from '../../../../browser/parts/mobile/mobileSessionFilterChips.js';
import { IMobileSortGroupSheetItem, showMobileSortGroupSheet } from '../../../../browser/parts/mobile/mobileSortGroupSheet.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import { IsPhoneLayoutContext, SessionsListRearrangeContext } from '../../../../common/contextkeys.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { logSessionsListCompactViewState } from '../../../../common/sessionsTelemetry.js';
import { SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING } from '../../../../common/sessionConfig.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { CustomizationsNavigationState } from '../customizationsNavigationState.js';
import { createSessionsListNotices } from './sessionsListNotice.js';
import { SessionStorageCleanupNotice } from './sessionStorageCleanupNotice.js';
import { SessionsListNotification } from './sessionsListNotification.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { SessionStatusIcon } from '../../../../browser/sessionStatusIcon.js';

const $ = DOM.$;
export const SessionsViewId = 'sessions.workbench.view.sessionsView';
const GROUPING_STORAGE_KEY = 'sessionsViewPane.grouping';
const SORTING_STORAGE_KEY = 'sessionsViewPane.sorting';
const COMPACT_STORAGE_KEY = 'sessionsViewPane.compact';
const INBOX_VIEW_SHEET_ID = 'inbox';
const CUSTOMIZATIONS_MIN_HEIGHT = 129;
const SESSIONS_SECTION_MIN_HEIGHT = 120;
const SESSIONS_HEADER_ELLIPSIS_MIN_WIDTH = 8;
export type CustomizationsPresentation = 'hidden' | 'control' | 'treatment';

export function getSessionsViewTitle(inbox: boolean): string {
	return inbox ? localize('inboxHeader', "Inbox") : localize('sessionsHeader', "Sessions");
}

export function getSessionsInboxEmptyLabel(state: SessionsInboxEmptyState): string | undefined {
	switch (state) {
		case SessionsInboxEmptyState.Empty:
		case SessionsInboxEmptyState.EmptyAfterPinned:
			return localize('inboxEmpty', "Inbox empty");
		case SessionsInboxEmptyState.Running:
		case SessionsInboxEmptyState.RunningAfterPinned:
			return localize('inboxWaiting', "Waiting for agents to respond");
		default:
			return undefined;
	}
}

export function getCustomizationsPresentation(phoneLayout: boolean, aiEnabled: boolean, aiHidden: boolean, treatment: boolean): CustomizationsPresentation {
	if (phoneLayout || !aiEnabled || aiHidden) {
		return 'hidden';
	}
	return treatment ? 'treatment' : 'control';
}

export const SessionsViewGroupingContext = new RawContextKey<string>('sessionsViewPane.grouping', SessionsGrouping.Workspace);
export const SessionsViewSortingContext = new RawContextKey<string>('sessionsViewPane.sorting', SessionsSorting.Created);
export const SessionsViewCompactContext = new RawContextKey<boolean>('sessionsViewPane.compact', false);
export const SessionsViewInboxContext = new RawContextKey<boolean>('sessionsViewPane.inbox', false);
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
): ISessionsHeaderElements {
	const row = DOM.append(parent, $('.agent-sessions-header-row'));
	const label = DOM.append(row, $('.agent-sessions-header-label'));
	const actions = DOM.append(row, $('.agent-sessions-header-actions'));
	let toolbar: MenuWorkbenchToolBar | undefined;

	if (!phoneLayout) {
		label.textContent = getSessionsViewTitle(false);
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

interface ISessionsBottomSectionPresentation {
	readonly className: string;
	readonly icon: ThemeIcon;
	readonly suppressInProgressStatusIcon: boolean;
	readonly label: (count: number) => string;
}

class SessionsBottomSection extends DisposableStore {
	private static readonly MAX_LIST_HEIGHT = 240;

	readonly element: HTMLElement;
	private readonly header: HTMLElement;
	private readonly label: HTMLElement;
	private readonly chevron: HTMLElement;
	private readonly listContainer: HTMLElement;
	private readonly list: SessionsFlatList;
	private expanded = false;
	private width = 0;

	constructor(
		parent: HTMLElement,
		sessionsObservable: IObservable<readonly ISession[]>,
		presentation: ISessionsBottomSectionPresentation,
		private readonly compact: () => boolean,
		private readonly onDidChangeLayout: () => void,
		onSessionOpen: (resource: URI, preserveFocus: boolean, sideBySide: boolean) => void,
		overrideStyles: ISessionsFlatListOptions['overrideStyles'],
		instantiationService: IInstantiationService,
		accessibilityService: IAccessibilityService,
		hoverService: IHoverService,
	) {
		super();

		this.element = DOM.append(parent, $(`.agent-sessions-bottom-section.${presentation.className}`));
		this.element.setAttribute('role', 'tree');
		this.header = DOM.append(this.element, $('.agent-sessions-bottom-header'));
		this.header.setAttribute('role', 'treeitem');
		this.header.tabIndex = 0;
		const updateReducedMotion = () => this.element.classList.toggle('reduced-motion', accessibilityService.isMotionReduced());
		updateReducedMotion();
		this.add(accessibilityService.onDidChangeReducedMotion(updateReducedMotion));

		const icon = DOM.append(this.header, $('.agent-sessions-bottom-icon'));
		icon.setAttribute('aria-hidden', 'true');
		if (presentation.suppressInProgressStatusIcon) {
			const statusIcon = this.add(instantiationService.createInstance(SessionStatusIcon, icon));
			statusIcon.setStatus(SessionStatus.InProgress, true, false);
		} else {
			icon.classList.add(...ThemeIcon.asClassNameArray(presentation.icon));
		}
		this.label = DOM.append(this.header, $('.agent-sessions-bottom-label'));
		this.chevron = DOM.append(this.header, $('.agent-sessions-bottom-chevron'));
		this.chevron.setAttribute('aria-hidden', 'true');
		this.listContainer = DOM.append(this.element, $('.agent-sessions-bottom-list'));
		this.listContainer.setAttribute('role', 'group');
		this.list = this.add(instantiationService.createInstance(SessionsFlatList, this.listContainer, {
			overrideStyles,
			showSessionHover: false,
			compact: this.compact,
			rowSpacing: true,
			suppressInProgressStatusIcon: presentation.suppressInProgressStatusIcon,
			alwaysConsumeMouseWheel: false,
			useCompactQuickChatRows: false,
			onSessionOpen,
		}));

		const toggle = () => this.setExpanded(!this.expanded);
		this.add(DOM.addDisposableListener(this.header, DOM.EventType.CLICK, toggle));
		this.add(DOM.addDisposableListener(this.header, DOM.EventType.KEY_DOWN, event => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				toggle();
			} else if (event.key === 'ArrowRight' && !this.expanded) {
				event.preventDefault();
				this.setExpanded(true);
			} else if (event.key === 'ArrowLeft' && this.expanded) {
				event.preventDefault();
				this.setExpanded(false);
			}
		}));
		this.add(hoverService.setupDelayedHover(this.label, () => ({ content: this.label.textContent ?? '' })));
		this.add(this.list.onDidChangeContentHeight(() => this.layout(this.width)));
		this.add(autorun(reader => {
			const sessions = sessionsObservable.read(reader);
			const count = sessions.length;
			this.element.classList.toggle('visible', count > 0);
			const label = presentation.label(count);
			this.label.textContent = label;
			this.header.setAttribute('aria-label', label);
			this.list.setSessions(sessions);
			if (count === 0) {
				this.expanded = false;
			}
			this.updateExpandedState();
			this.layout(this.width);
		}));
		this.updateExpandedState();
	}

	private setExpanded(expanded: boolean): void {
		if (this.expanded === expanded) {
			return;
		}
		this.expanded = expanded;
		this.updateExpandedState();
		this.layout(this.width);
		this.onDidChangeLayout();
	}

	private updateExpandedState(): void {
		this.element.classList.toggle('expanded', this.expanded);
		this.header.setAttribute('aria-expanded', String(this.expanded));
		this.chevron.className = `agent-sessions-bottom-chevron ${ThemeIcon.asClassName(this.expanded ? Codicon.chevronDown : Codicon.chevronRight)}`;
	}

	layout(width: number): void {
		this.width = width;
		const height = this.expanded ? Math.min(this.list.getContentHeight(), SessionsBottomSection.MAX_LIST_HEIGHT) : 0;
		this.listContainer.style.height = `${height}px`;
		this.list.layout(height, width);
	}

	setCompact(): void {
		this.list.setCompact();
		this.layout(this.width);
	}

	getFocusedSessions(): readonly ISession[] | undefined {
		return this.list.getFocusedSessions();
	}
}

export class SessionsRunningSection extends DisposableStore {
	private readonly section: SessionsBottomSection;
	readonly element: HTMLElement;

	constructor(
		parent: HTMLElement,
		runningSessions: IObservable<readonly ISession[]>,
		compact: () => boolean,
		onDidChangeLayout: () => void,
		onSessionOpen: (resource: URI, preserveFocus: boolean, sideBySide: boolean) => void,
		overrideStyles: ISessionsFlatListOptions['overrideStyles'],
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		this.section = this.add(new SessionsBottomSection(
			parent,
			runningSessions,
			{
				className: 'agent-sessions-bottom-section-running',
				icon: Codicon.sessionInProgress,
				suppressInProgressStatusIcon: true,
				label: count => count === 1
					? localize('sessionRunningStatus.single', "1 session running")
					: localize('sessionRunningStatus.multiple', "{0} sessions running", count),
			},
			compact,
			onDidChangeLayout,
			onSessionOpen,
			overrideStyles,
			instantiationService,
			accessibilityService,
			hoverService,
		));
		this.element = this.section.element;
	}

	layout(width: number): void {
		this.section.layout(width);
	}

	setCompact(): void {
		this.section.setCompact();
	}

	getFocusedSessions(): readonly ISession[] | undefined {
		return this.section.getFocusedSessions();
	}
}

export class SessionsDeferredSection extends DisposableStore {
	private readonly section: SessionsBottomSection;
	readonly element: HTMLElement;

	constructor(
		parent: HTMLElement,
		sessions: IObservable<readonly ISession[]>,
		disposition: SessionInboxDisposition,
		compact: () => boolean,
		onDidChangeLayout: () => void,
		onSessionOpen: (resource: URI, preserveFocus: boolean, sideBySide: boolean) => void,
		overrideStyles: ISessionsFlatListOptions['overrideStyles'],
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		const onHold = disposition === SessionInboxDisposition.OnHold;
		this.section = this.add(new SessionsBottomSection(
			parent,
			sessions,
			{
				className: onHold ? 'agent-sessions-bottom-section-on-hold' : 'agent-sessions-bottom-section-ready-to-merge',
				icon: onHold ? Codicon.clock : Codicon.gitMerge,
				suppressInProgressStatusIcon: false,
				label: count => onHold
					? count === 1
						? localize('sessionOnHoldStatus.single', "1 session on hold")
						: localize('sessionOnHoldStatus.multiple', "{0} sessions on hold", count)
					: count === 1
						? localize('sessionReadyToMergeStatus.single', "1 session ready to merge")
						: localize('sessionReadyToMergeStatus.multiple', "{0} sessions ready to merge", count),
			},
			compact,
			onDidChangeLayout,
			onSessionOpen,
			overrideStyles,
			instantiationService,
			accessibilityService,
			hoverService,
		));
		this.element = this.section.element;
	}

	layout(width: number): void {
		this.section.layout(width);
	}

	setCompact(): void {
		this.section.setCompact();
	}

	getFocusedSessions(): readonly ISession[] | undefined {
		return this.section.getFocusedSessions();
	}
}

export class SessionsView extends ViewPane {

	private viewPaneContainer: HTMLElement | undefined;
	private sidebarSplitViewContainer: HTMLElement | undefined;
	private sidebarSplitView: SplitView | undefined;
	private readonly customizationsPaneDisposables = this._register(new MutableDisposable<DisposableStore>());
	private sessionsControlContainer: HTMLElement | undefined;
	private runningSection: SessionsRunningSection | undefined;
	private onHoldSection: SessionsDeferredSection | undefined;
	private readyToMergeSection: SessionsDeferredSection | undefined;
	private findWidgetContainer: HTMLElement | undefined;
	private readonly sessionsHeaders = new Set<ISessionsHeaderElements>();
	private isFindWidgetOpen = false;
	sessionsControl: SessionsList | undefined;
	archiveNotification: SessionsListNotification | undefined;
	private _customizationsWidget: AICustomizationShortcutsWidget | undefined;
	private readonly separateNavigation: IObservable<boolean>;
	private readonly sessionsListRearrangeContext: IContextKey<boolean>;
	private readonly customizationsNavigationVisible = observableValue(this, false);
	private readonly customizationsNavigationState: CustomizationsNavigationState;
	private customizationsPresentation: CustomizationsPresentation = 'hidden';
	private currentGrouping: SessionsGrouping = SessionsGrouping.Workspace;
	private currentSorting: SessionsSorting = SessionsSorting.Created;
	private currentCompact = false;
	private groupingContextKey: IContextKey | undefined;
	private sortingContextKey: IContextKey | undefined;
	private compactContextKey: IContextKey<boolean> | undefined;
	private inboxContextKey: IContextKey<boolean> | undefined;
	private workspaceGroupCappedContextKey: IContextKey<boolean> | undefined;
	private readonly filterContextKeys = new Map<string, { key: IContextKey<boolean>; getDefault: () => boolean }>();
	private currentBodyHeight = 0;
	private currentBodyWidth = 0;
	private didInitializePaneSizes = false;

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
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsListModelService private readonly sessionsListModelService: ISessionsListModelService,
		@ISessionComparisonService private readonly sessionComparisonService: ISessionComparisonService,
		@IHostService private readonly hostService: IHostService,
		@IAgentWorkbenchLayoutService private readonly layoutService: IAgentWorkbenchLayoutService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this.separateNavigation = observableConfigValue(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, false, configurationService);
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
		this.groupingContextKey.set(this.currentGrouping);
		this.sortingContextKey = SessionsViewSortingContext.bindTo(contextKeyService);
		this.sortingContextKey.set(this.currentSorting);
		this.compactContextKey = SessionsViewCompactContext.bindTo(contextKeyService);
		this.compactContextKey.set(this.currentCompact);
		this.inboxContextKey = SessionsViewInboxContext.bindTo(contextKeyService);
		this.inboxContextKey.set(this.currentInbox);

		// Bind workspace group capped context key (will be synced with persisted state in renderBody)
		this.workspaceGroupCappedContextKey = IsWorkspaceGroupCappedContext.bindTo(contextKeyService);
	}

	private _handleSessionOpened(session: ISession): void {
		const comparison = this.sessionComparisonService.getComparisonForSession(session.resource);
		// The open may have been cancelled or superseded; only hide the side pane for a session that is actually shown.
		const isShown = this.sessionsService.visibleSessions.get().some(visible => visible?.sessionId === session.sessionId);
		if (comparison && comparison.archivedAt === undefined && isShown) {
			this.layoutService.hideSidePane();
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
		const inboxEmptyLabel = DOM.append(sessionsContent, $('.agent-sessions-inbox-empty-label'));

		// Container for the tree's find widget (toggled by the toolbar's Find action)
		const findWidgetContainer = this.findWidgetContainer = DOM.append(header.row, $('.agent-sessions-find-widget-container'));
		findWidgetContainer.style.display = 'none';

		// Reserve DOM slot for mobile filter chips (phone layout only).
		// The actual widget is created after sessionsControl is available.
		const filterChipsContainer = isPhoneLayout(this.layoutService)
			? DOM.append(sessionsContent, $('.mobile-session-filter-chips-slot'))
			: undefined;

		// Sessions List Control
		this.sessionsControlContainer = DOM.append(sessionsContent, $('.agent-sessions-control-container'));
		const openSession = (resource: URI, preserveFocus: boolean, sideBySide: boolean): void => {
			const session = this.sessionsManagementService.getSession(resource);
			if (!session) {
				onUnexpectedError(new Error(`Unable to open session because '${resource.toString()}' is not available`));
				return;
			}
			const onOpened = () => this._handleSessionOpened(session);
			const opening = sideBySide
				? this.sessionsService.openSessionToSide(session, { preserveFocus, source: 'sessionsList', forceMainChat: true })
				: this.sessionsService.openSession(session.resource, { preserveFocus, source: 'sessionsList', forceMainChat: true });
			opening.then(onOpened).catch(onUnexpectedError);
		};
		const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(SessionsList, this.sessionsControlContainer, {
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
			grouping: () => this.currentGrouping,
			sorting: () => this.currentSorting,
			inbox: () => this.currentInbox,
			compact: () => this.currentCompact,
			showNavigationShortcuts: () => this.customizationsPresentation === 'treatment',
			customizationsCount: this.customizationsNavigationState.totalCount,
			customizationMigrationsAvailable: this.customizationsNavigationState.migrationAvailable,
			navigationContainer,
			onDidChangeNavigationHeight: () => this.layoutSidebarSplitView(),
			focusNewSessionInput: () => this.sessionsPartService.focusSession(this.sessionsService.activeSession.get()),
			findWidgetContainer,
			onSessionOpen: openSession,
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
		const storageCleanupNotice = this._register(this.instantiationService.createInstance(SessionStorageCleanupNotice, () => sessionsControl.focus(), status));
		sessionsContent.appendChild(storageCleanupNotice.domNode);
		for (const notice of createSessionsListNotices(this.instantiationService, {
			container: sessionsContent,
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
		})) { this._register(notice); }
		this._register(this.onDidChangeBodyVisibility(visible => sessionsControl.setVisible(visible)));
		this.archiveNotification = this._register(this.instantiationService.createInstance(SessionsListNotification, sessionsContent, () => sessionsControl.focus()));

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
		this.registerArchivedFilter(sessionsControl);

		const updateInboxEmptyLabel = () => {
			const state = sessionsControl.getInboxEmptyState();
			const emptyLabel = state === SessionsInboxEmptyState.EmptyAfterPinned || state === SessionsInboxEmptyState.RunningAfterPinned
				? undefined
				: getSessionsInboxEmptyLabel(state);
			inboxEmptyLabel.textContent = emptyLabel ?? '';
			inboxEmptyLabel.classList.toggle('visible', emptyLabel !== undefined);
		};

		// Refresh sessions when window gets focus to compensate for missing events
		this._register(this.hostService.onDidChangeFocus(hasFocus => {
			if (hasFocus) {
				sessionsControl.refresh();
			}
		}));

		// Listen to list updates and restore selection if nothing is selected
		this._register(sessionsControl.onDidUpdate(() => {
			updateInboxEmptyLabel();
			if (!sessionsControl.hasFocusOrSelection()) {
				this.restoreLastSelectedSession();
			}
		}));
		updateInboxEmptyLabel();

		if (filterChipsContainer) {
			const chips = this._register(new MobileSessionFilterChips(filterChipsContainer));
			this._register(chips.onDidRequestSortGroup(() => {
				this.openSortGroupSheet();
			}));
			this._register(chips.onDidRequestFind(() => {
				this.openFind();
			}));
		}

		// When the active session changes, reveal it in the sessions list.
		this._register(autorun(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
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
			const treatment = this.separateNavigation.read(reader);
			const sentiment = this.chatEntitlementService.sentimentObs.read(reader);
			const aiEnabled = this.scopedContextKeyService.contextMatchesRules(ChatContextKeys.enabled);
			const presentation = getCustomizationsPresentation(isPhoneLayout(this.layoutService), aiEnabled, sentiment.hidden === true, treatment);
			this.updateCustomizationsPresentation(presentation);
		}));

		const updateSplitViewStyles = () => {
			const borderColor = this.themeService.getColorTheme().getColor(PANEL_SECTION_BORDER);
			this.sidebarSplitView?.style({ separatorBorder: borderColor ?? Color.transparent });
		};
		updateSplitViewStyles();
		this._register(this.themeService.onDidColorThemeChange(updateSplitViewStyles));

		const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
		const listModelChanged = observableSignalFromEvent(this, this.sessionsListModelService.onDidChange);
		const runningSessions = derivedOpts({ owner: this }, reader => {
			sessionsChanged.read(reader);
			listModelChanged.read(reader);
			if (!this.sessionsListModelService.inboxViewEnabled.read(reader)) {
				return [];
			}
			return this.sessionsManagementService.getSessions().filter(session =>
				session.status.read(reader) === SessionStatus.InProgress
				&& !session.isArchived.read(reader)
				&& session.isAutomation?.read(reader) !== true
			);
		});
		const deferredSessions = (disposition: SessionInboxDisposition) => derivedOpts({ owner: this }, reader => {
			sessionsChanged.read(reader);
			listModelChanged.read(reader);
			if (!this.sessionsListModelService.inboxViewEnabled.read(reader)) {
				return [];
			}
			return this.sessionsManagementService.getSessions()
				.filter(session =>
					this.sessionsListModelService.getSessionInboxDisposition(session) === disposition
					&& session.status.read(reader) !== SessionStatus.InProgress
					&& !session.isArchived.read(reader)
					&& session.isAutomation?.read(reader) !== true
				)
				.sort((a, b) => b.updatedAt.read(reader).getTime() - a.updatedAt.read(reader).getTime());
		});
		const bottomSections = DOM.append(sessionsContainer, $('.agent-sessions-bottom-sections'));
		this.runningSection = this._register(this.instantiationService.createInstance(
			SessionsRunningSection,
			bottomSections,
			runningSessions,
			() => this.currentCompact,
			() => this.layoutSidebarSplitView(),
			openSession,
			this.getLocationBasedColors().listOverrideStyles,
		));
		this.onHoldSection = this._register(this.instantiationService.createInstance(
			SessionsDeferredSection,
			bottomSections,
			deferredSessions(SessionInboxDisposition.OnHold),
			SessionInboxDisposition.OnHold,
			() => this.currentCompact,
			() => this.layoutSidebarSplitView(),
			openSession,
			this.getLocationBasedColors().listOverrideStyles,
		));
		this.readyToMergeSection = this._register(this.instantiationService.createInstance(
			SessionsDeferredSection,
			bottomSections,
			deferredSessions(SessionInboxDisposition.ReadyToMerge),
			SessionInboxDisposition.ReadyToMerge,
			() => this.currentCompact,
			() => this.layoutSidebarSplitView(),
			openSession,
			this.getLocationBasedColors().listOverrideStyles,
		));

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
		const header = renderSessionsHeader(parent, phoneLayout, this.instantiationService, this.scopedContextKeyService, disposables, () => this.sessionsControl?.reportArchivedFilterShown());
		this.sessionsHeaders.add(header);
		disposables.add(toDisposable(() => this.sessionsHeaders.delete(header)));
		if (!phoneLayout) {
			header.label.textContent = getSessionsViewTitle(this.currentInbox);
		}
		this.updateHeaderLayout();
		return header;
	}

	private updateSessionsHeaderLabels(): void {
		const title = getSessionsViewTitle(this.currentInbox);
		for (const header of this.sessionsHeaders) {
			if (!header.row.classList.contains('phone-layout-empty')) {
				header.label.textContent = title;
			}
		}
	}

	private updateCustomizationsPresentation(presentation: CustomizationsPresentation): void {
		if (this.customizationsPresentation === presentation) {
			return;
		}

		const customizationsFocused = this._customizationsWidget?.hasFocus() === true || this.sessionsControl?.isCustomizationsFocused() === true;
		const automationsFocused = this.sessionsControl?.isAutomationsFocused() === true;
		const wasTreatment = this.customizationsPresentation === 'treatment';
		this.customizationsPresentation = presentation;
		this.sessionsListRearrangeContext.set(presentation === 'treatment');
		this.customizationsNavigationVisible.set(presentation === 'treatment', undefined);
		this.updateHeaderLayout();

		if (wasTreatment !== (presentation === 'treatment')) {
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
		const activeSession = this.sessionsService.activeSession.get();
		if (activeSession && this.sessionsControl) {
			this.sessionsControl.reveal(activeSession.resource);
		}
	}

	private readonly archivedFilterRegistration = this._register(new DisposableStore());

	private registerSessionFilters(sessionsControl: SessionsList): void {
		const changed = observableSignalFromEvent(this, Event.any(
			this.sessionsManagementService.onDidChangeSessions,
			this.sessionsManagementService.onDidChangeSessionTypes,
			this.sessionsProvidersService.onDidChangeProviders,
			sessionsControl.filters.onDidChange,
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
			const includedEnvironments = [...environmentLabels].filter(([id]) => !sessionsControl.filters.isExcluded({ kind: 'environment', id }));
			const scopedOptions = options
				.filter(option => option.filter.kind !== 'application' || !sessionsControl.filters.isExcluded({ kind: 'environment', id: option.filter.environment }))
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
		this.filterContextKeys.set(archivedContextKey.key, { key: archivedContextKeyInstance, getDefault: () => false });

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

		// Reset filter action
		const filterContextKeys = this.filterContextKeys;
		const workspaceGroupCappedContextKey = this.workspaceGroupCappedContextKey;
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
				sessionsControl.resetFilters();
				for (const { key, getDefault } of filterContextKeys.values()) {
					key.set(getDefault());
				}
				workspaceGroupCappedContextKey?.set(sessionsControl.isWorkspaceGroupCapped());
			}
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.currentBodyHeight = height;
		this.currentBodyWidth = width;
		this.updateHeaderLayout();
		this.updateCustomizationsPresentation(getCustomizationsPresentation(
			isPhoneLayout(this.layoutService),
			this.scopedContextKeyService.contextMatchesRules(ChatContextKeys.enabled),
			this.chatEntitlementService.sentiment.hidden === true,
			this.separateNavigation.get(),
		));
		this.layoutSidebarSplitView();

		if (this.sidebarSplitView || !this.sessionsControl || !this.sessionsControlContainer) {
			return;
		}

		this.sessionsControl.layout(this.sessionsControlContainer.offsetHeight, width);
	}

	private layoutSidebarSplitView(): void {
		this.runningSection?.layout(this.currentBodyWidth);
		this.onHoldSection?.layout(this.currentBodyWidth);
		this.readyToMergeSection?.layout(this.currentBodyWidth);
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

	getFocusedSessions(): readonly ISession[] | undefined {
		return this.runningSection?.getFocusedSessions()
			?? this.onHoldSection?.getFocusedSessions()
			?? this.readyToMergeSection?.getFocusedSessions()
			?? this.sessionsControl?.getFocusedSessions();
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
	 * Phone-only: present a bottom sheet with the four sort/group toggles.
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
				checked: this.currentGrouping === SessionsGrouping.Workspace,
				group: 'group',
				groupTitle: groupTitle,
			},
			{
				id: SessionsGrouping.Date,
				label: localize('groupByTime', "Group by Time"),
				checked: this.currentGrouping === SessionsGrouping.Date,
				group: 'group',
			},
			{
				id: INBOX_VIEW_SHEET_ID,
				label: localize('inboxView', "Inbox View"),
				checked: this.currentInbox,
				group: 'view',
				groupTitle: localize('sortGroupSheet.view', "View"),
			},
		];

		showMobileSortGroupSheet(this.layoutService.mainContainer, localize('sortGroupSheet.title', "Sort"), items).then(selectedId => {
			if (!selectedId) {
				return;
			}
			if (selectedId === SessionsSorting.Created || selectedId === SessionsSorting.Updated) {
				this.setInbox(false);
				this.setSorting(selectedId);
			} else if (selectedId === SessionsGrouping.Workspace || selectedId === SessionsGrouping.Date) {
				this.setInbox(false);
				this.setGrouping(selectedId);
			} else if (selectedId === INBOX_VIEW_SHEET_ID) {
				this.setInbox(!this.currentInbox);
			}
		});
	}

	setGrouping(grouping: SessionsGrouping): void {
		if (this.currentGrouping === grouping) {
			return;
		}

		this.currentGrouping = grouping;
		this.storageService.store(GROUPING_STORAGE_KEY, this.currentGrouping, StorageScope.PROFILE, StorageTarget.USER);
		this.groupingContextKey?.set(this.currentGrouping);
		this.sessionsControl?.resetSectionCollapseState();
		this.sessionsControl?.update(true);
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
		this.runningSection?.setCompact();
		this.onHoldSection?.setCompact();
		this.readyToMergeSection?.setCompact();
	}

	toggleCompact(): void {
		this.setCompact(!this.currentCompact);
	}

	private get currentInbox(): boolean {
		return this.sessionsListModelService.inboxViewEnabled.get();
	}

	setInbox(inbox: boolean): void {
		if (this.currentInbox === inbox) {
			return;
		}

		this.sessionsListModelService.setInboxViewEnabled(inbox);
		this.inboxContextKey?.set(inbox);
		this.updateSessionsHeaderLabels();
		this.sessionsControl?.update(true);
	}

	toggleInbox(): void {
		this.setInbox(!this.currentInbox);
	}
}
