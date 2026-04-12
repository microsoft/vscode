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
import { $ } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { HookType, HOOK_METADATA } from '../../../common/promptSyntax/hookTypes.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import './media/chatHookContentPart.css';
function getHookTypeLabel(hookType) {
    return HOOK_METADATA[hookType]?.label ?? hookType;
}
let ChatHookContentPart = class ChatHookContentPart extends ChatCollapsibleContentPart {
    constructor(hookPart, context, hoverService, configurationService) {
        const hookTypeLabel = getHookTypeLabel(hookPart.hookType);
        const isStopped = !!hookPart.stopReason;
        const isWarning = !!hookPart.systemMessage;
        const toolName = hookPart.toolDisplayName;
        const title = isStopped
            ? (toolName
                ? localize('hook.title.stoppedWithTool', "Blocked {0} - {1} hook", toolName, hookTypeLabel)
                : localize('hook.title.stopped', "Blocked by {0} hook", hookTypeLabel))
            : (toolName
                ? localize('hook.title.warningWithTool', "Warning for {0} - {1} hook", toolName, hookTypeLabel)
                : localize('hook.title.warning', "Warning from {0} hook", hookTypeLabel));
        super(title, context, undefined, hoverService, configurationService);
        this.hookPart = hookPart;
        this.icon = isStopped ? Codicon.error : isWarning ? Codicon.warning : Codicon.check;
        if (isStopped) {
            this.domNode.classList.add('chat-hook-outcome-blocked');
        }
        else if (isWarning) {
            this.domNode.classList.add('chat-hook-outcome-warning');
        }
        this.setExpanded(false);
    }
    initContent() {
        const content = $('.chat-hook-details.chat-used-context-list');
        if (this.hookPart.stopReason) {
            const reasonElement = $('.chat-hook-reason', undefined, this.hookPart.stopReason);
            content.appendChild(reasonElement);
        }
        const isToolHook = this.hookPart.hookType === HookType.PreToolUse || this.hookPart.hookType === HookType.PostToolUse;
        if (this.hookPart.systemMessage && (isToolHook || !this.hookPart.stopReason)) {
            const messageElement = $('.chat-hook-message', undefined, this.hookPart.systemMessage);
            content.appendChild(messageElement);
        }
        return content;
    }
    hasSameContent(other, _followingContent, _element) {
        if (other.kind !== 'hook') {
            return false;
        }
        return other.hookType === this.hookPart.hookType &&
            other.stopReason === this.hookPart.stopReason &&
            other.systemMessage === this.hookPart.systemMessage &&
            other.toolDisplayName === this.hookPart.toolDisplayName;
    }
};
ChatHookContentPart = __decorate([
    __param(2, IHoverService),
    __param(3, IConfigurationService)
], ChatHookContentPart);
export { ChatHookContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEhvb2tDb250ZW50UGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0SG9va0NvbnRlbnRQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUd6RyxPQUFPLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBaUIsTUFBTSwyQ0FBMkMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUU3RSxPQUFPLGlDQUFpQyxDQUFDO0FBRXpDLFNBQVMsZ0JBQWdCLENBQUMsUUFBdUI7SUFDaEQsT0FBTyxhQUFhLENBQUMsUUFBb0IsQ0FBQyxFQUFFLEtBQUssSUFBSSxRQUFRLENBQUM7QUFDL0QsQ0FBQztBQUVNLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsMEJBQTBCO0lBRWxFLFlBQ2tCLFFBQXVCLEVBQ3hDLE9BQXNDLEVBQ3ZCLFlBQTJCLEVBQ25CLG9CQUEyQztRQUVsRSxNQUFNLGFBQWEsR0FBRyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDMUQsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7UUFDeEMsTUFBTSxT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