/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Menu, MenuItem } from 'electron';
import { validatedIpcMain } from '../../ipc/electron-main/ipcMain.js';
import { CONTEXT_MENU_CHANNEL, CONTEXT_MENU_CLOSE_CHANNEL } from '../common/contextmenu.js';
export function registerContextMenuListener() {
    validatedIpcMain.on(CONTEXT_MENU_CHANNEL, (event, contextMenuId, items, onClickChannel, options) => {
        const menu = createMenu(event, onClickChannel, items);
        menu.popup({
            x: options ? options.x : undefined,
            y: options ? options.y : undefined,
            positioningItem: options ? options.positioningItem : undefined,
            callback: () => {
                // Workaround for https://github.com/microsoft/vscode/issues/72447
                // It turns out that the menu gets GC'ed if not referenced anymore
                // As such we drag it into this scope so that it is not being GC'ed
                if (menu) {
                    event.sender.send(CONTEXT_MENU_CLOSE_CHANNEL, contextMenuId);
                }
            }
        });
    });
}
function createMenu(event, onClickChannel, items) {
    const menu = new Menu();
    items.forEach(item => {
        let menuitem;
        // Separator
        if (item.type === 'separator') {
            menuitem = new MenuItem({
                type: item.type,
            });
        }
        // Sub Menu
        else if (Array.isArray(item.submenu)) {
            menuitem = new MenuItem({
                submenu: createMenu(event, onClickChannel, item.submenu),
                label: item.label
            });
        }
        // Normal Menu Item
        else {
            menuitem = new MenuItem({
                label: item.label,
                type: item.type,
                accelerator: item.accelerator,
                checked: item.checked,
                enabled: item.enabled,
                visible: item.visible,
                click: (menuItem, win, contextmenuEvent) => event.sender.send(onClickChannel, item.id, contextmenuEvent)
            });
        }
        menu.append(menuitem);
    });
    return menu;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dG1lbnUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3BhcnRzL2NvbnRleHRtZW51L2VsZWN0cm9uLW1haW4vY29udGV4dG1lbnUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFnQixJQUFJLEVBQUUsUUFBUSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQ3hELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSwwQkFBMEIsRUFBK0MsTUFBTSwwQkFBMEIsQ0FBQztBQUV6SSxNQUFNLFVBQVUsMkJBQTJCO0lBQzFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLEtBQW1CLEVBQUUsYUFBcUIsRUFBRSxLQUFxQyxFQUFFLGNBQXNCLEVBQUUsT0FBdUIsRUFBRSxFQUFFO1FBQ2hMLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxLQUFLLEVBQUUsY0FBYyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXRELElBQUksQ0FBQyxLQUFLLENBQUM7WUFDVixDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ2xDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDbEMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUM5RCxRQUFRLEVBQUUsR0FBRyxFQUFFO2dCQUNkLGtFQUFrRTtnQkFDbEUsa0VBQWtFO2dCQUNsRSxtRUFBbUU7Z0JBQ25FLElBQUksSUFBSSxFQUFFLENBQUM7b0JBQ1YsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBQzlELENBQUM7WUFDRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsS0FBbUIsRUFBRSxjQUFzQixFQUFFLEtBQXFDO0lBQ3JHLE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7SUFFeEIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNwQixJQUFJLFFBQWtCLENBQUM7UUFFdkIsWUFBWTtRQUNaLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUMvQixRQUFRLEdBQUcsSUFBSSxRQUFRLENBQUM7Z0JBQ3ZCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTthQUNmLENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxXQUFXO2FBQ04sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3RDLFFBQVEsR0FBRyxJQUFJLFFBQVEsQ0FBQztnQkFDdkIsT0FBTyxFQUFFLFVBQVUsQ0FBQyxLQUFLLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUM7Z0JBQ3hELEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSzthQUNqQixDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsbUJBQW1CO2FBQ2QsQ0FBQztZQUNMLFFBQVEsR0FBRyxJQUFJLFFBQVEsQ0FBQztnQkFDdkIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO2dCQUNqQixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7Z0JBQ2YsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXO2dCQUM3QixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87Z0JBQ3JCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztnQkFDckIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO2dCQUNyQixLQUFLLEVBQUUsQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFLGdCQUFnQixFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQzthQUN4RyxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN2QixDQUFDLENBQUMsQ0FBQztJQUVILE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQyJ9