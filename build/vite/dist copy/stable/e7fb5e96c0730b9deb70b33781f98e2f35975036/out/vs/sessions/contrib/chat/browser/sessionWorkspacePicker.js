/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../base/browser/dom.js';
import { SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IPreferencesService } from '../../../../workbench/services/preferences/common/preferences.js';
import { IOutputService } from '../../../../workbench/services/output/common/output.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { autorun } from '../../../../base/common/observable.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { COPILOT_PROVIDER_ID } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';
const LEGACY_STORAGE_KEY_RECENT_PROJECTS = 'sessions.recentlyPickedProjects';
const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedWorkspaces';
const FILTER_THRESHOLD = 10;
const MAX_RECENT_WORKSPACES = 10;
/**
 * A unified workspace picker that shows workspaces from all registered session
 * providers in a single dropdown.
 *
 * Browse actions from providers are appended at the bottom of the list.
 */
let WorkspacePicker = class WorkspacePicker extends Disposable {
    get selectedProject() {
        return this._selectedWorkspace;
    }
    constructor(actionWidgetService, storageService, uriIdentityService, sessionsProvidersService, sessionsManagementService, remoteAgentHostService, quickInputService, clipboardService, preferencesService, outputService) {
        super();
        this.actionWidgetService = actionWidgetService;
        this.storageService = storageService;
        this.uriIdentityService = uriIdentityService;
        this.sessionsProvidersService = sessionsProvidersService;
        this.sessionsManagementService = sessionsManagementService;
        this.remoteAgentHostService = remoteAgentHostService;
        this.quickInputService = quickInputService;
        this.clipboardService = clipboardService;
        this.preferencesService = preferencesService;
        this.outputService = outputService;
        this._onDidSelectWorkspace = this._register(new Emitter());
        this.onDidSelectWorkspace = this._onDidSelectWorkspace.event;
        this._onDidChangeSelection = this._register(new Emitter());
        this.onDidChangeSelection = this._onDidChangeSelection.event;
        this._renderDisposables = this._register(new DisposableStore());
        this._connectionStatusListener = this._register(new MutableDisposable());
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
                if (!providers.some(p => p.id === this._selectedWorkspace.providerId)) {
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
    }
    /**
     * Renders the project picker trigger button into the given container.
     * Returns the container element.
     */
    render(container) {
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
        this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
            dom.EventHelper.stop(e, true);
            this.showPicker();
        }));
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
    showPicker() {
        if (!this._triggerElement || this.actionWidgetService.isVisible) {
            return;
        }
        const items = this._buildItems();
        const showFilter = items.filter(i => i.kind === "action" /* ActionListItemKind.Action */).length > FILTER_THRESHOLD;
        const triggerElement = this._triggerElement;
        const delegate = {
            onSelect: (item) => {
                this.actionWidgetService.hide();
                if (item.selection && this._isProviderUnavailable(item.selection.providerId)) {
                    // Workspace belongs to an unavailable remote — ignore selection
                    return;
                }
                if (item.remoteProvider && item.browseActionIndex === undefined) {
                    // Disconnected remote host — show options menu after widget hides
                    this._showRemoteHostOptionsDelayed(item.remoteProvider);
                }
                else if (item.browseActionIndex !== undefined) {
                    this._executeBrowseAction(item.browseActionIndex);
                }
                else if (item.selection) {
                    this._selectProject(item.selection);
                }
            },
            onHide: () => {
                triggerElement.setAttribute('aria-expanded', 'false');
                triggerElement.focus();
            },
        };
        const listOptions = showFilter
            ? { showFilter: true, filterPlaceholder: localize('workspacePicker.filter', "Search Workspaces..."), reserveSubmenuSpace: false }
            : { reserveSubmenuSpace: false };
        triggerElement.setAttribute('aria-expanded', 'true');
        this.actionWidgetService.show('workspacePicker', false, items, delegate, this._triggerElement, undefined, [], {
            getAriaLabel: (item) => item.label ?? '',
            getWidgetAriaLabel: () => localize('workspacePicker.ariaLabel', "Workspace Picker"),
        }, listOptions);
    }
    /**
     * Programmatically set the selected project.
     * @param fireEvent Whether to fire the onDidSelectWorkspace event. Defaults to true.
     */
    setSelectedWorkspace(project, fireEvent = true) {
        this._selectProject(project, fireEvent);
    }
    /**
     * Clears the selected project.
     */
    clearSelection() {
        this.actionWidgetService.hide();
        this._selectedWorkspace = undefined;
        // Clear checked state from all recents
        const recents = this._getStoredRecentWorkspaces();
        const updated = recents.map(p => ({ ...p, checked: false }));
        this.storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(updated), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        this._updateTriggerLabel();
        this._onDidChangeSelection.fire();
    }
    /**
     * Clears the selection if it matches the given URI.
     */
    removeFromRecents(uri) {
        if (this._selectedWorkspace && this.uriIdentityService.extUri.isEqual(this._selectedWorkspace.workspace.repositories[0]?.uri, uri)) {
            this.clearSelection();
        }
    }
    _selectProject(selection, fireEvent = true) {
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
    async _executeBrowseAction(actionIndex) {
        const allActions = this._getAllBrowseActions();
        const action = allActions[actionIndex];
        if (!action) {
            return;
        }
        try {
            const workspace = await action.execute();
            if (workspace) {
                this._selectProject({ providerId: action.providerId, workspace });
            }
        }
        catch {
            // browse action was cancelled or failed
        }
    }
    _getActiveProviders() {
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
    _getAllBrowseActions() {
        return this.sessionsProvidersService.getProviders().flatMap(p => p.browseActions);
    }
    _buildItems() {
        const items = [];
        // Collect recent workspaces from picker storage across all providers
        const allProviders = this.sessionsProvidersService.getProviders();
        const providerIds = new Set(allProviders.map(p => p.id));
        const recentWorkspaces = this._getRecentWorkspaces().filter(w => providerIds.has(w.providerId));
        const hasMultipleProviders = allProviders.length > 1;
        if (hasMultipleProviders) {
            // Group workspaces by provider, showing provider name as description on the first entry
            const providersWithWorkspaces = allProviders.filter(p => recentWorkspaces.some(w => w.providerId === p.id));
            for (let pi = 0; pi < providersWithWorkspaces.length; pi++) {
                const provider = providersWithWorkspaces[pi];
                const isOffline = this._isProviderUnavailable(provider.id);
                const providerWorkspaces = recentWorkspaces.filter(w => w.providerId === provider.id);
                for (let i = 0; i < providerWorkspaces.length; i++) {
                    const { workspace, providerId } = providerWorkspaces[i];
                    const selection = { providerId, workspace };
                    const selected = this._isSelectedWorkspace(selection);
                    const description = i === 0
                        ? (isOffline ? localize('workspacePicker.providerOffline', "{0} (Offline)", provider.label) : provider.label)
                        : (isOffline ? localize('workspacePicker.offline', "Offline") : undefined);
                    items.push({
                        kind: "action" /* ActionListItemKind.Action */,
                        label: workspace.label,
                        description,
                        group: { title: '', icon: workspace.icon },
                        item: { selection, checked: selected || undefined },
                        onRemove: () => this._removeRecentWorkspace(selection),
                    });
                }
                if (pi < providersWithWorkspaces.length - 1) {
                    items.push({ kind: "separator" /* ActionListItemKind.Separator */, label: '' });
                }
            }
        }
        else {
            for (const { workspace, providerId } of recentWorkspaces) {
                const selection = { providerId, workspace };
                const selected = this._isSelectedWorkspace(selection);
                const isOffline = this._isProviderUnavailable(providerId);
                items.push({
                    kind: "action" /* ActionListItemKind.Action */,
                    label: workspace.label,
                    description: isOffline ? localize('workspacePicker.offlineSingle', "Offline") : undefined,
                    group: { title: '', icon: workspace.icon },
                    item: { selection, checked: selected || undefined },
                    onRemove: () => this._removeRecentWorkspace(selection),
                });
            }
        }
        // Browse actions from all providers
        const allBrowseActions = this._getAllBrowseActions();
        // Remote providers with connection status
        const remoteProviders = allProviders.filter(p => p.connectionStatus !== undefined);
        if (items.length > 0 && (allBrowseActions.length > 0 || remoteProviders.length > 0)) {
            items.push({ kind: "separator" /* ActionListItemKind.Separator */, label: '' });
        }
        if (hasMultipleProviders && (allBrowseActions.length + remoteProviders.length) > 1) {
            // Show a single "Select..." entry with provider-grouped submenu actions
            // that also includes remote host entries
            const providerMap = new Map();
            allBrowseActions.forEach((action, i) => {
                let entry = providerMap.get(action.providerId);
                if (!entry) {
                    const provider = allProviders.find(p => p.id === action.providerId);
                    if (!provider) {
                        return;
                    }
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
                    enabled: remoteStatus !== "disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */ && remoteStatus !== "connecting" /* RemoteAgentHostConnectionStatus.Connecting */,
                    run: () => this._executeBrowseAction(index),
                }));
                return new SubmenuAction(`workspacePicker.browse.${provider.id}`, '', actionItems);
            });
            items.push({
                kind: "action" /* ActionListItemKind.Action */,
                label: localize('workspacePicker.browseSelect', "Select..."),
                group: { title: '', icon: Codicon.folderOpened },
                item: {},
                submenuActions,
            });
        }
        else {
            for (let i = 0; i < allBrowseActions.length; i++) {
                const action = allBrowseActions[i];
                items.push({
                    kind: "action" /* ActionListItemKind.Action */,
                    label: localize(`workspacePicker.browseSelectAction`, "Select {0}...", action.label),
                    group: { title: '', icon: action.icon },
                    item: { browseActionIndex: i },
                });
            }
        }
        for (const provider of remoteProviders) {
            const status = provider.connectionStatus.get();
            const isConnected = status === "connected" /* RemoteAgentHostConnectionStatus.Connected */;
            const providerBrowseIndex = allBrowseActions.findIndex(a => a.providerId === provider.id);
            if (items.length > 0 && items[items.length - 1].kind !== "separator" /* ActionListItemKind.Separator */) {
                items.push({ kind: "separator" /* ActionListItemKind.Separator */, label: '' });
            }
            items.push({
                kind: "action" /* ActionListItemKind.Action */,
                label: provider.label,
                description: this._getStatusDescription(status),
                hover: { content: this._getStatusHover(status, provider.remoteAddress) },
                group: { title: '', icon: Codicon.remote },
                disabled: !isConnected,
                item: {
                    browseActionIndex: isConnected && providerBrowseIndex >= 0 ? providerBrowseIndex : undefined,
                    remoteProvider: provider,
                },
                toolbarActions: [
                    toAction({
                        id: `workspacePicker.remote.gear.${provider.id}`,
                        label: localize('workspacePicker.remoteOptions', "Options"),
                        class: ThemeIcon.asClassName(Codicon.gear),
                        run: () => {
                            this.actionWidgetService.hide();
                            this._showRemoteHostOptionsDelayed(provider);
                        },
                    }),
                ],
            });
        }
        return items;
    }
    /**
     * Returns a short status indicator with a colored circle icon for the description field.
     */
    _getStatusDescription(status) {
        const md = new MarkdownString(undefined, { supportThemeIcons: true });
        switch (status) {
            case "connected" /* RemoteAgentHostConnectionStatus.Connected */:
                md.appendText(localize('workspacePicker.statusOnline', "Online"));
                break;
            case "connecting" /* RemoteAgentHostConnectionStatus.Connecting */:
                md.appendText(localize('workspacePicker.statusConnecting', "Connecting"));
                break;
            case "disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */:
                md.appendText(localize('workspacePicker.statusOffline', "Offline"));
                break;
        }
        return md;
    }
    /**
     * Returns detailed hover text for a remote host's connection status.
     */
    _getStatusHover(status, address) {
        switch (status) {
            case "connected" /* RemoteAgentHostConnectionStatus.Connected */:
                return address
                    ? localize('workspacePicker.hoverConnectedAddr', "Remote agent host is connected and ready.\n\nAddress: {0}", address)
                    : localize('workspacePicker.hoverConnected', "Remote agent host is connected and ready.");
            case "connecting" /* RemoteAgentHostConnectionStatus.Connecting */:
                return address
                    ? localize('workspacePicker.hoverConnectingAddr', "Attempting to connect to remote agent host...\n\nAddress: {0}", address)
                    : localize('workspacePicker.hoverConnecting', "Attempting to connect to remote agent host...");
            case "disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */:
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
    _showRemoteHostOptionsDelayed(provider) {
        const timeout = setTimeout(() => this._showRemoteHostOptions(provider), 1);
        this._renderDisposables.add({ dispose: () => clearTimeout(timeout) });
    }
    async _showRemoteHostOptions(provider) {
        const address = provider.remoteAddress;
        if (!address) {
            return;
        }
        const status = provider.connectionStatus?.get();
        const isConnected = status === "connected" /* RemoteAgentHostConnectionStatus.Connected */;
        const items = [];
        if (!isConnected) {
            items.push({ label: '$(debug-restart) ' + localize('workspacePicker.reconnect', "Reconnect"), id: 'reconnect' });
        }
        items.push({ label: '$(trash) ' + localize('workspacePicker.removeRemote', "Remove Remote"), id: 'remove' }, { label: '$(copy) ' + localize('workspacePicker.copyAddress', "Copy Address"), id: 'copy' }, { label: '$(settings-gear) ' + localize('workspacePicker.openSettings', "Open Settings"), id: 'settings' });
        if (provider.outputChannelId) {
            items.push({ label: '$(output) ' + localize('workspacePicker.showOutput', "Show Output"), id: 'output' });
        }
        const picked = await this.quickInputService.pick(items, {
            placeHolder: localize('workspacePicker.remoteOptionsTitle', "Options for {0}", provider.label),
        });
        if (!picked) {
            return;
        }
        const action = picked.id;
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
    _updateTriggerLabel() {
        if (!this._triggerElement) {
            return;
        }
        dom.clearNode(this._triggerElement);
        const workspace = this._selectedWorkspace?.workspace;
        const label = workspace ? workspace.label : localize('pickWorkspace', "workspace");
        const icon = workspace ? workspace.icon : Codicon.project;
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
    _isProviderUnavailable(providerId) {
        const provider = this.sessionsProvidersService.getProviders().find(p => p.id === providerId);
        if (!provider?.connectionStatus) {
            return false;
        }
        return provider.connectionStatus.get() !== "connected" /* RemoteAgentHostConnectionStatus.Connected */;
    }
    /**
     * Watch connection status observables from all remote providers.
     * When a remote disconnects, clear the selection if it belongs to that
     * provider. When a remote reconnects, try to restore a stored workspace.
     */
    _watchConnectionStatus() {
        const remoteProviders = this.sessionsProvidersService.getProviders().filter(p => p.connectionStatus !== undefined);
        if (remoteProviders.length === 0) {
            this._connectionStatusListener.clear();
            return;
        }
        this._connectionStatusListener.value = autorun(reader => {
            for (const provider of remoteProviders) {
                provider.connectionStatus.read(reader);
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
    _isSelectedWorkspace(selection) {
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
    _persistSelectedWorkspace(selection) {
        const uri = selection.workspace.repositories[0]?.uri;
        if (!uri) {
            return;
        }
        this._addRecentWorkspace(selection.providerId, selection.workspace, true);
    }
    _restoreSelectedWorkspace() {
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
                const workspace = this.sessionsProvidersService.resolveWorkspace(stored.providerId, uri);
                if (workspace) {
                    return { providerId: stored.providerId, workspace };
                }
            }
            return undefined;
        }
        catch {
            return undefined;
        }
    }
    /**
     * Restore only the checked (previously selected) workspace if its provider
     * is currently available. Does not fall back to other workspaces.
     * Used by the connection status watcher to avoid unexpected workspace switches.
     */
    _restoreCheckedWorkspace() {
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
                const workspace = this.sessionsProvidersService.resolveWorkspace(stored.providerId, uri);
                if (workspace) {
                    return { providerId: stored.providerId, workspace };
                }
            }
            return undefined;
        }
        catch {
            return undefined;
        }
    }
    /**
     * Migrate legacy `sessions.recentlyPickedProjects` storage to the new
     * `sessions.recentlyPickedWorkspaces` key, adding `providerId` (defaulting
     * to Copilot) and ensuring at least one entry is checked.
     */
    _migrateLegacyStorage() {
        // Already migrated
        if (this.storageService.get(STORAGE_KEY_RECENT_WORKSPACES, 0 /* StorageScope.PROFILE */)) {
            return;
        }
        const raw = this.storageService.get(LEGACY_STORAGE_KEY_RECENT_PROJECTS, 0 /* StorageScope.PROFILE */);
        if (!raw) {
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            const hasAnyChecked = parsed.some(e => e.checked);
            const migrated = parsed.map((entry, index) => ({
                uri: entry.uri,
                providerId: COPILOT_PROVIDER_ID,
                checked: hasAnyChecked ? !!entry.checked : index === 0,
            }));
            this.storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(migrated), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        }
        catch { /* ignore */ }
        this.storageService.remove(LEGACY_STORAGE_KEY_RECENT_PROJECTS, 0 /* StorageScope.PROFILE */);
    }
    // -- Recent workspaces storage --
    _addRecentWorkspace(providerId, workspace, checked) {
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
        }).filter((p) => p !== undefined);
        const entry = { uri: uri.toJSON(), providerId, checked };
        const updated = [entry, ...filtered].slice(0, MAX_RECENT_WORKSPACES);
        this.storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(updated), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    _getRecentWorkspaces() {
        return this._getStoredRecentWorkspaces()
            .map(stored => {
            const uri = URI.revive(stored.uri);
            const workspace = this.sessionsProvidersService.resolveWorkspace(stored.providerId, uri);
            if (!workspace) {
                return undefined;
            }
            return { providerId: stored.providerId, workspace };
        })
            .filter((w) => w !== undefined)
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
    _removeRecentWorkspace(selection) {
        const uri = selection.workspace.repositories[0]?.uri;
        if (!uri) {
            return;
        }
        const recents = this._getStoredRecentWorkspaces();
        const updated = recents.filter(p => !(p.providerId === selection.providerId && this.uriIdentityService.extUri.isEqual(URI.revive(p.uri), uri)));
        this.storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(updated), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        // Clear current selection if it was the removed workspace
        if (this._isSelectedWorkspace(selection)) {
            this.actionWidgetService.hide();
            this._selectedWorkspace = undefined;
            this._updateTriggerLabel();
            this._onDidChangeSelection.fire();
        }
    }
    _getStoredRecentWorkspaces() {
        const raw = this.storageService.get(STORAGE_KEY_RECENT_WORKSPACES, 0 /* StorageScope.PROFILE */);
        if (!raw) {
            return [];
        }
        try {
            return JSON.parse(raw);
        }
        catch {
            return [];
        }
    }
};
WorkspacePicker = __decorate([
    __param(0, IActionWidgetService),
    __param(1, IStorageService),
    __param(2, IUriIdentityService),
    __param(3, ISessionsProvidersService),
    __param(4, ISessionsManagementService),
    __param(5, IRemoteAgentHostService),
    __param(6, IQuickInputService),
    __param(7, IClipboardService),
    __param(8, IPreferencesService),
    __param(9, IOutputService)
], WorkspacePicker);
export { WorkspacePicker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbldvcmtzcGFjZVBpY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3Nlc3Npb25Xb3Jrc3BhY2VQaWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsYUFBYSxFQUFFLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEcsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRWpHLE9BQU8sRUFBRSx1QkFBdUIsRUFBbUMsTUFBTSxpRUFBaUUsQ0FBQztBQUMzSSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUM5RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN2RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDeEYsT0FBTyxFQUFFLGtCQUFrQixFQUFrQixNQUFNLHNEQUFz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