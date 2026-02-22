/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspacesService, isRecentFolder } from '../../../../platform/workspaces/common/workspaces.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { INewSession } from './newSession.js';

const STORAGE_KEY_LAST_FOLDER = 'agentSessions.lastPickedFolder';
const STORAGE_KEY_RECENT_FOLDERS = 'agentSessions.recentlyPickedFolders';
const MAX_RECENT_FOLDERS = 10;
const FILTER_THRESHOLD = 10;

interface IFolderItem {
	readonly uri: URI;
	readonly label: string;
}

/**
 * A folder picker that uses the action widget dropdown to show a list of
 * recently selected and recently opened folders. Remembers the last selected
 * folder and recently picked folders in storage. Enables a filter input when
 * there are more than 10 items.
 */
export class FolderPicker extends Disposable {

	private readonly _onDidSelectFolder = this._register(new Emitter<URI>());
	readonly onDidSelectFolder: Event<URI> = this._onDidSelectFolder.event;

	private _selectedFolderUri: URI | undefined;
	private _recentlyPickedFolders: URI[] = [];
	private _cachedRecentFolders: { uri: URI; label?: string }[] = [];
	private _newSession: INewSession | undefined;

	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	get selectedFolderUri(): URI | undefined {
		return this._selectedFolderUri;
	}

	/**
	 * Sets the pending session that this picker writes to.
	 * When the user selects a folder, it calls `setRepoUri` on the session.
	 */
	setNewSession(session: INewSession | undefined): void {
		this._newSession = session;
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
	) {
		super();

		// Restore last picked folder
		const lastFolder = this.storageService.get(STORAGE_KEY_LAST_FOLDER, StorageScope.PROFILE);
		if (lastFolder) {
			try { this._selectedFolderUri = URI.parse(lastFolder); } catch { /* ignore */ }
		}

		// Restore recently picked folders
		try {
			const stored = this.storageService.get(STORAGE_KEY_RECENT_FOLDERS, StorageScope.PROFILE);
			if (stored) {
				this._recentlyPickedFolders = JSON.parse(stored).map((s: string) => URI.parse(s));
			}
		} catch { /* ignore */ }

		// Pre-fetch recently opened folders
		this.workspacesService.getRecentlyOpened().then(recent => {
			this._cachedRecentFolders = recent.workspaces
				.filter(isRecentFolder)
				.slice(0, MAX_RECENT_FOLDERS)
				.map(r => ({ uri: r.folderUri, label: r.label }));
		}).catch(() => { /* ignore */ });
	}

	/**
	 * Renders the folder picker trigger button into the given container.
	 * Returns the container element.
	 */
	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

		this._updateTriggerLabel(trigger);

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
	 * Shows the folder picker dropdown anchored to the trigger element.
	 */
	showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const currentFolderUri = this._selectedFolderUri ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;
		const items = this._buildItems(currentFolderUri);
		const showFilter = items.filter(i => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IFolderItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				if (item.uri.scheme === 'command' && item.uri.path === 'browse') {
					this._browseForFolder();
				} else {
					this._selectFolder(item.uri);
				}
			},
			onHide: () => { triggerElement.focus(); },
		};

		this.actionWidgetService.show<IFolderItem>(
			'folderPicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('folderPicker.ariaLabel', "Folder Picker"),
			},
			showFilter ? { showFilter: true, filterPlaceholder: localize('folderPicker.filter', "Filter folders...") } : undefined,
		);
	}

	/**
	 * Programmatically set the selected folder.
	 */
	setSelectedFolder(folderUri: URI): void {
		this._selectFolder(folderUri);
	}

	/**
	 * Clears the selected folder.
	 */
	clearSelection(): void {
		this._selectedFolderUri = undefined;
		this._updateTriggerLabel(this._triggerElement);
	}

	private _selectFolder(folderUri: URI): void {
		this._selectedFolderUri = folderUri;
		this._addToRecentlyPickedFolders(folderUri);
		this.storageService.store(STORAGE_KEY_LAST_FOLDER, folderUri.toString(), StorageScope.PROFILE, StorageTarget.MACHINE);
		this._updateTriggerLabel(this._triggerElement);
		this._newSession?.setRepoUri(folderUri);
		this._onDidSelectFolder.fire(folderUri);
	}

	private async _browseForFolder(): Promise<void> {
		try {
			const selected = await this.fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('selectFolder', "Select Folder"),
			});
			if (selected?.[0]) {
				this._selectFolder(selected[0]);
			}
		} catch {
			// dialog was cancelled or failed — nothing to do
		}
	}

	private _addToRecentlyPickedFolders(folderUri: URI): void {
		this._recentlyPickedFolders = [folderUri, ...this._recentlyPickedFolders.filter(f => !isEqual(f, folderUri))].slice(0, MAX_RECENT_FOLDERS);
		this.storageService.store(STORAGE_KEY_RECENT_FOLDERS, JSON.stringify(this._recentlyPickedFolders.map(f => f.toString())), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _buildItems(currentFolderUri: URI | undefined): IActionListItem<IFolderItem>[] {
		const seenUris = new Set<string>();
		if (currentFolderUri) {
			seenUris.add(currentFolderUri.toString());
		}

		const items: IActionListItem<IFolderItem>[] = [];

		// Currently selected folder (shown first, checked)
		if (currentFolderUri) {
			items.push({
				kind: ActionListItemKind.Action,
				label: basename(currentFolderUri),
				group: { title: '', icon: Codicon.check },
				item: { uri: currentFolderUri, label: basename(currentFolderUri) },
			});
		}

		// Combine recently picked folders and recently opened folders
		const allFolders: { uri: URI; label?: string }[] = [
			...this._recentlyPickedFolders.map(uri => ({ uri })),
			...this._cachedRecentFolders,
		];
		for (const folder of allFolders) {
			const key = folder.uri.toString();
			if (seenUris.has(key)) {
				continue;
			}
			seenUris.add(key);
			const label = folder.label || basename(folder.uri);
			items.push({
				kind: ActionListItemKind.Action,
				label,
				group: { title: '', icon: Codicon.blank },
				item: { uri: folder.uri, label },
			});
		}

		// Separator + Browse...
		if (items.length > 0) {
			items.push({
				kind: ActionListItemKind.Separator,
				label: '',
			});
		}
		items.push({
			kind: ActionListItemKind.Action,
			label: localize('browseFolder', "Browse..."),
			group: { title: '', icon: Codicon.folderOpened },
			item: { uri: URI.from({ scheme: 'command', path: 'browse' }), label: localize('browseFolder', "Browse...") },
		});

		return items;
	}

	private _updateTriggerLabel(trigger: HTMLElement | undefined): void {
		if (!trigger) {
			return;
		}

		dom.clearNode(trigger);
		const folderUri = this._selectedFolderUri ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;
		const label = folderUri ? basename(folderUri) : localize('pickFolder', "Pick Folder");

		dom.append(trigger, renderIcon(Codicon.folder));
		const labelSpan = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(trigger, renderIcon(Codicon.chevronDown));
	}
}
