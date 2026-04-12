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
import { ILogService } from '../../../../platform/log/common/log.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ChatConfiguration } from '../common/constants.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { createDefaultModelArrays, DefaultModelContribution } from './defaultModelContribution.js';
const arrays = createDefaultModelArrays();
let ExploreAgentDefaultModel = class ExploreAgentDefaultModel extends DefaultModelContribution {
    static { this.ID = 'workbench.contrib.exploreAgentDefaultModel'; }
    static { this.modelIds = arrays.modelIds; }
    static { this.modelLabels = arrays.modelLabels; }
    static { this.modelDescriptions = arrays.modelDescriptions; }
    constructor(languageModelsService, logService) {
        super(arrays, {
            configKey: ChatConfiguration.ExploreAgentDefaultModel,
            configSectionId: 'chatSidebar',
            logPrefix: '[ExploreAgentDefaultModel]',
            filter: metadata => !!metadata.capabilities?.toolCalling,
        }, languageModelsService, logService);
    }
};
ExploreAgentDefaultModel = __decorate([
    __param(0, ILanguageModelsService),
    __param(1, ILogService)
], ExploreAgentDefaultModel);
export { ExploreAgentDefaultModel };
registerWorkbenchContribution2(ExploreAgentDefaultModel.ID, ExploreAgentDefaultModel, 2 /* WorkbenchPhase.BlockRestore */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwbG9yZUFnZW50RGVmYXVsdE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2V4cGxvcmVBZ2VudERlZmF1bHRNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLDhCQUE4QixFQUFrQixNQUFNLGtDQUFrQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzNELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3JFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRW5HLE1BQU0sTUFBTSxHQUFHLHdCQUF3QixFQUFFLENBQUM7QUFFbkMsSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSx3QkFBd0I7YUFDckQsT0FBRSxHQUFHLDRDQUE0QyxBQUEvQyxDQUFnRDthQUVsRCxhQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsQUFBbEIsQ0FBbUI7YUFDM0IsZ0JBQVcsR0FBRyxNQUFNLENBQUMsV0FBVyxBQUFyQixDQUFzQjthQUNqQyxzQkFBaUIsR0FBRyxNQUFNLENBQUMsaUJBQWlCLEFBQTNCLENBQTRCO0lBRTdELFlBQ3lCLHFCQUE2QyxFQUN4RCxVQUF1QjtRQUVwQyxLQUFLLENBQUMsTUFBTSxFQUFFO1lBQ2IsU0FBUyxFQUFFLGlCQUFpQixDQUFDLHdCQUF3QjtZQUNyRCxlQUFlLEVBQUUsYUFBYTtZQUM5QixTQUFTLEVBQUUsNEJBQTRCO1lBQ3ZDLE1BQU0sRUFBRSxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLFdBQVc7U0FDeEQsRUFBRSxxQkFBcUIsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUN2QyxDQUFDOztBQWpCVyx3QkFBd0I7SUFRbEMsV0FBQSxzQkFBc0IsQ0FBQTtJQUN0QixXQUFBLFdBQVcsQ0FBQTtHQVRELHdCQUF3QixDQWtCcEM7O0FBRUQsOEJBQThCLENBQUMsd0JBQXdCLENBQUMsRUFBRSxFQUFFLHdCQUF3QixzQ0FBOEIsQ0FBQyJ9