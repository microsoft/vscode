/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { toAction } from '../../../../base/common/actions.js';
import { CopyPasteController, pasteAsPreferenceConfig } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { DropIntoEditorController, dropAsPreferenceConfig } from '../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js';
import { localize } from '../../../../nls.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
let DropOrPasteIntoCommands = class DropOrPasteIntoCommands {
    static { this.ID = 'workbench.contrib.dropOrPasteInto'; }
    constructor(_preferencesService) {
        this._preferencesService = _preferencesService;
        CopyPasteController.setConfigureDefaultAction(toAction({
            id: 'workbench.action.configurePreferredPasteAction',
            label: localize('configureDefaultPaste.label', 'Configure preferred paste action...'),
            run: () => this.configurePreferredPasteAction()
        }));
        DropIntoEditorController.setConfigureDefaultAction(toAction({
            id: 'workbench.action.configurePreferredDropAction',
            label: localize('configureDefaultDrop.label', 'Configure preferred drop action...'),
            run: () => this.configurePreferredDropAction()
        }));
    }
    configurePreferredPasteAction() {
        return this._preferencesService.openUserSettings({
            jsonEditor: true,
            revealSetting: { key: pasteAsPreferenceConfig, edit: true }
        });
    }
    configurePreferredDropAction() {
        return this._preferencesService.openUserSettings({
            jsonEditor: true,
            revealSetting: { key: dropAsPreferenceConfig, edit: true }
        });
    }
};
DropOrPasteIntoCommands = __decorate([
    __param(0, IPreferencesService)
], DropOrPasteIntoCommands);
export { DropOrPasteIntoCommands };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9jb21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkVBQTJFLENBQUM7QUFDekksT0FBTyxFQUFFLHdCQUF3QixFQUFFLHNCQUFzQixFQUFFLE1BQU0sZ0ZBQWdGLENBQUM7QUFDbEosT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRW5GLElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXVCO2FBQ3JCLE9BQUUsR0FBRyxtQ0FBbUMsQUFBdEMsQ0FBdUM7SUFFdkQsWUFDdUMsbUJBQXdDO1FBQXhDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFFOUUsbUJBQW1CLENBQUMseUJBQXlCLENBQUMsUUFBUSxDQUFDO1lBQ3RELEVBQUUsRUFBRSxnREFBZ0Q7WUFDcEQsS0FBSyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxxQ0FBcUMsQ0FBQztZQUNyRixHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDZCQUE2QixFQUFFO1NBQy9DLENBQUMsQ0FBQyxDQUFDO1FBRUosd0JBQXdCLENBQUMseUJBQXlCLENBQUMsUUFBUSxDQUFDO1lBQzNELEVBQUUsRUFBRSwrQ0FBK0M7WUFDbkQsS0FBSyxFQUFFLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxvQ0FBb0MsQ0FBQztZQUNuRixHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDRCQUE0QixFQUFFO1NBQzlDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLDZCQUE2QjtRQUNwQyxPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxnQkFBZ0IsQ0FBQztZQUNoRCxVQUFVLEVBQUUsSUFBSTtZQUNoQixhQUFhLEVBQUUsRUFBRSxHQUFHLEVBQUUsdUJBQXVCLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtTQUMzRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sNEJBQTRCO1FBQ25DLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLGdCQUFnQixDQUFDO1lBQ2hELFVBQVUsRUFBRSxJQUFJO1lBQ2hCLGFBQWEsRUFBRSxFQUFFLEdBQUcsRUFBRSxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFO1NBQzFELENBQUMsQ0FBQztJQUNKLENBQUM7O0FBL0JXLHVCQUF1QjtJQUlqQyxXQUFBLG1CQUFtQixDQUFBO0dBSlQsdUJBQXVCLENBZ0NuQyJ9