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
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { ToolDataSource } from '../../../chat/common/tools/languageModelToolsService.js';
import { createBrowserPageLink, DEFAULT_ELEMENT_LABEL, errorResult, playwrightInvoke } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';
export const HoverElementToolData = {
    id: 'hover_element',
    toolReferenceName: 'hoverElement',
    displayName: localize('hoverElementTool.displayName', 'Hover Element'),
    userDescription: localize('hoverElementTool.userDescription', 'Hover over an element in a browser page'),
    modelDescription: 'Hover over an element in a browser page. Provide either a Playwright selector or an element reference.',
    icon: Codicon.cursor,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            pageId: {
                type: 'string',
                description: `The browser page ID, acquired from context or the open tool.`
            },
            ref: {
                type: 'string',
                description: 'Element reference to hover over.'
            },
            selector: {
                type: 'string',
                description: 'Playwright selector of the element to hover over when "ref" is not available.'
            },
            element: {
                type: 'string',
                description: 'Human-readable description of the element to hover over (e.g., "navigation menu", "tooltip trigger").'
            },
        },
        required: ['pageId', 'element'],
        oneOf: [
            { required: ['ref'] },
            { required: ['selector'] },
        ]
    },
};
let HoverElementTool = class HoverElementTool {
    constructor(playwrightService) {
        this.playwrightService = playwrightService;
    }
    async prepareToolInvocation(_context, _token) {
        const params = _context.parameters;
        const link = createBrowserPageLink(params.pageId);
        const element = escapeMarkdownSyntaxTokens(params.element ?? DEFAULT_ELEMENT_LABEL);
        return {
            invocationMessage: new MarkdownString(localize('browser.hover.invocation', "Hovering over {0} in {1}", element, link)),
            pastTenseMessage: new MarkdownString(localize('browser.hover.past', "Hovered over {0} in {1}", element, link)),
        };
    }
    async invoke(invocation, _countTokens, _progress, _token) {
        const params = invocation.parameters;
        if (!params.pageId) {
            return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
        }
        let selector = params.selector;
        if (params.ref) {
            selector = `aria-ref=${params.ref}`;
        }
        if (!selector) {
            return errorResult('Either a "ref" or "selector" parameter is required.');
        }
        return playwrightInvoke(this.playwrightService, params.pageId, (page, sel) => page.locator(sel).hover(), selector);
    }
};
HoverElementTool = __decorate([
    __param(0, IPlaywrightService)
], HoverElementTool);
export { HoverElementTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJFbGVtZW50VG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvdG9vbHMvaG92ZXJFbGVtZW50VG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNyRyxPQUFPLEVBQUUsY0FBYyxFQUE2TCxNQUFNLHlEQUF5RCxDQUFDO0FBQ3BSLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxxQkFBcUIsRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFdEQsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQWM7SUFDOUMsRUFBRSxFQUFFLGVBQWU7SUFDbkIsaUJBQWlCLEVBQUUsY0FBYztJQUNqQyxXQUFXLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLGVBQWUsQ0FBQztJQUN0RSxlQUFlLEVBQUUsUUFBUSxDQUFDLGtDQUFrQyxFQUFFLHlDQUF5QyxDQUFDO0lBQ3hHLGdCQUFnQixFQUFFLHdHQUF3RztJQUMxSCxJQUFJLEVBQUUsT0FBTyxDQUFDLE1BQU07SUFDcEIsTUFBTSxFQUFFLGNBQWMsQ0FBQyxRQUFRO0lBQy9CLFdBQVcsRUFBRTtRQUNaLElBQUksRUFBRSxRQUFRO1FBQ2QsVUFBVSxFQUFFO1lB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