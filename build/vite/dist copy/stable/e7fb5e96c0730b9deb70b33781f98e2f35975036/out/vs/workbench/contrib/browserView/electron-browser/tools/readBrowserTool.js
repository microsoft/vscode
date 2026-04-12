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
import { ToolDataSource } from '../../../chat/common/tools/languageModelToolsService.js';
import { createBrowserPageLink, errorResult } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';
export const ReadBrowserToolData = {
    id: 'read_page',
    toolReferenceName: 'readPage',
    displayName: localize('readBrowserTool.displayName', 'Read Page'),
    userDescription: localize('readBrowserTool.userDescription', 'Read the content of a browser page'),
    modelDescription: 'Get a snapshot of the current browser page state. This is better than screenshot.',
    icon: Codicon.fileText,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            pageId: {
                type: 'string',
                description: `The browser page ID to read, acquired from context or the open tool.`
            },
        },
        required: ['pageId'],
    },
};
let ReadBrowserTool = class ReadBrowserTool {
    constructor(playwrightService) {
        this.playwrightService = playwrightService;
    }
    async prepareToolInvocation(_context, _token) {
        const link = createBrowserPageLink(_context.parameters.pageId);
        return {
            invocationMessage: new MarkdownString(localize('browser.read.invocation', "Reading {0}", link)),
            pastTenseMessage: new MarkdownString(localize('browser.read.past', "Read {0}", link)),
        };
    }
    async invoke(invocation, _countTokens, _progress, _token) {
        const params = invocation.parameters;
        if (!params.pageId) {
            return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
        }
        const summary = await this.playwrightService.getSummary(params.pageId);
        if (!summary) {
            return errorResult('No page summary available.');
        }
        return {
            content: [{
                    kind: 'text',
                    value: summary,
                }],
        };
    }
};
ReadBrowserTool = __decorate([
    __param(0, IPlaywrightService)
], ReadBrowserTool);
export { ReadBrowserTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhZEJyb3dzZXJUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci90b29scy9yZWFkQnJvd3NlclRvb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDckcsT0FBTyxFQUFFLGNBQWMsRUFBNkwsTUFBTSx5REFBeUQsQ0FBQztBQUNwUixPQUFPLEVBQUUscUJBQXFCLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDN0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRXRELE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFjO0lBQzdDLEVBQUUsRUFBRSxXQUFXO0lBQ2YsaUJBQWlCLEVBQUUsVUFBVTtJQUM3QixXQUFXLEVBQUUsUUFBUSxDQUFDLDZCQUE2QixFQUFFLFdBQVcsQ0FBQztJQUNqRSxlQUFlLEVBQUUsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLG9DQUFvQyxDQUFDO0lBQ2xHLGdCQUFnQixFQUFFLG1GQUFtRjtJQUNyRyxJQUFJLEVBQUUsT0FBTyxDQUFDLFFBQVE7SUFDdEIsTUFBTSxFQUFFLGNBQWMsQ0FBQyxRQUFRO0lBQy9CLFdBQVcsRUFBRTtRQUNaLElBQUksRUFBRSxRQUFRO1FBQ2QsVUFBVSxFQUFFO1lBQ1gsTUFBTSxFQUFFO2dCQUNQLElBQUksRUFBRSxRQUFRO2dCQUNkLFdBQVcsRUFBRSxzRUFBc0U7YUFDbkY7U0FDRDtRQUNELFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQztLQUNwQjtDQUNELENBQUM7QUFNSyxJQUFNLGVBQWUsR0FBckIsTUFBTSxlQUFlO0lBQzNCLFlBQ3NDLGlCQUFxQztRQUFyQyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO0lBQ3ZFLENBQUM7SUFFTCxLQUFLLENBQUMscUJBQXFCLENBQUMsUUFBMkMsRUFBRSxNQUF5QjtRQUNqRyxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQy9ELE9BQU87WUFDTixpQkFBaUIsRUFBRSxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUUsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9GLGdCQUFnQixFQUFFLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDckYsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUFDLFVBQTJCLEVBQUUsWUFBaUMsRUFBRSxTQUF1QixFQUFFLE1BQXlCO1FBQzlILE1BQU0sTUFBTSxHQUFHLFVBQVUsQ0FBQyxVQUFvQyxDQUFDO1FBRS9ELElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDcEIsT0FBTyxXQUFXLENBQUMsNkJBQTZCLGNBQWMsVUFBVSxDQUFDLENBQUM7UUFDM0UsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsT0FBTyxXQUFXLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUNsRCxDQUFDO1FBRUQsT0FBTztZQUNOLE9BQU8sRUFBRSxDQUFDO29CQUNULElBQUksRUFBRSxNQUFNO29CQUNaLEtBQUssRUFBRSxPQUFPO2lCQUNkLENBQUM7U0FDRixDQUFDO0lBQ0gsQ0FBQztDQUNELENBQUE7QUFoQ1ksZUFBZTtJQUV6QixXQUFBLGtCQUFrQixDQUFBO0dBRlIsZUFBZSxDQWdDM0IifQ==