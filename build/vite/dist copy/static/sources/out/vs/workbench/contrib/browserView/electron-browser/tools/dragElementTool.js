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
export const DragElementToolData = {
    id: 'drag_element',
    toolReferenceName: 'dragElement',
    displayName: localize('dragElementTool.displayName', 'Drag Element'),
    userDescription: localize('dragElementTool.userDescription', 'Drag an element over another element'),
    modelDescription: 'Drag an element over another element in a browser page.',
    icon: Codicon.move,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            pageId: {
                type: 'string',
                description: `The browser page ID, acquired from context or the open tool.`
            },
            fromRef: {
                type: 'string',
                description: 'Element reference of the element to drag.'
            },
            fromSelector: {
                type: 'string',
                description: 'Playwright selector of the element to drag when "fromRef" is not available.'
            },
            fromElement: {
                type: 'string',
                description: 'Human-readable description of the element to drag (e.g., "file item", "draggable card").'
            },
            toRef: {
                type: 'string',
                description: 'Element reference of the element to drop onto.'
            },
            toSelector: {
                type: 'string',
                description: 'Playwright selector of the element to drop onto when "toRef" is not available.'
            },
            toElement: {
                type: 'string',
                description: 'Human-readable description of the element to drop onto (e.g., "drop zone", "target folder").'
            },
        },
        required: ['pageId', 'fromElement', 'toElement'],
        allOf: [
            {
                oneOf: [
                    { required: ['fromRef'] },
                    { required: ['fromSelector'] },
                ]
            },
            {
                oneOf: [
                    { required: ['toRef'] },
                    { required: ['toSelector'] },
                ]
            }
        ]
    },
};
let DragElementTool = class DragElementTool {
    constructor(playwrightService) {
        this.playwrightService = playwrightService;
    }
    async prepareToolInvocation(_context, _token) {
        const params = _context.parameters;
        const link = createBrowserPageLink(params.pageId);
        const fromElement = escapeMarkdownSyntaxTokens(params.fromElement ?? DEFAULT_ELEMENT_LABEL);
        const toElement = escapeMarkdownSyntaxTokens(params.toElement ?? DEFAULT_ELEMENT_LABEL);
        return {
            invocationMessage: new MarkdownString(localize('browser.drag.invocation', "Dragging {0} to {1} in {2}", fromElement, toElement, link)),
            pastTenseMessage: new MarkdownString(localize('browser.drag.past', "Dragged {0} to {1} in {2}", fromElement, toElement, link)),
        };
    }
    async invoke(invocation, _countTokens, _progress, _token) {
        const params = invocation.parameters;
        if (!params.pageId) {
            return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
        }
        let fromSelector = params.fromSelector;
        if (params.fromRef) {
            fromSelector = `aria-ref=${params.fromRef}`;
        }
        if (!fromSelector) {
            return errorResult('Either a "fromRef" or "fromSelector" parameter is required for the source element.');
        }
        let toSelector = params.toSelector;
        if (params.toRef) {
            toSelector = `aria-ref=${params.toRef}`;
        }
        if (!toSelector) {
            return errorResult('Either a "toRef" or "toSelector" parameter is required for the target element.');
        }
        return playwrightInvoke(this.playwrightService, params.pageId, (page, from, to) => page.dragAndDrop(from, to), fromSelector, toSelector);
    }
};
DragElementTool = __decorate([
    __param(0, IPlaywrightService)
], DragElementTool);
export { DragElementTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHJhZ0VsZW1lbnRUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci90b29scy9kcmFnRWxlbWVudFRvb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN2RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDckcsT0FBTyxFQUFFLGNBQWMsRUFBNkwsTUFBTSx5REFBeUQsQ0FBQztBQUNwUixPQUFPLEVBQUUscUJBQXFCLEVBQUUscUJBQXFCLEVBQUUsV0FBVyxFQUFFLGdCQUFnQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRXRELE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFjO0lBQzdDLEVBQUUsRUFBRSxjQUFjO0lBQ2xCLGlCQUFpQixFQUFFLGFBQWE7SUFDaEMsV0FBVyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxjQUFjLENBQUM7SUFDcEUsZUFBZSxFQUFFLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSxzQ0FBc0MsQ0FBQztJQUNwRyxnQkFBZ0IsRUFBRSx5REFBeUQ7SUFDM0UsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO0lBQ2xCLE1BQU0sRUFBRSxjQUFjLENBQUMsUUFBUTtJQUMvQixXQUFXLEVBQUU7UUFDWixJQUFJLEVBQUUsUUFBUTtRQUNkLFVBQVUsRUFBRTtZQUNY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