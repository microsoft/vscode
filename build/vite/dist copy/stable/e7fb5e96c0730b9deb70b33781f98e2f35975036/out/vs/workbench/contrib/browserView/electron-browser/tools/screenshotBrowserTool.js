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
import { IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { errorResult, playwrightInvokeRaw } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';
import { ReadBrowserToolData } from './readBrowserTool.js';
export const ScreenshotBrowserToolData = {
    id: 'screenshot_page',
    toolReferenceName: 'screenshotPage',
    displayName: localize('screenshotBrowserTool.displayName', 'Screenshot Page'),
    userDescription: localize('screenshotBrowserTool.userDescription', 'Capture a screenshot of a browser page'),
    modelDescription: `Capture a screenshot of the current browser page. You can't perform actions based on the screenshot; use ${ReadBrowserToolData.id} for actions.`,
    icon: Codicon.deviceCamera,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            pageId: {
                type: 'string',
                description: `The browser page ID to capture, acquired from context or the open tool.`
            },
            ref: {
                type: 'string',
                description: 'Element reference to capture. If omitted, captures the whole viewport.'
            },
            selector: {
                type: 'string',
                description: 'Playwright selector of an element to capture when "ref" is not available. If omitted, captures the whole viewport.'
            },
            element: {
                type: 'string',
                description: 'Human-readable description of the element to capture (e.g., "chart diagram", "product image").'
            },
            scrollIntoViewIfNeeded: {
                type: 'boolean',
                description: 'Whether to scroll the element into view before capturing. Defaults to false.',
            }
        },
        required: ['pageId'],
    },
};
let ScreenshotBrowserTool = class ScreenshotBrowserTool {
    constructor(browserViewWorkbenchService, playwrightService) {
        this.browserViewWorkbenchService = browserViewWorkbenchService;
        this.playwrightService = playwrightService;
    }
    async prepareToolInvocation(_context, _token) {
        const params = _context.parameters;
        if (params.element) {
            const element = escapeMarkdownSyntaxTokens(params.element);
            return {
                invocationMessage: new MarkdownString(localize('browser.screenshot.invocation.element', "Capturing screenshot of {0}", element)),
                pastTenseMessage: new MarkdownString(localize('browser.screenshot.past.element', "Captured screenshot of {0}", element)),
            };
        }
        return {
            invocationMessage: localize('browser.screenshot.invocation', "Capturing browser screenshot"),
            pastTenseMessage: localize('browser.screenshot.past', "Captured browser screenshot"),
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
        // Note that we don't use Playwright's screenshot methods because they cause brief flashing on the page,
        // and also doesn't handle zooming well.
        const browserViewModel = await this.browserViewWorkbenchService.getBrowserViewModel(params.pageId); // Throws if the given pageId doesn't exist
        const bounds = selector && await playwrightInvokeRaw(this.playwrightService, params.pageId, async (page, selector, scrollIntoViewIfNeeded) => {
            const locator = page.locator(selector);
            if (scrollIntoViewIfNeeded) {
                await locator.scrollIntoViewIfNeeded();
            }
            return locator.boundingBox();
        }, selector, params.scrollIntoViewIfNeeded) || undefined;
        const screenshot = await browserViewModel.captureScreenshot({ pageRect: bounds });
        return {
            content: [
                {
                    kind: 'data',
                    value: {
                        mimeType: 'image/jpeg',
                        data: screenshot,
                    },
                },
            ],
        };
    }
};
ScreenshotBrowserTool = __decorate([
    __param(0, IBrowserViewWorkbenchService),
    __param(1, IPlaywrightService)
], ScreenshotBrowserTool);
export { ScreenshotBrowserTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyZWVuc2hvdEJyb3dzZXJUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci90b29scy9zY3JlZW5zaG90QnJvd3NlclRvb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFDTiwwQkFBMEIsRUFDMUIsY0FBYyxFQUNkLE1BQU0sMkNBQTJDLENBQUM7QUFDbkQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxjQUFjLEVBQTZMLE1BQU0seURBQXlELENBQUM7QUFDcFIsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDM0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzNFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUUzRCxNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBYztJQUNuRCxFQUFFLEVBQUUsaUJBQWlCO0lBQ3JCLGlCQUFpQixFQUFFLGdCQUFnQjtJQUNuQyxXQUFXLEVBQUUsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLGlCQUFpQixDQUFDO0lBQzdFLGVBQWUsRUFBRSxRQUFRLENBQUMsdUNBQXVDLEVBQUUsd0NBQXdDLENBQUM7SUFDNUcsZ0JBQWdCLEVBQUUsNEdBQTRHLG1CQUFtQixDQUFDLEVBQUUsZUFBZTtJQUNuSyxJQUFJ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