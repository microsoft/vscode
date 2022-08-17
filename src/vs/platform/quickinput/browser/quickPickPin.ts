/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickPick, IQuickPickItem, IQuickPickItemButtonEvent, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

/**
 * Initially, adds pin buttons to all @param quickPick items.
 * When pinned, a copy of the item will be moved to the end of the pinned list and any duplicate within the pinned list will
 * be removed. Pin and pinned button events trigger updates to the underlying storage.
 * Shows the quickpick once formatted.
 */
export async function showWithPinnedItems(accessor: ServicesAccessor, storageKey: string, quickPick: IQuickPick<IQuickPickItem>): Promise<void> {
	const storageService = accessor.get(IStorageService);
	quickPick.onDidTriggerItemButton(async (e) => {
		if (e.button.iconClass === ThemeIcon.asClassName(Codicon.pin) || e.button.iconClass === ThemeIcon.asClassName(Codicon.pinned)) {
			quickPick.items = await _formatPinnedItems(storageKey, quickPick, storageService, e);
		}
	});
	quickPick.onDidChangeValue(async value => {
		// don't show pinned items in the search results
		quickPick.items = value ? quickPick.items.filter(i => i.type !== 'separator' && !i.buttons?.find(b => b.iconClass === ThemeIcon.asClassName(Codicon.pinned))) : quickPick.items;
	});
	quickPick.items = await _formatPinnedItems(storageKey, quickPick, storageService);
	await quickPick.show();
}

function _formatPinnedItems(storageKey: string, quickPick: IQuickPick<IQuickPickItem>, storageService: IStorageService, changedItem?: IQuickPickItem): QuickPickItem[] {
	const formattedItems: QuickPickItem[] = [];
	const labels = getPinnedItems(storageKey, storageService).map(item => item.label);
	const updatedLabels = !!event?.item.label ? updatePinnedItems(storageKey, event.item, storageService, new Set(labels).has(event.item.label)) : labels.filter(l => l !== 'Pinned');
	if (updatedLabels.length) {
		formattedItems.push({ type: 'separator', label: localize("terminal.commands.pinned", 'Pinned') });
	}
	for (const label of updatedLabels) {
		const item = quickPick.items.find(i => i.label === label && i.type !== 'separator');
		if (item) {
			const pinnedItem = Object.assign({}, item);
			updateButtons(pinnedItem, false);
			formattedItems.push(pinnedItem);
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

function updatePinnedItems(storageKey: string, item: IQuickPickItem, storageService: IStorageService, removePin: boolean): IQuickPickItem[] {
	const items = getPinnedItems(storageKey, storageService).filter(l => l.label !== item.label);
	if (!removePin) {
		items.push(item);
	}
	storageService.store(storageKey, JSON.stringify(items), StorageScope.WORKSPACE, StorageTarget.USER);
	return items;
}

function getPinnedItems(storageKey: string, storageService: IStorageService): IQuickPickItem[] {
	const items = storageService.get(storageKey, StorageScope.WORKSPACE);
	return items ? JSON.parse(items) : [];
}
