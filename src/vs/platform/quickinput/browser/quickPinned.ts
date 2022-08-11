/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { pinnedButton, pinButton } from 'vs/platform/quickinput/browser/quickInput';
import { IQuickPickItem, IQuickPickSeparator, IQuickPick } from 'vs/platform/quickinput/common/quickInput';


export function updateButtons(item: IQuickPickItem | IQuickPickSeparator, shouldPin?: boolean): void {
	if (!item?.label || !('buttons' in item)) {
		return;
	}
	item.buttons = item.buttons ? item.buttons?.filter(b => b !== pinnedButton && b !== pinButton) : [];
	if (shouldPin) {
		item.buttons.unshift(pinnedButton);
	} else {
		item.buttons.unshift(pinButton);
	}
}
export function formatPinnedItems(pinnedItems: (IQuickPickItem | IQuickPickSeparator)[], quickPick: IQuickPick<IQuickPickItem>): string[] {
	const formattedItems: (IQuickPickItem | IQuickPickSeparator)[] = [];
	const pinnedLabels = pinnedItems.map(i => i.label);
	const labels: string[] = [];
	for (const l of pinnedLabels) {
		if (l) {
			labels.push(l);
		}
	}
	if (pinnedItems.length) {
		formattedItems.push({ type: 'separator', label: localize("terminal.commands.pinned", 'Pinned') });
	}
	for (const item of pinnedItems) {
		updateButtons(item, true);
		updatePinnedList(labels, item.label!, true);
		formattedItems.push(item);
	}
	for (const item of quickPick.items.filter(i => !!i?.label)) {
		updateButtons(item, false);
		formattedItems.push(item);
	}
	quickPick.items = formattedItems;
	return labels;
}

export function updatePinnedList(labels: string[], label: string, shouldPin?: boolean): string[] {
	console.log('labels', labels);
	if (shouldPin) {
		console.log('save pinned', label, shouldPin);
	}
	if (new Set(labels).has(label) && shouldPin) {
		return labels;
	}
	if (shouldPin) {
		labels.push(label);
		console.log('saved', labels);
	} else {
		labels = labels.splice(labels.findIndex(l => l === label), 1);
	}
	return labels;
}
