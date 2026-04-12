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
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { chatSubcommandLeader } from '../../../common/requestParser/chatParserTypes.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
let ChatAgentCommandContentPart = class ChatAgentCommandContentPart extends Disposable {
    constructor(cmd, onClick, _hoverService) {
        super();
        this._hoverService = _hoverService;
        this.domNode = document.createElement('span');
        this.domNode.classList.add('chat-agent-command');
        this.domNode.setAttribute('aria-label', cmd.name);
        this.domNode.setAttribute('role', 'button');
        const groupId = generateUuid();
        const commandSpan = document.createElement('span');
        this.domNode.appendChild(commandSpan);
        commandSpan.innerText = chatSubcommandLeader + cmd.name;
        this._store.add(this._hoverService.setupDelayedHover(commandSpan, {
            content: cmd.description,
            style: 1 /* HoverStyle.Pointer */,
        }, { groupId }));
        const rerun = localize('rerun', "Rerun without {0}{1}", chatSubcommandLeader, cmd.name);
        const btn = new Button(this.domNode, { ariaLabel: rerun });
        btn.icon = Codicon.close;
        this._store.add(btn.onDidClick(() => onClick()));
        this._store.add(btn);
        this._store.add(this._hoverService.setupDelayedHover(btn.element, {
            content: rerun,
            style: 1 /* HoverStyle.Pointer */,
        }, { groupId }));
    }
    hasSameContent(other, followingContent, element) {
        return false;
    }
};
ChatAgentCommandContentPart = __decorate([
    __param(2, IHoverService)
], ChatAgentCommandContentPart);
export { ChatAgentCommandContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFnZW50Q29tbWFuZENvbnRlbnRQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRBZ2VudENvbW1hbmRDb250ZW50UGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWxGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBSXhGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUk5RCxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLFVBQVU7SUFJMUQsWUFDQyxHQUFzQixFQUN0QixPQUFtQixFQUNKLGFBQTZDO1FBRTVELEtBQUssRUFBRSxDQUFDO1FBRndCLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBTHBELFlBQU8sR0FBZ0IsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQVE5RCxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztRQUU1QyxNQUFNLE9BQU8sR0FBRyxZQUFZLEVBQUUsQ0FBQztRQUUvQixNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ25ELElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3RDLFdBQVcsQ0FBQyxTQUFTLEdBQUcsb0JBQW9CLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztRQUN4RCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsRUFBRTtZQUNqRSxPQUFPLEVBQUUsR0FBRyxDQUFDLFdBQVc7WUFDeEIsS0FBSyw0QkFBb0I7U0FDekIsRUFBRSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVqQixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsT0FBTyxFQUFFLHNCQUFzQixFQUFFLG9CQUFvQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4RixNQUFNLEdBQUcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDM0QsR0FBRyxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3JCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRTtZQUNqRSxPQUFPLEVBQUUsS0FBSztZQUNkLEtBQUssNEJBQW9CO1NBQ3pCLEVBQUUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQztJQUVELGNBQWMsQ0FBQyxLQUEyQixFQUFFLGdCQUF3QyxFQUFFLE9BQXFCO1FBQzFHLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztDQUNELENBQUE7QUF0Q1ksMkJBQTJCO0lBT3JDLFdBQUEsYUFBYSxDQUFBO0dBUEgsMkJBQTJCLENBc0N2QyJ9