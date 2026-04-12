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
import { localize } from '../../../../../nls.js';
import { logBrowserOpen } from '../../../../../platform/browserView/common/browserViewTelemetry.js';
import { BrowserViewUri } from '../../../../../platform/browserView/common/browserViewUri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { OpenBrowserToolData } from './openBrowserTool.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { alreadyOpenResult, createBrowserPageLink, findExistingPageByHost } from './browserToolHelpers.js';
export const OpenBrowserToolNonAgenticData = {
    ...OpenBrowserToolData,
    modelDescription: 'Open a new browser page in the integrated browser at the given URL.',
};
let OpenBrowserToolNonAgentic = class OpenBrowserToolNonAgentic {
    constructor(telemetryService, editorService) {
        this.telemetryService = telemetryService;
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
            invocationMessage: localize('browser.open.nonAgentic.invocation', "Opening browser page at {0}", parsed.href),
            pastTenseMessage: localize('browser.open.nonAgentic.past', "Opened browser page at {0}", parsed.href),
            confirmationMessages: {
                title: localize('browser.open.nonAgentic.confirmTitle', 'Open Browser Page?'),
                message: localize('browser.open.nonAgentic.confirmMessage', 'This will open {0} in the integrated browser. The agent will not be able to read its contents.', parsed.href),
                allowAutoConfirm: true,
            },
        };
    }
    async invoke(invocation, _countTokens, _progress, _token) {
        const params = invocation.parameters;
        if (!params.forceNew) {
            const existing = await findExistingPageByHost(this.editorService, undefined, params.url);
            if (existing) {
                return alreadyOpenResult(existing);
            }
        }
        logBrowserOpen(this.telemetryService, 'chatTool');
        const browserUri = BrowserViewUri.forId(generateUuid());
        await this.editorService.openEditor({ resource: browserUri, options: { pinned: true, viewState: { url: params.url } } });
        return {
            content: [{
                    kind: 'text',
                    value: `Page opened successfully. Note that you do not have access to the page contents unless the user enables agentic tools via the \`workbench.browser.enableChatTools\` setting.`,
                }],
            toolResultMessage: new MarkdownString(localize('browser.open.nonAgentic.result', "Opened {0}", createBrowserPageLink(browserUri)))
        };
    }
};
OpenBrowserToolNonAgentic = __decorate([
    __param(0, ITelemetryService),
    __param(1, IEditorService)
], OpenBrowserToolNonAgentic);
export { OpenBrowserToolNonAgentic };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3BlbkJyb3dzZXJUb29sTm9uQWdlbnRpYy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvdG9vbHMvb3BlbkJyb3dzZXJUb29sTm9uQWdlbnRpYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUM5RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRXJGLE9BQU8sRUFBMEIsbUJBQW1CLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNuRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHFCQUFxQixFQUFFLHNCQUFzQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFM0csTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQWM7SUFDdkQsR0FBRyxtQkFBbUI7SUFDdEIsZ0JBQWdCLEVBQUUscUVBQXFFO0NBQ3ZGLENBQUM7QUFFSyxJQUFNLHlCQUF5QixHQUEvQixNQUFNLHlCQUF5QjtJQUNyQyxZQUNxQyxnQkFBbUMsRUFDdEMsYUFBNkI7UUFEMUIscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtRQUN0QyxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7SUFDM0QsQ0FBQztJQUVMLEtB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