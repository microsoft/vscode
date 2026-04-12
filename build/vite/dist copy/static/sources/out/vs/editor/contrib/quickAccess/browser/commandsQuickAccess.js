/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { isLocalizedString } from '../../../../platform/action/common/action.js';
import { AbstractCommandsQuickAccessProvider } from '../../../../platform/quickinput/browser/commandsQuickAccess.js';
export class AbstractEditorCommandsQuickAccessProvider extends AbstractCommandsQuickAccessProvider {
    constructor(options, instantiationService, keybindingService, commandService, telemetryService, dialogService) {
        super(options, instantiationService, keybindingService, commandService, telemetryService, dialogService);
    }
    getCodeEditorCommandPicks() {
        const activeTextEditorControl = this.activeTextEditorControl;
        if (!activeTextEditorControl) {
            return [];
        }
        const editorCommandPicks = [];
        for (const editorAction of activeTextEditorControl.getSupportedActions()) {
            let commandDescription;
            if (editorAction.metadata?.description) {
                if (isLocalizedString(editorAction.metadata.description)) {
                    commandDescription = editorAction.metadata.description;
                }
                else {
                    commandDescription = { original: editorAction.metadata.description, value: editorAction.metadata.description };
                }
            }
            editorCommandPicks.push({
                commandId: editorAction.id,
                commandAlias: editorAction.alias,
                commandDescription,
                label: stripIcons(editorAction.label) || editorAction.id,
            });
        }
        return editorCommandPicks;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZHNRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3F1aWNrQWNjZXNzL2Jyb3dzZXIvY29tbWFuZHNRdWlja0FjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFHbkUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFLakYsT0FBTyxFQUFFLG1DQUFtQyxFQUFrRCxNQUFNLGdFQUFnRSxDQUFDO0FBR3JLLE1BQU0sT0FBZ0IseUNBQTBDLFNBQVEsbUNBQW1DO0lBRTFHLFlBQ0MsT0FBb0MsRUFDcEMsb0JBQTJDLEVBQzNDLGlCQUFxQyxFQUNyQyxjQUErQixFQUMvQixnQkFBbUMsRUFDbkMsYUFBNkI7UUFFN0IsS0FBSyxDQUFDLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDMUcsQ0FBQztJQU9TLHlCQUF5QjtRQUNsQyxNQUFNLHVCQUF1QixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQztRQUM3RCxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUM5QixPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFFRCxNQUFNLGtCQUFrQixHQUF3QixFQUFFLENBQUM7UUFDbkQsS0FBSyxNQUFNLFlBQVksSUFBSSx1QkFBdUIsQ0FBQyxtQkFBbUIsRUFBRSxFQUFFLENBQUM7WUFDMUUsSUFBSSxrQkFBZ0QsQ0FBQztZQUNyRCxJQUFJLFlBQVksQ0FBQyxRQUFRLEVBQUUsV0FBVyxFQUFFLENBQUM7Z0JBQ3hDLElBQUksaUJBQWlCLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO29CQUMxRCxrQkFBa0IsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQztnQkFDeEQsQ0FBQztxQkFBTSxDQUFDO29CQUNQLGtCQUFrQixHQUFHLEVBQUUsUUFBUSxFQUFFLFlBQVksQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLEtBQUssRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNoSCxDQUFDO1lBQ0YsQ0FBQztZQUNELGtCQUFrQixDQUFDLElBQUksQ0FBQztnQkFDdkIsU0FBUyxFQUFFLFlBQVksQ0FBQyxFQUFFO2dCQUMxQixZQUFZLEVBQUUsWUFBWSxDQUFDLEtBQUs7Z0JBQ2hDLGtCQUFrQjtnQkFDbEIsS0FBSyxFQUFFLFVBQVUsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksWUFBWSxDQUFDLEVBQUU7YUFDeEQsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELE9BQU8sa0JBQWtCLENBQUM7SUFDM0IsQ0FBQztDQUNEIn0=