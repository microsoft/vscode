/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import * as touch from '../../../../base/browser/touch.js';
import { IAction, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { basename } from '../../../../base/common/resources.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../platform/actionWidget/browser/actionList.js';
import { TabbedActionListWidget } from '../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { IMenuService, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TUNNEL_ADDRESS_PREFIX } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_CLOUD, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { getStatusHover, getStatusLabel, showRemoteHostOptions } from '../../remoteAgentHost/browser/remoteHostOptions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { COPILOT_PROVIDER_ID } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';
import { IWorkspacesService, isRecentFolder } from '../../../../platform/workspaces/common/workspaces.js';
import { Menus } from '../../../browser/menus.js';

const LEGACY_STORAGE_KEY_RECENT_PROJECTS = 'sessions.recentlyPickedProjects';
const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedWorkspaces';
const FILTER_THRESHOLD = 10;
const MAX_RECENT_WORKSPACES = 10;

/**
 * Fixed picker width when the categorical tab bar is shown. Keeps the tab
 * row and the list aligned and prevents horizontal jitter when switching
 * tabs.
 */
const TABBED_PICKER_WIDTH = 360;

/**
 * Canonical order in which well-known tab labels are rendered. Tabs whose
 * labels don't match any of these constants are appended in registration
 * order after the recognized ones.
 */
const KNOWN_TAB_ORDER: readonly string[] = [
	SESSION_WORKSPACE_GROUP_LOCAL,
	SESSION_WORKSPACE_GROUP_CLOUD,
	SESSION_WORKSPACE_GROUP_REMOTE,
];
const KNOWN_TAB_SET = new Set<string>(KNOWN_TAB_ORDER);

/**
 * Grace period for a restored remote workspace's provider to reach Connected
 * before we fall back to no selection. SSH tunnels typically connect within
 * a couple seconds; if it hasn't connected by then, we'd rather show no
 * selection than leave the user staring at an unreachable workspace.
 */
const RESTORE_CONNECT_GRACE_MS = 5000;

/**
 * A workspace selection from the picker, pairing the workspace with its owning provider.
 */
export interface IWorkspaceSelection {
	readonly providerId: string;
	readonly workspace: ISessionWorkspace;
}

/**
 * Stored recent workspace entry. The `checked` flag marks the currently
 * selected workspace so we only need a single storage key.
 */
interface IStoredRecentWorkspace {
	readonly uri: UriComponents;
	readonly providerId: string;
	readonly checked: boolean;
}

/**
 * Item type used in the action list.
 */
export interface IWorkspacePickerItem {
	readonly selection?: IWorkspaceSelection;
	readonly browseActionIndex?: number;
	readonly checked?: boolean;
	/** Command to execute when this item is selected. */
	readonly commandId?: string;
}

/**
 * A unified workspace picker that shows workspaces from all registered session
 * providers in a single dropdown.
 *
 * Browse actions from providers are appended at the bottom of the list.
 */
export class WorkspacePicker extends Disposable {

	protected readonly _onDidSelectWorkspace = this._register(new Emitter<IWorkspaceSelection | undefined>());
	readonly onDidSelectWorkspace: Event<IWorkspaceSelection | undefined> = this._onDidSelectWorkspace.event;
	protected readonly _onDidChangeSelection = this._register(new Emitter<void>());
	readonly onDidChangeSelection: Event<void> = this._onDidChangeSelection.event;

	private _selectedWorkspace: IWorkspaceSelection | undefined;

	/**
	 * Set to `true` once the user has explicitly picked or cleared a workspace.
	 * Until then, late-arriving provider registrations are allowed to upgrade
	 * the current (auto-restored) selection to the user's stored "checked"
	 * entry. After the user has acted, providers coming and going never move
	 * the selection out from under them.
	 */
	private _userHasPicked = false;

	/**
	 * Watches the connection status of a restored remote workspace. Cleared when
	 * the user explicitly picks, when the connection succeeds, or when it fails
	 * and we fall back.
	 */
	private readonly _connectionStatusWatch = this._register(new MutableDisposable());

	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _tabbedWidget: TabbedActionListWidget;

	/**
	 * Currently active workspace tab (a group label contributed by a
	 * provider, e.g. `"Local"` / `"Cloud"` / `"Remote"`).
	 */
	private _activeTab: string | undefined;

	/**
	 * Whether the user explicitly clicked a tab while the picker was open.
	 * Reset on each fresh open so the picker re-defaults to the selected
	 * workspace's group between opens.
	 */
	private _userPickedTab = false;

	/** Cached VS Code recent folder URIs, resolved lazily. */
	private _vsCodeRecentFolderUris: URI[] = [];

	get selectedProject(): IWorkspaceSelection | undefined {
		return this._selectedWorkspace;
	}

	constructor(
		@IActionWidgetService protected readonly actionWidgetService: IActionWidgetService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ISessionsProvidersService protected readonly sessionsProvidersService: ISessionsProvidersService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
		@IConfigurationService _configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._tabbedWidget = this._register(this.instantiationService.createInstance(TabbedActionListWidget));

		// Migrate legacy storage to new key
		this._migrateLegacyStorage();

		// Restore selected workspace from storage
		this._selectedWorkspace = this._restoreSelectedWorkspace();
		if (this._selectedWorkspace) {
			this._watchForConnectionFailure(this._selectedWorkspace);
		}

		// React to provider registrations/removals: re-validate the current
		// selection, and if the user hasn't explicitly picked yet, re-restore
		// from storage so we upgrade from any fallback to the user's actual
		// stored selection once its provider arrives.
		this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
			if (this._selectedWorkspace) {
				const providers = this.sessionsProvidersService.getProviders();
				if (!providers.some(p => p.id === this._selectedWorkspace!.providerId)) {
					this._selectedWorkspace = undefined;
					this._connectionStatusWatch.clear();
					this._updateTriggerLabel();
					this._onDidChangeSelection.fire();
					this._onDidSelectWorkspace.fire(undefined);
				}
			}
			if (!this._userHasPicked) {
				const restored = this._restoreSelectedWorkspace();
				if (restored && !this._isSelectedWorkspace(restored)) {
					this._selectedWorkspace = restored;
					this._updateTriggerLabel();
					this._onDidChangeSelection.fire();
					this._onDidSelectWorkspace.fire(restored);
					this._watchForConnectionFailure(restored);
				}
			}
		}));

		// Load VS Code recent folders eagerly and refresh on changes
		this._loadVSCodeRecentFolders();
		this._register(this.workspacesService.onDidChangeRecentlyOpened(() => this._loadVSCodeRecentFolders()));

		// Re-arm auto-tab whenever the workspace selection changes to a new
		// value, but only while the picker is closed. This way picking a tab
		// and then a workspace within the same open keeps that tab active for
		// the current session, while the next fresh open follows the latest
		// selection's category. Clears (`undefined`) are ignored so the
		// previously-active tab is preserved.
		this._register(this.onDidSelectWorkspace(selection => {
			if (selection && !this.actionWidgetService.isVisible && !this._tabbedWidget.isVisible) {
				this._userPickedTab = false;
			}
		}));
	}

	/**
	 * Renders the project picker trigger button into the given container.
	 * Returns the container element.
	 */
	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-workspace-picker'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.setAttribute('aria-expanded', 'false');
		this._triggerElement = trigger;

		this._updateTriggerLabel();

		this._renderDisposables.add(touch.Gesture.addTarget(trigger));
		[dom.EventType.CLICK, touch.EventType.Tap].forEach(eventType => {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
				dom.EventHelper.stop(e, true);
				this.showPicker();
			}));
		});

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this.showPicker();
			}
		}));

		return slot;
	}

	/**
	 * Shows the workspace picker dropdown anchored to the trigger element.
	 *
	 * @param force When true, re-show even if the picker is already visible.
	 *              Used internally when swapping items in place after a tab
	 *              change.
	 */
	showPicker(force = false): void {
		if (!this._triggerElement) {
			return;
		}
		const alreadyVisible = this.actionWidgetService.isVisible || this._tabbedWidget.isVisible;
		if (!force && alreadyVisible) {
			return;
		}

		const tabs = this._showTabs() ? this._getAvailableTabs() : [];

		// Default the active tab to the group of the currently selected
		// workspace. The user-pick latch is reset on every selection change,
		// so picking a tab during one open of the picker doesn't permanently
		// override auto-tab.
		if (tabs.length > 0) {
			const selectedGroup = this._selectedWorkspace?.workspace.group;
			if (!this._userPickedTab && selectedGroup && tabs.includes(selectedGroup)) {
				this._activeTab = selectedGroup;
			}
			if (!this._activeTab || !tabs.includes(this._activeTab)) {
				this._activeTab = tabs[0];
			}
		}

		const tabbed = tabs.length > 1;
		if (tabbed) {
			this._showTabbedPicker(tabs);
		} else {
			this._activeTab = undefined;
			this._showFlatPicker();
		}
	}

	/**
	 * Subclasses may opt out of the categorical tab bar (e.g. when scoped to
	 * a single host).
	 */
	protected _showTabs(): boolean {
		return true;
	}

	/**
	 * Discovers the union of `group` labels contributed by all providers'
	 * browse actions and recent workspaces. Well-known labels (Local /
	 * Cloud / Remote) come first in canonical order; any custom labels
	 * provider plug-ins might contribute follow in registration order.
	 *
	 * Visible to tests; not part of the public API.
	 */
	protected _getAvailableTabs(): string[] {
		const seen = new Set<string>();
		for (const provider of this.sessionsProvidersService.getProviders()) {
			for (const action of provider.browseActions) {
				if (action.group) {
					seen.add(action.group);
				}
			}
		}
		for (const { workspace } of this._getRecentWorkspaces()) {
			if (workspace.group) {
				seen.add(workspace.group);
			}
		}
		const known = KNOWN_TAB_ORDER.filter(g => seen.has(g));
		const extra = [...seen].filter(g => !KNOWN_TAB_SET.has(g));
		return [...known, ...extra];
	}

	/**
	 * Builds the shared `IActionListDelegate` used by both the flat and
	 * tabbed presentations.
	 */
	private _buildDelegate(triggerElement: HTMLElement, hide: () => void): IActionListDelegate<IWorkspacePickerItem> {
		return {
			onSelect: (item) => {
				hide();
				if (item.commandId) {
					this.commandService.executeCommand(item.commandId);
				} else if (item.selection && this._isProviderUnavailable(item.selection.providerId)) {
					// Workspace belongs to an unavailable remote — ignore selection
					return;
				}
				if (item.browseActionIndex !== undefined) {
					this._executeBrowseAction(item.browseActionIndex);
				} else if (item.selection) {
					this._selectProject(item.selection);
				}
			},
			onHide: () => {
				triggerElement.setAttribute('aria-expanded', 'false');
				triggerElement.focus();
			},
		};
	}

	private _buildListOptions(items: readonly IActionListItem<IWorkspacePickerItem>[], pickerWidth: number | undefined): IActionListOptions {
		const showFilter = items.filter(i => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;
		return showFilter
			? { showFilter: true, filterPlaceholder: localize('workspacePicker.filter', "Search Workspaces..."), reserveSubmenuSpace: false, inlineDescription: true, showGroupTitleOnFirstItem: true, minWidth: pickerWidth, maxWidth: pickerWidth }
			: { reserveSubmenuSpace: false, inlineDescription: true, showGroupTitleOnFirstItem: true, minWidth: pickerWidth, maxWidth: pickerWidth };
	}

	/**
	 * Flat (no-tabs) presentation. Delegates rendering to the shared
	 * `IActionWidgetService` so we benefit from its keybindings, focus
	 * tracking and submenu chrome.
	 */
	private _showFlatPicker(): void {
		// Tear down any previous tabbed popup before delegating to the
		// shared service — the two presentations don't co-exist.
		this._tabbedWidget.hide();
		const triggerElement = this._triggerElement!;
		const items = this._buildItems();
		const delegate = this._buildDelegate(triggerElement, () => this._hidePicker());
		triggerElement.setAttribute('aria-expanded', 'true');

		this.actionWidgetService.show<IWorkspacePickerItem>(
			'workspacePicker',
			false,
			items,
			delegate,
			triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('workspacePicker.ariaLabel', "Workspace Picker"),
			},
			this._buildListOptions(items, undefined),
		);
	}

	/**
	 * Tabbed presentation. Delegates rendering and lifecycle to the
	 * platform `TabbedActionListWidget`; this picker only owns the data
	 * and selection logic.
	 */
	private _showTabbedPicker(tabs: readonly string[]): void {
		const triggerElement = this._triggerElement!;
		// Hide the flat picker if it's visible — the two presentations
		// don't co-exist.
		if (this.actionWidgetService.isVisible) {
			this.actionWidgetService.hide();
		}

		const delegate = this._buildDelegate(triggerElement, () => this._hidePicker());
		const accessibilityProvider = {
			getAriaLabel: (item: IActionListItem<IWorkspacePickerItem>) => item.label ?? '',
			getWidgetAriaLabel: () => localize('workspacePicker.ariaLabel', "Workspace Picker"),
		};

		triggerElement.setAttribute('aria-expanded', 'true');
		this._tabbedWidget.show<IWorkspacePickerItem>({
			user: 'workspacePicker',
			anchor: triggerElement,
			tabs,
			initialTab: this._activeTab ?? tabs[0],
			buildItems: (tab) => {
				this._activeTab = tab;
				const items = this._buildItems();
				return { items, listOptions: this._buildListOptions(items, TABBED_PICKER_WIDTH) };
			},
			delegate,
			accessibilityProvider,
			width: TABBED_PICKER_WIDTH,
			tabBarClassName: 'sessions-workspace-picker-tabbar',
			onDidChangeTab: (tab) => {
				this._activeTab = tab;
				this._userPickedTab = true;
			},
		});
	}

	/**
	 * Programmatically set the selected project.
	 * @param fireEvent Whether to fire the onDidSelectWorkspace event. Defaults to true.
	 */
	setSelectedWorkspace(project: IWorkspaceSelection, fireEvent = true): void {
		this._selectProject(project, fireEvent);
	}

	/**
	 * Hides whichever popup variant is currently visible — the shared
	 * action-widget-service flat picker or our own context-view-driven
	 * tabbed picker.
	 */
	private _hidePicker(): void {
		this._tabbedWidget.hide();
		if (this.actionWidgetService.isVisible) {
			this.actionWidgetService.hide();
		}
	}

	/**
	 * Clears the selected project.
	 */
	clearSelection(): void {
		this._hidePicker();
		this._userHasPicked = true;
		this._connectionStatusWatch.clear();
		this._selectedWorkspace = undefined;
		// Clear checked state from all recents
		const recents = this._getStoredRecentWorkspaces();
		const updated = recents.map(p => ({ ...p, checked: false }));
		this.storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(updated), StorageScope.PROFILE, StorageTarget.MACHINE);
		this._updateTriggerLabel();
		this._onDidChangeSelection.fire();
	}

	/**
	 * Clears the selection if it matches the given URI.
	 */
	removeFromRecents(uri: URI): void {
		if (this._selectedWorkspace && this.uriIdentityService.extUri.isEqual(this._selectedWorkspace.workspace.repositories[0]?.uri, uri)) {
			this.clearSelection();
		}
	}

	private _selectProject(selection: IWorkspaceSelection, fireEvent = true): void {
		this._userHasPicked = true;
		this._connectionStatusWatch.clear();
		this._selectedWorkspace = selection;
		this._persistSelectedWorkspace(selection);
		this._updateTriggerLabel();
		this._onDidChangeSelection.fire();
		if (fireEvent) {
			this._onDidSelectWorkspace.fire(selection);
		}
	}

	/**
	 * Executes a browse action from a provider, identified by index.
	 */
	protected async _executeBrowseAction(actionIndex: number): Promise<void> {
		const allActions = this._getAllBrowseActions();
		const action = allActions[actionIndex];
		if (!action) {
			return;
		}

		try {
			const workspace = await action.run();
			if (workspace) {
				this._selectProject({ providerId: action.providerId, workspace });
			}
		} catch {
			// browse action was cancelled or failed
		}
	}

	/**
	 * Collects browse actions from all registered providers, scoped to the
	 * currently active tab when tabs are shown.
	 */
	protected _getAllBrowseActions(): ISessionWorkspaceBrowseAction[] {
		const all = this.sessionsProvidersService.getProviders().flatMap(p => p.browseActions);
		if (!this._isTabFiltered()) {
			return all;
		}
		return all.filter(a => a.group === this._activeTab);
	}

	/** True when the picker is currently scoped to a single tab. */
	protected _isTabFiltered(): boolean {
		return this._showTabs() && !!this._activeTab && this._getAvailableTabs().length > 1;
	}

	/**
	 * Whether the bottom "Manage…" submenu should be included. Hidden
	 * outside the Remote tab because the contributed actions (Tunnels…,
	 * SSH…, remote provider list) are remote-specific.
	 */
	protected _includeManageSubmenu(): boolean {
		if (!this._isTabFiltered()) {
			return true;
		}
		return this._activeTab === SESSION_WORKSPACE_GROUP_REMOTE;
	}

	/**
	 * Builds the picker items list from recent workspaces.
	 *
	 * Items are shown in a flat recency-sorted list (most recently used first)
	 * without source grouping. Own recents come first, followed by VS Code
	 * recent folders.
	 */
	protected _buildItems(): IActionListItem<IWorkspacePickerItem>[] {
		const items: IActionListItem<IWorkspacePickerItem>[] = [];

		// Collect recent workspaces from picker storage across all providers
		const allProviders = this.sessionsProvidersService.getProviders();
		const providerIds = new Set(allProviders.map(p => p.id));
		const tabFilter = this._isTabFiltered()
			? (w: IWorkspaceSelection) => w.workspace.group === this._activeTab
			: undefined;
		const ownRecentWorkspaces = this._getRecentWorkspaces()
			.filter(w => providerIds.has(w.providerId))
			.filter(w => !tabFilter || tabFilter({ providerId: w.providerId, workspace: w.workspace }));

		// Merge VS Code recent folders (resolved through providers, deduplicated)
		const vsCodeRecents = this._getVSCodeRecentWorkspaces()
			.filter(w => providerIds.has(w.providerId))
			.filter(w => !tabFilter || tabFilter({ providerId: w.providerId, workspace: w.workspace }));
		const ownRecentCount = ownRecentWorkspaces.length;
		const recentWorkspaces = [...ownRecentWorkspaces, ...vsCodeRecents];

		// Build flat list in recency order (no source grouping)
		for (let i = 0; i < recentWorkspaces.length; i++) {
			const { workspace, providerId } = recentWorkspaces[i];
			const isOwnRecent = i < ownRecentCount;
			const provider = allProviders.find(p => p.id === providerId);
			const connectionStatus = provider && isAgentHostProvider(provider) ? provider.connectionStatus?.get() : undefined;
			const isDisconnected = connectionStatus === RemoteAgentHostConnectionStatus.Disconnected;
			const selection: IWorkspaceSelection = { providerId, workspace };
			const selected = this._isSelectedWorkspace(selection);
			items.push({
				kind: ActionListItemKind.Action,
				label: workspace.label,
				description: workspace.description,
				group: { title: '', icon: workspace.icon },
				disabled: isDisconnected,
				item: { selection, checked: selected || undefined },
				onRemove: isOwnRecent ? () => this._removeRecentWorkspace(selection) : () => this._removeVSCodeRecentWorkspace(selection),
			});
		}

		// Browse actions from all providers (filtered to the active tab)
		const allBrowseActions = this._getAllBrowseActions();
		// Remote providers with connection status — only relevant for the
		// Manage submenu, which is itself only included on the Remote tab.
		const remoteProviders = allProviders.filter(isAgentHostProvider).filter(p => p.connectionStatus !== undefined);
		const includeManage = this._includeManageSubmenu();

		if (items.length > 0 && (allBrowseActions.length > 0 || (includeManage && remoteProviders.length > 0))) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
		}

		// Render each browse action individually. Within a tab, actions are
		// already constrained to a single category, so cross-provider
		// merging is no longer meaningful.
		allBrowseActions.forEach((action, index) => {
			const provider = allProviders.find(p => p.id === action.providerId);
			const connectionStatus = provider && isAgentHostProvider(provider) ? provider.connectionStatus?.get() : undefined;
			const isUnavailable = connectionStatus === RemoteAgentHostConnectionStatus.Disconnected || connectionStatus === RemoteAgentHostConnectionStatus.Connecting;
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('workspacePicker.browseSelectAction', "Select {0}...", action.label),
				description: action.description,
				group: { title: '', icon: action.icon },
				disabled: isUnavailable,
				item: { browseActionIndex: index },
			});
		});

		// Inline "Manage" entries: dynamic remote provider rows + menu-contributed
		// actions (Tunnels…, SSH…), separated from the workspace list above.
		// The actions are tracked in a per-render array so the picker delegate
		// can dispatch by index when an item is selected.
		const manageActions: IAction[] = [];
		if (includeManage) {
			for (const provider of remoteProviders) {
				const status = provider.connectionStatus!.get();
				const isTunnel = provider.remoteAddress?.startsWith(TUNNEL_ADDRESS_PREFIX);
				const action = toAction({
					id: `workspacePicker.remote.${provider.id}`,
					label: provider.label,
					tooltip: getStatusLabel(status),
					enabled: true,
					run: () => {
						this._hidePicker();
						this._showRemoteHostOptionsDelayed(provider);
					},
				});
				const extended = action as IAction & { icon?: ThemeIcon; hoverContent?: string; onRemove?: () => void };
				extended.icon = isTunnel ? Codicon.cloud : Codicon.remote;
				extended.hoverContent = getStatusHover(status, provider.remoteAddress);
				if (!isTunnel && provider.remoteAddress) {
					const address = provider.remoteAddress;
					extended.onRemove = async () => {
						await this.remoteAgentHostService.removeRemoteAgentHost(address);
					};
				}
				manageActions.push(action);
			}

			const menuActions = this.menuService.getMenuActions(Menus.SessionWorkspaceManage, this.contextKeyService, { renderShortTitle: true });
			for (const [, actions] of menuActions) {
				for (const menuAction of actions) {
					if (menuAction instanceof MenuItemAction) {
						const icon = ThemeIcon.isThemeIcon(menuAction.item.icon) ? menuAction.item.icon : undefined;
						manageActions.push(Object.assign(menuAction, { icon }));
					}
				}
			}
		}

		if (manageActions.length > 0) {
			if (items.length > 0 && items[items.length - 1].kind !== ActionListItemKind.Separator) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('workspacePicker.manage', "Manage..."),
				group: { title: '', icon: Codicon.settingsGear },
				item: {},
				submenuActions: [new SubmenuAction('workspacePicker.manage.submenu', '', manageActions)],
			});
		}

		return items;
	}

	private _showRemoteHostOptionsDelayed(provider: IAgentHostSessionsProvider): void {
		// Defer one tick so the action widget fully tears down (focus/DOM cleanup)
		// before the QuickPick opens and claims focus.
		const timeout = setTimeout(() => {
			this.instantiationService.invokeFunction(accessor => showRemoteHostOptions(accessor, provider));
		}, 1);
		this._renderDisposables.add({ dispose: () => clearTimeout(timeout) });
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);
		const workspace = this._selectedWorkspace?.workspace;
		const label = workspace ? workspace.label : localize('pickWorkspace', "workspace");
		const icon = workspace ? workspace.icon : Codicon.project;

		this._triggerElement.setAttribute('aria-label', workspace
			? localize('workspacePicker.selectedAriaLabel', "New session in {0}", label)
			: localize('workspacePicker.pickAriaLabel', "Start by picking a workspace"));

		dom.append(this._triggerElement, renderIcon(icon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown)).classList.add('sessions-chat-dropdown-chevron');
	}

	/**
	 * Returns whether the given provider is a remote that is currently unavailable
	 * (disconnected or still connecting).
	 * Returns false for providers without connection status (e.g. local providers).
	 */
	protected _isProviderUnavailable(providerId: string): boolean {
		const provider = this.sessionsProvidersService.getProvider(providerId);
		if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
			return false;
		}
		return provider.connectionStatus.get() !== RemoteAgentHostConnectionStatus.Connected;
	}

	protected _isSelectedWorkspace(selection: IWorkspaceSelection): boolean {
		if (!this._selectedWorkspace) {
			return false;
		}
		if (this._selectedWorkspace.providerId !== selection.providerId) {
			return false;
		}
		const selectedUri = this._selectedWorkspace.workspace.repositories[0]?.uri;
		const candidateUri = selection.workspace.repositories[0]?.uri;
		return this.uriIdentityService.extUri.isEqual(selectedUri, candidateUri);
	}

	private _persistSelectedWorkspace(selection: IWorkspaceSelection): void {
		const uri = selection.workspace.repositories[0]?.uri;
		if (!uri) {
			return;
		}
		this._addRecentWorkspace(selection.providerId, selection.workspace, true);
	}

	private _restoreSelectedWorkspace(): IWorkspaceSelection | undefined {
		// Try the checked entry first
		const checked = this._restoreCheckedWorkspace();
		if (checked) {
			return checked;
		}

		// Fall back to the first resolvable recent workspace from a connected provider.
		// Fallbacks (vs. the user's explicit checked pick) require the provider
		// to be ready: we don't want to silently land on, e.g., a disconnected
		// remote workspace that the user never picked.
		try {
			const providers = this.sessionsProvidersService.getProviders();
			const providerIds = new Set(providers.map(p => p.id));
			const storedRecents = this._getStoredRecentWorkspaces();

			for (const stored of storedRecents) {
				if (!providerIds.has(stored.providerId)) {
					continue;
				}
				if (this._isProviderUnavailable(stored.providerId)) {
					continue;
				}
				const uri = URI.revive(stored.uri);
				const workspace = this.sessionsProvidersService.getProvider(stored.providerId)?.resolveWorkspace(uri);
				if (workspace) {
					return { providerId: stored.providerId, workspace };
				}
			}
			return undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Restore only the checked (previously selected) workspace if its provider
	 * is registered. The provider's connection status is intentionally NOT
	 * checked — we honor the user's explicit pick even if the remote is still
	 * connecting or currently disconnected. The trigger label reflects the
	 * connection state separately (spinner / grayed).
	 */
	private _restoreCheckedWorkspace(): IWorkspaceSelection | undefined {
		try {
			const providers = this.sessionsProvidersService.getProviders();
			const providerIds = new Set(providers.map(p => p.id));
			const storedRecents = this._getStoredRecentWorkspaces();

			for (const stored of storedRecents) {
				if (!stored.checked || !providerIds.has(stored.providerId)) {
					continue;
				}
				const uri = URI.revive(stored.uri);
				const workspace = this.sessionsProvidersService.getProvider(stored.providerId)?.resolveWorkspace(uri);
				if (workspace) {
					return { providerId: stored.providerId, workspace };
				}
			}
			return undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * When restoring a workspace whose provider isn't currently Connected,
	 * watch the connection status. Fires `onDidSelectWorkspace(undefined)`
	 * (which the view pane converts to `unsetNewSession()`) if:
	 *   - the status transitions to Disconnected after we start watching, or
	 *   - the status is still not Connected after a short grace period.
	 *
	 * The grace period covers a race: provider state can transition synchronously
	 * inside provider registration before our autorun's first read, so we may
	 * never observe an explicit Disconnected transition. The timer ensures we
	 * eventually fall back instead of leaving the picker showing an unreachable
	 * remote with no session.
	 *
	 * Has no effect once the user makes an explicit pick (`_userHasPicked`).
	 */
	private _watchForConnectionFailure(selection: IWorkspaceSelection): void {
		const provider = this.sessionsProvidersService.getProvider(selection.providerId);
		if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
			return;
		}
		const connStatus = provider.connectionStatus;
		if (connStatus.get() === RemoteAgentHostConnectionStatus.Connected) {
			return;
		}

		const store = new DisposableStore();
		this._connectionStatusWatch.value = store;

		const fallback = () => {
			this._connectionStatusWatch.clear();
			if (!this._userHasPicked && this._isSelectedWorkspace(selection)) {
				this._selectedWorkspace = undefined;
				this._updateTriggerLabel();
				this._onDidChangeSelection.fire();
				this._onDidSelectWorkspace.fire(undefined);
			}
		};

		let isFirstRun = true;
		store.add(autorun(reader => {
			const status = connStatus.read(reader);
			if (status === RemoteAgentHostConnectionStatus.Connected) {
				this._connectionStatusWatch.clear();
			} else if (status === RemoteAgentHostConnectionStatus.Disconnected && !isFirstRun) {
				fallback();
			}
			isFirstRun = false;
		}));

		// Safety net: if the connection hasn't succeeded by the grace period,
		// fall back. Catches the case where the provider's status flips before
		// our autorun subscribes (so we never observe a transition).
		disposableTimeout(() => {
			if (connStatus.get() !== RemoteAgentHostConnectionStatus.Connected) {
				fallback();
			}
		}, RESTORE_CONNECT_GRACE_MS, store);
	}

	/**
	 * Migrate legacy `sessions.recentlyPickedProjects` storage to the new
	 * `sessions.recentlyPickedWorkspaces` key, adding `providerId` (defaulting
	 * to Copilot) and ensuring at least one entry is checked.
	 */
	private _migrateLegacyStorage(): void {
		// Already migrated
		if (this.storageService.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE)) {
			return;
		}

		const raw = this.storageService.get(LEGACY_STORAGE_KEY_RECENT_PROJECTS, StorageScope.PROFILE);
		if (!raw) {
			return;
		}

		try {
			const parsed = JSON.parse(raw) as { uri: UriComponents; checked?: boolean }[];
			const hasAnyChecked = parsed.some(e => e.checked);
			const migrated: IStoredRecentWorkspace[] = parsed.map((entry, index) => ({
				uri: entry.uri,
				providerId: COPILOT_PROVIDER_ID,
				checked: hasAnyChecked ? !!entry.checked : index === 0,
			}));
			this.storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(migrated), StorageScope.PROFILE, StorageTarget.MACHINE);
		} catch { /* ignore */ }

		this.storageService.remove(LEGACY_STORAGE_KEY_RECENT_PROJECTS, StorageScope.PROFILE);
	}

	// -- Recent workspaces storage --

	private _addRecentWorkspace(providerId: string, workspace: ISessionWorkspace, checked: boolean): void {
		const uri = workspace.repositories[0]?.uri;
		if (!uri) {
			return;
		}
		const recents = this._getStoredRecentWorkspaces();
		const filtered = recents.map(p => {
			// Remove the entry being re-added (it will go to the front)
			if (p.providerId === providerId && this.uriIdentityService.extUri.isEqual(URI.revive(p.uri), uri)) {
				return undefined;
			}
			// Clear checked from all other entries when marking checked
			if (checked && p.checked) {
				return { ...p, checked: false };
			}
			return p;
		}).filter((p): p is IStoredRecentWorkspace => p !== undefined);

		const entry: IStoredRecentWorkspace = { uri: uri.toJSON(), providerId, checked };
		const updated = [entry, ...filtered].slice(0, MAX_RECENT_WORKSPACES);
		this.storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(updated), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	protected _getRecentWorkspaces(): { providerId: string; workspace: ISessionWorkspace }[] {
		return this._getStoredRecentWorkspaces()
			.map(stored => {
				const uri = URI.revive(stored.uri);
				const workspace = this.sessionsProvidersService.getProvider(stored.providerId)?.resolveWorkspace(uri);
				if (!workspace) {
					return undefined;
				}
				return { providerId: stored.providerId, workspace };
			})
			.filter((w): w is { providerId: string; workspace: ISessionWorkspace } => w !== undefined);
	}

	protected _removeRecentWorkspace(selection: IWorkspaceSelection): void {
		const uri = selection.workspace.repositories[0]?.uri;
		if (!uri) {
			return;
		}
		const recents = this._getStoredRecentWorkspaces();
		const updated = recents.filter(p =>
			!(p.providerId === selection.providerId && this.uriIdentityService.extUri.isEqual(URI.revive(p.uri), uri))
		);
		this.storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(updated), StorageScope.PROFILE, StorageTarget.MACHINE);

		// Clear current selection if it was the removed workspace
		if (this._isSelectedWorkspace(selection)) {
			this._hidePicker();
			this._selectedWorkspace = undefined;
			this._updateTriggerLabel();
			this._onDidSelectWorkspace.fire(undefined);
		}
	}

	protected _removeVSCodeRecentWorkspace(selection: IWorkspaceSelection): void {
		const uri = selection.workspace.repositories[0]?.uri;
		if (!uri) {
			return;
		}
		this.workspacesService.removeRecentlyOpened([uri]);

		// Clear current selection if it was the removed workspace
		if (this._isSelectedWorkspace(selection)) {
			this._hidePicker();
			this._selectedWorkspace = undefined;
			this._updateTriggerLabel();
			this._onDidSelectWorkspace.fire(undefined);
		}
	}

	private _getStoredRecentWorkspaces(): IStoredRecentWorkspace[] {
		const raw = this.storageService.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		try {
			return JSON.parse(raw) as IStoredRecentWorkspace[];
		} catch {
			return [];
		}
	}

	// -- VS Code recent folders -----------------------------------------------

	private async _loadVSCodeRecentFolders(): Promise<void> {
		const recentlyOpened = await this.workspacesService.getRecentlyOpened();
		this._vsCodeRecentFolderUris = recentlyOpened.workspaces
			.filter(isRecentFolder)
			.map(f => f.folderUri)
			.filter(uri => !this._isCopilotWorktree(uri))
			.slice(0, 10);
	}

	/**
	 * Returns whether the given URI points to a copilot-managed folder
	 * (a folder whose name starts with `copilot-`).
	 */
	private _isCopilotWorktree(uri: URI): boolean {
		return basename(uri).startsWith('copilot-');
	}

	/**
	 * Returns VS Code recent folders resolved through registered session
	 * providers, excluding any URIs already present in the sessions' own
	 * recent workspace history.
	 */
	protected _getVSCodeRecentWorkspaces(): { providerId: string; workspace: ISessionWorkspace }[] {
		if (this._vsCodeRecentFolderUris.length === 0) {
			return [];
		}

		// Collect URIs already in sessions history to avoid duplicates
		const ownRecents = this._getStoredRecentWorkspaces();
		const ownUris = new Set(ownRecents.map(r => URI.revive(r.uri).toString()));

		const providers = this.sessionsProvidersService.getProviders();
		const result: { providerId: string; workspace: ISessionWorkspace }[] = [];

		for (const folderUri of this._vsCodeRecentFolderUris) {
			if (ownUris.has(folderUri.toString())) {
				continue;
			}
			for (const provider of providers) {
				if (this._isProviderUnavailable(provider.id)) {
					continue;
				}
				const workspace = provider.resolveWorkspace(folderUri);
				if (workspace) {
					result.push({ providerId: provider.id, workspace });
				}
			}
			if (result.length >= 10) {
				break;
			}
		}

		return result;
	}

}
