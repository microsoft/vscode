/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorAction, EditorAction2 } from '../../../../browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { EditorContextKeys } from '../../../../common/editorContextKeys.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { StandaloneColorPickerController } from './standaloneColorPickerController.js';
export class ShowOrFocusStandaloneColorPicker extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.action.showOrFocusStandaloneColorPicker',
            title: {
                ...localize2('showOrFocusStandaloneColorPicker', "Show or Focus Standalone Color Picker"),
                mnemonicTitle: localize({ key: 'mishowOrFocusStandaloneColorPicker', comment: ['&& denotes a mnemonic'] }, "&&Show or Focus Standalone Color Picker"),
            },
            precondition: undefined,
            menu: [
                { id: MenuId.CommandPalette },
            ],
            metadata: {
                description: localize2('showOrFocusStandaloneColorPickerDescription', "Show or focus a standalone color picker which uses the default color provider. It displays hex/rgb/hsl colors."),
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        StandaloneColorPickerController.get(editor)?.showOrFocus();
    }
}
export class HideStandaloneColorPicker extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.hideColorPicker',
            label: localize2({
                key: 'hideColorPicker',
                comment: [
                    'Action that hides the color picker'
                ]
            }, "Hide the Color Picker"),
            precondition: EditorContextKeys.standaloneColorPickerVisible.isEqualTo(true),
            kbOpts: {
                primary: 9 /* KeyCode.Escape */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: localize2('hideColorPickerDescription', "Hide the standalone color picker."),
            }
        });
    }
    run(_accessor, editor) {
        StandaloneColorPickerController.get(editor)?.hide();
    }
}
export class InsertColorWithStandaloneColorPicker extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.insertColorWithStandaloneColorPicker',
            label: localize2({
                key: 'insertColorWithStandaloneColorPicker',
                comment: [
                    'Action that inserts color with standalone color picker'
                ]
            }, "Insert Color with Standalone Color Picker"),
            precondition: EditorContextKeys.standaloneColorPickerFocused.isEqualTo(true),
            kbOpts: {
                primary: 3 /* KeyCode.Enter */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: localize2('insertColorWithStandaloneColorPickerDescription', "Insert hex/rgb/hsl colors with the focused standalone color picker."),
            }
        });
    }
    run(_accessor, editor) {
        StandaloneColorPickerController.get(editor)?.insertColor();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUNvbG9yUGlja2VyQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2NvbG9yUGlja2VyL2Jyb3dzZXIvc3RhbmRhbG9uZUNvbG9yUGlja2VyL3N0YW5kYWxvbmVDb2xvclBpY2tlckFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQW9CLE1BQU0seUNBQXlDLENBQUM7QUFFeEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDM0UsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFdkYsTUFBTSxPQUFPLGdDQUFpQyxTQUFRLGFBQWE7SUFDbEU7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsZ0RBQWdEO1lBQ3BELEtBQUssRUFBRTtnQkFDTixHQUFHLFNBQVMsQ0FBQyxrQ0FBa0MsRUFBRSx1Q0FBdUMsQ0FBQztnQkFDekYsYUFBYSxFQUFFLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxvQ0FBb0MsRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUseUNBQXlDLENBQUM7YUFDcko7WUFDRCxZQUFZLEVBQUUsU0FBUztZQUN2QixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWMsRUFBRTthQUM3QjtZQUNELFFBQVEsRUFBRTtnQkFDVCxXQUFXLEVBQUUsU0FBUyxDQUFDLDZDQUE2QyxFQUFFLGdIQUFnSCxDQUFDO2FBQ3ZMO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUNELGdCQUFnQixDQUFDLFNBQTJCLEVBQUUsTUFBbUI7UUFDaEUsK0JBQStCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDO0lBQzVELENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyx5QkFBMEIsU0FBUSxZQUFZO0lBQzFEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLCtCQUErQjtZQUNuQyxLQUFLLEVBQUUsU0FBUyxDQUFDO2dCQUNoQixHQUFHLEVBQUUsaUJBQWlCO2dCQUN0QixPQUFPLEVBQUU7b0JBQ1Isb0NBQW9DO2lCQUNwQzthQUNELEVBQUUsdUJBQXVCLENBQUM7WUFDM0IsWUFBWSxFQUFFLGlCQUFpQixDQUFDLDRCQUE0QixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUM7WUFDNUUsTUFBTSxFQUFFO2dCQUNQLE9BQU8sd0JBQWdCO2dCQUN2QixNQUFNLDBDQUFnQzthQUN0QztZQUNELFFBQVEsRUFBRTtnQkFDVCxXQUFXLEVBQUUsU0FBUyxDQUFDLDRCQUE0QixFQUFFLG1DQUFtQyxDQUFDO2FBQ3pGO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUNNLEdBQUcsQ0FBQyxTQUEyQixFQUFFLE1BQW1CO1FBQzFELCtCQUErQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUNyRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sb0NBQXFDLFNBQVEsWUFBWTtJQUNyRTtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxvREFBb0Q7WUFDeEQsS0FBSyxFQUFFLFNBQVMsQ0FBQztnQkFDaEIsR0FBRyxFQUFFLHNDQUFzQztnQkFDM0MsT0FBTyxFQUFFO29CQUNSLHdEQUF3RDtpQkFDeEQ7YUFDRCxFQUFFLDJDQUEyQyxDQUFDO1lBQy9DLFlBQVksRUFBRSxpQkFBaUIsQ0FBQyw0QkFBNEIsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDO1lBQzVFLE1BQU0sRUFBRTtnQkFDUCxPQUFPLHVCQUFlO2dCQUN0QixNQUFNLDBDQUFnQzthQUN0QztZQUNELFFBQVEsRUFBRTtnQkFDVCxXQUFXLEVBQUUsU0FBUyxDQUFDLGlEQUFpRCxFQUFFLHFFQUFxRSxDQUFDO2FBQ2hKO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUNNLEdBQUcsQ0FBQyxTQUEyQixFQUFFLE1BQW1CO1FBQzFELCtCQUErQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxXQUFXLEVBQUUsQ0FBQztJQUM1RCxDQUFDO0NBQ0QifQ==