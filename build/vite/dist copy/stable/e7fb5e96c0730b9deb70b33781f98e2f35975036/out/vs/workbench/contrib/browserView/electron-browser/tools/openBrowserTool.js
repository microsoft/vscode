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
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ToolDataSource } from '../../../chat/common/tools/languageModelToolsService.js';
import { alreadyOpenResult, createBrowserPageLink, findExistingPageByHost } from './browserToolHelpers.js';
export const OpenPageToolId = 'open_browser_page';
export const OpenBrowserToolData = {
    id: OpenPageToolId,
    toolReferenceName: 'openBrowserPage',
    displayName: localize('openBrowserTool.displayName', 'Open Browser Page'),
    userDescription: localize('openBrowserTool.userDescription', 'Open a URL in the integrated browser'),
    modelDescription: 'Open a new browser page in the integrated browser at the given URL. Returns a page ID that must be used with other browser tools to interact with the page. Prefer to reuse existing pages whenever possible and only call this tool if a new page is necessary.',
    icon: Codicon.openInProduct,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'The URL to open in the browser. Must be an absolute URI with a scheme such as file:, http:, or https:. For local files, use the canonical absolute form, for example file:///path/to/file.'
            },
            forceNew: {
                type: 'boolean',
                description: 'Whether to force opening a new page even if a page with the same host already exists. Default is false.'
            }
        },
        required: ['url'],
    },
};
let OpenBrowserTool = class OpenBrowserTool {
    constructor(playwrightService, editorService) {
        this.playwrightService = playwrightService;
        this.editorService = editorService;
    }
    async prepareToolInvocation(context, _token) {
        const params = context.parameters;
        if (!params.url) {
            throw new Error('The "url" parameter is required.');
        }
        const parsed = URL.parse(params.url);
        if (!parsed) {
            throw new Error('You must provide a complete, valid URL.');
        }
        return {
            invocationMessage: localize('browser.open.invocation', "Opening browser page at {0}", parsed.href),
            pastTenseMessage: localize('browser.open.past', "Opened browser page at {0}", parsed.href),
            confirmationMessages: {
                title: localize('browser.open.confirmTitle', 'Open Browser Page?'),
                message: localize('browser.open.confirmMessage', 'This will open {0} in the integrated browser. The agent will be able to read and interact with its contents.', parsed.href),
                allowAutoConfirm: true,
            },
        };
    }
    async invoke(invocation, _countTokens, _progress, _token) {
        const params = invocation.parameters;
        if (!params.forceNew) {
            const existing = await findExistingPageByHost(this.editorService, this.playwrightService, params.url);
            if (existing) {
                return alreadyOpenResult(existing);
            }
        }
        const { pageId, summary } = await this.playwrightService.openPage(params.url);
        return {
            content: [{
                    kind: 'text',
                    value: `Page ID: ${pageId}\n\nSummary:\n`,
                }, {
                    kind: 'text',
                    value: summary,
                }],
            toolResultMessage: new MarkdownString(localize('browser.open.result', "Opened {0}", createBrowserPageLink(pageId)))
        };
    }
};
OpenBrowserTool = __decorate([
    __param(0, IPlaywrightService),
    __param(1, IEditorService)
], OpenBrowserTool);
export { OpenBrowserTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3BlbkJyb3dzZXJUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci90b29scy9vcGVuQnJvd3NlclRvb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDckcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxjQUFjLEVBQTZMLE1BQU0seURBQXlELENBQUM7QUFDcFIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHFCQUFxQixFQUFFLHNCQUFzQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFM0csTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLG1CQUFtQixDQUFDO0FBRWxELE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFjO0lBQzdDLEVBQUUsRUFBRSxjQUFjO0lBQ2xCLGlCQUFpQixFQUFFLGlCQUFpQjtJQUNwQyxXQUFXLEVBQUUsUUFBUSxDQUFDLDZCQUE2QixFQUFFLG1CQUFtQixDQUFDO0lBQ3pFLGVBQWUsRUFBRSxRQUFRLENBQUMsaUNBQWlDLEVBQUUsc0NBQXNDLENBQUM7SUFDcEcsZ0JBQWdCLEVBQUUsa1FBQWtRO0lBQ3BSLElBQUksRUFBRSxPQUFPLENBQUMsYUFBYTtJQUMzQixNQUFNLEVBQUUsY0FBYyxDQUFDLFFBQVE7SUFDL0IsV0FBVyxFQUFFO1FBQ1osSUFBSSxFQUFFLFFBQVE7UUFDZCxVQUFVLEVBQUU7WUFDWCxHQUFHLEVBQUU7Z0JBQ0osSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsV0FBVyxFQUFFLDRMQUE0TDthQUN6TTtZQUNELFFBQVEsRUFBRTtnQkFDVCxJQUFJLEVBQUUsU0FBUztnQkFDZixXQUFXLEVBQUUseUdBQXlHO2FBQ3RIO1NBQ0Q7UUFDRCxRQUFRLEVBQUUsQ0FBQyxLQUFLLENBQUM7S0FDakI7Q0FDRCxDQUFDO0FBT0ssSUFBTSxlQUFlLEdBQXJCLE1BQU0sZUFBZTtJQUMzQixZQUNzQyxpQkFBcUMsRUFDekMsYUFBNkI7UUFEekIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUN6QyxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7SUFDM0QsQ0FBQztJQUVMLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxPQUEwQyxFQUFFLE1BQXlCO1FBQ2hHLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxVQUFvQyxDQUFDO1FBRTVELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDakIsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQ3JELENBQUM7UUFDRCxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNyQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixNQUFNLElBQUksS0FBSyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUVELE9BQU87WUFDTixpQkFBaUIsRUFBRSxRQUFRLENBQUMseUJBQXlCLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQztZQUNsRyxnQkFBZ0IsRUFBRSxRQUFRLENBQUMsbUJBQW1CLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQztZQUMxRixvQkFBb0IsRUFBRTtnQkFDckIsS0FBSyxFQUFFLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxvQkFBb0IsQ0FBQztnQkFDbEUsT0FBTyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSw4R0FBOEcsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUM3SyxnQkFBZ0IsRUFBRSxJQUFJO2FBQ3RCO1NBQ0QsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUFDLFVBQTJCLEVBQUUsWUFBaUMsRUFBRSxTQUF1QixFQUFFLE1BQXlCO1FBQzlILE1BQU0sTUFBTSxHQUFHLFVBQVUsQ0FBQyxVQUFvQyxDQUFDO1FBRS9ELElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDdEIsTUFBTSxRQUFRLEdBQUcsTUFBTSxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEcsSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDZCxPQUFPLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3BDLENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRTlFLE9BQU87WUFDTixPQUFPLEVBQUUsQ0FBQztvQkFDVCxJQUFJLEVBQUUsTUFBTTtvQkFDWixLQUFLLEVBQUUsWUFBWSxNQUFNLGdCQUFnQjtpQkFDekMsRUFBRTtvQkFDRixJQUFJLEVBQUUsTUFBTTtvQkFDWixLQUFLLEVBQUUsT0FBTztpQkFDZCxDQUFDO1lBQ0YsaUJBQWlCLEVBQUUsSUFBSSxjQUFjLENBQUMsUUFBUSxDQUFDLHFCQUFxQixFQUFFLFlBQVksRUFBRSxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1NBQ25ILENBQUM7SUFDSCxDQUFDO0NBQ0QsQ0FBQTtBQW5EWSxlQUFlO0lBRXpCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxjQUFjLENBQUE7R0FISixlQUFlLENBbUQzQiJ9