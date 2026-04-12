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
import { renderMarkdown } from '../../../base/browser/markdownRenderer.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IOpenerService } from '../../opener/common/opener.js';
export const IMarkdownRendererService = createDecorator('markdownRendererService');
let MarkdownRendererService = class MarkdownRendererService {
    constructor(_openerService) {
        this._openerService = _openerService;
    }
    render(markdown, options, outElement) {
        const resolvedOptions = { ...options };
        if (!resolvedOptions.actionHandler) {
            resolvedOptions.actionHandler = (link, mdStr) => {
                return openLinkFromMarkdown(this._openerService, link, mdStr.isTrusted);
            };
        }
        if (!resolvedOptions.codeBlockRenderer) {
            resolvedOptions.codeBlockRenderer = (alias, value) => {
                return this._defaultCodeBlockRenderer?.renderCodeBlock(alias, value, resolvedOptions ?? {}) ?? Promise.resolve(document.createElement('span'));
            };
        }
        const rendered = renderMarkdown(markdown, resolvedOptions, outElement);
        rendered.element.classList.add('rendered-markdown');
        return rendered;
    }
    setDefaultCodeBlockRenderer(renderer) {
        this._defaultCodeBlockRenderer = renderer;
    }
};
MarkdownRendererService = __decorate([
    __param(0, IOpenerService)
], MarkdownRendererService);
export { MarkdownRendererService };
export async function openLinkFromMarkdown(openerService, link, isTrusted, skipValidation) {
    try {
        return await openerService.open(link, {
            fromUserGesture: true,
            allowContributedOpeners: true,
            allowCommands: toAllowCommandsOption(isTrusted),
            skipValidation
        });
    }
    catch (e) {
        onUnexpectedError(e);
        return false;
    }
}
function toAllowCommandsOption(isTrusted) {
    if (isTrusted === true) {
        return true; // Allow all commands
    }
    if (isTrusted && Array.isArray(isTrusted.enabledCommands)) {
        return isTrusted.enabledCommands; // Allow subset of commands
    }
    return false; // Block commands
}
registerSingleton(IMarkdownRendererService, MarkdownRendererService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Rvd25SZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQTRDLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3JILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRW5FLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBeUIvRCxNQUFNLENBQUMsTUFBTSx3QkFBd0IsR0FBRyxlQUFlLENBQTJCLHlCQUF5QixDQUFDLENBQUM7QUFtQnRHLElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXVCO0lBS25DLFlBQ2tDLGNBQThCO1FBQTlCLG1CQUFjLEdBQWQsY0FBYyxDQUFnQjtJQUM1RCxDQUFDO0lBRUwsTUFBTSxDQUFDLFFBQXlCLEVBQUUsT0FBK0QsRUFBRSxVQUF3QjtRQUMxSCxNQUFNLGVBQWUsR0FBRyxFQUFFLEdBQUcsT0FBTyxFQUFFLENBQUM7UUFFdkMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNwQyxlQUFlLENBQUMsYUFBYSxHQUFHLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO2dCQUMvQyxPQUFPLG9CQUFvQixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN6RSxDQUFDLENBQUM7UUFDSCxDQUFDO1FBRUQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hDLGVBQWUsQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtnQkFDcEQsT0FBTyxJQUFJLENBQUMseUJBQXlCLEVBQUUsZUFBZSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsZUFBZSxJQUFJLEVBQUUsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2hKLENBQUMsQ0FBQztRQUNILENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxjQUFjLENBQUMsUUFBUSxFQUFFLGVBQWUsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUN2RSxRQUFRLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUNwRCxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRUQsMkJBQTJCLENBQUMsUUFBb0M7UUFDL0QsSUFBSSxDQUFDLHlCQUF5QixHQUFHLFFBQVEsQ0FBQztJQUMzQyxDQUFDO0NBQ0QsQ0FBQTtBQWhDWSx1QkFBdUI7SUFNakMsV0FBQSxjQUFjLENBQUE7R0FOSix1QkFBdUIsQ0FnQ25DOztBQUVELE1BQU0sQ0FBQyxLQUFLLFVBQVUsb0JBQW9CLENBQUMsYUFBNkIsRUFBRSxJQUFZLEVBQUUsU0FBNkQsRUFBRSxjQUF3QjtJQUM5SyxJQUFJLENBQUM7UUFDSixPQUFPLE1BQU0sYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDckMsZUFBZSxFQUFFLElBQUk7WUFDckIsdUJBQXVCLEVBQUUsSUFBSTtZQUM3QixhQUFhLEVBQUUscUJBQXFCLENBQUMsU0FBUyxDQUFDO1lBQy9DLGNBQWM7U0FDZCxDQUFDLENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNaLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JCLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLFNBQTZEO0lBQzNGLElBQUksU0FBUyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQ3hCLE9BQU8sSUFBSSxDQUFDLENBQUMscUJBQXFCO0lBQ25DLENBQUM7SUFFRCxJQUFJLFNBQVMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO1FBQzNELE9BQU8sU0FBUyxDQUFDLGVBQWUsQ0FBQyxDQUFDLDJCQUEyQjtJQUM5RCxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUMsQ0FBQyxpQkFBaUI7QUFDaEMsQ0FBQztBQUVELGlCQUFpQixDQUFDLHdCQUF3QixFQUFFLHVCQUF1QixvQ0FBNEIsQ0FBQyJ9