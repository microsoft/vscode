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
export const ClickBrowserToolData = {
    id: 'click_element',
    toolReferenceName: 'clickElement',
    displayName: localize('clickBrowserTool.displayName', 'Click Element'),
    userDescription: localize('clickBrowserTool.userDescription', 'Click an element in a browser page'),
    modelDescription: 'Click on an element in a browser page.',
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
                description: 'Element reference to click.'
            },
            selector: {
                type: 'string',
                description: 'Playwright selector of the element to click when "ref" is not available.'
            },
            element: {
                type: 'string',
                description: 'Human-readable description of the element to click (e.g., "submit button", "search icon").'
            },
            dblClick: {
                type: 'boolean',
                description: 'Set to true for double clicks. Default is false.'
            },
            button: {
                type: 'string',
                enum: ['left', 'right', 'middle'],
                description: 'Mouse button to click with. Default is "left".'
            },
        },
        required: ['pageId', 'element'],
        oneOf: [
            { required: ['ref'] },
            { required: ['selector'] },
        ]
    },
};
let ClickBrowserTool = class ClickBrowserTool {
    constructor(playwrightService) {
        this.playwrightService = playwrightService;
    }
    async prepareToolInvocation(_context, _token) {
        const params = _context.parameters;
        const link = createBrowserPageLink(params.pageId);
        const element = escapeMarkdownSyntaxTokens(params.element ?? DEFAULT_ELEMENT_LABEL);
        return {
            invocationMessage: params.button === 'right'
                ? new MarkdownString(localize('browser.click.invocation.right', "Right-clicking {0} in {1}", element, link))
                : params.button === 'middle'
                    ? new MarkdownString(localize('browser.click.invocation.middle', "Middle-clicking {0} in {1}", element, link))
                    : params.dblClick
                        ? new MarkdownString(localize('browser.dblClick.invocation', "Double-clicking {0} in {1}", element, link))
                        : new MarkdownString(localize('browser.click.invocation', "Clicking {0} in {1}", element, link)),
            pastTenseMessage: params.button === 'right'
                ? new MarkdownString(localize('browser.click.past.right', "Right-clicked {0} in {1}", element, link))
                : params.button === 'middle'
                    ? new MarkdownString(localize('browser.click.past.middle', "Middle-clicked {0} in {1}", element, link))
                    : params.dblClick
                        ? new MarkdownString(localize('browser.dblClick.past', "Double-clicked {0} in {1}", element, link))
                        : new MarkdownString(localize('browser.click.past', "Clicked {0} in {1}", element, link)),
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
        const button = params.button ?? 'left';
        if (params.dblClick) {
            return playwrightInvoke(this.playwrightService, params.pageId, (page, sel, btn) => page.locator(sel).dblclick({ button: btn }), selector, button);
        }
        return playwrightInvoke(this.playwrightService, params.pageId, (page, sel, btn) => page.locator(sel).click({ button: btn }), selector, button);
    }
};
ClickBrowserTool = __decorate([
    __param(0, IPlaywrightService)
], ClickBrowserTool);
export { ClickBrowserTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpY2tCcm93c2VyVG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvdG9vbHMvY2xpY2tCcm93c2VyVG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNyRyxPQUFPLEVBQUUsY0FBYyxFQUE2TCxNQUFNLHlEQUF5RCxDQUFDO0FBQ3BSLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxxQkFBcUIsRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFdEQsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQWM7SUFDOUMsRUFBRSxFQUFFLGVBQWU7SUFDbkIsaUJBQWlCLEVBQUUsY0FBYztJQUNqQyxXQUFXLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLGVBQWUsQ0FBQztJQUN0RSxlQUFlLEVBQUUsUUFBUSxDQUFDLGtDQUFrQyxFQUFFLG9DQUFvQyxDQUFDO0lBQ25HLGdCQUFnQixFQUFFLHdDQUF3QztJQUMxRCxJQUFJLEVBQUUsT0FBTyxDQUFDLE1BQU07SUFDcEIsTUFBTSxFQUFFLGNBQWMsQ0FBQyxRQUFRO0lBQy9CLFdBQVcsRUFBRTtRQUNaLElBQUksRUFBRSxRQUFRO1FBQ2QsVUFBVSxFQUFFO1lB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