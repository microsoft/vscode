/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionsViewPane.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { getOrSet } from '../../../../../base/common/map.js';
import { autorun, derived, derivedOpts, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { getComparisonKey } from '../../../../../base/common/resources.js';
import { Orientation } from '../../../../../base/browser/ui/sash/sash.js';
import { IView, Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../../base/common/color.js';
import { ChatViewId } from '../../../chat/browser/chat.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { FocusedViewContext, IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { createDecorator, IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { SyncDescriptor0 } from '../../../../../platform/instantiation/common/descriptors.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
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
import { localize, localize2 } from '../../../../../nls.js';
import { SessionsList } from './sessionsList.js';
import { IPendingSessionItem } from './pendingSessions.js';
import { SessionsGrouping, SessionsSorting } from './sessionsListCommon.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionComparisonService } from '../../common/sessionComparison.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { IWorkspaceFolderRepositories } from '../workspaceFolderRepositories.js';
import { SessionsInScope } from '../sessionScope.js';
import { SessionsWindowScopeController } from './sessionsWindowScopeController.js';
import { getSessionFilterActionId, getSessionFilterEnvironments, getSessionFilterOptions, ISessionFilterOption, listsQuickChatsIn, sessionFilterKey, SessionsWorktreeOpener } from './sessionsListFilters.js';
import { AICustomizationShortcutsWidget } from '../aiCustomizationShortcutsWidget.js';
import { AgentHostShortcutsWidget } from '../agentHostShortcutsWidget.js';
import { Action2, IMenuService, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { getFlatContextMenuActions, MenuEntryActionViewItem, SubmenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IActionViewItem } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { IAction } from '../../../../../base/common/actions.js';
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
import { IChatScheduledRequest } from '../../../chat/common/model/chatViewModel.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IToolBarResponsiveBehaviorOptions } from '../../../../../base/browser/ui/toolbar/toolbar.js';
import { NewSplitButtonActionViewItem } from '../newSplitButton/newSplitButtonActionViewItem.js';
import { IWorkspaceContextService, WorkbenchMode } from '../../../../../platform/workspace/common/workspace.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { Menus, SessionsViewShowGroup } from '../menus.js';
import { MobileSessionFilterChips } from '../mobile/mobileSessionFilterChips.js';
import { IMobileSortGroupSheetItem, showMobileSortGroupSheet } from '../mobile/mobileSortGroupSheet.js';
import { isPhoneLayout } from '../../../../browser/parts/sessions/mobileLayout.js';
import { IsPhoneLayoutContext, SessionsListRearrangeContext, SessionWorkspacesEnabledContext } from '../../common/contextkeys.js';
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
import { ISessionsListUndoService } from '../sessionsListUndoService.js';
import { SessionsInboxScope } from './sessionsInboxScope.js';
import { readPaneSessions } from '../../../../services/sessions/browser/sessionGridPane.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { ChatCustomizationsLocation, resolveChatCustomizationsLocation } from '../../../chat/common/customizationsLocation.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';

const $ = DOM.$;
export const SessionsViewId = 'sessions.workbench.view.sessionsView';

/** The storage keys under which a Sessions view remembers its grouping and the grouping Inbox returns to. */
export interface ISessionsViewGroupingStorageKeys {
	readonly grouping: string;
	readonly nonInboxGrouping: string;
	/** Where the grouping and the grouping Inbox returns to are stored, such as only on this machine; by default, for the user. */
	readonly target?: StorageTarget;
	/**
	 * A key whose grouping the view starts with while it has not stored its own, such as the one it stored before it had its own
	 * keys, which the view then stores as its own once. Only a grouping other than Inbox is taken, and the key is only read.
	 */
	readonly fallbackGrouping?: string;
	/**
	 * Where it is remembered that Inbox was left while the view was not there to leave it, such as as `keptBy` turned off, and
	 * the view went: the view then opens at the grouping Inbox returns to, unless the window's workspace keeps `keptBy` on. The
	 * stored grouping stays Inbox for such a window until the view stores a grouping again, which forgets this.
	 */
	readonly inboxLeft?: { readonly key: string; readonly keptBy: string };
}

const SEPARATE_GROUPS_AND_WORKSPACES_STORAGE_KEY = 'sessionsViewPane.separateGroupsAndWorkspaces';
/** Whether Group by Workspace separates groups and workspaces for a user who has not chosen. */
const DEFAULT_SEPARATE_GROUPS_AND_WORKSPACES = false;
/** The grouping that listed custom groups and workspaces under headers of their own, which Group by Workspace now does as an option. */
export const LEGACY_WORKSPACES_AND_GROUPS_GROUPING = 'workspacesAndGroups';
/** The phone sheet's row that turns {@link SEPARATE_GROUPS_AND_WORKSPACES_LABEL} on or off. */
const SEPARATE_GROUPS_AND_WORKSPACES_SHEET_ITEM = 'separateGroupsAndWorkspaces';

const DEFAULT_GROUPING_STORAGE_KEYS: ISessionsViewGroupingStorageKeys = {
	grouping: 'sessionsViewPane.grouping',
	nonInboxGrouping: 'sessionsViewPane.nonInboxGrouping',
};

/**
 * The grouping a Sessions view remembers and the grouping Inbox returns to, under its {@link ISessionsViewGroupingStorageKeys keys}
 * (by default, those of the Agents window): the one owner of how they are stored, which the view reads and writes them through,
 * and which can leave Inbox for the view while it is not there.
 */
export class SessionsViewGroupingState {

	private readonly keys: ISessionsViewGroupingStorageKeys;

	constructor(
		keys: ISessionsViewGroupingStorageKeys | undefined,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		this.keys = keys ?? DEFAULT_GROUPING_STORAGE_KEYS;
	}

	/** The grouping Inbox returns to, of those `offered`, else `fallback`. */
	readNonInboxGrouping(offered: readonly SessionsGrouping[], fallback: SessionsGrouping): SessionsGrouping {
		return getStoredSessionsGrouping(this.storageService.get(this.keys.nonInboxGrouping, StorageScope.PROFILE), offered.filter(grouping => grouping !== SessionsGrouping.Inbox)) ?? fallback;
	}

	/**
	 * The grouping the view opens with, of those `offered`: the one stored, else, where none is stored and there is a fallback
	 * key, the grouping other than Inbox stored there (or `fallback`), which `seed` says the view is to store as its own. Inbox
	 * left while the view was not there opens at the grouping Inbox returns to.
	 */
	readGrouping(offered: readonly SessionsGrouping[], fallback: SessionsGrouping): { readonly grouping: SessionsGrouping | undefined; readonly seed: boolean } {
		const stored = this.storageService.get(this.keys.grouping, StorageScope.PROFILE);
		if (stored === undefined && this.keys.fallbackGrouping) {
			const seeded = getStoredSessionsGrouping(this.storageService.get(this.keys.fallbackGrouping, StorageScope.PROFILE), offered.filter(grouping => grouping !== SessionsGrouping.Inbox));
			return { grouping: seeded ?? fallback, seed: true };
		}
		const grouping = getStoredSessionsGrouping(stored, offered);
		const inboxLeft = this.keys.inboxLeft;
		if (grouping === SessionsGrouping.Inbox && inboxLeft && this.storageService.getBoolean(inboxLeft.key, StorageScope.PROFILE, false)
			&& this.configurationService.inspect<boolean>(inboxLeft.keptBy).workspaceValue !== true) {
			return { grouping: this.readNonInboxGrouping(offered, fallback), seed: false };
		}
		return { grouping, seed: false };
	}

	/**
	 * Whether Group by Workspace lists the custom groups and the workspaces under headers of their own, as the user chose, else
	 * by default. It takes effect only while workspaces are enabled.
	 */
	get separateGroupsAndWorkspaces(): boolean {
		const stored = this.storageService.get(SEPARATE_GROUPS_AND_WORKSPACES_STORAGE_KEY, StorageScope.PROFILE);
		return stored === 'true' || stored === 'false' ? stored === 'true' : DEFAULT_SEPARATE_GROUPS_AND_WORKSPACES;
	}

	/** Fires as the choice whether to separate groups and workspaces is stored, by any view of the profile, until `disposables` is disposed. */
	onDidChangeSeparateGroupsAndWorkspaces(disposables: DisposableStore): Event<void> {
		return Event.signal(this.storageService.onDidChangeValue(StorageScope.PROFILE, SEPARATE_GROUPS_AND_WORKSPACES_STORAGE_KEY, disposables));
	}

	setSeparateGroupsAndWorkspaces(separate: boolean): void {
		// One choice for every view of the profile, whichever view's keys stay on the machine
		this.storageService.store(SEPARATE_GROUPS_AND_WORKSPACES_STORAGE_KEY, separate, StorageScope.PROFILE, StorageTarget.USER);
	}

	/**
	 * Stores a stored choice of the former Workspaces & Groups grouping, as the grouping or as the one Inbox returns to, as
	 * Group by Workspace with groups and workspaces separate, whether or not workspaces are enabled.
	 */
	migrateWorkspacesAndGroupsGrouping(): void {
		let migrated = false;
		for (const key of [this.keys.grouping, this.keys.nonInboxGrouping]) {
			if (this.storageService.get(key, StorageScope.PROFILE) === LEGACY_WORKSPACES_AND_GROUPS_GROUPING) {
				this.storageService.store(key, SessionsGrouping.Workspace, StorageScope.PROFILE, this.keys.target ?? StorageTarget.USER);
				migrated = true;
			}
		}
		if (migrated) {
			this.setSeparateGroupsAndWorkspaces(true);
		}
	}

	/** Stores the grouping the view opens with, without forgetting that Inbox was left. */
	seedGrouping(grouping: SessionsGrouping): void {
		this.storageService.store(this.keys.grouping, grouping, StorageScope.PROFILE, this.keys.target ?? StorageTarget.USER);
	}

	/** Stores the grouping the view changed to and, where it left a grouping other than Inbox, that one as the one Inbox returns to. */
	storeGrouping(grouping: SessionsGrouping, left: SessionsGrouping | undefined): void {
		const target = this.keys.target ?? StorageTarget.USER;
		if (left !== undefined && left !== SessionsGrouping.Inbox) {
			this.storageService.store(this.keys.nonInboxGrouping, left, StorageScope.PROFILE, target);
		}
		this.storageService.store(this.keys.grouping, grouping, StorageScope.PROFILE, target);
		if (this.keys.inboxLeft) {
			this.storageService.remove(this.keys.inboxLeft.key, StorageScope.PROFILE);
		}
	}

	/**
	 * Leaves the stored Inbox while the view is not there to leave it: the view then opens at the grouping Inbox returns to,
	 * except in a window whose workspace keeps the setting the keys name on, for which the stored Inbox stays.
	 */
	leaveInbox(): void {
		if (this.keys.inboxLeft && this.storageService.get(this.keys.grouping, StorageScope.PROFILE) === SessionsGrouping.Inbox) {
			this.storageService.store(this.keys.inboxLeft.key, true, StorageScope.PROFILE, this.keys.target ?? StorageTarget.USER);
		}
	}
}

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

/** The Toggle Inbox action, which the view's title shows. */
const INBOX_MODE_ACTION_ID = 'sessionsViewPane.inboxMode';

/**
 * Toggle Inbox in a host's title, such as the Chat view's, which shows as pressed while Inbox is on. Toggling rebuilds the
 * title's actions, so the view hands the focus of a toggle that goes on to the one that replaces it.
 */
class InboxToggleActionViewItem extends MenuEntryActionViewItem {

	onDispose: ((hadFocus: boolean) => void) | undefined;

	override render(container: HTMLElement): void {
		super.render(container);
		// The title's toolbar does not show toggled actions as pressed; this one does
		this.element?.classList.add('sessions-inbox-toggle');
	}

	hasFocus(): boolean {
		return !!this.element && DOM.isAncestorOfActiveElement(this.element);
	}

	isShown(): boolean {
		return !!this.element?.isConnected && this.element.getClientRects().length > 0;
	}

	override dispose(): void {
		this.onDispose?.(this.hasFocus());
		super.dispose();
	}
}

export const ISessionsViewLocator = createDecorator<ISessionsViewLocator>('sessionsViewLocator');

/** Knows the Sessions views that a host, such as another view, embeds instead of registering them with {@link SessionsViewId}. */
export interface ISessionsViewLocator {
	readonly _serviceBrand: undefined;

	/** Fires as an embedded Sessions view registers or goes. */
	readonly onDidChange: Event<void>;

	/** Registers an embedded Sessions view; the latest registered view is the active one. */
	register(view: SessionsView): IDisposable;

	getEmbeddedView(): SessionsView | undefined;
}

export class SessionsViewLocator implements ISessionsViewLocator {

	declare readonly _serviceBrand: undefined;

	private readonly views: SessionsView[] = [];

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	register(view: SessionsView): IDisposable {
		this.views.push(view);
		this._onDidChange.fire();
		return toDisposable(() => {
			const index = this.views.indexOf(view);
			if (index >= 0) {
				this.views.splice(index, 1);
				this._onDidChange.fire();
			}
		});
	}

	getEmbeddedView(): SessionsView | undefined {
		return this.views[this.views.length - 1];
	}
}

registerSingleton(ISessionsViewLocator, SessionsViewLocator, InstantiationType.Delayed);

/**
 * Resolves the Sessions view that the actions of the sessions list act on: the view of {@link SessionsViewId}, or else the one that a host embeds.
 * It takes its services now, so that the returned function can be called after the accessor is no longer valid.
 */
export function getSessionsViewResolver(accessor: ServicesAccessor): () => SessionsView | undefined {
	const viewsService = accessor.get(IViewsService);
	const locator = accessor.get(ISessionsViewLocator);
	return () => viewsService.getViewWithId<SessionsView>(SessionsViewId) ?? locator?.getEmbeddedView();
}

/**
 * The Sessions view to act on: the view registered with its id, opened as a view is so that it shows, else the view that a host
 * embeds. A registered view whose container is not created yet is not instantiated, so only opening it tells it from none.
 */
export async function openSessionsView(viewsService: IViewsService, locator: ISessionsViewLocator | undefined): Promise<SessionsView | undefined> {
	return await viewsService.openView<SessionsView>(SessionsViewId) ?? locator?.getEmbeddedView();
}

export function getActiveSessionsView(accessor: ServicesAccessor): SessionsView | undefined {
	return getSessionsViewResolver(accessor)();
}

/** Whether the window shows the Sessions view of an editor window, wherever it shows: in the Agents view or in the Chat view. */
export const EditorWindowSessionsContext = new RawContextKey<boolean>('editorWindowSessions', false);

/**
 * Whether the editor window has a Sessions view that offers Inbox, such as the one the Chat view embeds: the window-wide state,
 * as the Command Palette needs it wherever the focus is, which the view's own groupings do not tell outside the view.
 */
export const EditorWindowSessionsViewOffersInboxContext = new RawContextKey<boolean>('editorWindowSessionsViewOffersInbox', false);

/** Whether the focus is inside a Sessions view: set on the view's own scope, so it holds wherever the view is embedded. */
export const InSessionsViewContext = new RawContextKey<boolean>('inSessionsView', false);

/** The focus is in a Sessions view, whether it is the view of {@link SessionsViewId} or one that a host embeds. */
export const SessionsViewFocusedContext = ContextKeyExpr.or(FocusedViewContext.isEqualTo(SessionsViewId), InSessionsViewContext.isEqualTo(true))!;

export const SessionsViewGroupingContext = new RawContextKey<string>('sessionsViewPane.grouping', SessionsGrouping.Workspace);
export const SessionsViewSortingContext = new RawContextKey<string>('sessionsViewPane.sorting', SessionsSorting.Created);
/** Whether the Chat view shows the shared sessions list, whose actions contribute to the title of the Chat view. */
export const ChatViewSessionsListContext = new RawContextKey<boolean>('chatViewSessionsList', false);
/** The `when` of the actions of the shared sessions list in the title of the Chat view. */
export const ChatViewSessionsListTitleContext = ContextKeyExpr.and(ContextKeyExpr.equals('view', ChatViewId), ChatViewSessionsListContext, ChatContextKeys.enabled, ChatContextKeys.agentSessionsViewerVisible)!;
export const SessionsViewCompactContext = new RawContextKey<boolean>('sessionsViewPane.compact', false);
/** Whether Group by Workspace lists the custom groups and the workspaces under headers of their own, as the user chose. */
export const SessionsViewSeparateGroupsAndWorkspacesContext = new RawContextKey<boolean>('sessionsViewPane.separateGroupsAndWorkspaces', DEFAULT_SEPARATE_GROUPS_AND_WORKSPACES);
/** The label of the option of Group by Workspace that lists the custom groups and the workspaces under headers of their own. */
export const SEPARATE_GROUPS_AND_WORKSPACES_LABEL = localize2('separateGroupsAndWorkspaces', "Separate Groups and Workspaces");
export const IsWorkspaceGroupCappedContext = new RawContextKey<boolean>('sessionsViewPane.workspaceGroupCapped', true);
/** The groupings a Sessions view offers by default, as the Agents window's does: all of them. */
export const DEFAULT_SESSIONS_GROUPINGS: readonly SessionsGrouping[] = Object.values(SessionsGrouping);

/**
 * Per grouping, the context key that says whether the Sessions view does not offer it. Where no Sessions view binds them,
 * such as in the Command Palette outside one, a view offers {@link DEFAULT_SESSIONS_GROUPINGS}.
 */
const groupingUnavailableContexts = new Map(Object.values(SessionsGrouping).map(grouping => [grouping, new RawContextKey<boolean>(`sessionsViewPane.groupingUnavailable.${grouping}`, false)]));

/** Whether the Sessions view offers `grouping`, such as in its Grouping menu. */
export function sessionsViewOffersGrouping(grouping: SessionsGrouping): ContextKeyExpression {
	return groupingUnavailableContexts.get(grouping)!.negate();
}

/** Binds in `contextKeyService` that a Sessions view offers the `offered` groupings, and no others. */
export function bindSessionsViewGroupings(contextKeyService: IContextKeyService, offered: readonly SessionsGrouping[]): void {
	for (const [grouping, context] of groupingUnavailableContexts) {
		context.bindTo(contextKeyService).set(!offered.includes(grouping));
	}
}

/**
 * The grouping a stored value names, or `undefined` for a value this build does not know or this view does not offer:
 * a view keeps its default for a grouping that another view sharing the stored grouping offers, such as Workspace, which
 * the Sessions view of an editor window does not offer. The stored value stays as it is.
 */
export function getStoredSessionsGrouping(stored: string | undefined, groupings: readonly SessionsGrouping[]): SessionsGrouping | undefined {
	return groupings.find(grouping => grouping === stored);
}

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
		const actionsFit = scopedInstantiationService.createInstance(SessionsHeaderActionsFit, row);
		toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actions, Menus.SidebarSessionsHeader, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'sessionsView.header',
			toolbarOptions: { primaryGroup: group => group.startsWith('navigation') },
			responsiveBehavior: actionsFit.responsiveBehavior,
			actionViewItemProvider: (action, options) => onDidShowFilters && action instanceof SubmenuItemAction && action.item.submenu === Menus.SessionsViewFilter
				? scopedInstantiationService.createInstance(SessionsFilterActionViewItem, action, options, onDidShowFilters)
				: undefined,
		}));
		disposables.add(actionsFit.attach(toolbar));
	} else {
		row.classList.add('phone-layout-empty');
	}

	return { row, label, actions, toolbar };
}

/**
 * Fits the actions of the sessions header into its row, by their rendered widths. When they do not all fit, the New
 * split button hides its keybinding first; when they still do not fit, the other actions move into the overflow menu
 * from the end, and the New button moves last.
 */
class SessionsHeaderActionsFit {

	/** The class of the row while the New split button hides its keybinding. */
	static readonly COMPACT_NEW_BUTTON_CLASS = 'compact-new-button';

	private toolbar: MenuWorkbenchToolBar | undefined;

	/** The width the New split button needs without its keybinding, kept for while it is in the overflow menu. */
	private compactNewButtonWidth: number | undefined;

	readonly responsiveBehavior: IToolBarResponsiveBehaviorOptions;

	constructor(
		private readonly row: HTMLElement,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		this.responsiveBehavior = {
			enabled: true,
			kind: 'all',
			minItems: 0,
			overflowsLast: action => this.isNewMenu(action),
			actionMinWidth: 22,
			getActionMinWidth: action => this.isNewMenu(action) ? this.getCompactNewButtonWidth() : undefined,
			observedElement: row,
			getAvailableWidth: () => this.getAvailableWidth(),
		};
	}

	/**
	 * Fits the actions of `toolbar` whenever the row or the actions change size, or the keybindings change. A resize of the
	 * row fits them before it paints. Other changes fit them in the next frame: fitting changes the size of the actions
	 * again, which a resize observer cannot report in the frame it reports their resize, and a hidden keybinding changes
	 * no size.
	 */
	attach(toolbar: MenuWorkbenchToolBar): IDisposable {
		this.toolbar = toolbar;
		const store = new DisposableStore();
		const targetWindow = DOM.getWindow(this.row);
		const scheduledFit = store.add(new MutableDisposable());
		const scheduleFit = () => {
			scheduledFit.value ??= DOM.scheduleAtNextAnimationFrame(targetWindow, () => {
				scheduledFit.clear();
				this.fit();
			});
		};
		const observer = store.add(new DOM.DisposableResizeObserver('sessionsHeaderActionsFit', entries => {
			if (entries.some(entry => entry.target === this.row)) {
				scheduledFit.clear();
				this.fit();
			} else {
				scheduleFit();
			}
		}, targetWindow));
		store.add(this.keybindingService.onDidUpdateKeybindings(scheduleFit));
		store.add(observer.observe(this.row));
		store.add(observer.observe(toolbar.getElement()));
		store.add(toDisposable(() => this.toolbar = undefined));
		return store;
	}

	/**
	 * Lets the toolbar move actions that do not fit into its overflow menu, taking the New split button at its width without
	 * its keybinding, and then shows the keybinding if all actions fit with it.
	 */
	private fit(): void {
		const toolbar = this.toolbar;
		if (!toolbar) {
			return;
		}
		toolbar.relayout();
		const newButton = this.getNewButton();
		const compact = !!newButton && (toolbar.hasOverflowedPrimaryActions() || this.getWidthWithKeybinding(newButton) > this.getAvailableWidth());
		this.row.classList.toggle(SessionsHeaderActionsFit.COMPACT_NEW_BUTTON_CLASS, compact);
	}

	private getAvailableWidth(): number {
		return DOM.getContentWidth(this.row);
	}

	private isNewMenu(action: IAction): boolean {
		return action instanceof SubmenuItemAction && action.item.submenu === Menus.SidebarSessionsNew;
	}

	private getNewButton(): NewSplitButtonActionViewItem | undefined {
		const toolbar = this.toolbar;
		for (let index = 0; toolbar && index < toolbar.getItemsLength(); index++) {
			const viewItem = toolbar.getItemViewItem(index);
			if (viewItem instanceof NewSplitButtonActionViewItem) {
				return viewItem;
			}
		}
		return undefined;
	}

	/** The width of the New split button without its keybinding, or its last width while it has no view item, such as in the Inbox layout or the overflow menu. */
	private getCompactNewButtonWidth(): number | undefined {
		const newButton = this.getNewButton();
		if (newButton) {
			this.compactNewButtonWidth = this.measureCompactNewButton(newButton) ?? this.compactNewButtonWidth;
		}
		return this.compactNewButtonWidth;
	}

	private measureCompactNewButton(newButton: NewSplitButtonActionViewItem): number | undefined {
		const wasCompact = this.row.classList.contains(SessionsHeaderActionsFit.COMPACT_NEW_BUTTON_CLASS);
		this.row.classList.add(SessionsHeaderActionsFit.COMPACT_NEW_BUTTON_CLASS);
		try {
			return newButton.getMinimumWidth();
		} finally {
			this.row.classList.toggle(SessionsHeaderActionsFit.COMPACT_NEW_BUTTON_CLASS, wasCompact);
		}
	}

	/** The width the shown actions take, unshrunk, with the New split button showing its keybinding. */
	private getWidthWithKeybinding(newButton: NewSplitButtonActionViewItem): number {
		const actionsContainer = newButton.element?.parentElement;
		if (!actionsContainer) {
			return 0;
		}
		const wasCompact = this.row.classList.contains(SessionsHeaderActionsFit.COMPACT_NEW_BUTTON_CLASS);
		const items = [...actionsContainer.children].filter(DOM.isHTMLElement);
		const flexShrinks = items.map(item => item.style.flexShrink);
		this.row.classList.remove(SessionsHeaderActionsFit.COMPACT_NEW_BUTTON_CLASS);
		items.forEach(item => item.style.flexShrink = '0');
		try {
			// Fractional widths, as the integer scroll width can hide an overflow of less than a pixel
			const left = actionsContainer.getBoundingClientRect().left;
			return Math.max(0, ...items.map(item => item.getBoundingClientRect().right - left));
		} finally {
			items.forEach((item, index) => item.style.flexShrink = flexShrinks[index]);
			this.row.classList.toggle(SessionsHeaderActionsFit.COMPACT_NEW_BUTTON_CLASS, wasCompact);
		}
	}
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

/** The options of the Sessions view. */
export interface ISessionsViewOptions extends IViewPaneOptions {
	/**
	 * Whether the actions of the sessions header, such as New Session and Filter, show in the title of the view, as in an
	 * editor window, rather than in a header row of its own.
	 */
	readonly headerInTitle?: boolean;

	/** Whether it offers the customizations, such as a Customizations section; it does by default. */
	readonly showCustomizations?: boolean;

	/** Whether the sessions providers list only the sessions of a scope, such as of an editor window's folders. See the `scoped` option of the sessions list. */
	readonly scoped?: IObservable<boolean>;

	/**
	 * The groupings it offers, and the one it shows until one of them is chosen, such as when the chosen one is not offered;
	 * by default, {@link DEFAULT_SESSIONS_GROUPINGS}, and without a `default`, Workspace.
	 */
	readonly groupings?: { readonly offered: readonly SessionsGrouping[]; readonly default?: SessionsGrouping };

	/** Whether grouping by time lists the sessions without a workspace in the "Chats" section. See the sessions list's option. */
	readonly quickChatsInTimeGrouping?: boolean;

	/**
	 * What remembers its grouping and the grouping Inbox returns to, so that a view in another window, such as the Chat view
	 * of an editor window, remembers its own; by default, under the keys of the Agents window.
	 */
	readonly groupingState?: SyncDescriptor0<SessionsViewGroupingState>;

	/** Whether Inbox opens the next session that needs input after a reply or approval; it does by default. */
	readonly inboxAutoAdvance?: boolean;

	/**
	 * Whether the view leaves Inbox as Chat becomes unavailable, as its participant goes, so that Inbox does not stay on while its
	 * controls are hidden, nor come back stale; by default it stays in Inbox and only hides the controls until Chat is back.
	 */
	readonly leaveInboxWithoutChat?: boolean;
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
	private separateGroupsAndWorkspacesContextKey: IContextKey<boolean> | undefined;
	private workspaceGroupCappedContextKey: IContextKey<boolean> | undefined;
	/** Context keys of filter menu toggles, each with a reader of the list state it mirrors. */
	private readonly filterContextKeys = new Map<string, { key: IContextKey<boolean>; read: () => boolean }>();
	private currentBodyHeight = 0;
	private currentBodyWidth = 0;
	private didInitializePaneSizes = false;

	/** The host of the main window, whose session the list reveals. */
	private readonly _mainWindowHost: ISessionHost;

	private readonly headerInTitle: boolean;
	private readonly inboxToggles = new Set<InboxToggleActionViewItem>();
	private readonly hideCustomizations: boolean;
	private readonly groupings: ISessionsViewOptions['groupings'];
	private readonly groupingState: SessionsViewGroupingState;
	private readonly inboxAutoAdvance: boolean | undefined;
	private readonly leaveInboxWithoutChat: boolean | undefined;
	/**
	 * The grouping Inbox returns to in the Chat view ({@link ISessionsViewOptions.leaveInboxWithoutChat}): read as it opens or
	 * switches profile, so that another window entering Inbox from another grouping does not change where this one returns.
	 */
	private mountedNonInboxGrouping: SessionsGrouping | undefined;
	/**
	 * Whether the window switches to another profile, until Chat is back ({@link ISessionsViewOptions.leaveInboxWithoutChat}):
	 * meanwhile, its storage and its settings arrive in any order, and the view only shows what they hold, storing nothing.
	 */
	private inProfileTransition = false;
	private readonly quickChatsInTimeGrouping: boolean;
	private readonly scoped: IObservable<boolean> | undefined;
	private readonly windowScope: SessionsWindowScopeController;

	constructor(
		options: ISessionsViewOptions,
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
		@ISessionsViewLocator sessionsViewLocator: ISessionsViewLocator,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ISessionsListUndoService private readonly undoService: ISessionsListUndoService,
		@IWorkspaceFolderRepositories private readonly workspaceFolderRepositories: IWorkspaceFolderRepositories,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
	) {
		super(options.headerInTitle ? { ...options, titleMenuId: Menus.SidebarSessionsHeader } : options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this.headerInTitle = !!options.headerInTitle;
		this.hideCustomizations = options.showCustomizations === false;
		this.scoped = options.scoped;
		this.windowScope = this._register(instantiationService.createInstance(SessionsWindowScopeController));
		this._mainWindowHost = getMainWindowHost(sessionHostService);
		this.separateNavigation = observableConfigValue(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, false, configurationService);
		this.customizationsAtBottom = observableConfigValue(SESSIONS_SIDEBAR_CUSTOMIZATIONS_AT_BOTTOM_SETTING, false, configurationService);
		this.customizationsLocation = observableConfigValue<ChatCustomizationsLocation>(ChatConfiguration.ChatCustomizationsLocation, 'auto', configurationService);
		this.customizationsNavigationState = this._register(instantiationService.createInstance(CustomizationsNavigationState, this.customizationsNavigationVisible));
		this.sessionsListRearrangeContext = SessionsListRearrangeContext.bindTo(this.scopedContextKeyService);
		InSessionsViewContext.bindTo(this.scopedContextKeyService).set(true);

		// Restore persisted grouping
		this.groupings = options.groupings;
		this.groupingState = options.groupingState ? instantiationService.createInstance(options.groupingState) : instantiationService.createInstance(SessionsViewGroupingState, undefined);
		this.inboxAutoAdvance = options.inboxAutoAdvance;
		this.leaveInboxWithoutChat = options.leaveInboxWithoutChat;
		this.quickChatsInTimeGrouping = !!options.quickChatsInTimeGrouping;
		this.initializeGrouping();
		this.followProfileSwitches();
		// Registered once it knows its groupings, which whoever locates it asks about
		this._register(sessionsViewLocator.register(this));

		// Restore persisted sorting
		const storedSorting = this.storageService.get(SORTING_STORAGE_KEY, StorageScope.PROFILE);
		if (storedSorting && Object.values(SessionsSorting).includes(storedSorting as SessionsSorting)) {
			this.currentSorting = storedSorting as SessionsSorting;
		}
		this.currentCompact = this.storageService.getBoolean(COMPACT_STORAGE_KEY, StorageScope.PROFILE, false);
		logSessionsListCompactViewState(telemetryService, this.currentCompact);

		// Ensure context keys reflect restored state immediately
		bindSessionsViewGroupings(contextKeyService, this.offeredGroupings);
		this.groupingContextKey = SessionsViewGroupingContext.bindTo(contextKeyService);
		this.groupingContextKey.set(this.grouping);
		// Group by Workspace separates groups and workspaces only while workspaces are on
		this._register(contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([SessionWorkspacesEnabledContext.key, ChatContextKeys.enabled.key])) && this.grouping === SessionsGrouping.Workspace) {
				this.sessionsControl?.update(true);
			}
		}));
		this.sortingContextKey = SessionsViewSortingContext.bindTo(contextKeyService);
		this.sortingContextKey.set(this.currentSorting);
		this.compactContextKey = SessionsViewCompactContext.bindTo(contextKeyService);
		this.compactContextKey.set(this.currentCompact);
		this.separateGroupsAndWorkspacesContextKey = SessionsViewSeparateGroupsAndWorkspacesContext.bindTo(contextKeyService);
		this.separateGroupsAndWorkspacesContextKey.set(this.groupingState.separateGroupsAndWorkspaces);
		this.followSeparateGroupsAndWorkspaces();

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
		const barEnabled = this.windowScope.barShown;
		const repositories = this.workspaceFolderRepositories;
		const scope = new SessionsInScope(
			derived(this, reader => this.scoped?.read(reader) && !barEnabled.read(reader) ? repositories.folders.read(reader) : undefined),
			repositories.gitHubRepositories,
			() => this.sessionsManagementService.getSessions(),
			this.sessionsManagementService.onDidChangeSessions,
			this.uriIdentityService.extUri,
		);
		const sessionScope = scope.sessionIds;
		const pendingSessionScope = derived(this, reader => {
			const work = scope.work.read(reader);
			return work && ((item: IPendingSessionItem) => item.isQuickChat !== true && !!item.folderUri && work.worksInScope(item.folderUri));
		});
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
		// In the view's context, so that its keys, such as `inSessionsView`, apply in the list, also where a host embeds the view
		const listInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		const listsQuickChats = listsQuickChatsIn(this.workspaceContextService);
		const sessionsControl = this.sessionsControl = this._register(listInstantiationService.createInstance(SessionsList, this.sessionsControlContainer, {
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
			scheduledRequests: derived(this, reader => {
				const requests = new Map<string, IChatScheduledRequest[]>();
				for (const item of this.scheduledChatsService.items.read(reader)) {
					if (item.conversation) {
						const key = getComparisonKey(item.conversation.chatResource);
						requests.set(key, [...requests.get(key) ?? [], item]);
					}
				}
				return requests;
			}),
			sectionRowHeight: this.presentation.sectionRowHeight,
			titleOnlyQuickChatRowHeight: this.presentation.titleOnlyQuickChatRowHeight,
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
			grouping: () => this.grouping,
			sorting: () => this.currentSorting,
			compact: () => this.currentCompact,
			separateGroupsAndWorkspaces: () => this.separateGroupsAndWorkspaces,
			showNavigationShortcuts: () => this.navigationShortcutsVisible,
			showCustomizations: () => this.customizationsPresentation === 'treatment',
			customizationsCount: this.customizationsNavigationState.totalCount,
			customizationMigrationsAvailable: this.customizationsNavigationState.migrationAvailable,
			customizationsBadge: this.customizationsNavigationState.badge,
			navigationContainer,
			onDidChangeNavigationHeight: () => this.layoutSidebarSplitView(),
			pinnedCanvases: this.presentation.pinnedCanvases,
			focusNewSessionInput: () => this.sessionsService.focusActiveSession(),
			scoped: this.scoped,
			sessionScope,
			pendingSessionScope,
			scopeBar: barEnabled,
			findWidgetContainer,
			quickChatsInTimeGrouping: this.quickChatsInTimeGrouping,
			inboxAutoAdvance: this.inboxAutoAdvance,
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
			offersWorktreeFilter: this.workspaceContextService.getWorkbenchMode() !== WorkbenchMode.Agents,
			// A window about its own folders shows no chats without a workspace while it has a folder
			listsQuickChats: derived(reader => barEnabled.read(reader) || listsQuickChats.read(reader)),
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
		// The bar offers the workspaces of the sessions the list includes, before the bar's own pick narrows them
		const scopeSessions = derived(this, reader => {
			scopeChanged.read(reader);
			return this.sessionsManagementService.getSessions().filter(session => sessionsControl.isSessionInInventory(session, reader));
		});
		const scopeEnvironments = derived(this, reader => {
			scopeChanged.read(reader);
			return getSessionFilterEnvironments(this.sessionsProvidersService.getProviders(), reader);
		});
		const inboxScope = this._register(this.instantiationService.createInstance(SessionsInboxScope, inboxScopeContainer, sessionsControl.filters, scopeSessions,
			derived(reader => scopeEnvironments.read(reader).environments),
			derived(reader => scopeEnvironments.read(reader).localEnvironmentIds),
			derived(reader => { scopeChanged.read(reader); return this.grouping === SessionsGrouping.Inbox; })));
		this.windowScope.setScopeBarFilters(sessionsControl.filters);
		this._register(autorun(reader => {
			scopeChanged.read(reader);
			const hidden = this.chatEntitlementService.sentimentObs.read(reader).hidden;
			if (inboxScope.setVisible(barEnabled.read(reader) || (this.grouping === SessionsGrouping.Inbox && this.windowScope.isScopeBarWindow.read(reader) && !hidden && this.scopedContextKeyService.contextMatchesRules(ChatContextKeys.enabled)))) {
				sessionsControl.focus();
			}
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
		const listNotification = this._register(this.instantiationService.createInstance(SessionsListNotification, sessionsContent, () => sessionsControl.focus()));
		this.listNotification = listNotification;
		// A collapsed view, or one in a hidden part of the window, would count down a notice the user can't see.
		listNotification.setVisible(this.isBodyVisible());
		this._register(this.onDidChangeBodyVisibility(() => listNotification.setVisible(this.isBodyVisible())));
		this._register(this.undoService.registerPresenter({
			isVisible: () => this.isBodyVisible(),
			show: notice => listNotification.show(notice),
		}));

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
		this.registerScheduledFilter(sessionsControl);
		this.registerArchivedFilter(sessionsControl);
		this.registerResetFiltersAction();

		// Refresh sessions when window gets focus to compensate for missing events: while the list shows, else as it shows
		let refreshWhenVisible = false;
		this._register(this.hostService.onDidChangeFocus(hasFocus => {
			if (!hasFocus) {
				return;
			}
			if (this.isBodyVisible()) {
				sessionsControl.refresh();
			} else {
				refreshWhenVisible = true;
			}
		}));
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible && refreshWhenVisible) {
				refreshWhenVisible = false;
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
			const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
			const chips = this._register(scopedInstantiationService.createInstance(MobileSessionFilterChips, filterChipsContainer));
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

	/**
	 * Gives the focus that Toggle Inbox in the host's title lost as it went to the toggle that replaces it, or where none shows,
	 * such as where Inbox is no longer offered, to the view's list. Focus that moved elsewhere stays.
	 */
	private handOverInboxToggleFocus(): void {
		// The title renders the toggle that replaces it right away, if at all
		queueMicrotask(() => {
			const activeElement = DOM.getActiveElement();
			if (DOM.isHTMLElement(activeElement) && activeElement.isConnected && activeElement !== activeElement.ownerDocument.body) {
				return;
			}
			const toggle = Iterable.find(this.inboxToggles, item => item.isShown());
			if (toggle) {
				toggle.focus();
			} else if (!this._store.isDisposed && this.isBodyVisible()) {
				this.sessionsControl?.focus();
			}
		});
	}

	override createActionViewItem(action: IAction, options?: IDropdownMenuActionViewItemOptions): IActionViewItem | undefined {
		if (this.headerInTitle && action instanceof SubmenuItemAction && action.item.submenu === Menus.SessionsViewFilter) {
			return this.instantiationService.createInstance(SessionsFilterActionViewItem, action, options, () => this.sessionsControl?.reportFilterMenuShown());
		}
		if (this.headerInTitle && action instanceof MenuItemAction && action.id === INBOX_MODE_ACTION_ID) {
			const item = this.instantiationService.createInstance(InboxToggleActionViewItem, action, options);
			this.inboxToggles.add(item);
			item.onDispose = hadFocus => {
				this.inboxToggles.delete(item);
				if (hadFocus) {
					this.handOverInboxToggleFocus();
				}
			};
			return item;
		}
		return super.createActionViewItem(action, options);
	}

	/** Whether the focus is on Toggle Inbox in the host's title, which tells its checked state itself. */
	isInboxToggleFocused(): boolean {
		return Iterable.some(this.inboxToggles, item => item.hasFocus());
	}

	/** Whether the view's header is in the title of a host view, such as the Chat view. */
	get isHeaderInTitle(): boolean {
		return this.headerInTitle;
	}

	private createSessionsHeader(parent: HTMLElement, phoneLayout: boolean, disposables: DisposableStore): ISessionsHeaderElements {
		const header = renderSessionsHeader(parent, phoneLayout || this.headerInTitle, this.instantiationService, this.scopedContextKeyService, disposables, () => this.sessionsControl?.reportFilterMenuShown(), () => this.grouping);
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
			this.hideCustomizations ? 'hidden' : getCustomizationsPresentation(phone, enabled, hidden, navigationIncludesCustomizations, this.customizationsLocation.read(reader)),
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

	private registerScheduledFilter(sessionsControl: SessionsList): void {
		const contextKey = new RawContextKey<boolean>('sessionsViewPane.filter.scheduledOnly', sessionsControl.filters.isScheduledOnly());
		const contextKeyInstance = contextKey.bindTo(this.scopedContextKeyService);
		this.filterContextKeys.set(contextKey.key, { key: contextKeyInstance, read: () => sessionsControl.filters.isScheduledOnly() });
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'sessionsViewPane.filterScheduled',
					title: localize('showOnlyScheduled', "Show Only Scheduled"),
					toggled: ContextKeyExpr.equals(contextKey.key, true),
					precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${SESSIONS_SEND_LATER_ENABLED_SETTING}`, true)),
					menu: [{
						id: Menus.SessionsViewShow,
						group: SessionsViewShowGroup.Visibility,
						order: 2,
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
		// The Worktrees filter, of an editor window only, whose picked folder opens a session of it once allowed to, as a click
		// in the list does
		const offersWorktrees = this.workspaceContextService.getWorkbenchMode() !== WorkbenchMode.Agents;
		const worktreeOpener = this._register(this.instantiationService.createInstance(SessionsWorktreeOpener,
			this._mainWindowHost.session,
			() => this.sessionsManagementService.getSessions().filter(session => sessionsControl.isSessionInScope(session)),
			session => this.sessionsService.canOpenSession(session),
			session => this.sessionsService.openSession(session.resource, { preserveFocus: false, source: 'sessionsList', forceMainChat: true }).then(() => this._handleSessionOpened(session)).catch(onUnexpectedError),
			sessionsControl.filters.onDidChange,
		));
		// Keeps each filter's command id across rebuilds, since a menu still open resolves the command of a row when it is clicked
		const filterActionIds = new Map<string, number>();
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
			const { environments } = getSessionFilterEnvironments(this.sessionsProvidersService.getProviders(), reader);
			const options = getSessionFilterOptions(
				this.sessionsManagementService.getSessions(),
				environments,
				(session, reader) => sessionsControl.isSessionInScope(session, reader),
				this.uriIdentityService.extUri,
				reader,
			).filter(option => offersWorktrees || option.filter.kind !== 'worktree');
			const environmentLabels = new Map(options
				.filter(option => option.filter.kind === 'environment')
				.map(option => [option.filter.id, option.label]));
			for (const environment of environments) {
				if (options.some(option => option.filter.kind === 'application' && option.filter.environment === environment.id)) {
					environmentLabels.set(environment.id, environment.label);
				}
			}
			const scopedByBar = this.grouping === SessionsGrouping.Inbox || this.windowScope.barShown.read(reader);
			const isEnvironmentIncluded = (id: string) => scopedByBar
				? !sessionsControl.filters.inboxScope.environment || sessionsControl.filters.inboxScope.environment.id === id
				: !sessionsControl.filters.isExcluded({ kind: 'environment', id });
			const includedEnvironments = [...environmentLabels].filter(([id]) => isEnvironmentIncluded(id));
			const selectedWorktree = sessionsControl.filters.getSelectedWorktree(new Set(options.filter(option => option.filter.kind === 'worktree').map(option => option.filter.id)));
			const scopedOptions = options
				.filter(option => option.filter.kind !== 'application' || isEnvironmentIncluded(option.filter.environment))
				.map(option => ({ ...option, checked: option.filter.kind === 'worktree' ? option.filter.id === selectedWorktree : !sessionsControl.filters.isExcluded(option.filter) }));
			return {
				options: scopedOptions,
				emptySourcesTitle: scopedOptions.some(option => option.filter.kind === 'application') ? undefined
					: includedEnvironments.length === 0 ? localize('selectEnvironmentFirst', "Select an Environment First")
						: localize('noCreatingApplications', "No Applications Found"),
			};
		});
		this._register(autorun(reader => {
			const { options, emptySourcesTitle } = menuState.read(reader);
			if (!this.windowScope.barShown.read(reader)) {
				reader.store.add(MenuRegistry.appendMenuItem(Menus.SessionsViewFilter, {
					submenu: Menus.SessionsViewEnvironment,
					title: localize('environment', "Environment"),
					when: SessionsViewGroupingContext.notEqualsTo(SessionsGrouping.Inbox),
					group: '2_filters',
					order: 0,
				}));
			}
			// Only while sessions work in worktrees: the sessions of all folders, or of one
			if (options.some(option => option.filter.kind === 'worktree')) {
				reader.store.add(MenuRegistry.appendMenuItem(Menus.SessionsViewFilter, {
					submenu: Menus.SessionsViewWorktree,
					title: localize('worktrees', "Worktrees"),
					group: '2_filters',
					order: 3,
				}));
				const allWorktrees = !options.some(option => option.filter.kind === 'worktree' && option.checked);
				const allWorktreesKey = new RawContextKey('sessionsViewPane.filter.allWorktrees', allWorktrees).bindTo(this.scopedContextKeyService);
				allWorktreesKey.set(allWorktrees);
				reader.store.add(toDisposable(() => allWorktreesKey.reset()));
				reader.store.add(registerAction2(class extends Action2 {
					constructor() {
						super({
							id: 'sessionsViewPane.filter.allWorktrees',
							title: localize('allWorktrees', "All Worktrees"),
							toggled: ContextKeyExpr.equals('sessionsViewPane.filter.allWorktrees', true),
							menu: [{ id: Menus.SessionsViewWorktree, group: '4_worktrees_0_all', order: 0 }],
						});
					}
					override run() {
						sessionsControl.filters.setSelectedWorktree(undefined);
					}
				}));
			}
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
						: option.filter.kind === 'worktree' ? Menus.SessionsViewWorktree
							: Menus.SessionsViewHarness;
				const id = getSessionFilterActionId(option.filter, getOrSet(filterActionIds, sessionFilterKey(option.filter), filterActionIds.size));
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
						if (option.filter.kind === 'worktree') {
							sessionsControl.filters.setSelectedWorktree(option.filter.id);
							worktreeOpener.open(option.filter.id).catch(onUnexpectedError);
						} else {
							sessionsControl.filters.setExcluded(option.filter, !sessionsControl.filters.isExcluded(option.filter));
						}
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
							id: Menus.SessionsViewShow,
							group: SessionsViewShowGroup.Visibility,
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
		this.undoService.offerUndo({
			kind: 'resetFilters',
			count: 1,
			message: () => localize('filtersReset', "Filters reset"),
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
			if (this.headerInTitle) {
				// The title shows the label and the actions; the row only shows the find widget while it is open, at its full width
				header.row.style.display = this.isFindWidgetOpen ? '' : 'none';
				header.label.style.display = this.isFindWidgetOpen ? 'none' : '';
				header.actions.style.display = this.isFindWidgetOpen ? 'none' : '';
				continue;
			}
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
			...(this.grouping === SessionsGrouping.Workspace && this.workspacesEnabled ? [{
				id: SEPARATE_GROUPS_AND_WORKSPACES_SHEET_ITEM,
				label: SEPARATE_GROUPS_AND_WORKSPACES_LABEL.value,
				checked: this.groupingState.separateGroupsAndWorkspaces,
				group: 'layout',
			}] : []),
		];
		showMobileSortGroupSheet(this.layoutService.mainContainer, localize('sortGroupSheet.title', "Sort"), items).then(selectedId => {
			if (!selectedId) {
				return;
			}
			if (selectedId === SessionsSorting.Created || selectedId === SessionsSorting.Updated) {
				this.setSorting(selectedId);
			} else if (selectedId === SEPARATE_GROUPS_AND_WORKSPACES_SHEET_ITEM) {
				this.toggleSeparateGroupsAndWorkspaces();
			} else if (selectedId === SessionsGrouping.Workspace || selectedId === SessionsGrouping.Repository || selectedId === SessionsGrouping.Environment || selectedId === SessionsGrouping.Date) {
				this.setGrouping(selectedId);
			}
		}).catch(onUnexpectedError);
	}

	/** Whether workspaces and chat are on, which separating groups and workspaces needs. */
	private get workspacesEnabled(): boolean {
		return !!this.scopedContextKeyService.getContextKeyValue<boolean>(SessionWorkspacesEnabledContext.key)
			&& !!this.scopedContextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key);
	}

	get grouping(): SessionsGrouping {
		return this.currentGrouping ?? this.groupings?.default ?? SessionsGrouping.Workspace;
	}

	/** Whether Group by Workspace lists the custom groups and the workspaces under headers of their own: as the user chose, while workspaces are on. */
	get separateGroupsAndWorkspaces(): boolean {
		return this.groupingState.separateGroupsAndWorkspaces && this.workspacesEnabled;
	}

	private get offeredGroupings(): readonly SessionsGrouping[] {
		return this.groupings?.offered ?? DEFAULT_SESSIONS_GROUPINGS;
	}

	/** Whether the view offers `grouping`, such as Inbox, which only some views do. */
	offersGrouping(grouping: SessionsGrouping): boolean {
		return this.offeredGroupings.includes(grouping);
	}

	/** The grouping Inbox returns to: in the Chat view, the one this view left for Inbox, else the one stored. */
	private get nonInboxGrouping(): SessionsGrouping {
		return this.mountedNonInboxGrouping ?? this.storedNonInboxGrouping;
	}

	private get storedNonInboxGrouping(): SessionsGrouping {
		return this.groupingState.readNonInboxGrouping(this.offeredGroupings, this.groupings?.default ?? SessionsGrouping.Workspace);
	}

	private get inboxAvailable(): boolean {
		return !!this.configurationService.getValue<boolean>(SESSIONS_LIST_INBOX_ENABLED_SETTING)
			&& !this.configurationService.getValue<boolean>('chat.disableAIFeatures')
			&& !this.chatEntitlementService.sentiment.hidden;
	}

	private readStoredGrouping(): { readonly grouping: SessionsGrouping | undefined; readonly seed: boolean } {
		return this.groupingState.readGrouping(this.offeredGroupings, this.groupings?.default ?? SessionsGrouping.Workspace);
	}

	private initializeGrouping(): void {
		this.groupingState.migrateWorkspacesAndGroupsGrouping();
		const { grouping, seed } = this.readStoredGrouping();
		this.currentGrouping = grouping;
		if (this.leaveInboxWithoutChat) {
			this.mountedNonInboxGrouping = this.storedNonInboxGrouping;
		}
		if (seed) {
			// Seeds the view's own key once, so that a later change to the fallback key does not change the view as it reopens
			this.groupingState.seedGrouping(this.grouping);
		}
		this.updateInboxAvailability();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING) || e.affectsConfiguration('chat.disableAIFeatures')) {
				this.updateInboxAvailability();
			}
		}));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.updateInboxAvailability()));
		if (this.leaveInboxWithoutChat) {
			// Only as Chat goes: while the window starts, Chat is unavailable until its participant activates, and the view keeps
			// the Inbox it restored
			const chatEnabledKeys = new Set([ChatContextKeys.enabled.key]);
			let chatEnabled = this.scopedContextKeyService.contextMatchesRules(ChatContextKeys.enabled);
			this._register(this.scopedContextKeyService.onDidChangeContext(e => {
				if (!e.affectsSome(chatEnabledKeys)) {
					return;
				}
				const enabled = this.scopedContextKeyService.contextMatchesRules(ChatContextKeys.enabled);
				if (chatEnabled && !enabled && !this.inProfileTransition) {
					this.leaveInbox();
				}
				chatEnabled = enabled;
			}));
		}
	}

	/**
	 * In the Chat view ({@link ISessionsViewOptions.leaveInboxWithoutChat}), as the window switches to another profile, shows
	 * the grouping and the filters that profile remembers, as the view would open in it, without storing anything: what the
	 * view remembered in the previous profile stays there. Until Chat is back after the switch restarts the extension host,
	 * whose stopping, before the switch, left Inbox in the previous profile, it reads them again as the new profile's storage
	 * tells the values that differ, if any, and as its settings arrive, in either order, and then once more.
	 */
	private followProfileSwitches(): void {
		if (!this.leaveInboxWithoutChat) {
			return;
		}
		let pendingStorage = false;
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(e => {
			// Not as the current profile only changes, such as its name
			if (e.previous.id !== e.profile.id) {
				pendingStorage = this.inProfileTransition = true;
			}
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(e => {
			if (pendingStorage && e.external && this.storageService.hasScope(this.userDataProfileService.currentProfile)) {
				pendingStorage = false;
				this.restoreStoredGrouping();
			}
		}));
		const chatEnabledKeys = new Set([ChatContextKeys.enabled.key]);
		this._register(this.scopedContextKeyService.onDidChangeContext(e => {
			if (this.inProfileTransition && e.affectsSome(chatEnabledKeys) && this.scopedContextKeyService.contextMatchesRules(ChatContextKeys.enabled)) {
				pendingStorage = this.inProfileTransition = false;
				this.restoreStoredGrouping();
			}
		}));
	}

	/**
	 * Shows the grouping and the filters stored now, as the view restores them as it opens, without storing them: Inbox even
	 * while Chat starts, but not where Inbox is unavailable.
	 */
	private restoreStoredGrouping(): void {
		this.sessionsControl?.filters.reload();
		this.groupingState.migrateWorkspacesAndGroupsGrouping();
		this.mountedNonInboxGrouping = this.storedNonInboxGrouping;
		const stored = this.readStoredGrouping().grouping;
		const grouping = stored === SessionsGrouping.Inbox && !this.inboxAvailable ? this.nonInboxGrouping : stored;
		if (this.currentGrouping === grouping) {
			this.showSeparateGroupsAndWorkspaces();
			return;
		}
		this.separateGroupsAndWorkspacesContextKey?.set(this.groupingState.separateGroupsAndWorkspaces);
		// Read only: the sections show the collapse state the profile stores, which a reset would change, in either profile
		this.currentGrouping = grouping;
		this.groupingContextKey?.set(this.grouping);
		this.sessionsControl?.update(true);
		this.updateHeaderLayout();
	}

	/**
	 * Whether the view can enter Inbox now: where it leaves Inbox as Chat goes ({@link ISessionsViewOptions.leaveInboxWithoutChat}),
	 * such as as the extension host restarts, entering it also needs Chat.
	 */
	private get canEnterInbox(): boolean {
		return this.inboxAvailable && (!this.leaveInboxWithoutChat || this.scopedContextKeyService.contextMatchesRules(ChatContextKeys.enabled));
	}

	private updateInboxAvailability(): void {
		if (this.inProfileTransition) {
			// The settings may be the new profile's while the storage is still the previous one's, or the other way around
			this.restoreStoredGrouping();
		} else if (!this.inboxAvailable) {
			this.leaveInbox();
		}
	}

	/** Leaves Inbox for the grouping it returns to, keeping the focus in the view if it was on the Inbox toggle. */
	private leaveInbox(): void {
		// Where the view's header is in the title of a host view, such as the Chat view, the toggle is in the host's title
		const activeElement = DOM.getActiveElement();
		const restoreFocus = this.headerInTitle
			? this.isInboxToggleFocused()
			: DOM.isHTMLElement(activeElement) && activeElement.classList.contains('codicon-inbox') && !!this.element?.contains(activeElement);
		if (this.grouping === SessionsGrouping.Inbox) {
			this.setGrouping(this.nonInboxGrouping);
		}
		if (restoreFocus) {
			this.focus();
		}
	}

	/** Toggles Inbox, and returns whether the grouping changed. */
	toggleInbox(): boolean {
		const grouping = this.grouping;
		this.setGrouping(grouping === SessionsGrouping.Inbox ? this.nonInboxGrouping : SessionsGrouping.Inbox);
		return this.grouping !== grouping;
	}

	get sorting(): SessionsSorting {
		return this.currentSorting;
	}

	get compact(): boolean {
		return this.currentCompact;
	}

	setGrouping(grouping: SessionsGrouping): void {
		if (!this.offeredGroupings.includes(grouping)) {
			return;
		}
		if (grouping === SessionsGrouping.Inbox && !this.canEnterInbox) {
			throw new Error(localize('inboxUnavailable', "Enable {0} and AI features to use Inbox Mode.", SESSIONS_LIST_INBOX_ENABLED_SETTING));
		}
		if (this.currentGrouping === grouping) {
			return;
		}

		const preserveCollapseState = this.grouping === SessionsGrouping.Inbox || grouping === SessionsGrouping.Inbox;
		const left = this.grouping;
		if (left !== SessionsGrouping.Inbox && this.mountedNonInboxGrouping !== undefined) {
			this.mountedNonInboxGrouping = left;
		}
		this.currentGrouping = grouping;
		this.inProfileTransition = false;
		this.groupingState.storeGrouping(grouping, left);
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

	setSeparateGroupsAndWorkspaces(separate: boolean): void {
		if (this.groupingState.separateGroupsAndWorkspaces === separate) {
			return;
		}

		this.groupingState.setSeparateGroupsAndWorkspaces(separate);
		this.showSeparateGroupsAndWorkspaces();
	}

	/**
	 * Shows the stored choice whether to separate groups and workspaces, as this view or another, such as one in another window,
	 * made it: its checkmark and, while grouped by workspace, the list.
	 */
	private showSeparateGroupsAndWorkspaces(): void {
		const separate = this.groupingState.separateGroupsAndWorkspaces;
		if (!this.separateGroupsAndWorkspacesContextKey || this.separateGroupsAndWorkspacesContextKey.get() === separate) {
			return;
		}
		this.separateGroupsAndWorkspacesContextKey.set(separate);
		if (this.grouping === SessionsGrouping.Workspace) {
			this.sessionsControl?.update(true);
		}
	}

	/** Shows the choice whether to separate groups and workspaces as another view, such as one in another window, stores it. */
	private followSeparateGroupsAndWorkspaces(): void {
		this._register(this.groupingState.onDidChangeSeparateGroupsAndWorkspaces(this._store)(() => this.showSeparateGroupsAndWorkspaces()));
	}

	toggleSeparateGroupsAndWorkspaces(): void {
		this.setSeparateGroupsAndWorkspaces(!this.groupingState.separateGroupsAndWorkspaces);
	}
}
