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
import * as nls from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../common/contributions.js';
import { IssueFormService } from './issueFormService.js';
import { BrowserIssueService } from './issueService.js';
import './issueTroubleshoot.js';
import { IIssueFormService, IWorkbenchIssueService } from '../common/issue.js';
import { BaseIssueContribution } from '../common/issue.contribution.js';
let WebIssueContribution = class WebIssueContribution extends BaseIssueContribution {
    constructor(productService, configurationService) {
        super(productService, configurationService);
        Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
            properties: {
                'issueReporter.experimental.webReporter': {
                    type: 'boolean',
                    default: productService.quality !== 'stable',
                    description: 'Enable experimental issue reporter for web.',
                },
            }
        });
    }
};
WebIssueContribution = __decorate([
    __param(0, IProductService),
    __param(1, IConfigurationService)
], WebIssueContribution);
Registry.as(Extensions.Workbench).registerWorkbenchContribution(WebIssueContribution, 3 /* LifecyclePhase.Restored */);
registerSingleton(IWorkbenchIssueService, BrowserIssueService, 1 /* InstantiationType.Delayed */);
registerSingleton(IIssueFormService, IssueFormService, 1 /* InstantiationType.Delayed */);
CommandsRegistry.registerCommand('_issues.getSystemStatus', (accessor) => {
    return nls.localize('statusUnsupported', "The --status argument is not yet supported in browsers.");
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXNzdWUuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvaXNzdWUvYnJvd3Nlci9pc3N1ZS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsVUFBVSxJQUFJLHVCQUF1QixFQUEwQixNQUFNLG9FQUFvRSxDQUFDO0FBQ25KLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxVQUFVLEVBQW1DLE1BQU0sa0NBQWtDLENBQUM7QUFDL0YsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDekQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDeEQsT0FBTyx3QkFBd0IsQ0FBQztBQUNoQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUMvRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUl4RSxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLHFCQUFxQjtJQUN2RCxZQUE2QixjQUErQixFQUF5QixvQkFBMkM7UUFDL0gsS0FBSyxDQUFDLGNBQWMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQzVDLFFBQVEsQ0FBQyxFQUFFLENBQXlCLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDLHFCQUFxQixDQUFDO1lBQ2hHLFVBQVUsRUFBRTtnQkFDWCx3Q0FBd0MsRUFBRTtvQkFDekMsSUFBSSxFQUFFLFNBQVM7b0JBQ2YsT0FBTyxFQUFFLGNBQWMsQ0FBQyxPQUFPLEtBQUssUUFBUTtvQkFDNUMsV0FBVyxFQUFFLDZDQUE2QztpQkFDMUQ7YUFDRDtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRCxDQUFBO0FBYkssb0JBQW9CO0lBQ1osV0FBQSxlQUFlLENBQUE7SUFBbUMsV0FBQSxxQkFBcUIsQ0FBQTtHQUQvRSxvQkFBb0IsQ0FhekI7QUFFRCxRQUFRLENBQUMsRUFBRSxDQUFrQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsNkJBQTZCLENBQUMsb0JBQW9CLGtDQUEwQixDQUFDO0FBRWhKLGlCQUFpQixDQUFDLHNCQUFzQixFQUFFLG1CQUFtQixvQ0FBNEIsQ0FBQztBQUMxRixpQkFBaUIsQ0FBQyxpQkFBaUIsRUFBRSxnQkFBZ0Isb0NBQTRCLENBQUM7QUFFbEYsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLHlCQUF5QixFQUFFLENBQUMsUUFBUSxFQUFFLEVBQUU7SUFDeEUsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLHlEQUF5RCxDQUFDLENBQUM7QUFDckcsQ0FBQyxDQUFDLENBQUMifQ==