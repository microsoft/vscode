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
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchIssueService } from './issue.js';
const OpenIssueReporterActionId = 'workbench.action.openIssueReporter';
const OpenIssueReporterApiId = 'vscode.openIssueReporter';
const OpenIssueReporterCommandMetadata = {
    description: 'Open the issue reporter and optionally prefill part of the form.',
    args: [
        {
            name: 'options',
            description: 'Data to use to prefill the issue reporter with.',
            isOptional: true,
            schema: {
                oneOf: [
                    {
                        type: 'string',
                        description: 'The extension id to preselect.'
                    },
                    {
                        type: 'object',
                        properties: {
                            extensionId: {
                                type: 'string'
                            },
                            issueTitle: {
                                type: 'string'
                            },
                            issueBody: {
                                type: 'string'
                            }
                        }
                    }
                ]
            }
        },
    ]
};
let BaseIssueContribution = class BaseIssueContribution extends Disposable {
    constructor(productService, configurationService) {
        super();
        if (!configurationService.getValue('telemetry.feedback.enabled')) {
            this._register(CommandsRegistry.registerCommand({
                id: 'workbench.action.openIssueReporter',
                handler: function (accessor) {
                    const data = accessor.get(INotificationService);
                    data.info('Feedback is disabled.');
                },
            }));
            return;
        }
        if (!productService.reportIssueUrl) {
            return;
        }
        this._register(CommandsRegistry.registerCommand({
            id: OpenIssueReporterActionId,
            handler: function (accessor, args) {
                const data = typeof args === 'string'
                    ? { extensionId: args }
                    : Array.isArray(args)
                        ? { extensionId: args[0] }
                        : args ?? {};
                return accessor.get(IWorkbenchIssueService).openReporter(data);
            },
            metadata: OpenIssueReporterCommandMetadata
        }));
        this._register(CommandsRegistry.registerCommand({
            id: OpenIssueReporterApiId,
            handler: function (accessor, args) {
                const data = typeof args === 'string'
                    ? { extensionId: args }
                    : Array.isArray(args)
                        ? { extensionId: args[0] }
                        : args ?? {};
                return accessor.get(IWorkbenchIssueService).openReporter(data);
            },
            metadata: OpenIssueReporterCommandMetadata
        }));
        const reportIssue = {
            id: OpenIssueReporterActionId,
            title: localize2({ key: 'reportIssueInEnglish', comment: ['Translate this to "Report Issue in English" in all languages please!'] }, "Report Issue..."),
            category: Categories.Help
        };
        this._register(MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: reportIssue }));
        this._register(MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
            group: '3_feedback',
            command: {
                id: OpenIssueReporterActionId,
                title: localize({ key: 'miReportIssue', comment: ['&& denotes a mnemonic', 'Translate this to "Report Issue in English" in all languages please!'] }, "Report &&Issue")
            },
            order: 3
        }));
    }
};
BaseIssueContribution = __decorate([
    __param(0, IProductService),
    __param(1, IConfigurationService)
], BaseIssueContribution);
export { BaseIssueContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXNzdWUuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvaXNzdWUvY29tbW9uL2lzc3VlLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUV6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOERBQThELENBQUM7QUFDMUYsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsZ0JBQWdCLEVBQW9CLE1BQU0sa0RBQWtELENBQUM7QUFDdEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRXhGLE9BQU8sRUFBcUIsc0JBQXNCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFdkUsTUFBTSx5QkFBeUIsR0FBRyxvQ0FBb0MsQ0FBQztBQUN2RSxNQUFNLHNCQUFzQixHQUFHLDBCQUEwQixDQUFDO0FBRTFELE1BQU0sZ0NBQWdDLEdBQXFCO0lBQzFELFdBQVcsRUFBRSxrRUFBa0U7SUFDL0UsSUFBSSxFQUFFO1FBQ0w7WUFDQyxJQUFJLEVBQUUsU0FBUztZQUNmLFdBQVcsRUFBRSxpREFBaUQ7WUFDOUQsVUFBVSxFQUFFLElBQUk7WUFDaEIsTUFBTSxFQUFFO2dCQUNQLEtBQUssRUFBRTtvQkFDTjt3QkFDQyxJQUFJLEVBQUUsUUFBUTt3QkFDZCxXQUFX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