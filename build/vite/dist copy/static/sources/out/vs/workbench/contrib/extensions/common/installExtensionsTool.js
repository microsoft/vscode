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
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ToolDataSource } from '../../chat/common/tools/languageModelToolsService.js';
import { IExtensionsWorkbenchService } from './extensions.js';
export const InstallExtensionsToolId = 'vscode_installExtensions';
export const InstallExtensionsToolData = {
    id: InstallExtensionsToolId,
    toolReferenceName: 'installExtensions',
    canBeReferencedInPrompt: true,
    displayName: localize('installExtensionsTool.displayName', 'Install Extensions'),
    modelDescription: 'This is a tool for installing extensions in Visual Studio Code. You should provide the list of extension ids to install. The identifier of an extension is \'\${ publisher }.\${ name }\' for example: \'vscode.csharp\'.',
    userDescription: localize('installExtensionsTool.userDescription', 'Tool for installing extensions'),
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            ids: {
                type: 'array',
                items: {
                    type: 'string',
                },
                description: 'The ids of the extensions to search for. The identifier of an extension is \'\${ publisher }.\${ name }\' for example: \'vscode.csharp\'.',
            },
        }
    }
};
let InstallExtensionsTool = class InstallExtensionsTool {
    constructor(extensionsWorkbenchService) {
        this.extensionsWorkbenchService = extensionsWorkbenchService;
    }
    async prepareToolInvocation(context, token) {
        const parameters = context.parameters;
        return {
            confirmationMessages: {
                title: localize('installExtensionsTool.confirmationTitle', 'Install Extensions'),
                message: new MarkdownString(localize('installExtensionsTool.confirmationMessage', "Review the suggested extensions and click the **Install** button for each extension you wish to add. Once you have finished installing the selected extensions, click **Continue** to proceed.")),
            },
            toolSpecificData: {
                kind: 'extensions',
                extensions: parameters.ids
            }
        };
    }
    async invoke(invocation, _countTokens, _progress, token) {
        const input = invocation.parameters;
        const installed = this.extensionsWorkbenchService.local.filter(e => input.ids.some(id => areSameExtensions({ id }, e.identifier)));
        return {
            content: [{
                    kind: 'text',
                    value: installed.length ? localize('installExtensionsTool.resultMessage', 'Following extensions are installed: {0}', installed.map(e => e.identifier.id).join(', ')) : localize('installExtensionsTool.noResultMessage', 'No extensions were installed.'),
                }]
        };
    }
};
InstallExtensionsTool = __decorate([
    __param(0, IExtensionsWorkbenchService)
], InstallExtensionsTool);
export { InstallExtensionsTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zdGFsbEV4dGVuc2lvbnNUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9jb21tb24vaW5zdGFsbEV4dGVuc2lvbnNUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFDL0csT0FBTyxFQUF1SSxjQUFjLEVBQWdCLE1BQU0sc0RBQXNELENBQUM7QUFDek8sT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFFOUQsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsMEJBQTBCLENBQUM7QUFFbEUsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQWM7SUFDbkQsRUFBRSxFQUFFLHVCQUF1QjtJQUMzQixpQkFBaUIsRUFBRSxtQkFBbUI7SUFDdEMsdUJBQXVCLEVBQUUsSUFBSTtJQUM3QixXQUFXLEVBQUUsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLG9CQUFvQixDQUFDO0lBQ2hGLGdCQUFnQixFQUFFLDJOQUEyTjtJQUM3TyxlQUFlLEVBQUUsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLGdDQUFnQyxDQUFDO0lBQ3BHLE1BQU0sRUFBRSxjQUFjLENBQUMsUUFBUTtJQUMvQixXQUFXLEVBQUU7UUFDWixJQUFJLEVBQUUsUUFBUTtRQUNkLFVBQVUsRUFBRTtZQUNYLEdBQUcsRUFBRTtnQkFDSixJQUFJLEVBQUUsT0FBTztnQkFDYixLQUFLLEVBQUU7b0JBQ04sSUFBSSxFQUFFLFFBQVE7aUJBQ2Q7Z0JBQ0QsV0FBVyxFQUFFLDJJQUEySTthQUN4SjtTQUNEO0tBQ0Q7Q0FDRCxDQUFDO0FBTUssSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBcUI7SUFFakMsWUFDK0MsMEJBQXVEO1FBQXZELCtCQUEwQixHQUExQiwwQkFBMEIsQ0FBNkI7SUFDbEcsQ0FBQztJQUVMLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxPQUEwQyxFQUFFLEtBQXdCO1FBQy9GLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUF5QixDQUFDO1FBQ3JELE9BQU87WUFDTixvQkFBb0IsRUFBRTtnQkFDckIsS0FBSyxFQUFFLFFBQVEsQ0FBQyx5Q0FBeUMsRUFBRSxvQkFBb0IsQ0FBQztnQkFDaEYsT0FBTyxFQUFFLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQywyQ0FBMkMsRUFBRSxnTUFBZ00sQ0FBQyxDQUFDO2FBQ3BSO1lBQ0QsZ0JBQWdCLEVBQUU7Z0JBQ2pCLElBQUksRUFBRSxZQUFZO2dCQUNsQixVQUFVLEVBQUUsVUFBVSxDQUFDLEdBQUc7YUFDMUI7U0FDRCxDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsVUFBMkIsRUFBRSxZQUFpQyxFQUFFLFNBQXVCLEVBQUUsS0FBd0I7UUFDN0gsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLFVBQXlCLENBQUM7UUFDbkQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuSSxPQUFPO1lBQ04sT0FBTyxFQUFFLENBQUM7b0JBQ1QsSUFBSSxFQUFFLE1BQU07b0JBQ1osS0FBSyxFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSx5Q0FBeUMsRUFBRSxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLCtCQUErQixDQUFDO2lCQUN6UCxDQUFDO1NBQ0YsQ0FBQztJQUNILENBQUM7Q0FDRCxDQUFBO0FBOUJZLHFCQUFxQjtJQUcvQixXQUFBLDJCQUEyQixDQUFBO0dBSGpCLHFCQUFxQixDQThCakMifQ==