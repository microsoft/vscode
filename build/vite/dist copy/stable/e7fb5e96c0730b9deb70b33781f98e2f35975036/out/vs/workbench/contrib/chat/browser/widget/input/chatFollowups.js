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
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { formatChatQuestion } from '../../../common/requestParser/chatParserTypes.js';
const $ = dom.$;
let ChatFollowups = class ChatFollowups extends Disposable {
    constructor(container, followups, location, options, clickHandler, chatAgentService) {
        super();
        this.location = location;
        this.options = options;
        this.clickHandler = clickHandler;
        this.chatAgentService = chatAgentService;
        const followupsContainer = dom.append(container, $('.interactive-session-followups'));
        followups.forEach(followup => this.renderFollowup(followupsContainer, followup));
    }
    renderFollowup(container, followup) {
        if (!this.chatAgentService.getDefaultAgent(this.location)) {
            // No default agent yet, which affects how followups are rendered, so can't render this yet
            return;
        }
        const tooltipPrefix = formatChatQuestion(this.chatAgentService, this.location, '', followup.agentId, followup.subCommand);
        if (tooltipPrefix === undefined) {
            return;
        }
        const baseTitle = followup.kind === 'reply' ?
            (followup.title || followup.message)
            : followup.title;
        const message = followup.kind === 'reply' ? followup.message : followup.title;
        const tooltip = (tooltipPrefix +
            (followup.tooltip || message)).trim();
        const button = this._register(new Button(container, { ...this.options, title: tooltip }));
        if (followup.kind === 'reply') {
            button.element.classList.add('interactive-followup-reply');
        }
        else if (followup.kind === 'command') {
            button.element.classList.add('interactive-followup-command');
        }
        button.element.ariaLabel = localize('followUpAriaLabel', "Follow up question: {0}", baseTitle);
        button.label = new MarkdownString(baseTitle);
        this._register(button.onDidClick(() => this.clickHandler(followup)));
    }
};
ChatFollowups = __decorate([
    __param(5, IChatAgentService)
], ChatFollowups);
export { ChatFollowups };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEZvbGxvd3Vwcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdEZvbGxvd3Vwcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxNQUFNLEVBQWlCLE1BQU0sb0RBQW9ELENBQUM7QUFDM0YsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFJdEYsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUVULElBQU0sYUFBYSxHQUFuQixNQUFNLGFBQXVDLFNBQVEsVUFBVTtJQUNyRSxZQUNDLFNBQXNCLEVBQ3RCLFNBQWMsRUFDRyxRQUEyQixFQUMzQixPQUFrQyxFQUNsQyxZQUFtQyxFQUNoQixnQkFBbUM7UUFFdkUsS0FBSyxFQUFFLENBQUM7UUFMUyxhQUFRLEdBQVIsUUFBUSxDQUFtQjtRQUMzQixZQUFPLEdBQVAsT0FBTyxDQUEyQjtRQUNsQyxpQkFBWSxHQUFaLFlBQVksQ0FBdUI7UUFDaEIscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtRQUl2RSxNQUFNLGtCQUFrQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDLENBQUM7UUFDdEYsU0FBUyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUNsRixDQUFDO0lBRU8sY0FBYyxDQUFDLFNBQXNCLEVBQUUsUUFBVztRQUV6RCxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUMzRCwyRkFBMkY7WUFDM0YsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsUUFBUSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUgsSUFBSSxhQUFhLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDakMsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDO1lBQzVDLENBQUMsUUFBUSxDQUFDLEtBQUssSUFBSSxRQUFRLENBQUMsT0FBTyxDQUFDO1lBQ3BDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO1FBQ2xCLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO1FBQzlFLE1BQU0sT0FBTyxHQUFHLENBQUMsYUFBYTtZQUM3QixDQUFDLFFBQVEsQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN2QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksTUFBTSxDQUFDLFNBQVMsRUFBRSxFQUFFLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFGLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUMvQixNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUM1RCxDQUFDO2FBQU0sSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQzlELENBQUM7UUFDRCxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUMsbUJBQW1CLEVBQUUseUJBQXlCLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDL0YsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUU3QyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEUsQ0FBQztDQUNELENBQUE7QUE1Q1ksYUFBYTtJQU92QixXQUFBLGlCQUFpQixDQUFBO0dBUFAsYUFBYSxDQTRDekIifQ==