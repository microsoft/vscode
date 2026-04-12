/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { category } from './searchActionsBase.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { TEXT_SEARCH_QUICK_ACCESS_PREFIX } from './quickTextSearch/textSearchQuickAccess.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getSelectionTextFromEditor } from './searchView.js';
registerAction2(class TextSearchQuickAccessAction extends Action2 {
    constructor() {
        super({
            id: "workbench.action.quickTextSearch" /* Constants.SearchCommandIds.QuickTextSearchActionId */,
            title: nls.localize2('quickTextSearch', "Quick Search"),
            category,
            f1: true
        });
    }
    async run(accessor, match) {
        const quickInputService = accessor.get(IQuickInputService);
        const searchText = getSearchText(accessor) ?? '';
        quickInputService.quickAccess.show(TEXT_SEARCH_QUICK_ACCESS_PREFIX + searchText, { preserveValue: !!searchText });
    }
});
function getSearchText(accessor) {
    const editorService = accessor.get(IEditorService);
    const configurationService = accessor.get(IConfigurationService);
    const activeEditor = editorService.activeTextEditorControl;
    if (!activeEditor) {
        return null;
    }
    if (!activeEditor.hasTextFocus()) {
        return null;
    }
    // only happen if it would also happen for the search view
    const seedSearchStringFromSelection = configurationService.getValue('editor.find.seedSearchStringFromSelection');
    if (!seedSearchStringFromSelection) {
        return null;
    }
    return getSelectionTextFromEditor(false, activeEditor);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoQWN0aW9uc1RleHRRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaEFjdGlvbnNUZXh0UXVpY2tBY2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUcxQyxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNsRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFHN0QsZUFBZSxDQUFDLE1BQU0sMkJBQTRCLFNBQVEsT0FBTztJQUVoRTtRQUVDLEtBQUssQ0FBQztZQUNMLEVBQUUsNkZBQW9EO1lBQ3RELEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLGlCQUFpQixFQUFFLGNBQWMsQ0FBQztZQUN2RCxRQUFRO1lBQ1IsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFFSixDQUFDO0lBRVEsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQixFQUFFLEtBQWtDO1FBQ2hGLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQzNELE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakQsaUJBQWlCLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQywrQkFBK0IsR0FBRyxVQUFVLEVBQUUsRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7SUFDbkgsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILFNBQVMsYUFBYSxDQUFDLFFBQTBCO0lBQ2hELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDbkQsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFFakUsTUFBTSxZQUFZLEdBQVksYUFBYSxDQUFDLHVCQUFrQyxDQUFDO0lBQy9FLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNuQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFDRCxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUM7UUFDbEMsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsMERBQTBEO0lBQzFELE1BQU0sNkJBQTZCLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFVLDJDQUEyQyxDQUFDLENBQUM7SUFDMUgsSUFBSSxDQUFDLDZCQUE2QixFQUFFLENBQUM7UUFDcEMsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsT0FBTywwQkFBMEIsQ0FBQyxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUM7QUFDeEQsQ0FBQyJ9