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
import { errorResult, invokeFunctionResultToToolResult } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';
export const RunPlaywrightCodeToolData = {
    id: 'run_playwright_code',
    toolReferenceName: 'runPlaywrightCode',
    displayName: localize('runPlaywrightCodeTool.displayName', 'Run Playwright Code'),
    userDescription: localize('runPlaywrightCodeTool.userDescription', 'Run a Playwright code snippet against a browser page'),
    modelDescription: `Run a Playwright code snippet to control a browser page. Only use this if other browser tools are insufficient.`,
    icon: Codicon.terminal,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            pageId: {
                type: 'string',
                description: `The browser page ID, acquired from context or the open tool.`
            },
            code: {
                type: 'string',
                description: `The Playwright code to execute. The code must be concise, serve one clear purpose, and be self-contained. You **must not** directly access \`document\` or \`window\` using this tool. You must access it via the provided \`page\` object, e.g. "return page.evaluate(() => document.title)". Omit this when resuming a deferred execution via deferredResultId.`
            },
            deferredResultId: {
                type: 'string',
                description: `If a previous call returned a deferredResultId, pass it here to continue waiting for that execution to complete.`
            },
            timeoutMs: {
                type: 'number',
                description: `Maximum time in milliseconds to wait for the code to complete. Defaults to 5000 (5 seconds).`
            },
        },
        required: ['pageId'],
        oneOf: [
            { required: ['code'] },
            { required: ['deferredResultId'] },
        ]
    },
};
let RunPlaywrightCodeTool = class RunPlaywrightCodeTool {
    constructor(playwrightService) {
        this.playwrightService = playwrightService;
    }
    async prepareToolInvocation(context, _token) {
        const params = context.parameters;
        if (params.deferredResultId) {
            return {
                invocationMessage: new MarkdownString(localize('browser.runCode.waitInvocation', "Waiting for Playwright code to complete...")),
                pastTenseMessage: new MarkdownString(localize('browser.runCode.waitPast', "Waited for Playwright code")),
            };
        }
        const code = params.code ?? '';
        return {
            invocationMessage: new MarkdownString(localize('browser.runCode.invocation', "Running Playwright code...")),
            pastTenseMessage: new MarkdownString(localize('browser.runCode.past', "Ran Playwright code")),
            confirmationMessages: {
                title: localize('browser.runCode.confirmTitle', 'Run Playwright Code?'),
                message: new MarkdownString(`\`\`\`javascript\n${code.trim()}\n\`\`\``),
                disclaimer: localize('browser.runCode.confirmDisclaimer', 'Make sure you trust the code before continuing.'),
                allowAutoConfirm: true,
            }
        };
    }
    async invoke(invocation, _countTokens, _progress, _token) {
        const params = invocation.parameters;
        if (!params.pageId) {
            return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
        }
        // Resume waiting for a deferred execution
        if (params.deferredResultId) {
            try {
                const result = await this.playwrightService.waitForDeferredResult(params.deferredResultId, params.timeoutMs ?? 5_000);
                return invokeFunctionResultToToolResult(result);
            }
            catch (e) {
                return errorResult(e instanceof Error ? e.message : String(e));
            }
        }
        if (!params.code) {
            return errorResult('Either "code" or "deferredResultId" must be provided.');
        }
        let result;
        try {
            result = await this.playwrightService.invokeFunction(params.pageId, `async (page) => { ${params.code} }`, undefined, params.timeoutMs ?? 5_000);
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return errorResult(`Code execution failed: ${message}`);
        }
        return invokeFunctionResultToToolResult(result, params.code.trim());
    }
};
RunPlaywrightCodeTool = __decorate([
    __param(0, IPlaywrightService)
], RunPlaywrightCodeTool);
export { RunPlaywrightCodeTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuUGxheXdyaWdodENvZGVUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci90b29scy9ydW5QbGF5d3JpZ2h0Q29kZVRvb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDckcsT0FBTyxFQUFFLGNBQWMsRUFBNkwsTUFBTSx5REFBeUQsQ0FBQztBQUNwUixPQUFPLEVBQUUsV0FBVyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDeEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRXRELE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFjO0lBQ25ELEVBQUUsRUFBRSxxQkFBcUI7SUFDekIsaUJBQWlCLEVBQUUsbUJBQW1CO0lBQ3RDLFdBQVcsRUFBRSxRQUFRLENBQUMsbUNBQW1DLEVBQUUscUJBQXFCLENBQUM7SUFDakYsZUFBZSxFQUFFLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSxzREFBc0QsQ0FBQztJQUMxSCxnQkFBZ0IsRUFBRSxpSEFBaUg7SUFDbkksSUFBSSxFQUFFLE9BQU8sQ0FBQyxRQUFRO0lBQ3RCLE1BQU0sRUFBRSxjQUFjLENBQUMsUUFBUTtJQUMvQixXQUFXLEVBQUU7UUFDWixJQUFJLEVBQUUsUUFBUTtRQUNkLFVBQVUsRUFBRTtZQUNYLE1BQU0sRUFBRTtnQkFDUCxJQUFJLEVBQUUsUUFBUTtnQkFDZCxXQUFXLEVBQUUsOERBQThEO2FBQzNFO1lBQ0QsSUFBSSxFQUFFO2dCQUNMLElBQUksRUFBRSxRQUFRO2dCQUNkLFdBQVcsRUFBRSxtV0FBbVc7YUFDaFg7WUFDRCxnQkFBZ0IsRUFBRTtnQkFDakIsSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsV0FBVyxFQUFFLGtIQUFrSDthQUMvSDtZQUNELFNBQVMsRUFBRTtnQkFDVixJQUFJLEVBQUUsUUFBUTtnQkFDZCxXQUFXLEVBQUUsOEZBQThGO2FBQzNHO1NBQ0Q7UUFDRCxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUM7UUFDcEIsS0FBSyxFQUFFO1lBQ04sRUFBRSxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUN0QixFQUFFLFFBQVEsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUU7U0FDbEM7S0FDRDtDQUNELENBQUM7QUFTSyxJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFxQjtJQUNqQyxZQUNzQyxpQkFBcUM7UUFBckMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtJQUN2RSxDQUFDO0lBRUwsS0FBSyxDQUFDLHFCQUFxQixDQUFDLE9BQTBDLEVBQUUsTUFBeUI7UUFDaEcsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFVBQTBDLENBQUM7UUFFbEUsSUFBSSxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUM3QixPQUFPO2dCQUNOLGlCQUFpQixFQUFFLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO2dCQUMvSCxnQkFBZ0IsRUFBRSxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsNEJBQTRCLENBQUMsQ0FBQzthQUN4RyxDQUFDO1FBQ0gsQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQy9CLE9BQU87WUFDTixpQkFBaUIsRUFBRSxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsNEJBQTRCLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztZQUMzRyxnQkFBZ0IsRUFBRSxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEVBQUUscUJBQXFCLENBQUMsQ0FBQztZQUM3RixvQkFBb0IsRUFBRTtnQkFDckIsS0FBSyxFQUFFLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxzQkFBc0IsQ0FBQztnQkFDdkUsT0FBTyxFQUFFLElBQUksY0FBYyxDQUFDLHFCQUFxQixJQUFJLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQztnQkFDdkUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxtQ0FBbUMsRUFBRSxpREFBaUQsQ0FBQztnQkFDNUcsZ0JBQWdCLEVBQUUsSUFBSTthQUN0QjtTQUNELENBQUM7SUFDSCxDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUEyQixFQUFFLFlBQWlDLEVBQUUsU0FBdUIsRUFBRSxNQUF5QjtRQUM5SCxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsVUFBMEMsQ0FBQztRQUVyRSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3BCLE9BQU8sV0FBVyxDQUFDLDZCQUE2QixjQUFjLFVBQVUsQ0FBQyxDQUFDO1FBQzNFLENBQUM7UUFFRCwwQ0FBMEM7UUFDMUMsSUFBSSxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUM7Z0JBQ0osTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxTQUFTLElBQUksS0FBSyxDQUFDLENBQUM7Z0JBQ3RILE9BQU8sZ0NBQWdDLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakQsQ0FBQztZQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ1osT0FBTyxXQUFXLENBQUMsQ0FBQyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEUsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2xCLE9BQU8sV0FBVyxDQUFDLHVEQUF1RCxDQUFDLENBQUM7UUFDN0UsQ0FBQztRQUVELElBQUksTUFBTSxDQUFDO1FBQ1gsSUFBSSxDQUFDO1lBQ0osTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLHFCQUFxQixNQUFNLENBQUMsSUFBSSxJQUFJLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLElBQUksS0FBSyxDQUFDLENBQUM7UUFDakosQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWixNQUFNLE9BQU8sR0FBRyxDQUFDLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0QsT0FBTyxXQUFXLENBQUMsMEJBQTBCLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDekQsQ0FBQztRQUVELE9BQU8sZ0NBQWdDLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNyRSxDQUFDO0NBQ0QsQ0FBQTtBQTNEWSxxQkFBcUI7SUFFL0IsV0FBQSxrQkFBa0IsQ0FBQTtHQUZSLHFCQUFxQixDQTJEakMifQ==