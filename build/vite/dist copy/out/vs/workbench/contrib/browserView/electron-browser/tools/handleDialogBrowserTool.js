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
export const HandleDialogBrowserToolData = {
    id: 'handle_dialog',
    toolReferenceName: 'handleDialog',
    displayName: localize('handleDialogBrowserTool.displayName', 'Handle Dialog'),
    userDescription: localize('handleDialogBrowserTool.userDescription', 'Respond to a dialog in a browser page'),
    modelDescription: 'Respond to a pending modal (alert, confirm, prompt) or file chooser dialog on a browser page.',
    icon: Codicon.comment,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            pageId: {
                type: 'string',
                description: `The browser page ID, acquired from context or the open tool.`
            },
            acceptModal: {
                type: 'boolean',
                description: 'Whether to accept (true) or dismiss (false) a modal dialog.'
            },
            promptText: {
                type: 'string',
                description: 'Text to enter into a prompt dialog.'
            },
            selectFiles: {
                type: 'array',
                items: { type: 'string' },
                description: 'Absolute paths of files to select, or empty to dismiss. Required for file chooser dialogs.'
            },
        },
        required: ['pageId'],
    },
};
let HandleDialogBrowserTool = class HandleDialogBrowserTool {
    constructor(playwrightService) {
        this.playwrightService = playwrightService;
    }
    async prepareToolInvocation(_context, _token) {
        const link = createBrowserPageLink(_context.parameters.pageId);
        return {
            invocationMessage: new MarkdownString(localize('browser.handleDialog.invocation', "Handling dialog in {0}", link)),
            pastTenseMessage: new MarkdownString(localize('browser.handleDialog.past', "Handled dialog in {0}", link)),
        };
    }
    async invoke(invocation, _countTokens, _progress, _token) {
        const params = invocation.parameters;
        if (!params.pageId) {
            return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
        }
        if (params.selectFiles !== undefined && (params.acceptModal !== undefined || params.promptText !== undefined)) {
            return errorResult(`Invalid parameters. 'selectFiles' cannot be used with 'acceptModal' or 'promptText'.`);
        }
        if (!Array.isArray(params.selectFiles) && (params.acceptModal === undefined || params.acceptModal === null)) {
            return errorResult(`Invalid parameters. Either 'selectFiles' or 'acceptModal' must be provided.`);
        }
        try {
            let result;
            if (params.selectFiles !== undefined) {
                result = await this.playwrightService.replyToFileChooser(params.pageId, params.selectFiles);
            }
            else {
                result = await this.playwrightService.replyToDialog(params.pageId, params.acceptModal, params.promptText);
            }
            return { content: [{ kind: 'text', value: result.summary }] };
        }
        catch (e) {
            return errorResult(e instanceof Error ? e.message : String(e));
        }
    }
};
HandleDialogBrowserTool = __decorate([
    __param(0, IPlaywrightService)
], HandleDialogBrowserTool);
export { HandleDialogBrowserTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGFuZGxlRGlhbG9nQnJvd3NlclRvb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9icm93c2VyVmlldy9lbGVjdHJvbi1icm93c2VyL3Rvb2xzL2hhbmRsZURpYWxvZ0Jyb3dzZXJUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxjQUFjLEVBQTZMLE1BQU0seURBQXlELENBQUM7QUFDcFIsT0FBTyxFQUFFLHFCQUFxQixFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzdFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUV0RCxNQUFNLENBQUMsTUFBTSwyQkFBMkIsR0FBYztJQUNyRCxFQUFFLEVBQUUsZUFBZTtJQUNuQixpQkFBaUIsRUFBRSxjQUFjO0lBQ2pDLFdBQVcsRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsZUFBZSxDQUFDO0lBQzdFLGVBQWUsRUFBRSxRQUFRLENBQUMseUNBQXlDLEVBQUUsdUNBQXVDLENBQUM7SUFDN0csZ0JBQWdCLEVBQUUsK0ZBQStGO0lBQ2pILElBQUksRUFBRSxPQUFPLENBQUMsT0FBTztJQUNyQixNQUFNLEVBQUUsY0FBYyxDQUFDLFFBQVE7SUFDL0IsV0FBVyxFQUFFO1FBQ1osSUFBSSxFQUFFLFFBQVE7UUFDZCxVQUFVLEVBQUU7WUFDWCxNQUFNLEVBQUU7Z0JBQ1AsSUFB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