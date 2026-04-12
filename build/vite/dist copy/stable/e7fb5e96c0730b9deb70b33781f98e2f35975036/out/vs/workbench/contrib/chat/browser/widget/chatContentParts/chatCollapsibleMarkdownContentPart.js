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
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
/**
 * A collapsible content part that displays markdown content.
 * The title is shown in the collapsed state, and the full content is shown when expanded.
 */
let ChatCollapsibleMarkdownContentPart = class ChatCollapsibleMarkdownContentPart extends ChatCollapsibleContentPart {
    constructor(title, markdownContent, context, chatContentMarkdownRenderer, hoverService, configurationService) {
        super(title, context, undefined, hoverService, configurationService);
        this.markdownContent = markdownContent;
        this.chatContentMarkdownRenderer = chatContentMarkdownRenderer;
        this.icon = Codicon.check;
    }
    initContent() {
        const wrapper = $('.chat-collapsible-markdown-content.chat-used-context-list');
        if (this.markdownContent) {
            this.contentElement = $('.chat-collapsible-markdown-body');
            const rendered = this._register(this.chatContentMarkdownRenderer.render(new MarkdownString(this.markdownContent)));
            this.contentElement.appendChild(rendered.element);
            wrapper.appendChild(this.contentElement);
        }
        return wrapper;
    }
    hasSameContent(other, _followingContent, _element) {
        // This part is embedded in the subagent part, not rendered directly
        return false;
    }
};
ChatCollapsibleMarkdownContentPart = __decorate([
    __param(4, IHoverService),
    __param(5, IConfigurationService)
], ChatCollapsibleMarkdownContentPart);
export { ChatCollapsibleMarkdownContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbGxhcHNpYmxlTWFya2Rvd25Db250ZW50UGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29sbGFwc2libGVNYXJrZG93bkNvbnRlbnRQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVsRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUd6RyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUc3RTs7O0dBR0c7QUFDSSxJQUFNLGtDQUFrQyxHQUF4QyxNQUFNLGtDQUFtQyxTQUFRLDBCQUEwQjtJQUlqRixZQUNDLEtBQWEsRUFDSSxlQUF1QixFQUN4QyxPQUFzQyxFQUNyQiwyQkFBOEMsRUFDaEQsWUFBMkIsRUFDbkIsb0JBQTJDO1FBRWxFLEtBQUssQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQU5wRCxvQkFBZSxHQUFmLGVBQWUsQ0FBUTtRQUV2QixnQ0FBMkIsR0FBM0IsMkJBQTJCLENBQW1CO1FBSy9ELElBQUksQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQztJQUMzQixDQUFDO0lBRWtCLFdBQVc7UUFDN0IsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDLDJEQUEyRCxDQUFDLENBQUM7UUFFL0UsSUFBSSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxDQUFDLENBQUMsaUNBQWlDLENBQUMsQ0FBQztZQUMzRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxNQUFNLENBQUMsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNuSCxJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDbEQsT0FBTyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUVELE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFRCxjQUFjLENBQUMsS0FBMkIsRUFBRSxpQkFBeUMsRUFBRSxRQUFzQjtRQUM1RyxvRUFBb0U7UUFDcEUsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0NBQ0QsQ0FBQTtBQWpDWSxrQ0FBa0M7SUFTNUMsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLHFCQUFxQixDQUFBO0dBVlgsa0NBQWtDLENBaUM5QyJ9