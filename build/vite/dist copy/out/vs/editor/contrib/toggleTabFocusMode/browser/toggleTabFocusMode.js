/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { TabFocus } from '../../../browser/config/tabFocus.js';
import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
export class ToggleTabFocusModeAction extends Action2 {
    static { this.ID = 'editor.action.toggleTabFocusMode'; }
    constructor() {
        super({
            id: ToggleTabFocusModeAction.ID,
            title: nls.localize2({ key: 'toggle.tabMovesFocus', comment: ['Turn on/off use of tab key for moving focus around VS Code'] }, 'Toggle Tab Key Moves Focus'),
            precondition: undefined,
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 43 /* KeyCode.KeyM */,
                mac: { primary: 256 /* KeyMod.WinCtrl */ | 1024 /* KeyMod.Shift */ | 43 /* KeyCode.KeyM */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: nls.localize2('tabMovesFocusDescriptions', "Determines whether the tab key moves focus around the workbench or inserts the tab character in the current editor. This is also called tab trapping, tab navigation, or tab focus mode."),
            },
            f1: true
        });
    }
    run() {
        const oldValue = TabFocus.getTabFocusMode();
        const newValue = !oldValue;
        TabFocus.setTabFocusMode(newValue);
        if (newValue) {
            alert(nls.localize('toggle.tabMovesFocus.on', "Pressing Tab will now move focus to the next focusable element"));
        }
        else {
            alert(nls.localize('toggle.tabMovesFocus.off', "Pressing Tab will now insert the tab character"));
        }
    }
}
registerAction2(ToggleTabFocusModeAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9nZ2xlVGFiRm9jdXNNb2RlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvdG9nZ2xlVGFiRm9jdXNNb2RlL2Jyb3dzZXIvdG9nZ2xlVGFiRm9jdXNNb2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRzFGLE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxPQUFPO2FBRTdCLE9BQUUsR0FBRyxrQ0FBa0MsQ0FBQztJQUUvRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSx3QkFBd0IsQ0FBQyxFQUFFO1lBQy9CLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLHNCQUFzQixFQUFFLE9BQU8sRUFBRSxDQUFDLDREQUE0RCxDQUFDLEVBQUUsRUFBRSw0QkFBNEIsQ0FBQztZQUM1SixZQUFZLEVBQUUsU0FBUztZQUN2QixVQUFVLEVBQUU7Z0JBQ1gsT0FBTyxFQUFFLGlEQUE2QjtnQkFDdEMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGtEQUE2Qix3QkFBZSxFQUFFO2dCQUM5RCxNQUFNLDBDQUFnQzthQUN0QztZQUNELFFBQVEsRUFBRTtnQkFDVCxXQUFXLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQywyQkFBMkIsRUFBRSwwTEFBMEwsQ0FBQzthQUNuUDtZQUNELEVBQUUsRUFBRSxJQUFJO1NBQ1IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVNLEdBQUc7UUFDVCxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDNUMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxRQUFRLENBQUM7UUFDM0IsUUFBUSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUUsZ0VBQWdFLENBQUMsQ0FBQyxDQUFDO1FBQ2xILENBQUM7YUFBTSxDQUFDO1lBQ1AsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsZ0RBQWdELENBQUMsQ0FBQyxDQUFDO1FBQ25HLENBQUM7SUFDRixDQUFDOztBQUdGLGVBQWUsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDIn0=