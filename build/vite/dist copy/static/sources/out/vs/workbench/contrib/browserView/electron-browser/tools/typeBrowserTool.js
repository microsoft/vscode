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
import { createBrowserPageLink, errorResult, playwrightInvoke } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';
export const TypeBrowserToolData = {
    id: 'type_in_page',
    toolReferenceName: 'typeInPage',
    displayName: localize('typeBrowserTool.displayName', 'Type in Page'),
    userDescription: localize('typeBrowserTool.userDescription', 'Type text or press keys in a browser page'),
    modelDescription: 'Type text or press keys in a browser page.',
    icon: Codicon.symbolText,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            pageId: {
                type: 'string',
                description: `The browser page ID, acquired from context or the open tool.`
            },
            text: {
                type: 'string',
                description: 'The text to type. One of "text" or "key" must be provided.'
            },
            key: {
                type: 'string',
                description: 'A key or key combination to press (e.g., "Enter", "Tab", "Control+c"). One of "text" or "key" must be provided.'
            },
            ref: {
                type: 'string',
                description: 'Element reference to target. If omitted, types into the focused element.'
            },
            selector: {
                type: 'string',
                description: 'Playwright selector of element to target when "ref" is not available. If omitted, types into the focused element.'
            },
            element: {
                type: 'string',
                description: 'Human-readable description of the element to type into (e.g., "search box", "comment field"). Required when "ref" or "selector" is specified.'
            },
        },
        required: ['pageId'],
        oneOf: [
            {
                required: ['ref', 'element'],
                not: { required: ['selector'] }
            },
            {
                required: ['selector', 'element'],
                not: { required: ['ref'] }
            },
            {
                not: { anyOf: [{ required: ['ref'] }, { required: ['selector'] }] }
            }
        ]
    },
};
let TypeBrowserTool = class TypeBrowserTool {
    constructor(playwrightService) {
        this.playwrightService = playwrightService;
    }
    async prepareToolInvocation(context, _token) {
        const params = context.parameters;
        const link = createBrowserPageLink(params.pageId);
        const hasTarget = params.ref || params.selector;
        if (params.key) {
            const key = escapeMarkdownSyntaxTokens(params.key);
            if (hasTarget && params.element) {
                const element = escapeMarkdownSyntaxTokens(params.element);
                return {
                    invocationMessage: new MarkdownString(localize('browser.pressKey.invocation.element', "Pressing key `{0}` in {1} in {2}", key, element, link)),
                    pastTenseMessage: new MarkdownString(localize('browser.pressKey.past.element', "Pressed key `{0}` in {1} in {2}", key, element, link)),
                };
            }
            return {
                invocationMessage: new MarkdownString(localize('browser.pressKey.invocation', "Pressing key `{0}` in {1}", key, link)),
                pastTenseMessage: new MarkdownString(localize('browser.pressKey.past', "Pressed key `{0}` in {1}", key, link)),
            };
        }
        if (hasTarget && params.element) {
            const element = escapeMarkdownSyntaxTokens(params.element);
            return {
                invocationMessage: new MarkdownString(localize('browser.type.invocation.element', "Typing text in {0} in {1}", element, link)),
                pastTenseMessage: new MarkdownString(localize('browser.type.past.element', "Typed text in {0} in {1}", element, link)),
            };
        }
        return {
            invocationMessage: new MarkdownString(localize('browser.type.invocation', "Typing text in {0}", link)),
            pastTenseMessage: new MarkdownString(localize('browser.type.past', "Typed text in {0}", link)),
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
        if (!params.text && !params.key) {
            return errorResult('Either a "text" or "key" parameter is required.');
        }
        // Press key
        if (params.key) {
            if (selector) {
                return playwrightInvoke(this.playwrightService, params.pageId, (page, sel, key) => page.locator(sel).press(key), selector, params.key);
            }
            return playwrightInvoke(this.playwrightService, params.pageId, (page, key) => page.keyboard.press(key), params.key);
        }
        // Type text
        if (selector) {
            return playwrightInvoke(this.playwrightService, params.pageId, (page, sel, text) => page.locator(sel).fill(text), selector, params.text);
        }
        return playwrightInvoke(this.playwrightService, params.pageId, (page, text) => page.keyboard.type(text), params.text);
    }
};
TypeBrowserTool = __decorate([
    __param(0, IPlaywrightService)
], TypeBrowserTool);
export { TypeBrowserTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZUJyb3dzZXJUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci90b29scy90eXBlQnJvd3NlclRvb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFDTiwwQkFBMEIsRUFDMUIsY0FBYyxFQUNkLE1BQU0sMkNBQTJDLENBQUM7QUFDbkQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxjQUFjLEVBQTZMLE1BQU0seURBQXlELENBQUM7QUFDcFIsT0FBTyxFQUFFLHFCQUFxQixFQUFFLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQy9GLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUV0RCxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBYztJQUM3QyxFQUFFLEVBQUUsY0FBYztJQUNsQixpQkFBaUIsRUFBRSxZQUFZO0lBQy9CLFdBQVcsRUFBRSxRQUFRLENBQUMsNkJBQTZCLEVBQUUsY0FBYyxDQUFDO0lBQ3BFLGVBQWUsRUFBRSxRQUFRLENBQUMsaUNBQWlDLEVBQUUsMkNBQTJDLENBQUM7SUFDekcsZ0JBQWdCLEVBQUUsNENBQTRDO0lBQzlELElBQUksRUFBRSxPQUFPLENBQUMsVUFBVTtJQUN4QixNQUFNLEVBQUUsY0FBYyxDQUFDLFFBQVE7SUFDL0IsV0FBVyxFQUFFO1FBQ1osSUFBSSxFQUFFLFFBQVE7UUFDZCxVQUFVLEVBQUU7WUFDWCxNQUFNLEVBQUU7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