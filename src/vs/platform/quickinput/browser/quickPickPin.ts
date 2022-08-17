/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickPick, IQuickPickItem, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

/**
 * Initially, adds pin buttons to all @param quickPick items.
 * When pinned, a copy of the item will be moved to the end of the pinned list and any duplicate within the pinned list will
 * be removed. Pin and pinned button events trigger updates to the underlying storage.
 * Shows the quickpick once formatted.
 */
export async function showWithPinnedItems(accessor: ServicesAccessor, storageKey: string, quickPick: IQuickPick<IQuickPickItem>, filterDuplicates?: boolean): Promise<void> {
	const storageService = accessor.get(IStorageService);
	quickPick.onDidTriggerItemButton(async (e) => {
		if (e.button.iconClass === ThemeIcon.asClassName(Codicon.pin) || e.button.iconClass === ThemeIcon.asClassName(Codicon.pinned)) {
			quickPick.items = await _formatPinnedItems(storageKey, quickPick, storageService, e.item, filterDuplicates);
		}
	});
	quickPick.onDidChangeValue(async value => {
		// don't show pinned items in the search results
		quickPick.items = value ? quickPick.items.filter(i => i.type !== 'separator' && !i.buttons?.find(b => b.iconClass === ThemeIcon.asClassName(Codicon.pinned))) : quickPick.items;
	});
	quickPick.items = await _formatPinnedItems(storageKey, quickPick, storageService, undefined, filterDuplicates);
	await quickPick.show();
}

function _formatPinnedItems(storageKey: string, quickPick: IQuickPick<IQuickPickItem>, storageService: IStorageService, changedItem?: IQuickPickItem, filterDuplicates?: boolean): QuickPickItem[] {
	const formattedItems: QuickPickItem[] = [];
	const updatedItems = !!changedItem?.label ? updatePinnedItems(storageKey, changedItem, storageService) : getPinnedItems(storageKey, storageService);
	if (updatedItems.length) {
		formattedItems.push({ type: 'separator', label: localize("terminal.commands.pinned", 'Pinned') });
	}
	const pinnedIds = new Set();
	for (const updatedItem of updatedItems) {
		const item = quickPick.items.find(i => i.label === updatedItem.label && i.type !== 'separator') as IQuickPickItem;
		if (item) {
			const pinnedItemId = 'pinned-' + (item.id || `${item.label}${item.description}${item.detail}}`);
			const pinnedItem: IQuickPickItem = Object.assign({} as IQuickPickItem, item);
			if (!filterDuplicates || !pinnedIds.has(pinnedItemId)) {
				pinnedItem.id = pinnedItemId;
				pinnedIds.add(pinnedItem.id);
				updateButtons(pinnedItem, false);
				formattedItems.push(pinnedItem);
			}
		}
	}

	for (const item of quickPick.items.filter(i => !!i.label)) {
		updateButtons(item, true);
		formattedItems.push(item);
	}
	return formattedItems;
}

function updateButtons(item: QuickPickItem, removePin: boolean): void {
	if (item.type === 'separator') {
		return;
	}
	item.buttons = item.buttons ? item.buttons?.filter(b => b.iconClass !== ThemeIcon.asClassName(Codicon.pin) && b.iconClass !== ThemeIcon.asClassName(Codicon.pinned)) : [];
	item.buttons.unshift({
		iconClass: removePin ? ThemeIcon.asClassName(Codicon.pin) : ThemeIcon.asClassName(Codicon.pinned),
		tooltip: removePin ? localize('pinCommand', "Pin command") : localize('pinnedCommand', "Pinned command"),
		alwaysVisible: false
	});
}

function updatePinnedItems(storageKey: string, changedItem: IQuickPickItem, storageService: IStorageService): IQuickPickItem[] {
	const removePin = changedItem.buttons?.find(b => b.iconClass === ThemeIcon.asClassName(Codicon.pinned));
	let items = getPinnedItems(storageKey, storageService);
	if (removePin) {
		items = items.filter(l => l.label !== changedItem.label);
	} else {
		items.push(changedItem);
	}
	storageService.store(storageKey, JSON.stringify(items), StorageScope.WORKSPACE, StorageTarget.USER);
	return items;
}

function getPinnedItems(storageKey: string, storageService: IStorageService): IQuickPickItem[] {
	const items = storageService.get(storageKey, StorageScope.WORKSPACE);
	return items ? JSON.parse(items) : [];
}
