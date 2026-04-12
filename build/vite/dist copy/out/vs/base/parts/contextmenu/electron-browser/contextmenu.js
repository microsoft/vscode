/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CONTEXT_MENU_CHANNEL, CONTEXT_MENU_CLOSE_CHANNEL } from '../common/contextmenu.js';
import { ipcRenderer } from '../../sandbox/electron-browser/globals.js';
let contextMenuIdPool = 0;
export function popup(items, options, onHide) {
    const processedItems = [];
    const contextMenuId = contextMenuIdPool++;
    const onClickChannel = `vscode:onContextMenu${contextMenuId}`;
    const onClickChannelHandler = (_event, ...args) => {
        const itemId = args[0];
        const context = args[1];
        const item = processedItems[itemId];
        item.click?.(context);
    };
    ipcRenderer.once(onClickChannel, onClickChannelHandler);
    ipcRenderer.once(CONTEXT_MENU_CLOSE_CHANNEL, (_event, ...args) => {
        const closedContextMenuId = args[0];
        if (closedContextMenuId !== contextMenuId) {
            return;
        }
        ipcRenderer.removeListener(onClickChannel, onClickChannelHandler);
        onHide?.();
    });
    ipcRenderer.send(CONTEXT_MENU_CHANNEL, contextMenuId, items.map(item => createItem(item, processedItems)), onClickChannel, options);
}
function createItem(item, processedItems) {
    const serializableItem = {
        id: processedItems.length,
        label: item.label,
        type: item.type,
        accelerator: item.accelerator,
        checked: item.checked,
        enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
        visible: typeof item.visible === 'boolean' ? item.visible : true
    };
    processedItems.push(item);
    // Submenu
    if (Array.isArray(item.submenu)) {
        serializableItem.submenu = item.submenu.map(submenuItem => createItem(submenuItem, processedItems));
    }
    return serializableItem;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dG1lbnUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3BhcnRzL2NvbnRleHRtZW51L2VsZWN0cm9uLWJyb3dzZXIvY29udGV4dG1lbnUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLDBCQUEwQixFQUFvRixNQUFNLDBCQUEwQixDQUFDO0FBQzlLLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUV4RSxJQUFJLGlCQUFpQixHQUFHLENBQUMsQ0FBQztBQUUxQixNQUFNLFVBQVUsS0FBSyxDQUFDLEtBQXlCLEVBQUUsT0FBdUIsRUFBRSxNQUFtQjtJQUM1RixNQUFNLGNBQWMsR0FBdUIsRUFBRSxDQUFDO0lBRTlDLE1BQU0sYUFBYSxHQUFHLGlCQUFpQixFQUFFLENBQUM7SUFDMUMsTUFBTSxjQUFjLEdBQUcsdUJBQXVCLGFBQWEsRUFBRSxDQUFDO0lBQzlELE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxNQUFlLEVBQUUsR0FBRyxJQUFlLEVBQUUsRUFBRTtRQUNyRSxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFXLENBQUM7UUFDakMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBc0IsQ0FBQztRQUM3QyxNQUFNLElBQUksR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZCLENBQUMsQ0FBQztJQUVGLFdBQVcsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLHFCQUFxQixDQUFDLENBQUM7SUFDeEQsV0FBVyxDQUFDLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDLE1BQWUsRUFBRSxHQUFHLElBQWUsRUFBRSxFQUFFO1FBQ3BGLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBVyxDQUFDO1FBQzlDLElBQUksbUJBQW1CLEtBQUssYUFBYSxFQUFFLENBQUM7WUFDM0MsT0FBTztRQUNSLENBQUM7UUFFRCxXQUFXLENBQUMsY0FBYyxDQUFDLGNBQWMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1FBRWxFLE1BQU0sRUFBRSxFQUFFLENBQUM7SUFDWixDQUFDLENBQUMsQ0FBQztJQUVILFdBQVcsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsYUFBYSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDLEVBQUUsY0FBYyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQ3JJLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxJQUFzQixFQUFFLGNBQWtDO0lBQzdFLE1BQU0sZ0JBQWdCLEdBQWlDO1FBQ3RELEVBQUUsRUFBRSxjQUFjLENBQUMsTUFBTTtRQUN6QixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7UUFDakIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1FBQ2YsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXO1FBQzdCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztRQUNyQixPQUFPLEVBQUUsT0FBTyxJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNoRSxPQUFPLEVBQUUsT0FBTyxJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSTtLQUNoRSxDQUFDO0lBRUYsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUUxQixVQUFVO0lBQ1YsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ2pDLGdCQUFnQixDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQztJQUNyRyxDQUFDO0lBRUQsT0FBTyxnQkFBZ0IsQ0FBQztBQUN6QixDQUFDIn0=