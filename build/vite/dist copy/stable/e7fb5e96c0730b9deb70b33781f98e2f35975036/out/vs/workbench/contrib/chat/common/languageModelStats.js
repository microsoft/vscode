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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Extensions, IExtensionFeaturesManagementService } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
export const ILanguageModelStatsService = createDecorator('ILanguageModelStatsService');
let LanguageModelStatsService = class LanguageModelStatsService extends Disposable {
    constructor(extensionFeaturesManagementService, storageService) {
        super();
        this.extensionFeaturesManagementService = extensionFeaturesManagementService;
        // TODO: @sandy081 - remove this code after a while
        for (const key in storageService.keys(-1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */)) {
            if (key.startsWith('languageModelStats.') || key.startsWith('languageModelAccess.')) {
                storageService.remove(key, -1 /* StorageScope.APPLICATION */);
            }
        }
    }
    async update(model, extensionId, agent, tokenCount) {
        await this.extensionFeaturesManagementService.getAccess(extensionId, CopilotUsageExtensionFeatureId);
    }
};
LanguageModelStatsService = __decorate([
    __param(0, IExtensionFeaturesManagementService),
    __param(1, IStorageService)
], LanguageModelStatsService);
export { LanguageModelStatsService };
export const CopilotUsageExtensionFeatureId = 'copilot';
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: CopilotUsageExtensionFeatureId,
    label: localize('Language Models', "Copilot"),
    description: localize('languageModels', "Language models usage statistics of this extension."),
    icon: Codicon.copilot,
    access: {
        canToggle: false
    },
    accessDataLabel: localize('chat', "chat"),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbFN0YXRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbFN0YXRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUU5RyxPQUFPLEVBQUUsVUFBVSxFQUFFLG1DQUFtQyxFQUE4QixNQUFNLG1FQUFtRSxDQUFDO0FBQ2hLLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTlELE1BQU0sQ0FBQyxNQUFNLDBCQUEwQixHQUFHLGVBQWUsQ0FBNkIsNEJBQTRCLENBQUMsQ0FBQztBQVE3RyxJQUFNLHlCQUF5QixHQUEvQixNQUFNLHlCQUEwQixTQUFRLFVBQVU7SUFJeEQsWUFDdUQsa0NBQXVFLEVBQzVHLGNBQStCO1FBRWhELEtBQUssRUFBRSxDQUFDO1FBSDhDLHVDQUFrQyxHQUFsQyxrQ0FBa0MsQ0FBcUM7UUFJN0gsbURBQW1EO1FBQ25ELEtBQUssTUFBTSxHQUFHLElBQUksY0FBYyxDQUFDLElBQUksK0RBQThDLEVBQUUsQ0FBQztZQUNyRixJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMscUJBQXFCLENBQUMsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLHNCQUFzQixDQUFDLEVBQUUsQ0FBQztnQkFDckYsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLG9DQUEyQixDQUFDO1lBQ3RELENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBYSxFQUFFLFdBQWdDLEVBQUUsS0FBeUIsRUFBRSxVQUE4QjtRQUN0SCxNQUFNLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLDhCQUE4QixDQUFDLENBQUM7SUFDdEcsQ0FBQztDQUVELENBQUE7QUFyQlkseUJBQXlCO0lBS25DLFdBQUEsbUNBQW1DLENBQUE7SUFDbkMsV0FBQSxlQUFlLENBQUE7R0FOTCx5QkFBeUIsQ0FxQnJDOztBQUVELE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUFHLFNBQVMsQ0FBQztBQUN4RCxRQUFRLENBQUMsRUFBRSxDQUE2QixVQUFVLENBQUMseUJBQXlCLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQztJQUN0RyxFQUFFLEVBQUUsOEJBQThCO0lBQ2xDLEtBQUssRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsU0FBUyxDQUFDO0lBQzdDLFdBQVcsRUFBRSxRQUFRLENBQUMsZ0JBQWdCLEVBQUUscURBQXFELENBQUM7SUFDOUYsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPO0lBQ3JCLE1BQU0sRUFBRTtRQUNQLFNBQVMsRUFBRSxLQUFLO0tBQ2hCO0lBQ0QsZUFBZSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDO0NBQ3pDLENBQUMsQ0FBQyJ9