/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { MenuRegistry, MenuId, isIMenuItem } from '../../../../platform/actions/common/actions.js';
export function getAllUnboundCommands(boundCommands) {
    const unboundCommands = [];
    const seenMap = new Map();
    const addCommand = (id, includeCommandWithArgs) => {
        if (seenMap.has(id)) {
            return;
        }
        seenMap.set(id, true);
        if (id[0] === '_' || id.indexOf('vscode.') === 0) { // private command
            return;
        }
        if (boundCommands.get(id) === true) {
            return;
        }
        if (!includeCommandWithArgs) {
            const command = CommandsRegistry.getCommand(id);
            if (command && typeof command.metadata === 'object'
                && isNonEmptyArray(command.metadata.args)) { // command with args
                return;
            }
        }
        unboundCommands.push(id);
    };
    // Add all commands from Command Palette
    for (const menuItem of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
        if (isIMenuItem(menuItem)) {
            addCommand(menuItem.command.id, true);
        }
    }
    // Add all editor actions
    for (const editorAction of EditorExtensionsRegistry.getEditorActions()) {
        addCommand(editorAction.id, true);
    }
    for (const id of CommandsRegistry.getCommands().keys()) {
        addCommand(id, false);
    }
    return unboundCommands;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5ib3VuZENvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2tleWJpbmRpbmcvYnJvd3Nlci91bmJvdW5kQ29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFvQixNQUFNLGtEQUFrRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUVuRyxNQUFNLFVBQVUscUJBQXFCLENBQUMsYUFBbUM7SUFDeEUsTUFBTSxlQUFlLEdBQWEsRUFBRSxDQUFDO0lBQ3JDLE1BQU0sT0FBTyxHQUF5QixJQUFJLEdBQUcsRUFBbUIsQ0FBQztJQUNqRSxNQUFNLFVBQVUsR0FBRyxDQUFDLEVBQVUsRUFBRSxzQkFBK0IsRUFBRSxFQUFFO1FBQ2xFLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ3JCLE9BQU87UUFDUixDQUFDO1FBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEIsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxJQUFJLEVBQUUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxrQkFBa0I7WUFDckUsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLGFBQWEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDcEMsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztZQUM3QixNQUFNLE9BQU8sR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDaEQsSUFBSSxPQUFPLElBQUksT0FBTyxPQUFPLENBQUMsUUFBUSxLQUFLLFFBQVE7bUJBQy9DLGVBQWUsQ0FBb0IsT0FBTyxDQUFDLFFBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsb0JBQW9CO2dCQUNyRixPQUFPO1lBQ1IsQ0FBQztRQUNGLENBQUM7UUFDRCxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzFCLENBQUMsQ0FBQztJQUVGLHdDQUF3QztJQUN4QyxLQUFLLE1BQU0sUUFBUSxJQUFJLFlBQVksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7UUFDekUsSUFBSSxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUMzQixVQUFVLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdkMsQ0FBQztJQUNGLENBQUM7SUFFRCx5QkFBeUI7SUFDekIsS0FBSyxNQUFNLFlBQVksSUFBSSx3QkFBd0IsQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLENBQUM7UUFDeEUsVUFBVSxDQUFDLFlBQVksQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELEtBQUssTUFBTSxFQUFFLElBQUksZ0JBQWdCLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUN4RCxVQUFVLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxPQUFPLGVBQWUsQ0FBQztBQUN4QixDQUFDIn0=