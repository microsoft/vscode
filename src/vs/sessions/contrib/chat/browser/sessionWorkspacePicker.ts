/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISessionWorkspace } from '../../sessions/common/sessionData.js';
import { basename } from '../../../../base/common/resources.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ISessionsBrowseAction } from '../../sessions/browser/sessionsProvider.js';

const STORAGE_KEY_SELECTED_WORKSPACE = 'sessions.selectedWorkspace';
const STORAGE_KEY_SELECTED_WORKSPACE_BY_PROVIDER = 'sessions.selectedWorkspaceByProvider';
const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedProjects';
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
 * Serializable form of the selected workspace for storage.
 */
interface IStoredSelectedWorkspace {
	readonly uri: UriComponents;
	readonly providerId: string;
}

/**
 * Map of provider ID to stored workspace URI.
 */
interface IStoredWorkspaceByProvider {
	[providerId: string]: UriComponents;
}

/**
 * Stored recent workspace entry.
 */
interface IStoredRecentWorkspace {
	readonly uri: UriComponents;
	readonly providerId: string;
}

/**
 * Item type used in the action list.
 */
interface IWorkspacePickerItem {
	readonly selection?: IWorkspaceSelection;
	readonly browseActionIndex?: number;
	readonly checked?: boolean;
}

/**
 * A unified workspace picker that shows workspaces from all registered session
 * providers in a single dropdown.
 *
 * Browse actions from providers are appended at the bottom of the list.
 */
export class WorkspacePicker extends Disposable {

	private readonly _onDidSelectWorkspace = this._register(new Emitter<IWorkspaceSelection>());
	readonly onDidSelectWorkspace: Event<IWorkspaceSelection> = this._onDidSelectWorkspace.event;

	private _selectedWorkspace: IWorkspaceSelection | undefined;

	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	get selectedProject(): IWorkspaceSelection | undefined {
		return this._selectedWorkspace;
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		// Migrate legacy single-key storage to per-provider storage
		this._migrateLegacyStorage();

		// Restore selected workspace from storage
		this._selectedWorkspace = this._restoreSelectedWorkspace();

		// If restore failed (providers not yet registered), retry when providers appear
		if (!this._selectedWorkspace && this._hasStoredWorkspace()) {
			const providerListener = this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
				if (!this._selectedWorkspace) {
					const restored = this._restoreSelectedWorkspace();
					if (restored) {
						this._selectedWorkspace = restored;
						this._updateTriggerLabel();
						this._onDidSelectWorkspace.fire(restored);
					}
				}
				if (this._selectedWorkspace) {
					providerListener.dispose();
				}
			}));
		}
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
				if (item.browseActionIndex !== undefined) {
					this._executeBrowseAction(item.browseActionIndex);
				} else if (item.selection) {
					this._selectProject(item.selection);
				}
			},
			onHide: () => { triggerElement.focus(); },
		};

		const listOptions = showFilter ? { showFilter: true, filterPlaceholder: localize('workspacePicker.filter', "Search Workspaces...") } : undefined;

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
	setSelectedProject(project: IWorkspaceSelection, fireEvent = true): void {
		this._selectProject(project, fireEvent);
	}

	/**
	 * Clears the selected project.
	 */
	clearSelection(): void {
		this._selectedWorkspace = undefined;
		this.storageService.remove(STORAGE_KEY_SELECTED_WORKSPACE, StorageScope.PROFILE);
		this._updateTriggerLabel();
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
		if (fireEvent) {
			this._onDidSelectWorkspace.fire(selection);
		}
	}

	/**
	 * Executes a browse action from a provider, identified by index.
	 */
	private async _executeBrowseAction(actionIndex: number): Promise<void> {
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
		} catch {
			// browse action was cancelled or failed
		}
	}

	private _getActiveProviders(): import('../../sessions/browser/sessionsProvider.js').ISessionsProvider[] {
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
	private _getAllBrowseActions(): ISessionsBrowseAction[] {
		return this.sessionsProvidersService.getProviders().flatMap(p => p.browseActions);
	}

	private _buildItems(): IActionListItem<IWorkspacePickerItem>[] {
		const items: IActionListItem<IWorkspacePickerItem>[] = [];

		// Collect recent workspaces from picker storage across all providers
		const allProviders = this.sessionsProvidersService.getProviders();
		const providerIds = new Set(allProviders.map(p => p.id));
		const recentWorkspaces = this._getRecentWorkspaces().filter(w => providerIds.has(w.providerId));
		const hasMultipleProviders = allProviders.length > 1;

		if (hasMultipleProviders) {
			// Group workspaces by provider
			for (const provider of allProviders) {
				const providerWorkspaces = recentWorkspaces.filter(w => w.providerId === provider.id);
				if (providerWorkspaces.length === 0) {
					continue;
				}
				items.push({
					kind: ActionListItemKind.Header,
					label: provider.label,
					group: { title: provider.label, icon: provider.icon },
					item: {},
				});
				for (const { workspace, providerId } of providerWorkspaces) {
					const selection: IWorkspaceSelection = { providerId, workspace };
					const selected = this._isSelectedWorkspace(selection);
					items.push({
						kind: ActionListItemKind.Action,
						label: workspace.label,
						group: { title: '', icon: workspace.icon },
						item: { selection, checked: selected || undefined },
					});
				}
			}
		} else {
			for (const { workspace, providerId } of recentWorkspaces) {
				const selection: IWorkspaceSelection = { providerId, workspace };
				const selected = this._isSelectedWorkspace(selection);
				items.push({
					kind: ActionListItemKind.Action,
					label: workspace.label,
					group: { title: '', icon: workspace.icon },
					item: { selection, checked: selected || undefined },
				});
			}
		}

		// Separator + Browse actions from providers
		const allBrowseActions = this._getAllBrowseActions();
		if (items.length > 0 && allBrowseActions.length > 0) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
		}
		for (let i = 0; i < allBrowseActions.length; i++) {
			const action = allBrowseActions[i];
			items.push({
				kind: ActionListItemKind.Action,
				label: action.label,
				group: { title: '', icon: action.icon },
				item: { browseActionIndex: i },
			});
		}

		return items;
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);
		const workspace = this._selectedWorkspace?.workspace;
		const label = workspace ? workspace.label : localize('pickWorkspace', "Pick a Workspace");
		const icon = workspace ? workspace.icon : Codicon.project;

		dom.append(this._triggerElement, renderIcon(icon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
	}

	private _isSelectedWorkspace(selection: IWorkspaceSelection): boolean {
		if (!this._selectedWorkspace) {
			return false;
		}
		return this._selectedWorkspace.providerId === selection.providerId
			&& this._selectedWorkspace.workspace.label === selection.workspace.label;
	}

	private _persistSelectedWorkspace(selection: IWorkspaceSelection): void {
		const uri = selection.workspace.repositories[0]?.uri;
		if (!uri) {
			return;
		}
		// Store per-provider selected workspace
		const byProvider = this._getStoredByProvider();
		byProvider[selection.providerId] = uri.toJSON();
		this.storageService.store(STORAGE_KEY_SELECTED_WORKSPACE_BY_PROVIDER, JSON.stringify(byProvider), StorageScope.PROFILE, StorageTarget.MACHINE);

		// Add to recent workspaces
		this._addRecentWorkspace(selection.providerId, selection.workspace);
	}

	private _hasStoredWorkspace(): boolean {
		return !!this.storageService.get(STORAGE_KEY_SELECTED_WORKSPACE_BY_PROVIDER, StorageScope.PROFILE);
	}

	private _getStoredByProvider(): IStoredWorkspaceByProvider {
		try {
			const raw = this.storageService.get(STORAGE_KEY_SELECTED_WORKSPACE_BY_PROVIDER, StorageScope.PROFILE);
			return raw ? JSON.parse(raw) : {};
		} catch {
			return {};
		}
	}

	private _restoreSelectedWorkspace(): IWorkspaceSelection | undefined {
		try {
			const byProvider = this._getStoredByProvider();
			const recentWorkspaces = this._getRecentWorkspaces();

			// Find the workspace for the active provider (or first available provider)
			const providers = this._getActiveProviders();
			for (const provider of providers) {
				const storedUri = byProvider[provider.id];
				if (!storedUri) {
					continue;
				}
				const uri = URI.revive(storedUri);
				const match = recentWorkspaces.find(w =>
					w.providerId === provider.id
					&& w.workspace.repositories[0]?.uri && this.uriIdentityService.extUri.isEqual(w.workspace.repositories[0].uri, uri)
				);
				if (match) {
					return { providerId: provider.id, workspace: match.workspace };
				}
			}
			return undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Migrate legacy single-key storage to per-provider storage.
	 */
	private _migrateLegacyStorage(): void {
		const raw = this.storageService.get(STORAGE_KEY_SELECTED_WORKSPACE, StorageScope.PROFILE);
		if (!raw) {
			return;
		}
		try {
			const stored: IStoredSelectedWorkspace = JSON.parse(raw);
			const byProvider = this._getStoredByProvider();
			if (!byProvider[stored.providerId]) {
				byProvider[stored.providerId] = stored.uri;
				this.storageService.store(STORAGE_KEY_SELECTED_WORKSPACE_BY_PROVIDER, JSON.stringify(byProvider), StorageScope.PROFILE, StorageTarget.MACHINE);
			}
			this.storageService.remove(STORAGE_KEY_SELECTED_WORKSPACE, StorageScope.PROFILE);
		} catch {
			this.storageService.remove(STORAGE_KEY_SELECTED_WORKSPACE, StorageScope.PROFILE);
		}
	}

	// -- Recent workspaces storage --

	private _addRecentWorkspace(providerId: string, workspace: ISessionWorkspace): void {
		const uri = workspace.repositories[0]?.uri;
		if (!uri) {
			return;
		}
		const recents = this._getStoredRecentWorkspaces();
		const filtered = recents.filter(p =>
			!(p.providerId === providerId && this.uriIdentityService.extUri.isEqual(URI.revive(p.uri), uri))
		);
		const updated: IStoredRecentWorkspace[] = [{ uri: uri.toJSON(), providerId }, ...filtered].slice(0, MAX_RECENT_WORKSPACES);
		this.storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(updated), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _getRecentWorkspaces(): { providerId: string; workspace: ISessionWorkspace }[] {
		return this._getStoredRecentWorkspaces().map(stored => {
			const uri = URI.revive(stored.uri);
			return {
				providerId: stored.providerId,
				workspace: {
					label: this._labelFromUri(uri),
					icon: this._iconFromUri(uri),
					repositories: [{ uri, workingDirectory: undefined, detail: undefined, baseBranchProtected: undefined }],
				},
			};
		});
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

	private _labelFromUri(uri: URI): string {
		if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			return uri.path.substring(1).replace(/\/HEAD$/, '');
		}
		return basename(uri);
	}

	private _iconFromUri(uri: URI): ThemeIcon {
		if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			return Codicon.repo;
		}
		return Codicon.folder;
	}
}
