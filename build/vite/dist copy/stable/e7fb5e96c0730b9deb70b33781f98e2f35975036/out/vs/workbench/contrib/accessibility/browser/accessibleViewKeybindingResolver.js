/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../base/common/htmlContent.js';
export function resolveContentAndKeybindingItems(keybindingService, value) {
    if (!value) {
        return;
    }
    const configureKeybindingItems = [];
    const configuredKeybindingItems = [];
    const matches = value.matchAll(/(\<keybinding:(?<commandId>[^\<]*)\>)/gm);
    for (const match of [...matches]) {
        const commandId = match?.groups?.commandId;
        let kbLabel;
        if (match?.length && commandId) {
            const keybinding = keybindingService.lookupKeybinding(commandId)?.getAriaLabel();
            if (!keybinding) {
                kbLabel = ` (unassigned keybinding)`;
                configureKeybindingItems.push({
                    label: commandId,
                    id: commandId
                });
            }
            else {
                kbLabel = ' (' + keybinding + ')';
                configuredKeybindingItems.push({
                    label: commandId,
                    id: commandId
                });
            }
            value = value.replace(match[0], kbLabel);
        }
    }
    const content = new MarkdownString(value);
    content.isTrusted = true;
    return { content, configureKeybindingItems: configureKeybindingItems.length ? configureKeybindingItems : undefined, configuredKeybindingItems: configuredKeybindingItems.length ? configuredKeybindingItems : undefined };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJsZVZpZXdLZXliaW5kaW5nUmVzb2x2ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdLZXliaW5kaW5nUmVzb2x2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBSXhFLE1BQU0sVUFBVSxnQ0FBZ0MsQ0FBQyxpQkFBcUMsRUFBRSxLQUFjO0lBQ3JHLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNaLE9BQU87SUFDUixDQUFDO0lBQ0QsTUFBTSx3QkFBd0IsR0FBNkIsRUFBRSxDQUFDO0lBQzlELE1BQU0seUJBQXlCLEdBQTZCLEVBQUUsQ0FBQztJQUMvRCxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLHlDQUF5QyxDQUFDLENBQUM7SUFDMUUsS0FBSyxNQUFNLEtBQUssSUFBSSxDQUFDLEdBQUcsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxLQUFLLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQztRQUMzQyxJQUFJLE9BQU8sQ0FBQztRQUNaLElBQUksS0FBSyxFQUFFLE1BQU0sSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNoQyxNQUFNLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsRUFBRSxZQUFZLEVBQUUsQ0FBQztZQUNqRixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ2pCLE9BQU8sR0FBRywwQkFBMEIsQ0FBQztnQkFDckMsd0JBQXdCLENBQUMsSUFBSSxDQUFDO29CQUM3QixLQUFLLEVBQUUsU0FBUztvQkFDaEIsRUFBRSxFQUFFLFNBQVM7aUJBQ2IsQ0FBQyxDQUFDO1lBQ0osQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sR0FBRyxJQUFJLEdBQUcsVUFBVSxHQUFHLEdBQUcsQ0FBQztnQkFDbEMseUJBQXlCLENBQUMsSUFBSSxDQUFDO29CQUM5QixLQUFLLEVBQUUsU0FBUztvQkFDaEIsRUFBRSxFQUFFLFNBQVM7aUJBQ2IsQ0FBQyxDQUFDO1lBQ0osQ0FBQztZQUNELEtBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMxQyxDQUFDO0lBQ0YsQ0FBQztJQUNELE1BQU0sT0FBTyxHQUFHLElBQUksY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzFDLE9BQU8sQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO0lBQ3pCLE9BQU8sRUFBRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsd0JBQXdCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLHlCQUF5QixFQUFFLHlCQUF5QixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDO0FBQzNOLENBQUMifQ==