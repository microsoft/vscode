/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename, extUriBiasedIgnorePathCase, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';

const STORAGE_KEY_LAST_FOLDER = 'agentSessions.lastPickedFolder';
const STORAGE_KEY_RECENT_FOLDERS = 'agentSessions.recentlyPickedFolders';
const MAX_RECENT_FOLDERS = 10;
const FILTER_THRESHOLD = 10;

interface IFolderItem {
	readonly uri: URI;
	readonly label: string;
	readonly checked?: boolean;
}

/**
 * A folder picker that uses the action widget dropdown to show a list of
 * recently selected and recently opened folders. Remembers the last selected
 * folder and recently picked folders in storage. Enables a filter input when
 * there are more than 10 items.
 */
export interface IFolderPickerOptions {
	/**
	 * Filesystem schemes to pass to `showOpenDialog`. When set, the dialog
	 * browses the given scheme(s) instead of the default local filesystem.
	 * This is used to browse a remote agent host's filesystem.
	 */
	readonly availableFileSystems?: readonly string[];

	/**
	 * Default URI to pass to `showOpenDialog` as the starting location.
	 */
	readonly defaultUri?: URI;

	/**
	 * Optional prefix for storage keys, so that different picker instances
	 * (e.g. local vs remote) don't share the same last-picked and recents.
	 */
	readonly storageKeyPrefix?: string;
}

export class FolderPicker extends Disposable {

	private readonly _onDidSelectFolder = this._register(new Emitter<URI>());
	readonly onDidSelectFolder: Event<URI> = this._onDidSelectFolder.event;

	private _selectedFolderUri: URI | undefined;
	private _recentlyPickedFolders: URI[] = [];

	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _storageKeyLastFolder: string;
	private readonly _storageKeyRecentFolders: string;

	get selectedFolderUri(): URI | undefined {
		return this._selectedFolderUri;
	}

	constructor(
		private readonly _options: IFolderPickerOptions | undefined,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IStorageService private readonly storageService: IStorageService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		const prefix = this._options?.storageKeyPrefix ?? '';
		this._storageKeyLastFolder = prefix + STORAGE_KEY_LAST_FOLDER;
		this._storageKeyRecentFolders = prefix + STORAGE_KEY_RECENT_FOLDERS;

		// The set of schemes this picker is allowed to browse
		const allowedSchemes = new Set(this._options?.availableFileSystems ?? [Schemas.file]);

		// Restore last picked folder (skip URIs with schemes this picker can't handle)
		const lastFolder = this.storageService.get(this._storageKeyLastFolder, StorageScope.PROFILE);
		if (lastFolder) {
			try {
				const parsed = URI.parse(lastFolder);
				if (allowedSchemes.has(parsed.scheme)) {
					this._selectedFolderUri = parsed;
				}
			} catch { /* ignore */ }
		}

		// Restore recently picked folders (filter out URIs with foreign schemes)
		try {
			const stored = this.storageService.get(this._storageKeyRecentFolders, StorageScope.PROFILE);
			if (stored) {
				this._recentlyPickedFolders = JSON.parse(stored)
					.map((s: string) => URI.parse(s))
					.filter((u: URI) => allowedSchemes.has(u.scheme));
			}
		} catch { /* ignore */ }
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

		const currentFolderUri = this._selectedFolderUri;
		const items = this._buildItems(currentFolderUri);
		const showFilter = items.filter(i => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IFolderItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				if (item.uri.scheme === 'command' && item.uri.path === 'browse') {
					this._browseForFolder();
				} else if (item.uri.scheme === 'command' && item.uri.path === 'clone') {
					this._cloneRepository();
				} else {
					this._selectFolder(item.uri);
				}
			},
			onHide: () => { triggerElement.focus(); },
		};

		const listOptions = showFilter ? { showFilter: true, filterPlaceholder: localize('folderPicker.filter', "Filter folders...") } : undefined;

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
			listOptions,
		);
	}

	/**
	 * Programmatically set the selected folder (e.g. restoring draft state).
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
		this.storageService.store(this._storageKeyLastFolder, folderUri.toString(), StorageScope.PROFILE, StorageTarget.MACHINE);
		this._updateTriggerLabel(this._triggerElement);
		this._onDidSelectFolder.fire(folderUri);
	}

	private async _browseForFolder(): Promise<void> {
		try {
			const selected = await this.fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('selectFolder', "Select Folder"),
				availableFileSystems: this._options?.availableFileSystems?.slice(),
				defaultUri: this._options?.defaultUri,
			});
			if (selected?.[0]) {
				this._selectFolder(selected[0]);
			}
		} catch {
			// dialog was cancelled or failed — nothing to do
		}
	}

	private async _cloneRepository(): Promise<void> {
		try {
			const clonedPath: string | undefined = await this.commandService.executeCommand('git.clone', undefined, undefined, { postCloneAction: 'none' });
			if (clonedPath) {
				this._selectFolder(URI.file(clonedPath));
			}
		} catch {
			// clone was cancelled or failed — nothing to do
		}
	}

	private _addToRecentlyPickedFolders(folderUri: URI): void {
		this._recentlyPickedFolders = [folderUri, ...this._recentlyPickedFolders.filter(f => !isEqual(f, folderUri))].slice(0, MAX_RECENT_FOLDERS);
		this.storageService.store(this._storageKeyRecentFolders, JSON.stringify(this._recentlyPickedFolders.map(f => f.toString())), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _buildItems(currentFolderUri: URI | undefined): IActionListItem<IFolderItem>[] {
		const seenUris = new Set<string>();

		const items: IActionListItem<IFolderItem>[] = [];

		// Collect all folders (current + recently picked), deduplicated and sorted by name
		const allFolders: { uri: URI; label: string }[] = [];
		if (currentFolderUri) {
			seenUris.add(currentFolderUri.toString());
			allFolders.push({ uri: currentFolderUri, label: basename(currentFolderUri) });
		}
		for (const folderUri of this._recentlyPickedFolders) {
			const key = folderUri.toString();
			if (seenUris.has(key)) {
				continue;
			}
			seenUris.add(key);
			allFolders.push({ uri: folderUri, label: basename(folderUri) });
		}
		allFolders.sort((a, b) => extUriBiasedIgnorePathCase.compare(a.uri, b.uri));
		for (const folder of allFolders) {
			const isCurrent = currentFolderUri && isEqual(folder.uri, currentFolderUri);
			items.push({
				kind: ActionListItemKind.Action,
				label: folder.label,
				group: { title: '', icon: Codicon.folder },
				item: { uri: folder.uri, label: folder.label, checked: isCurrent || false },
				...(!isCurrent ? { onRemove: () => this._removeFolder(folder.uri) } : {}),
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
			group: { title: '', icon: Codicon.search },
			item: { uri: URI.from({ scheme: 'command', path: 'browse' }), label: localize('browseFolder', "Browse...") },
		});
		if (!this._options?.availableFileSystems?.length) {
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('cloneRepository', "Clone..."),
				group: { title: '', icon: Codicon.repoClone },
				item: { uri: URI.from({ scheme: 'command', path: 'clone' }), label: localize('cloneRepository', "Clone...") },
			});
		}

		return items;
	}

	/**
	 * Removes a folder from the recently picked list and storage.
	 */
	removeFromRecents(folderUri: URI): void {
		this._recentlyPickedFolders = this._recentlyPickedFolders.filter(f => !isEqual(f, folderUri));
		this.storageService.store(this._storageKeyRecentFolders, JSON.stringify(this._recentlyPickedFolders.map(f => f.toString())), StorageScope.PROFILE, StorageTarget.MACHINE);
		// If this was the last picked folder, clear it
		if (this._selectedFolderUri && isEqual(this._selectedFolderUri, folderUri)) {
			this._selectedFolderUri = undefined;
			this.storageService.remove(this._storageKeyLastFolder, StorageScope.PROFILE);
			this._updateTriggerLabel(this._triggerElement);
		}
	}

	private _removeFolder(folderUri: URI): void {
		this._recentlyPickedFolders = this._recentlyPickedFolders.filter(f => !isEqual(f, folderUri));
		this.storageService.store(this._storageKeyRecentFolders, JSON.stringify(this._recentlyPickedFolders.map(f => f.toString())), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _updateTriggerLabel(trigger: HTMLElement | undefined): void {
		if (!trigger) {
			return;
		}

		dom.clearNode(trigger);
		const folderUri = this._selectedFolderUri;
		const label = folderUri ? basename(folderUri) : localize('pickFolder', "Pick Folder");

		dom.append(trigger, renderIcon(Codicon.folder));
		const labelSpan = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(trigger, renderIcon(Codicon.chevronDown));
	}
}
