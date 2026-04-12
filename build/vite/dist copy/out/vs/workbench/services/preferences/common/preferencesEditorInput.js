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
var SettingsEditor2Input_1;
import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IPreferencesService } from './preferences.js';
const SettingsEditorIcon = registerIcon('settings-editor-label-icon', Codicon.settings, nls.localize('settingsEditorLabelIcon', 'Icon of the settings editor label.'));
let SettingsEditor2Input = class SettingsEditor2Input extends EditorInput {
    static { SettingsEditor2Input_1 = this; }
    static { this.ID = 'workbench.input.settings2'; }
    constructor(_preferencesService) {
        super();
        this.resource = URI.from({
            scheme: Schemas.vscodeSettings,
            path: `settingseditor`
        });
        this._settingsModel = _preferencesService.createSettings2EditorModel();
    }
    matches(otherInput) {
        return super.matches(otherInput) || otherInput instanceof SettingsEditor2Input_1;
    }
    get typeId() {
        return SettingsEditor2Input_1.ID;
    }
    getName() {
        return nls.localize('settingsEditor2InputName', "Settings");
    }
    getIcon() {
        return SettingsEditorIcon;
    }
    async resolve() {
        return this._settingsModel;
    }
    dispose() {
        this._settingsModel.dispose();
        super.dispose();
    }
};
SettingsEditor2Input = SettingsEditor2Input_1 = __decorate([
    __param(0, IPreferencesService)
], SettingsEditor2Input);
export { SettingsEditor2Input };
const PreferencesEditorIcon = registerIcon('preferences-editor-label-icon', Codicon.settings, nls.localize('preferencesEditorLabelIcon', 'Icon of the preferences editor label.'));
export class PreferencesEditorInput extends EditorInput {
    constructor() {
        super(...arguments);
        this.resource = URI.from({
            scheme: Schemas.vscodeSettings,
            path: `preferenceseditor`
        });
    }
    static { this.ID = 'workbench.input.preferences'; }
    matches(otherInput) {
        return super.matches(otherInput) || otherInput instanceof PreferencesEditorInput;
    }
    get typeId() {
        return PreferencesEditorInput.ID;
    }
    getName() {
        return nls.localize('preferencesEditorInputName', "Preferences");
    }
    getIcon() {
        return PreferencesEditorIcon;
    }
    async resolve() {
        return null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXNFZGl0b3JJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXNFZGl0b3JJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFakYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBR3ZELE1BQU0sa0JBQWtCLEdBQUcsWUFBWSxDQUFDLDRCQUE0QixFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDLENBQUM7QUFFaEssSUFBTSxvQkFBb0IsR0FBMUIsTUFBTSxvQkFBcUIsU0FBUSxXQUFXOzthQUVwQyxPQUFFLEdBQVcsMkJBQTJCLEFBQXRDLENBQXVDO0lBUXpELFlBQ3NCLG1CQUF3QztRQUU3RCxLQUFLLEVBQUUsQ0FBQztRQVJBLGFBQVEsR0FBUSxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ2pDLE1BQU0sRUFBRSxPQUFPLENBQUMsY0FBYztZQUM5QixJQUFJLEVBQUUsZ0JBQWdCO1NBQ3RCLENBQUMsQ0FBQztRQU9GLElBQUksQ0FBQyxjQUFjLEdBQUcsbUJBQW1CLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztJQUN4RSxDQUFDO0lBRVEsT0FBTyxDQUFDLFVBQTZDO1FBQzdELE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxVQUFVLFlBQVksc0JBQW9CLENBQUM7SUFDaEYsQ0FBQztJQUVELElBQWEsTUFBTTtRQUNsQixPQUFPLHNCQUFvQixDQUFDLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0lBRVEsT0FBTztRQUNmLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRVEsT0FBTztRQUNmLE9BQU8sa0JBQWtCLENBQUM7SUFDM0IsQ0FBQztJQUVRLEtBQUssQ0FBQyxPQUFPO1FBQ3JCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQztJQUM1QixDQUFDO0lBRVEsT0FBTztRQUNmLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFOUIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7O0FBMUNXLG9CQUFvQjtJQVc5QixXQUFBLG1CQUFtQixDQUFBO0dBWFQsb0JBQW9CLENBMkNoQzs7QUFFRCxNQUFNLHFCQUFxQixHQUFHLFlBQVksQ0FBQywrQkFBK0IsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsNEJBQTRCLEVBQUUsdUNBQXVDLENBQUMsQ0FBQyxDQUFDO0FBRW5MLE1BQU0sT0FBTyxzQkFBdUIsU0FBUSxXQUFXO0lBQXZEOztRQUlVLGFBQVEsR0FBUSxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ2pDLE1BQU0sRUFBRSxPQUFPLENBQUMsY0FBYztZQUM5QixJQUFJLEVBQUUsbUJBQW1CO1NBQ3pCLENBQUMsQ0FBQztJQXFCSixDQUFDO2FBMUJnQixPQUFFLEdBQVcsNkJBQTZCLEFBQXhDLENBQXlDO0lBT2xELE9BQU8sQ0FBQyxVQUE2QztRQUM3RCxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksVUFBVSxZQUFZLHNCQUFzQixDQUFDO0lBQ2xGLENBQUM7SUFFRCxJQUFhLE1BQU07UUFDbEIsT0FBTyxzQkFBc0IsQ0FBQyxFQUFFLENBQUM7SUFDbEMsQ0FBQztJQUVRLE9BQU87UUFDZixPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsNEJBQTRCLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVRLE9BQU87UUFDZixPQUFPLHFCQUFxQixDQUFDO0lBQzlCLENBQUM7SUFFUSxLQUFLLENBQUMsT0FBTztRQUNyQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUMifQ==