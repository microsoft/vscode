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
import { localize } from '../../../../nls.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ILanguageModelsService } from '../../chat/common/languageModels.js';
import { createDefaultModelArrays, DefaultModelContribution } from '../../chat/browser/defaultModelContribution.js';
const arrays = createDefaultModelArrays();
let InlineChatDefaultModel = class InlineChatDefaultModel extends DefaultModelContribution {
    static { this.ID = 'workbench.contrib.inlineChatDefaultModel'; }
    static { this.modelIds = arrays.modelIds; }
    static { this.modelLabels = arrays.modelLabels; }
    static { this.modelDescriptions = arrays.modelDescriptions; }
    constructor(languageModelsService, logService) {
        super(arrays, {
            configKey: "inlineChat.defaultModel" /* InlineChatConfigKeys.DefaultModel */,
            configSectionId: 'inlineChat',
            logPrefix: '[InlineChatDefaultModel]',
            filter: metadata => !!metadata.capabilities?.toolCalling,
        }, languageModelsService, logService);
    }
};
InlineChatDefaultModel = __decorate([
    __param(0, ILanguageModelsService),
    __param(1, ILogService)
], InlineChatDefaultModel);
export { InlineChatDefaultModel };
registerWorkbenchContribution2(InlineChatDefaultModel.ID, InlineChatDefaultModel, 2 /* WorkbenchPhase.BlockRestore */);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    ...{ id: 'inlineChat', title: localize('inlineChatConfigurationTitle', 'Inline Chat'), order: 30, type: 'object' },
    properties: {
        ["inlineChat.defaultModel" /* InlineChatConfigKeys.DefaultModel */]: {
            description: localize('inlineChatDefaultModelDescription', "Select the default language model to use for inline chat from the available providers. Model names may include the provider in parentheses, for example 'Claude Haiku 4.5 (copilot)'."),
            type: 'string',
            default: '',
            order: 1,
            enum: InlineChatDefaultModel.modelIds,
            enumItemLabels: InlineChatDefaultModel.modelLabels,
            markdownEnumDescriptions: InlineChatDefaultModel.modelDescriptions
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdERlZmF1bHRNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0RGVmYXVsdE1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQTBCLFVBQVUsSUFBSSx1QkFBdUIsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQ25KLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLDhCQUE4QixFQUFrQixNQUFNLGtDQUFrQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTdFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXBILE1BQU0sTUFBTSxHQUFHLHdCQUF3QixFQUFFLENBQUM7QUFFbkMsSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBdUIsU0FBUSx3QkFBd0I7YUFDbkQsT0FBRSxHQUFHLDBDQUEwQyxBQUE3QyxDQUE4QzthQUVoRCxhQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsQUFBbEIsQ0FBbUI7YUFDM0IsZ0JBQVcsR0FBRyxNQUFNLENBQUMsV0FBVyxBQUFyQixDQUFzQjthQUNqQyxzQkFBaUIsR0FBRyxNQUFNLENBQUMsaUJBQWlCLEFBQTNCLENBQTRCO0lBRTdELFlBQ3lCLHFCQUE2QyxFQUN4RCxVQUF1QjtRQUVwQyxLQUFLLENBQUMsTUFBTSxFQUFFO1lBQ2IsU0FBUyxtRUFBbUM7WUFDNUMsZUFBZSxFQUFFLFlBQVk7WUFDN0IsU0FBUyxFQUFFLDBCQUEwQjtZQUNyQyxNQUFNLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxXQUFXO1NBQ3hELEVBQUUscUJBQXFCLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDdkMsQ0FBQzs7QUFqQlcsc0JBQXNCO0lBUWhDLFdBQUEsc0JBQXNCLENBQUE7SUFDdEIsV0FBQSxXQUFXLENBQUE7R0FURCxzQkFBc0IsQ0FrQmxDOztBQUVELDhCQUE4QixDQUFDLHNCQUFzQixDQUFDLEVBQUUsRUFBRSxzQkFBc0Isc0NBQThCLENBQUM7QUFFL0csUUFBUSxDQUFDLEVBQUUsQ0FBeUIsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUMscUJBQXFCLENBQUM7SUFDaEcsR0FBRyxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxhQUFhLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7SUFDbEgsVUFBVSxFQUFFO1FBQ1gsbUVBQW1DLEVBQUU7WUFDcEMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxtQ0FBbUMsRUFBRSx1TEFBdUwsQ0FBQztZQUNuUCxJQUFJLEVBQUUsUUFBUTtZQUNkLE9BQU8sRUFBRSxFQUFFO1lBQ1gsS0FBSyxFQUFFLENBQUM7WUFDUixJQUFJLEVBQUUsc0JBQXNCLENBQUMsUUFBUTtZQUNyQyxjQUFjLEVBQUUsc0JBQXNCLENBQUMsV0FBVztZQUNsRCx3QkFBd0IsRUFBRSxzQkFBc0IsQ0FBQyxpQkFBaUI7U0FDbEU7S0FDRDtDQUNELENBQUMsQ0FBQyJ9