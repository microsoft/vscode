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
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
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
import { ISessionWorkspace, ISessionWorkspaceBrowseAction } from '../../../services/sessions/common/session.js';
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

	/** Cached VS Code recent folder URIs, resolved lazily. */
	private _vsCodeRecentFolderUris: URI[] = [];

	get selectedProject(): IWorkspaceSelection | undefined {
		return this._selectedWorkspace;
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
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
	 */
	showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const items = this._buildItems();
		const showFilter = items.filter(i => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IWorkspacePickerItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
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

		const listOptions = showFilter
			? { showFilter: true, filterPlaceholder: localize('workspacePicker.filter', "Search Workspaces..."), reserveSubmenuSpace: false, inlineDescription: true, showGroupTitleOnFirstItem: true }
			: { reserveSubmenuSpace: false, inlineDescription: true, showGroupTitleOnFirstItem: true };
		triggerElement.setAttribute('aria-expanded', 'true');

		this.actionWidgetService.show<IWorkspacePickerItem>(
			'workspacePicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('workspacePicker.ariaLabel', "Workspace Picker"),
			},
			listOptions,
		);
	}

	/**
	 * Programmatically set the selected project.
	 * @param fireEvent Whether to fire the onDidSelectWorkspace event. Defaults to true.
	 */
	setSelectedWorkspace(project: IWorkspaceSelection, fireEvent = true): void {
		this._selectProject(project, fireEvent);
	}

	/**
	 * Clears the selected project.
	 */
	clearSelection(): void {
		this.actionWidgetService.hide();
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
	 * Collects browse actions from all registered providers.
	 */
	protected _getAllBrowseActions(): ISessionWorkspaceBrowseAction[] {
		return this.sessionsProvidersService.getProviders().flatMap(p => p.browseActions);
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
		const ownRecentWorkspaces = this._getRecentWorkspaces().filter(w => providerIds.has(w.providerId));

		// Merge VS Code recent folders (resolved through providers, deduplicated)
		const vsCodeRecents = this._getVSCodeRecentWorkspaces().filter(w => providerIds.has(w.providerId));
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

		// Browse actions from all providers
		const allBrowseActions = this._getAllBrowseActions();
		// Remote providers with connection status
		const remoteProviders = allProviders.filter(isAgentHostProvider).filter(p => p.connectionStatus !== undefined);

		if (items.length > 0 && (allBrowseActions.length > 0 || remoteProviders.length > 0)) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
		}

		// Group browse actions by their `group` property so that actions
		// sharing the same group appear as a single entry with a submenu.
		// Actions without a group are shown individually.
		const browseByGroup = new Map<string, { label: string; icon: ThemeIcon; actions: { action: ISessionWorkspaceBrowseAction; index: number }[] }>();
		const ungrouped: { action: ISessionWorkspaceBrowseAction; index: number }[] = [];
		allBrowseActions.forEach((action, i) => {
			if (!action.group) {
				ungrouped.push({ action, index: i });
				return;
			}
			let entry = browseByGroup.get(action.group);
			if (!entry) {
				entry = { label: action.label, icon: action.icon, actions: [] };
				browseByGroup.set(action.group, entry);
			}
			entry.actions.push({ action, index: i });
		});

		for (const [groupKey, { label, icon, actions }] of browseByGroup) {
			if (actions.length === 1) {
				// Single provider for this group — show directly
				const { action, index } = actions[0];
				const provider = allProviders.find(p => p.id === action.providerId);
				const connectionStatus = provider && isAgentHostProvider(provider) ? provider.connectionStatus?.get() : undefined;
				const isUnavailable = connectionStatus === RemoteAgentHostConnectionStatus.Disconnected || connectionStatus === RemoteAgentHostConnectionStatus.Connecting;
				items.push({
					kind: ActionListItemKind.Action,
					label: localize(`workspacePicker.browseSelectAction`, "Select {0}...", label),
					description: action.description,
					group: { title: '', icon },
					disabled: isUnavailable,
					item: { browseActionIndex: index },
				});
			} else {
				// Multiple providers for this group — show submenu
				const submenuActions = actions.map(({ action, index }) => {
					const provider = allProviders.find(p => p.id === action.providerId);
					const connectionStatus = provider && isAgentHostProvider(provider) ? provider.connectionStatus?.get() : undefined;
					const isUnavailable = connectionStatus === RemoteAgentHostConnectionStatus.Disconnected || connectionStatus === RemoteAgentHostConnectionStatus.Connecting;
					return {
						...toAction({
							id: `workspacePicker.browse.${index}`,
							label: action.description ?? provider?.label ?? label,
							tooltip: '',
							enabled: !isUnavailable,
							run: () => this._executeBrowseAction(index),
						}),
						icon: action.icon,
					};
				});
				items.push({
					kind: ActionListItemKind.Action,
					label: localize('workspacePicker.browseSelectAction', "Select {0}...", label),
					group: { title: '', icon },
					item: {},
					submenuActions: [new SubmenuAction(`workspacePicker.browse.group.${groupKey}`, '', submenuActions)],
				});
			}
		}

		// Ungrouped actions shown individually
		for (const { action, index } of ungrouped) {
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
		}

		// "Manage" submenu: dynamic remote provider entries + menu-contributed actions

		// Dynamic remote provider entries
		const remoteProviderActions: IAction[] = [];
		for (const provider of remoteProviders) {
			const status = provider.connectionStatus!.get();
			const isTunnel = provider.remoteAddress?.startsWith(TUNNEL_ADDRESS_PREFIX);
			const action = toAction({
				id: `workspacePicker.remote.${provider.id}`,
				label: provider.label,
				tooltip: getStatusLabel(status),
				enabled: true,
				run: () => {
					this.actionWidgetService.hide();
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
			remoteProviderActions.push(action);
		}

		// Menu-contributed actions (e.g. Tunnels..., SSH...)
		const menuContributedActions: IAction[] = [];
		const menuActions = this.menuService.getMenuActions(Menus.SessionWorkspaceManage, this.contextKeyService, { renderShortTitle: true });
		for (const [, actions] of menuActions) {
			for (const menuAction of actions) {
				if (menuAction instanceof MenuItemAction) {
					const icon = ThemeIcon.isThemeIcon(menuAction.item.icon) ? menuAction.item.icon : undefined;
					menuContributedActions.push(Object.assign(menuAction, { icon }));
				}
			}
		}

		// Build submenu groups — each SubmenuAction becomes a visual group with
		// automatic separators between them.
		const manageSubmenuActions: SubmenuAction[] = [];
		if (remoteProviderActions.length > 0) {
			manageSubmenuActions.push(new SubmenuAction('workspacePicker.manage.remotes', '', remoteProviderActions));
		}
		if (menuContributedActions.length > 0) {
			manageSubmenuActions.push(new SubmenuAction('workspacePicker.manage.menu', '', menuContributedActions));
		}

		if (manageSubmenuActions.length > 0) {
			if (items.length > 0 && items[items.length - 1].kind !== ActionListItemKind.Separator) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('workspacePicker.manage', "Manage..."),
				group: { title: '', icon: Codicon.settingsGear },
				item: {},
				submenuActions: manageSubmenuActions,
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
			this.actionWidgetService.hide();
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
			this.actionWidgetService.hide();
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
