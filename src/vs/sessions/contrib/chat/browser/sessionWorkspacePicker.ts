/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ISessionWorkspace } from '../../sessions/common/sessionData.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ISessionsBrowseAction } from '../../sessions/browser/sessionsProvider.js';
import { COPILOT_PROVIDER_ID } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';

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
	private readonly _onDidChangeSelection = this._register(new Emitter<void>());
	readonly onDidChangeSelection: Event<void> = this._onDidChangeSelection.event;

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
			onHide: () => {
				triggerElement.setAttribute('aria-expanded', 'false');
				triggerElement.focus();
			},
		};

		const listOptions = showFilter
			? { showFilter: true, filterPlaceholder: localize('workspacePicker.filter', "Search Workspaces..."), reserveSubmenuSpace: false }
			: { reserveSubmenuSpace: false };
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
			// Group workspaces by provider, showing provider name as description on the first entry
			const providersWithWorkspaces = allProviders.filter(p => recentWorkspaces.some(w => w.providerId === p.id));
			for (let pi = 0; pi < providersWithWorkspaces.length; pi++) {
				const provider = providersWithWorkspaces[pi];
				const providerWorkspaces = recentWorkspaces.filter(w => w.providerId === provider.id);
				for (let i = 0; i < providerWorkspaces.length; i++) {
					const { workspace, providerId } = providerWorkspaces[i];
					const selection: IWorkspaceSelection = { providerId, workspace };
					const selected = this._isSelectedWorkspace(selection);
					items.push({
						kind: ActionListItemKind.Action,
						label: workspace.label,
						description: i === 0 ? provider.label : undefined,
						group: { title: '', icon: workspace.icon },
						item: { selection, checked: selected || undefined },
						onRemove: () => this._removeRecentWorkspace(selection),
					});
				}
				if (pi < providersWithWorkspaces.length - 1) {
					items.push({ kind: ActionListItemKind.Separator, label: '' });
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
					onRemove: () => this._removeRecentWorkspace(selection),
				});
			}
		}

		// Browse actions from all providers
		const allBrowseActions = this._getAllBrowseActions();
		if (items.length > 0 && allBrowseActions.length > 0) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
		}
		if (hasMultipleProviders && allBrowseActions.length > 1) {
			// Show a single "Browse..." entry with provider-grouped submenu actions
			const providerMap = new Map<string, { provider: typeof allProviders[0]; actions: { action: ISessionsBrowseAction; index: number }[] }>();
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
			const submenuActions = [...providerMap.values()].map(({ provider, actions }) =>
				new SubmenuAction(
					`workspacePicker.browse.${provider.id}`,
					'',
					actions.map(({ action, index }, ci) => toAction({
						id: `workspacePicker.browse.${index}`,
						label: localize(`workspacePicker.browse`, "{0}...", action.label),
						tooltip: ci === 0 ? provider.label : '',
						run: () => this._executeBrowseAction(index),
					})),
				)
			);
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('workspacePicker.browse', "Select..."),
				group: { title: '', icon: Codicon.folderOpened },
				item: {},
				submenuActions,
			});
		} else {
			for (let i = 0; i < allBrowseActions.length; i++) {
				const action = allBrowseActions[i];
				items.push({
					kind: ActionListItemKind.Action,
					label: localize(`workspacePicker.browse`, "Select {0}...", action.label),
					group: { title: '', icon: action.icon },
					item: { browseActionIndex: i },
				});
			}
		}

		return items;
	}

	private _updateTriggerLabel(): void {
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

	private _isSelectedWorkspace(selection: IWorkspaceSelection): boolean {
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
		try {
			const providers = this._getActiveProviders();
			const providerIds = new Set(providers.map(p => p.id));
			const storedRecents = this._getStoredRecentWorkspaces();

			// Find the checked entry for an active provider
			for (const stored of storedRecents) {
				if (!stored.checked || !providerIds.has(stored.providerId)) {
					continue;
				}
				const uri = URI.revive(stored.uri);
				const workspace = this.sessionsProvidersService.resolveWorkspace(stored.providerId, uri);
				if (workspace) {
					return { providerId: stored.providerId, workspace };
				}
			}

			// No checked entry found — fall back to the first resolvable recent workspace
			for (const stored of storedRecents) {
				if (!providerIds.has(stored.providerId)) {
					continue;
				}
				const uri = URI.revive(stored.uri);
				const workspace = this.sessionsProvidersService.resolveWorkspace(stored.providerId, uri);
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
			// Clear checked from other entries for the same provider when marking checked
			if (checked && p.providerId === providerId) {
				return { ...p, checked: false };
			}
			return p;
		}).filter((p): p is IStoredRecentWorkspace => p !== undefined);

		const entry: IStoredRecentWorkspace = { uri: uri.toJSON(), providerId, checked };
		const updated = [entry, ...filtered].slice(0, MAX_RECENT_WORKSPACES);
		this.storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(updated), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _getRecentWorkspaces(): { providerId: string; workspace: ISessionWorkspace }[] {
		return this._getStoredRecentWorkspaces()
			.map(stored => {
				const uri = URI.revive(stored.uri);
				const workspace = this.sessionsProvidersService.resolveWorkspace(stored.providerId, uri);
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

	private _removeRecentWorkspace(selection: IWorkspaceSelection): void {
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
			this._onDidChangeSelection.fire();
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

}
