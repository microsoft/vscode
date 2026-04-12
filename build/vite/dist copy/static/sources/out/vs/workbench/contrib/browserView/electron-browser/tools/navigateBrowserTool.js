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
import { createBrowserPageLink, errorResult, playwrightInvoke } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';
export const NavigateBrowserToolData = {
    id: 'navigate_page',
    toolReferenceName: 'navigatePage',
    displayName: localize('navigateBrowserTool.displayName', 'Navigate Page'),
    userDescription: localize('navigateBrowserTool.userDescription', 'Navigate or reload a browser page'),
    modelDescription: 'Navigate a browser page by URL, history, or reload.',
    icon: Codicon.arrowRight,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            pageId: {
                type: 'string',
                description: `The browser page ID to navigate, acquired from context or the open tool.`
            },
            type: {
                type: 'string',
                enum: ['url', 'back', 'forward', 'reload'],
                description: 'Navigation type: "url" to navigate to a URL (default, requires "url" param), "back" or "forward" for history, "reload" to refresh.'
            },
            url: {
                type: 'string',
                description: 'The URL to navigate to. Required when type is "url".'
            },
        },
        required: ['pageId'],
    },
};
let NavigateBrowserTool = class NavigateBrowserTool {
    constructor(playwrightService) {
        this.playwrightService = playwrightService;
    }
    async prepareToolInvocation(context, _token) {
        const params = context.parameters;
        const link = createBrowserPageLink(params.pageId);
        switch (params.type) {
            case 'reload':
                return {
                    invocationMessage: new MarkdownString(localize('browser.reload.invocation', "Reloading {0}", link)),
                    pastTenseMessage: new MarkdownString(localize('browser.reload.past', "Reloaded {0}", link)),
                    icon: Codicon.refresh,
                };
            case 'back':
                return {
                    invocationMessage: new MarkdownString(localize('browser.goBack.invocation', "Navigating backward in {0}", link)),
                    pastTenseMessage: new MarkdownString(localize('browser.goBack.past', "Navigated backward in {0}", link)),
                    icon: Codicon.arrowLeft,
                };
            case 'forward':
                return {
                    invocationMessage: new MarkdownString(localize('browser.goForward.invocation', "Navigating forward in {0}", link)),
                    pastTenseMessage: new MarkdownString(localize('browser.goForward.past', "Navigated forward in {0}", link)),
                    icon: Codicon.arrowRight,
                };
            default: {
                if (!params.url) {
                    throw new Error('The "url" parameter is required when type is "url".');
                }
                const parsed = URL.parse(params.url);
                if (!parsed) {
                    throw new Error('You must provide a complete, valid URL.');
                }
                return {
                    invocationMessage: new MarkdownString(localize('browser.navigate.invocation', "Navigating to {0} in {1}", parsed.href, link)),
                    pastTenseMessage: new MarkdownString(localize('browser.navigate.past', "Navigated to {0} in {1}", parsed.href, link)),
                    confirmationMessages: {
                        title: localize('browser.navigate.confirmTitle', 'Navigate Browser?'),
                        message: localize('browser.navigate.confirmMessage', 'This will navigate the browser to {0} and allow the agent to access its contents.', parsed.href),
                        allowAutoConfirm: true,
                    },
                };
            }
        }
    }
    async invoke(invocation, _countTokens, _progress, _token) {
        const params = invocation.parameters;
        if (!params.pageId) {
            return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
        }
        switch (params.type) {
            case 'reload':
                return playwrightInvoke(this.playwrightService, params.pageId, (page) => page.reload({ waitUntil: 'domcontentloaded' }));
            case 'back':
                return playwrightInvoke(this.playwrightService, params.pageId, (page) => page.goBack({ waitUntil: 'domcontentloaded' }));
            case 'forward':
                return playwrightInvoke(this.playwrightService, params.pageId, (page) => page.goForward({ waitUntil: 'domcontentloaded' }));
            default: {
                return playwrightInvoke(this.playwrightService, params.pageId, (page, url) => {
                    return page.goto(url, { waitUntil: 'domcontentloaded' });
                }, params.url);
            }
        }
    }
};
NavigateBrowserTool = __decorate([
    __param(0, IPlaywrightService)
], NavigateBrowserTool);
export { NavigateBrowserTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF2aWdhdGVCcm93c2VyVG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvdG9vbHMvbmF2aWdhdGVCcm93c2VyVG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNyRyxPQUFPLEVBQUUsY0FBYyxFQUE2TCxNQUFNLHlEQUF5RCxDQUFDO0FBQ3BSLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUMvRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFdEQsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQWM7SUFDakQsRUFBRSxFQUFFLGVBQWU7SUFDbkIsaUJBQWlCLEVBQUUsY0FBYztJQUNqQyxXQUFXLEVBQUUsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLGVBQWUsQ0FBQztJQUN6RSxlQUFlLEVBQUUsUUFBUSxDQUFDLHFDQUFxQyxFQUFFLG1DQUFtQyxDQUFDO0lBQ3JHLGdCQUFnQixFQUFFLHFEQUFxRDtJQUN2RSxJQUFJLEVBQUUsT0FBTyxDQUFDLFVBQVU7SUFDeEIsTUFBTSxFQUFFLGNBQWMsQ0FBQyxRQUFRO0lBQy9CLFdBQVcsRUFBRTtRQUNaLElBQUksRUFBRSxRQUFRO1FBQ2QsVUFBVSxFQUFFO1lBQ1gsTUFBTSxFQUFFO2dCQUNQ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