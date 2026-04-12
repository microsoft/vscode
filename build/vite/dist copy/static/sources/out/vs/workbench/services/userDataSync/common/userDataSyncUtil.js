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
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IUserDataSyncUtilService, getDefaultIgnoredSettings } from '../../../../platform/userDataSync/common/userDataSync.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextResourcePropertiesService, ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
let UserDataSyncUtilService = class UserDataSyncUtilService {
    constructor(keybindingsService, textModelService, textResourcePropertiesService, textResourceConfigurationService) {
        this.keybindingsService = keybindingsService;
        this.textModelService = textModelService;
        this.textResourcePropertiesService = textResourcePropertiesService;
        this.textResourceConfigurationService = textResourceConfigurationService;
    }
    async resolveDefaultCoreIgnoredSettings() {
        return getDefaultIgnoredSettings(true);
    }
    async resolveUserBindings(userBindings) {
        const keys = {};
        for (const userbinding of userBindings) {
            keys[userbinding] = this.keybindingsService.resolveUserBinding(userbinding).map(part => part.getUserSettingsLabel()).join(' ');
        }
        return keys;
    }
    async resolveFormattingOptions(resource) {
        try {
            const modelReference = await this.textModelService.createModelReference(resource);
            const { insertSpaces, tabSize } = modelReference.object.textEditorModel.getOptions();
            const eol = modelReference.object.textEditorModel.getEOL();
            modelReference.dispose();
            return { eol, insertSpaces, tabSize };
        }
        catch (e) {
        }
        return {
            eol: this.textResourcePropertiesService.getEOL(resource),
            insertSpaces: !!this.textResourceConfigurationService.getValue(resource, 'editor.insertSpaces'),
            tabSize: this.textResourceConfigurationService.getValue(resource, 'editor.tabSize')
        };
    }
};
UserDataSyncUtilService = __decorate([
    __param(0, IKeybindingService),
    __param(1, ITextModelService),
    __param(2, ITextResourcePropertiesService),
    __param(3, ITextResourceConfigurationService)
], UserDataSyncUtilService);
registerSingleton(IUserDataSyncUtilService, UserDataSyncUtilService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jVXRpbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luY1V0aWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLHlCQUF5QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFL0gsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRy9HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBRXBKLElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXVCO0lBSTVCLFlBQ3NDLGtCQUFzQyxFQUN2QyxnQkFBbUMsRUFDdEIsNkJBQTZELEVBQzFELGdDQUFtRTtRQUhsRix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBQ3ZDLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFDdEIsa0NBQTZCLEdBQTdCLDZCQUE2QixDQUFnQztRQUMxRCxxQ0FBZ0MsR0FBaEMsZ0NBQWdDLENBQW1DO0lBQ3BILENBQUM7SUFFTCxLQUFLLENBQUMsaUNBQWlDO1FBQ3RDLE9BQU8seUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxZQUFzQjtRQUMvQyxNQUFNLElBQUksR0FBOEIsRUFBRSxDQUFDO1FBQzNDLEtBQUssTUFBTSxXQUFXLElBQUksWUFBWSxFQUFFLENBQUM7WUFDeEMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoSSxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsS0FBSyxDQUFDLHdCQUF3QixDQUFDLFFBQWE7UUFDM0MsSUFBSSxDQUFDO1lBQ0osTUFBTSxjQUFjLEdBQUcsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbEYsTUFBTSxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNyRixNQUFNLEdBQUcsR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMzRCxjQUFjLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDekIsT0FBTyxFQUFFLEdBQUcsRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQUM7UUFDdkMsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDYixDQUFDO1FBQ0QsT0FBTztZQUNOLEdBQUcsRUFBRSxJQUFJLENBQUMsNkJBQTZCLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUN4RCxZQUFZLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLHFCQUFxQixDQUFDO1lBQy9GLE9BQU8sRUFBRSxJQUFJLENBQUMsZ0NBQWdDLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxnQkFBZ0IsQ0FBQztTQUNuRixDQUFDO0lBQ0gsQ0FBQztDQUVELENBQUE7QUF2Q0ssdUJBQXVCO0lBSzFCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLDhCQUE4QixDQUFBO0lBQzlCLFdBQUEsaUNBQWlDLENBQUE7R0FSOUIsdUJBQXVCLENBdUM1QjtBQUVELGlCQUFpQixDQUFDLHdCQUF3QixFQUFFLHVCQUF1QixvQ0FBNEIsQ0FBQyJ9