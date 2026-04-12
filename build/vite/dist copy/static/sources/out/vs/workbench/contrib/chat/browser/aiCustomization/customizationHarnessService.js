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
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { CustomizationHarness, CustomizationHarnessServiceBase, ICustomizationHarnessService, createCliHarnessDescriptor, createClaudeHarnessDescriptor, createVSCodeHarnessDescriptor, getCliUserRoots, getClaudeUserRoots, } from '../../common/customizationHarnessService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../../common/aiCustomizationWorkspaceService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
/**
 * Core implementation of the customization harness service.
 *
 * When `chat.customizations.providerApi.enabled` is true, only the Local
 * harness is registered statically. All other harnesses are contributed by
 * extensions via the provider API, so the hardcoded CLI/Claude harnesses are
 * intentionally omitted.
 *
 * When the setting is false, the full set of built-in harnesses (Local, Copilot
 * CLI, Claude) is registered for backwards compat.
 */
let CustomizationHarnessService = class CustomizationHarnessService extends CustomizationHarnessServiceBase {
    constructor(pathService, configurationService) {
        // The Local harness includes extension-contributed and built-in customizations.
        // Built-in items come from the default chat extension (productService.defaultChatAgent).
        const localExtras = [PromptsStorage.extension, BUILTIN_STORAGE];
        const providerApiEnabled = configurationService.getValue(ChatConfiguration.CustomizationsProviderApi);
        let allHarnesses;
        if (providerApiEnabled) {
            // When the provider API is enabled, only expose the Local harness.
            // CLI and Claude harnesses don't consume extension contributions.
            // Additional harnesses are contributed entirely via the provider API.
            allHarnesses = [createVSCodeHarnessDescriptor(localExtras)];
        }
        else {
            const userHome = pathService.userHome({ preferLocal: true });
            const restrictedExtras = [];
            allHarnesses = [
                createVSCodeHarnessDescriptor(localExtras),
                createCliHarnessDescriptor(getCliUserRoots(userHome), restrictedExtras),
                createClaudeHarnessDescriptor(getClaudeUserRoots(userHome), restrictedExtras),
            ];
        }
        super(allHarnesses, CustomizationHarness.VSCode);
    }
};
CustomizationHarnessService = __decorate([
    __param(0, IPathService),
    __param(1, IConfigurationService)
], CustomizationHarnessService);
registerSingleton(ICustomizationHarnessService, CustomizationHarnessService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2xILE9BQU8sRUFDTixvQkFBb0IsRUFDcEIsK0JBQStCLEVBQy9CLDRCQUE0QixFQUU1QiwwQkFBMEIsRUFDMUIsNkJBQTZCLEVBQzdCLDZCQUE2QixFQUM3QixlQUFlLEVBQ2Ysa0JBQWtCLEdBQ2xCLE1BQU0sNkNBQTZDLENBQUM7QUFDckQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDL0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFOUQ7Ozs7Ozs7Ozs7R0FVRztBQUNILElBQU0sMkJBQTJCLEdBQWpDLE1BQU0sMkJBQTRCLFNBQVEsK0JBQStCO0lBQ3hFLFlBQ2UsV0FBeUIsRUFDaEIsb0JBQTJDO1FBRWxFLGdGQUFnRjtRQUNoRix5RkFBeUY7UUFDekYsTUFBTSxXQUFXLEdBQUcsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBRWhFLE1BQU0sa0JBQWtCLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFVLGlCQUFpQixDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFFL0csSUFBSSxZQUEyQyxDQUFDO1FBQ2hELElBQUksa0JBQWtCLEVBQUUsQ0FBQztZQUN4QixtRUFBbUU7WUFDbkUsa0VBQWtFO1lBQ2xFLHNFQUFzRTtZQUN0RSxZQUFZLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBQzdELENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzdELE1BQU0sZ0JBQWdCLEdBQXNCLEVBQUUsQ0FBQztZQUMvQyxZQUFZLEdBQUc7Z0JBQ2QsNkJBQTZCLENBQUMsV0FBVyxDQUFDO2dCQUMxQywwQkFBMEIsQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLEVBQUUsZ0JBQWdCLENBQUM7Z0JBQ3ZFLDZCQUE2QixDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxFQUFFLGdCQUFnQixDQUFDO2FBQzdFLENBQUM7UUFDSCxDQUFDO1FBRUQsS0FBSyxDQUNKLFlBQVksRUFDWixvQkFBb0IsQ0FBQyxNQUFNLENBQzNCLENBQUM7SUFDSCxDQUFDO0NBQ0QsQ0FBQTtBQWhDSywyQkFBMkI7SUFFOUIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLHFCQUFxQixDQUFBO0dBSGxCLDJCQUEyQixDQWdDaEM7QUFFRCxpQkFBaUIsQ0FBQyw0QkFBNEIsRUFBRSwyQkFBMkIsb0NBQTRCLENBQUMifQ==