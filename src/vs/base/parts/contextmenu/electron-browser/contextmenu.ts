/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ipcRenderer, Event } from 'electron';
import { IContextMenuItem, ISerializableContextMenuItem, CONTEXT_MENU_CLOSE_CHANNEL, CONTEXT_MENU_CHANNEL, IPopupOptions, IContextMenuEvent } from 'vs/base/parts/contextmenu/common/contextmenu';

let onClickChannelIds = 0;

export function popup(items: IContextMenuItem[], options?: IPopupOptions): void {
	const processedItems: IContextMenuItem[] = [];

	const onClickChannel = `vscode:onContextMenu${onClickChannelIds++}`;
	const onClickChannelHandler = (event: Event, itemId: number, context: IContextMenuEvent) => processedItems[itemId].click(context);

	ipcRenderer.once(onClickChannel, onClickChannelHandler);
	ipcRenderer.once(CONTEXT_MENU_CLOSE_CHANNEL, () => {
		ipcRenderer.removeListener(onClickChannel, onClickChannelHandler);

		if (options && options.onHide) {
			options.onHide();
		}
	});

	ipcRenderer.send(CONTEXT_MENU_CHANNEL, items.map(item => createItem(item, processedItems)), onClickChannel, options);
}

function createItem(item: IContextMenuItem, processedItems: IContextMenuItem[]): ISerializableContextMenuItem {
	const serializableItem = {
		id: processedItems.length,
		label: item.label,
		type: item.type,
		accelerator: item.accelerator,
		checked: item.checked,
		enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
		visible: typeof item.visible === 'boolean' ? item.visible : true
	} as ISerializableContextMenuItem;

	processedItems.push(item);

	// Submenu
	if (Array.isArray(item.submenu)) {
		serializableItem.submenu = item.submenu.map(submenuItem => createItem(submenuItem, processedItems));
	}

	return serializableItem;
}