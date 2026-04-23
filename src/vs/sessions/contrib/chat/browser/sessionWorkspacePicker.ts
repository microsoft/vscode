/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import * as touch from '../../../../base/browser/touch.js';
import { IAction, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { isNative } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TUNNEL_ADDRESS_PREFIX } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IPreferencesService } from '../../../../workbench/services/preferences/common/preferences.js';
import { IOutputService } from '../../../../workbench/services/output/common/output.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { autorun } from '../../../../base/common/observable.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ISessionWorkspace, ISessionWorkspaceBrowseAction } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { COPILOT_PROVIDER_ID } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';
import { IWorkspacesService, isRecentFolder } from '../../../../platform/workspaces/common/workspaces.js';

const LEGACY_STORAGE_KEY_RECENT_PROJECTS = 'sessions.recentlyPickedProjects';
const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedWorkspaces';
const FILTER_THRESHOLD = 10;
const MAX_RECENT_WORKSPACES = 10;

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
	/** Remote provider reference for gear menu actions. */
	readonly remoteProvider?: IAgentHostSessionsProvider;
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

	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _connectionStatusListener = this._register(new MutableDisposable());

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
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IOutputService private readonly outputService: IOutputService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
	) {
		super();

		// Migrate legacy storage to new key
		this._migrateLegacyStorage();

		// Restore selected workspace from storage
		this._selectedWorkspace = this._restoreSelectedWorkspace();

		// React to provider registrations/removals: re-validate the current
		// selection and attempt to restore a stored workspace when none is active.
		this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
			if (this._selectedWorkspace) {
				// Validate that the selected workspace's provider is still registered
				const providers = this.sessionsProvidersService.getProviders();
				if (!providers.some(p => p.id === this._selectedWorkspace!.providerId)) {
					this._selectedWorkspace = undefined;
					this._updateTriggerLabel();
				}
			}
			if (!this._selectedWorkspace) {
				const restored = this._restoreSelectedWorkspace();
				if (restored) {
					this._selectedWorkspace = restored;
					this._updateTriggerLabel();
					this._onDidChangeSelection.fire();
					this._onDidSelectWorkspace.fire(restored);
				}
			}
			this._watchConnectionStatus();
		}));

		this._watchConnectionStatus();

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
				if (item.remoteProvider && item.browseActionIndex === undefined) {
					if (!item.remoteProvider.remoteAddress?.startsWith(TUNNEL_ADDRESS_PREFIX)) {
						// Disconnected SSH host — show options menu after widget hides.
						// (Disconnected tunnels are rendered as disabled with a
						// refresh toolbar action, so onSelect doesn't fire for them.)
						this._showRemoteHostOptionsDelayed(item.remoteProvider);
					}
				} else if (item.browseActionIndex !== undefined) {
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

	private _getActiveProviders(): import('../../../services/sessions/common/sessionsProvider.js').ISessionsProvider[] {
		const activeProviderId = this.sessionsManagementService.activeProviderId.get();
		const allProviders = this.sessionsProvidersService.getProviders();
		if (activeProviderId) {
			const active = allProviders.find(p => p.id === activeProviderId);
			if (active) {
				return [active];
			}
		}
		return allProviders;
	}

	/**
	 * Collects browse actions from all registered providers.
	 */
	protected _getAllBrowseActions(): ISessionWorkspaceBrowseAction[] {
		return this.sessionsProvidersService.getProviders().flatMap(p => p.browseActions);
	}

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

		// Build flat list of workspace entries with their group info
		const workspaceEntries: { workspace: ISessionWorkspace; providerId: string; isOwnRecent: boolean; groupTitle: string; isDisconnected: boolean }[] = [];
		const providersWithWorkspaces = allProviders.filter(p => recentWorkspaces.some(w => w.providerId === p.id));
		for (const provider of providersWithWorkspaces) {
			const connectionStatus = isAgentHostProvider(provider) ? provider.connectionStatus?.get() : undefined;
			const isDisconnected = connectionStatus === RemoteAgentHostConnectionStatus.Disconnected;
			const isConnecting = connectionStatus === RemoteAgentHostConnectionStatus.Connecting;
			const providerWorkspaces = recentWorkspaces
				.map((w, idx) => ({ ...w, isOwnRecent: idx < ownRecentCount }))
				.filter(w => w.providerId === provider.id);
			for (const { workspace, providerId, isOwnRecent } of providerWorkspaces) {
				const groupName = workspace.group ?? provider.label;
				const groupTitle = isDisconnected
					? localize('workspacePicker.groupOffline', "{0} (Offline)", groupName)
					: isConnecting
						? localize('workspacePicker.groupConnecting', "{0} (Connecting)", groupName)
						: groupName;
				workspaceEntries.push({ workspace, providerId, isOwnRecent, groupTitle, isDisconnected });
			}
		}

		// Sort by group name, then by label within each group
		workspaceEntries.sort((a, b) => {
			const groupCmp = a.groupTitle.localeCompare(b.groupTitle);
			if (groupCmp !== 0) {
				return groupCmp;
			}
			return a.workspace.label.localeCompare(b.workspace.label);
		});

		// Add items with separators between groups
		let lastGroupTitle: string | undefined;
		for (const { workspace, providerId, isOwnRecent, groupTitle, isDisconnected } of workspaceEntries) {
			if (lastGroupTitle !== undefined && lastGroupTitle !== groupTitle) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			lastGroupTitle = groupTitle;
			const selection: IWorkspaceSelection = { providerId, workspace };
			const selected = this._isSelectedWorkspace(selection);
			items.push({
				kind: ActionListItemKind.Action,
				label: workspace.label,
				description: workspace.description,
				group: { title: groupTitle, icon: workspace.icon },
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
		if (allProviders.length > 1 && (allBrowseActions.length + remoteProviders.length) > 1) {
			// Show a single "Select..." entry with provider-grouped submenu actions
			// that also includes remote host entries
			const providerMap = new Map<string, { provider: typeof allProviders[0]; actions: { action: ISessionWorkspaceBrowseAction; index: number }[] }>();
			allBrowseActions.forEach((action, i) => {
				let entry = providerMap.get(action.providerId);
				if (!entry) {
					const provider = allProviders.find(p => p.id === action.providerId);
					if (!provider) { return; }
					entry = { provider, actions: [] };
					providerMap.set(action.providerId, entry);
				}
				entry.actions.push({ action, index: i });
			});
			const remoteProviderIds = new Map(remoteProviders.map(p => [p.id, p]));
			const submenuActions = [...providerMap.values()].map(({ provider, actions }) => {
				const remoteProvider = remoteProviderIds.get(provider.id);
				const remoteStatus = remoteProvider?.connectionStatus?.get();
				const actionItems = actions.map(({ action, index }, ci) => toAction({
					id: `workspacePicker.browse.${index}`,
					label: localize(`workspacePicker.browseAction`, "{0}...", action.label),
					tooltip: ci === 0 ? provider.label : '',
					enabled: remoteStatus !== RemoteAgentHostConnectionStatus.Disconnected && remoteStatus !== RemoteAgentHostConnectionStatus.Connecting,
					run: () => this._executeBrowseAction(index),
				}));

				return new SubmenuAction(
					`workspacePicker.browse.${provider.id}`,
					'',
					actionItems,
				);
			});

			items.push({
				kind: ActionListItemKind.Action,
				label: localize('workspacePicker.browseSelect', "Select..."),
				group: { title: '', icon: Codicon.folderOpened },
				item: {},
				submenuActions,
			});
		} else {
			for (let i = 0; i < allBrowseActions.length; i++) {
				const action = allBrowseActions[i];
				items.push({
					kind: ActionListItemKind.Action,
					label: localize(`workspacePicker.browseSelectAction`, "Select {0}...", action.label),
					group: { title: '', icon: action.icon },
					item: { browseActionIndex: i },
				});
			}
		}

		if (items.length > 0 && items[items.length - 1].kind !== ActionListItemKind.Separator && remoteProviders.length) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
		}

		for (const provider of remoteProviders) {
			const status = provider.connectionStatus!.get();
			const isConnected = status === RemoteAgentHostConnectionStatus.Connected;
			const providerBrowseIndex = allBrowseActions.findIndex(a => a.providerId === provider.id);
			const isTunnel = provider.remoteAddress?.startsWith(TUNNEL_ADDRESS_PREFIX);

			const toolbarActions: IAction[] = [];

			if (isTunnel) {
				// Offline/connecting tunnels: surface a refresh button that
				// attempts to (re)connect in case the cached status is stale.
				if (!isConnected && providerBrowseIndex >= 0) {
					const browseIndex = providerBrowseIndex;
					toolbarActions.push(toAction({
						id: `workspacePicker.remote.refresh.${provider.id}`,
						label: localize('workspacePicker.refreshTunnel', "Attempt to Connect"),
						class: ThemeIcon.asClassName(Codicon.refresh),
						run: () => {
							this.actionWidgetService.hide();
							this._executeBrowseAction(browseIndex);
						},
					}));
				}
			} else {
				// Gear menu only for SSH hosts, not tunnel providers
				toolbarActions.push(toAction({
					id: `workspacePicker.remote.gear.${provider.id}`,
					label: localize('workspacePicker.remoteOptions', "Options"),
					class: ThemeIcon.asClassName(Codicon.gear),
					run: () => {
						this.actionWidgetService.hide();
						this._showRemoteHostOptionsDelayed(provider);
					},
				}));
			}

			items.push({
				kind: ActionListItemKind.Action,
				label: provider.label,
				description: this._getStatusDescription(status),
				hover: { content: this._getStatusHover(status, provider.remoteAddress) },
				group: { title: '', icon: isTunnel ? Codicon.cloud : Codicon.remote },
				disabled: !isConnected,
				item: {
					browseActionIndex: isConnected && providerBrowseIndex >= 0 ? providerBrowseIndex : undefined,
					remoteProvider: provider,
				},
				toolbarActions,
			});
		}

		// "Tunnels..." and "SSH..." entries — shown when remote agent hosts are enabled
		if (this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			if (items.length > 0 && items[items.length - 1].kind !== ActionListItemKind.Separator) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('workspacePicker.tunnels', "Tunnels..."),
				group: { title: '', icon: Codicon.cloud },
				item: { commandId: 'workbench.action.sessions.connectViaTunnel' },
			});
			if (isNative) {
				items.push({
					kind: ActionListItemKind.Action,
					label: localize('workspacePicker.ssh', "SSH..."),
					group: { title: '', icon: Codicon.remote },
					item: { commandId: 'workbench.action.sessions.connectViaSSH' },
				});
			}
		}

		return items;
	}

	/**
	 * Returns a short status indicator with a colored circle icon for the description field.
	 */
	private _getStatusDescription(status: RemoteAgentHostConnectionStatus): MarkdownString {
		const md = new MarkdownString(undefined, { supportThemeIcons: true });
		switch (status) {
			case RemoteAgentHostConnectionStatus.Connected:
				md.appendText(localize('workspacePicker.statusOnline', "Online"));
				break;
			case RemoteAgentHostConnectionStatus.Connecting:
				md.appendText(localize('workspacePicker.statusConnecting', "Connecting"));
				break;
			case RemoteAgentHostConnectionStatus.Disconnected:
				md.appendText(localize('workspacePicker.statusOffline', "Offline"));
				break;
		}
		return md;
	}

	/**
	 * Returns detailed hover text for a remote host's connection status.
	 */
	private _getStatusHover(status: RemoteAgentHostConnectionStatus, address?: string): string {
		switch (status) {
			case RemoteAgentHostConnectionStatus.Connected:
				return address
					? localize('workspacePicker.hoverConnectedAddr', "Remote agent host is connected and ready.\n\nAddress: {0}", address)
					: localize('workspacePicker.hoverConnected', "Remote agent host is connected and ready.");
			case RemoteAgentHostConnectionStatus.Connecting:
				return address
					? localize('workspacePicker.hoverConnectingAddr', "Attempting to connect to remote agent host...\n\nAddress: {0}", address)
					: localize('workspacePicker.hoverConnecting', "Attempting to connect to remote agent host...");
			case RemoteAgentHostConnectionStatus.Disconnected:
				return address
					? localize('workspacePicker.hoverDisconnectedAddr', "Remote agent host is disconnected. Click the gear icon for options.\n\nAddress: {0}", address)
					: localize('workspacePicker.hoverDisconnected', "Remote agent host is disconnected. Click the gear icon for options.");
		}
	}

	/**
	 * Show the remote host options quickpick after a short delay.
	 * This ensures the action widget has fully hidden before the quickpick opens,
	 * preventing focus conflicts that cause the quickpick to flash and disappear.
	 */
	private _showRemoteHostOptionsDelayed(provider: IAgentHostSessionsProvider): void {
		const timeout = setTimeout(() => this._showRemoteHostOptions(provider), 1);
		this._renderDisposables.add({ dispose: () => clearTimeout(timeout) });
	}

	private async _showRemoteHostOptions(provider: IAgentHostSessionsProvider): Promise<void> {
		const address = provider.remoteAddress;
		if (!address) {
			return;
		}

		const status = provider.connectionStatus?.get();
		const isConnected = status === RemoteAgentHostConnectionStatus.Connected;

		const items: IQuickPickItem[] = [];
		if (!isConnected) {
			items.push({ label: '$(debug-restart) ' + localize('workspacePicker.reconnect', "Reconnect"), id: 'reconnect' });
		}
		items.push(
			{ label: '$(trash) ' + localize('workspacePicker.removeRemote', "Remove Remote"), id: 'remove' },
			{ label: '$(copy) ' + localize('workspacePicker.copyAddress', "Copy Address"), id: 'copy' },
			{ label: '$(settings-gear) ' + localize('workspacePicker.openSettings', "Open Settings"), id: 'settings' },
		);
		if (provider.outputChannelId) {
			items.push({ label: '$(output) ' + localize('workspacePicker.showOutput', "Show Output"), id: 'output' });
		}

		const picked = await this.quickInputService.pick(items, {
			placeHolder: localize('workspacePicker.remoteOptionsTitle', "Options for {0}", provider.label),
		});
		if (!picked) {
			return;
		}

		const action = (picked as IQuickPickItem & { id: string }).id;
		switch (action) {
			case 'reconnect':
				this.remoteAgentHostService.reconnect(address);
				break;
			case 'remove':
				await this.remoteAgentHostService.removeRemoteAgentHost(address);
				break;
			case 'copy':
				await this.clipboardService.writeText(address);
				break;
			case 'settings':
				await this.preferencesService.openSettings({ query: 'chat.remoteAgentHosts' });
				break;
			case 'output':
				if (provider.outputChannelId) {
					this.outputService.showChannel(provider.outputChannelId, true);
				}
				break;
		}
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

	/**
	 * Watch connection status observables from all remote providers.
	 * When a remote disconnects, clear the selection if it belongs to that
	 * provider. When a remote reconnects, try to restore a stored workspace.
	 */
	private _watchConnectionStatus(): void {
		const remoteProviders = this.sessionsProvidersService.getProviders().filter(isAgentHostProvider).filter(p => p.connectionStatus !== undefined);
		if (remoteProviders.length === 0) {
			this._connectionStatusListener.clear();
			return;
		}

		this._connectionStatusListener.value = autorun(reader => {
			for (const provider of remoteProviders) {
				provider.connectionStatus!.read(reader);
			}

			// If the current selection belongs to an unavailable provider, clear it
			if (this._selectedWorkspace && this._isProviderUnavailable(this._selectedWorkspace.providerId)) {
				this._selectedWorkspace = undefined;
				this._updateTriggerLabel();
				this._onDidChangeSelection.fire();
			}

			// If no selection, try to restore the previously checked workspace
			// (only the checked entry, not any fallback, to avoid unexpected switches)
			if (!this._selectedWorkspace) {
				const restored = this._restoreCheckedWorkspace();
				if (restored) {
					this._selectedWorkspace = restored;
					this._updateTriggerLabel();
					this._onDidChangeSelection.fire();
					this._onDidSelectWorkspace.fire(restored);
				}
			}
		});
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

		// Fall back to the first resolvable recent workspace from a connected provider
		try {
			const providers = this._getActiveProviders();
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
	 * is currently available. Does not fall back to other workspaces.
	 * Used by the connection status watcher to avoid unexpected workspace switches.
	 */
	private _restoreCheckedWorkspace(): IWorkspaceSelection | undefined {
		try {
			const providers = this._getActiveProviders();
			const providerIds = new Set(providers.map(p => p.id));
			const storedRecents = this._getStoredRecentWorkspaces();

			for (const stored of storedRecents) {
				if (!stored.checked || !providerIds.has(stored.providerId)) {
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
			.filter((w): w is { providerId: string; workspace: ISessionWorkspace } => w !== undefined)
			.sort((a, b) => {
				// Local folders first, then remote repositories, alphabetical within each group
				const aIsLocal = a.workspace.repositories[0]?.uri.scheme === Schemas.file;
				const bIsLocal = b.workspace.repositories[0]?.uri.scheme === Schemas.file;
				if (aIsLocal !== bIsLocal) {
					return aIsLocal ? -1 : 1;
				}
				return a.workspace.label.localeCompare(b.workspace.label);
			});
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
			.map(f => f.folderUri);
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
		}

		return result;
	}

}
