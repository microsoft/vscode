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
import * as dom from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { createMarkdownCommandLink, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IMarkdownRendererService, openLinkFromMarkdown } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { localize } from '../../../../../../nls.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { PromptsConfig } from '../../../common/promptSyntax/config/config.js';
import './media/chatDisabledClaudeHooksContent.css';
let ChatDisabledClaudeHooksContentPart = class ChatDisabledClaudeHooksContentPart extends Disposable {
    constructor(_context, _openerService, _markdownRendererService) {
        super();
        this._openerService = _openerService;
        this._markdownRendererService = _markdownRendererService;
        this.domNode = dom.$('.chat-disabled-claude-hooks');
        const messageContainer = dom.$('.chat-disabled-claude-hooks-message');
        const icon = dom.$('.chat-disabled-claude-hooks-icon');
        icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
        const enableLink = createMarkdownCommandLink({
            text: localize('chat.disabledClaudeHooks.enableLink', "Enable"),
            id: 'workbench.action.openSettings',
            arguments: [PromptsConfig.USE_CLAUDE_HOOKS],
            tooltip: localize('chat.disabledClaudeHooks.enableLink.tooltip', "Open settings to enable Claude Code hooks"),
        });
        const message = localize('chat.disabledClaudeHooks.message', "Claude Code hooks are available for this workspace. {0}", enableLink);
        const content = new MarkdownString(message, { isTrusted: true });
        const rendered = this._register(this._markdownRendererService.render(content, {
            actionHandler: (href) => openLinkFromMarkdown(this._openerService, href, true),
        }));
        messageContainer.appendChild(icon);
        messageContainer.appendChild(rendered.element);
        this.domNode.appendChild(messageContainer);
    }
    hasSameContent(other) {
        return other.kind === 'disabledClaudeHooks';
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
};
ChatDisabledClaudeHooksContentPart = __decorate([
    __param(1, IOpenerService),
    __param(2, IMarkdownRendererService)
], ChatDisabledClaudeHooksContentPart);
export { ChatDisabledClaudeHooksContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERpc2FibGVkQ2xhdWRlSG9va3NDb250ZW50UGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0RGlzYWJsZWRDbGF1ZGVIb29rc0NvbnRlbnRQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN6RyxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sNENBQTRDLENBQUM7QUFDckYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFHcEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlFLE9BQU8sNENBQTRDLENBQUM7QUFFN0MsSUFBTSxrQ0FBa0MsR0FBeEMsTUFBTSxrQ0FBbUMsU0FBUSxVQUFVO0lBR2pFLFlBQ0MsUUFBdUMsRUFDTixjQUE4QixFQUNwQix3QkFBa0Q7UUFFN0YsS0FBSyxFQUFFLENBQUM7UUFIeUIsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBQ3BCLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBMEI7UUFJN0YsSUFBSSxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDcEQsTUFBTSxnQkFBZ0IsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7UUFFdEUsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBRWhFLE1BQU0sVUFBVSxHQUFHLHlCQUF5QixDQUFDO1lBQzVDLElBQUksRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsUUFBUSxDQUFDO1lBQy9ELEVBQUUsRUFBRSwrQkFBK0I7WUFDbkMsU0FBUyxFQUFFLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDO1lBQzNDLE9BQU8sRUFBRSxRQUFRLENBQUMsNkNBQTZDLEVBQUUsMkNBQTJDLENBQUM7U0FDN0csQ0FBQyxDQUFDO1FBQ0gsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLGtDQUFrQyxFQUFFLHlEQUF5RCxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ3BJLE1BQU0sT0FBTyxHQUFHLElBQUksY0FBYyxDQUFDLE9BQU8sRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRWpFLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUU7WUFDN0UsYUFBYSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7U0FDOUUsQ0FBQyxDQUFDLENBQUM7UUFFSixnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMvQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxjQUFjLENBQUMsS0FBMkI7UUFDekMsT0FBTyxLQUFLLENBQUMsSUFBSSxLQUFLLHFCQUFxQixDQUFDO0lBQzdDLENBQUM7SUFFRCxhQUFhLENBQUMsVUFBdUI7UUFDcEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUM1QixDQUFDO0NBQ0QsQ0FBQTtBQXpDWSxrQ0FBa0M7SUFLNUMsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLHdCQUF3QixDQUFBO0dBTmQsa0NBQWtDLENBeUM5QyJ9