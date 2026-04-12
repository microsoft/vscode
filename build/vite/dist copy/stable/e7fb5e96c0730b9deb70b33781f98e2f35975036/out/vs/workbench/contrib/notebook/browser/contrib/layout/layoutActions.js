/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { NOTEBOOK_ACTIONS_CATEGORY } from '../../controller/coreActions.js';
import { NotebookSetting } from '../../../common/notebookCommon.js';
const TOGGLE_CELL_TOOLBAR_POSITION = 'notebook.toggleCellToolbarPosition';
export class ToggleCellToolbarPositionAction extends Action2 {
    constructor() {
        super({
            id: TOGGLE_CELL_TOOLBAR_POSITION,
            title: localize2('notebook.toggleCellToolbarPosition', 'Toggle Cell Toolbar Position'),
            menu: [{
                    id: MenuId.NotebookCellTitle,
                    group: 'View',
                    order: 1
                }],
            category: NOTEBOOK_ACTIONS_CATEGORY,
            f1: false
        });
    }
    async run(accessor, context) {
        const editor = context && context.ui ? context.notebookEditor : undefined;
        if (editor && editor.hasModel()) {
            // from toolbar
            const viewType = editor.textModel.viewType;
            const configurationService = accessor.get(IConfigurationService);
            const toolbarPosition = configurationService.getValue(NotebookSetting.cellToolbarLocation);
            const newConfig = this.togglePosition(viewType, toolbarPosition);
            await configurationService.updateValue(NotebookSetting.cellToolbarLocation, newConfig);
        }
    }
    togglePosition(viewType, toolbarPosition) {
        if (typeof toolbarPosition === 'string') {
            // legacy
            if (['left', 'right', 'hidden'].indexOf(toolbarPosition) >= 0) {
                // valid position
                const newViewValue = toolbarPosition === 'right' ? 'left' : 'right';
                const config = {
                    default: toolbarPosition
                };
                config[viewType] = newViewValue;
                return config;
            }
            else {
                // invalid position
                const config = {
                    default: 'right',
                };
                config[viewType] = 'left';
                return config;
            }
        }
        else {
            const oldValue = toolbarPosition[viewType] ?? toolbarPosition['default'] ?? 'right';
            const newViewValue = oldValue === 'right' ? 'left' : 'right';
            const newConfig = {
                ...toolbarPosition
            };
            newConfig[viewType] = newViewValue;
            return newConfig;
        }
    }
}
registerAction2(ToggleCellToolbarPositionAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5b3V0QWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9sYXlvdXQvbGF5b3V0QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDckQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDeEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFFekcsT0FBTyxFQUEwQix5QkFBeUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVwRSxNQUFNLDRCQUE0QixHQUFHLG9DQUFvQyxDQUFDO0FBRTFFLE1BQU0sT0FBTywrQkFBZ0MsU0FBUSxPQUFPO0lBQzNEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLDRCQUE0QjtZQUNoQyxLQUFLLEVBQUUsU0FBUyxDQUFDLG9DQUFvQyxFQUFFLDhCQUE4QixDQUFDO1lBQ3RGLElBQUksRUFBRSxDQUFDO29CQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsaUJBQWlCO29CQUM1QixLQUFLLEVBQUUsTUFBTTtvQkFDYixLQUFLLEVBQUUsQ0FBQztpQkFDUixDQUFDO1lBQ0YsUUFBUSxFQUFFLHlCQUF5QjtZQUNuQyxFQUFFLEVBQUUsS0FBSztTQUNULENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsT0FBWTtRQUNqRCxNQUFNLE1BQU0sR0FBRyxPQUFPLElBQUksT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUUsT0FBa0MsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN0RyxJQUFJLE1BQU0sSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUNqQyxlQUFlO1lBQ2YsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUM7WUFDM0MsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7WUFDakUsTUFBTSxlQUFlLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFxQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsQ0FBQztZQUMvSCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUNqRSxNQUFNLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsbUJBQW1CLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDeEYsQ0FBQztJQUNGLENBQUM7SUFFRCxjQUFjLENBQUMsUUFBZ0IsRUFBRSxlQUFtRDtRQUNuRixJQUFJLE9BQU8sZUFBZSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3pDLFNBQVM7WUFDVCxJQUFJLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQy9ELGlCQUFpQjtnQkFDakIsTUFBTSxZQUFZLEdBQUcsZUFBZSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7Z0JBQ3BFLE1BQU0sTUFBTSxHQUE4QjtvQkFDekMsT0FBTyxFQUFFLGVBQWU7aUJBQ3hCLENBQUM7Z0JBQ0YsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLFlBQVksQ0FBQztnQkFDaEMsT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsbUJBQW1CO2dCQUNuQixNQUFNLE1BQU0sR0FBOEI7b0JBQ3pDLE9BQU8sRUFBRSxPQUFPO2lCQUNoQixDQUFDO2dCQUNGLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxNQUFNLENBQUM7Z0JBQzFCLE9BQU8sTUFBTSxDQUFDO1lBQ2YsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxRQUFRLEdBQUcsZUFBZSxDQUFDLFFBQVEsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLENBQUM7WUFDcEYsTUFBTSxZQUFZLEdBQUcsUUFBUSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7WUFDN0QsTUFBTSxTQUFTLEdBQUc7Z0JBQ2pCLEdBQUcsZUFBZTthQUNsQixDQUFDO1lBQ0YsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFlBQVksQ0FBQztZQUNuQyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO0lBRUYsQ0FBQztDQUNEO0FBQ0QsZUFBZSxDQUFDLCtCQUErQixDQUFDLENBQUMifQ==