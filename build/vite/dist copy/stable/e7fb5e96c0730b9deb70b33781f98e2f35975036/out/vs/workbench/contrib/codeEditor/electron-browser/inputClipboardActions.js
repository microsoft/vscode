/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import * as platform from '../../../../base/common/platform.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
if (platform.isMacintosh) {
    // On the mac, cmd+x, cmd+c and cmd+v do not result in cut / copy / paste
    // We therefore add a basic keybinding rule that invokes document.execCommand
    // This is to cover <input>s...
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: 'execCut',
        primary: 2048 /* KeyMod.CtrlCmd */ | 54 /* KeyCode.KeyX */,
        handler: bindExecuteCommand('cut'),
        weight: 0,
        when: undefined,
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: 'execCopy',
        primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */,
        handler: bindExecuteCommand('copy'),
        weight: 0,
        when: undefined,
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: 'execPaste',
        primary: 2048 /* KeyMod.CtrlCmd */ | 52 /* KeyCode.KeyV */,
        handler: bindExecuteCommand('paste'),
        weight: 0,
        when: undefined,
    });
    function bindExecuteCommand(command) {
        return () => {
            getActiveWindow().document.execCommand(command);
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5wdXRDbGlwYm9hcmRBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29kZUVkaXRvci9lbGVjdHJvbi1icm93c2VyL2lucHV0Q2xpcGJvYXJkQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNwRyxPQUFPLEtBQUssUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUVsRSxJQUFJLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUUxQix5RUFBeUU7SUFDekUsNkVBQTZFO0lBQzdFLCtCQUErQjtJQUUvQixtQkFBbUIsQ0FBQyxnQ0FBZ0MsQ0FBQztRQUNwRCxFQUFFLEVBQUUsU0FBUztRQUNiLE9BQU8sRUFBRSxpREFBNkI7UUFDdEMsT0FBTyxFQUFFLGtCQUFrQixDQUFDLEtBQUssQ0FBQztRQUNsQyxNQUFNLEVBQUUsQ0FBQztRQUNULElBQUksRUFBRSxTQUFTO0tBQ2YsQ0FBQyxDQUFDO0lBQ0gsbUJBQW1CLENBQUMsZ0NBQWdDLENBQUM7UUFDcEQsRUFBRSxFQUFFLFVBQVU7UUFDZCxPQUFPLEVBQUUsaURBQTZCO1FBQ3RDLE9BQU8sRUFBRSxrQkFBa0IsQ0FBQyxNQUFNLENBQUM7UUFDbkMsTUFBTSxFQUFFLENBQUM7UUFDVCxJQUFJLEVBQUUsU0FBUztLQUNmLENBQUMsQ0FBQztJQUNILG1CQUFtQixDQUFDLGdDQUFnQyxDQUFDO1FBQ3BELEVBQUUsRUFBRSxXQUFXO1FBQ2YsT0FBTyxFQUFFLGlEQUE2QjtRQUN0QyxPQUFPLEVBQUUsa0JBQWtCLENBQUMsT0FBTyxDQUFDO1FBQ3BDLE1BQU0sRUFBRSxDQUFDO1FBQ1QsSUFBSSxFQUFFLFNBQVM7S0FDZixDQUFDLENBQUM7SUFFSCxTQUFTLGtCQUFrQixDQUFDLE9BQWlDO1FBQzVELE9BQU8sR0FBRyxFQUFFO1lBQ1gsZUFBZSxFQUFFLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUM7SUFDSCxDQUFDO0FBQ0YsQ0FBQyJ9