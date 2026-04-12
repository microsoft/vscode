/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../base/common/codicons.js';
import { localize } from '../../../nls.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
const pinButtonClass = ThemeIcon.asClassName(Codicon.pin);
const pinnedButtonClass = ThemeIcon.asClassName(Codicon.pinned);
const buttonClasses = [pinButtonClass, pinnedButtonClass];
/**
 * Initially, adds pin buttons to all @param quickPick items.
 * When pinned, a copy of the item will be moved to the end of the pinned list and any duplicate within the pinned list will
 * be removed if @param filterDupliates has been provided. Pin and pinned button events trigger updates to the underlying storage.
 * Shows the quickpick once formatted.
 */
export function showWithPinnedItems(storageService, storageKey, quickPick, filterDuplicates) {
    const itemsWithoutPinned = quickPick.items;
    let itemsWithPinned = _formatPinnedItems(storageKey, quickPick, storageService, undefined, filterDuplicates);
    const disposables = new DisposableStore();
    disposables.add(quickPick.onDidTriggerItemButton(async (buttonEvent) => {
        const expectedButton = buttonEvent.button.iconClass && buttonClasses.includes(buttonEvent.button.iconClass);
        if (expectedButton) {
            quickPick.items = itemsWithoutPinned;
            itemsWithPinned = _formatPinnedItems(storageKey, quickPick, storageService, buttonEvent.item, filterDuplicates);
            quickPick.items = quickPick.value ? itemsWithoutPinned : itemsWithPinned;
        }
    }));
    disposables.add(quickPick.onDidChangeValue(async (value) => {
        if (quickPick.items === itemsWithPinned && value) {
            quickPick.items = itemsWithoutPinned;
        }
        else if (quickPick.items === itemsWithoutPinned && !value) {
            quickPick.items = itemsWithPinned;
        }
    }));
    quickPick.items = quickPick.value ? itemsWithoutPinned : itemsWithPinned;
    quickPick.show();
    return disposables;
}
function _formatPinnedItems(storageKey, quickPick, storageService, changedItem, filterDuplicates) {
    const formattedItems = [];
    let pinnedItems;
    if (changedItem) {
        pinnedItems = updatePinnedItems(storageKey, changedItem, storageService);
    }
    else {
        pinnedItems = getPinnedItems(storageKey, storageService);
    }
    if (pinnedItems.length) {
        formattedItems.push({ type: 'separator', label: localize("terminal.commands.pinned", 'pinned') });
    }
    const pinnedIds = new Set();
    for (const itemToFind of pinnedItems) {
        const itemToPin = quickPick.items.find(item => itemsMatch(item, itemToFind));
        if (itemToPin) {
            const pinnedItemId = getItemIdentifier(itemToPin);
            const pinnedItem = { ...itemToPin };
            if (!filterDuplicates || !pinnedIds.has(pinnedItemId)) {
                pinnedIds.add(pinnedItemId);
                updateButtons(pinnedItem, false);
                formattedItems.push(pinnedItem);
            }
        }
    }
    for (const item of quickPick.items) {
        updateButtons(item, true);
        formattedItems.push(item);
    }
    return formattedItems;
}
function getItemIdentifier(item) {
    return item.type === 'separator' ? '' : item.id || `${item.label}${item.description}${item.detail}`;
}
function updateButtons(item, removePin) {
    if (item.type === 'separator') {
        return;
    }
    // remove button classes before adding the new one
    const newButtons = item.buttons?.filter(button => button.iconClass && !buttonClasses.includes(button.iconClass)) ?? [];
    newButtons.unshift({
        iconClass: removePin ? pinButtonClass : pinnedButtonClass,
        tooltip: removePin ? localize('pinCommand', "Pin command") : localize('pinnedCommand', "Pinned command"),
        alwaysVisible: false
    });
    item.buttons = newButtons;
}
function itemsMatch(itemA, itemB) {
    return getItemIdentifier(itemA) === getItemIdentifier(itemB);
}
function updatePinnedItems(storageKey, changedItem, storageService) {
    const removePin = changedItem.buttons?.find(b => b.iconClass === pinnedButtonClass);
    let items = getPinnedItems(storageKey, storageService);
    if (removePin) {
        items = items.filter(item => getItemIdentifier(item) !== getItemIdentifier(changedItem));
    }
    else {
        items.push(changedItem);
    }
    storageService.store(storageKey, JSON.stringify(items.map(formatPinnedItemForStorage)), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    return items;
}
function getPinnedItems(storageKey, storageService) {
    const items = storageService.get(storageKey, 1 /* StorageScope.WORKSPACE */);
    return items ? JSON.parse(items) : [];
}
function formatPinnedItemForStorage(item) {
    return {
        label: item.label,
        description: item.description,
        detail: item.detail,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tQaWNrUGluLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3F1aWNrUGlja1Bpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRzNDLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFFakYsTUFBTSxjQUFjLEdBQUcsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDMUQsTUFBTSxpQkFBaUIsR0FBRyxTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNoRSxNQUFNLGFBQWEsR0FBRyxDQUFDLGNBQWMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0FBQzFEOzs7OztHQUtHO0FBQ0gsTUFBTSxVQUFVLG1CQUFtQixDQUFDLGNBQStCLEVBQUUsVUFBa0IsRUFBRSxTQUE4RCxFQUFFLGdCQUEwQjtJQUNsTCxNQUFNLGtCQUFrQixHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUM7SUFDM0MsSUFBSSxlQUFlLEdBQUcsa0JBQWtCLENBQUMsVUFBVSxFQUFFLFNBQVMsRUFBRSxjQUFjLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFDN0csTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUMxQyxXQUFXLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUMsV0FBVyxFQUFDLEVBQUU7UUFDcEUsTUFBTSxjQUFjLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxTQUFTLElBQUksYUFBYSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzVHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsU0FBUyxDQUFDLEtBQUssR0FBRyxrQkFBa0IsQ0FBQztZQUNyQyxlQUFlLEdBQUcsa0JBQWtCLENBQUMsVUFBVSxFQUFFLFNBQVMsRUFBRSxjQUFjLEVBQUUsV0FBVyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ2hILFNBQVMsQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQztRQUMxRSxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNKLFdBQVcsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBQyxLQUFLLEVBQUMsRUFBRTtRQUN4RCxJQUFJLFNBQVMsQ0FBQyxLQUFLLEtBQUssZUFBZSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ2xELFNBQVMsQ0FBQyxLQUFLLEdBQUcsa0JBQWtCLENBQUM7UUFDdEMsQ0FBQzthQUFNLElBQUksU0FBUyxDQUFDLEtBQUssS0FBSyxrQkFBa0IsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzdELFNBQVMsQ0FBQyxLQUFLLEdBQUcsZUFBZSxDQUFDO1FBQ25DLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosU0FBUyxDQUFDLEtBQUssR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDO0lBQ3pFLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNqQixPQUFPLFdBQVcsQ0FBQztBQUNwQixDQUFDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxVQUFrQixFQUFFLFNBQThELEVBQUUsY0FBK0IsRUFBRSxXQUE0QixFQUFFLGdCQUEwQjtJQUN4TSxNQUFNLGNBQWMsR0FBb0IsRUFBRSxDQUFDO0lBQzNDLElBQUksV0FBVyxDQUFDO0lBQ2hCLElBQUksV0FBVyxFQUFFLENBQUM7UUFDakIsV0FBVyxHQUFHLGlCQUFpQixDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDMUUsQ0FBQztTQUFNLENBQUM7UUFDUCxXQUFXLEdBQUcsY0FBYyxDQUFDLFVBQVUsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBQ0QsSUFBSSxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDeEIsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDbkcsQ0FBQztJQUNELE1BQU0sU0FBUyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7SUFDNUIsS0FBSyxNQUFNLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQztRQUN0QyxNQUFNLFNBQVMsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUM3RSxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsTUFBTSxZQUFZLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDbEQsTUFBTSxVQUFVLEdBQW1CLEVBQUUsR0FBSSxTQUE0QixFQUFFLENBQUM7WUFDeEUsSUFBSSxDQUFDLGdCQUFnQixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO2dCQUN2RCxTQUFTLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUM1QixhQUFhLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNqQyxjQUFjLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2pDLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssTUFBTSxJQUFJLElBQUksU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3BDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUIsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBQ0QsT0FBTyxjQUFjLENBQUM7QUFDdkIsQ0FBQztBQUVELFNBQVMsaUJBQWlCLENBQUMsSUFBbUI7SUFDN0MsT0FBTyxJQUFJLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUNyRyxDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsSUFBbUIsRUFBRSxTQUFrQjtJQUM3RCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssV0FBVyxFQUFFLENBQUM7UUFDL0IsT0FBTztJQUNSLENBQUM7SUFFRCxrREFBa0Q7SUFDbEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDdkgsVUFBVSxDQUFDLE9BQU8sQ0FBQztRQUNsQixTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLGlCQUFpQjtRQUN6RCxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLGdCQUFnQixDQUFDO1FBQ3hHLGFBQWEsRUFBRSxLQUFLO0tBQ3BCLENBQUMsQ0FBQztJQUNILElBQUksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDO0FBQzNCLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxLQUFvQixFQUFFLEtBQW9CO0lBQzdELE9BQU8saUJBQWlCLENBQUMsS0FBSyxDQUFDLEtBQUssaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUVELFNBQVMsaUJBQWlCLENBQUMsVUFBa0IsRUFBRSxXQUEyQixFQUFFLGNBQStCO0lBQzFHLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsS0FBSyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3BGLElBQUksS0FBSyxHQUFHLGNBQWMsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDdkQsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUNmLEtBQUssR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEtBQUssaUJBQWlCLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUMxRixDQUFDO1NBQU0sQ0FBQztRQUNQLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUNELGNBQWMsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLGdFQUFnRCxDQUFDO0lBQ3ZJLE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLFVBQWtCLEVBQUUsY0FBK0I7SUFDMUUsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxVQUFVLGlDQUF5QixDQUFDO0lBQ3JFLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDdkMsQ0FBQztBQUVELFNBQVMsMEJBQTBCLENBQUMsSUFBb0I7SUFDdkQsT0FBTztRQUNOLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztRQUNqQixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7UUFDN0IsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO0tBQ25CLENBQUM7QUFDSCxDQUFDIn0=