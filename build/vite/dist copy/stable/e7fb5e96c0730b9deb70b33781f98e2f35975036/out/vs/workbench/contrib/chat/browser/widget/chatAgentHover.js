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
import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { getFullyQualifiedId, IChatAgentNameService, IChatAgentService } from '../../common/participants/chatAgents.js';
import { showExtensionsWithIdsCommandId } from '../../../extensions/browser/extensionsActions.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { verifiedPublisherIcon } from '../../../../services/extensionManagement/common/extensionsIcons.js';
let ChatAgentHover = class ChatAgentHover extends Disposable {
    constructor(chatAgentService, extensionService, chatAgentNameService) {
        super();
        this.chatAgentService = chatAgentService;
        this.extensionService = extensionService;
        this.chatAgentNameService = chatAgentNameService;
        this._onDidChangeContents = this._register(new Emitter());
        this.onDidChangeContents = this._onDidChangeContents.event;
        const hoverElement = dom.h('.chat-agent-hover@root', [
            dom.h('.chat-agent-hover-header', [
                dom.h('.chat-agent-hover-icon@icon'),
                dom.h('.chat-agent-hover-details', [
                    dom.h('.chat-agent-hover-name@name'),
                    dom.h('.chat-agent-hover-extension', [
                        dom.h('.chat-agent-hover-extension-name@extensionName'),
                        dom.h('.chat-agent-hover-separator@separator'),
                        dom.h('.chat-agent-hover-publisher@publisher'),
                    ]),
                ]),
            ]),
            dom.h('.chat-agent-hover-warning@warning'),
            dom.h('span.chat-agent-hover-description@description'),
        ]);
        this.domNode = hoverElement.root;
        this.icon = hoverElement.icon;
        this.name = hoverElement.name;
        this.extensionName = hoverElement.extensionName;
        this.description = hoverElement.description;
        hoverElement.separator.textContent = '|';
        const verifiedBadge = dom.$('span.extension-verified-publisher', undefined, renderIcon(verifiedPublisherIcon));
        this.publisherName = dom.$('span.chat-agent-hover-publisher-name');
        dom.append(hoverElement.publisher, verifiedBadge, this.publisherName);
        hoverElement.warning.appendChild(renderIcon(Codicon.warning));
        hoverElement.warning.appendChild(dom.$('span', undefined, localize('reservedName', "This chat extension is using a reserved name.")));
    }
    setAgent(id) {
        const agent = this.chatAgentService.getAgent(id);
        if (agent.metadata.icon instanceof URI) {
            const avatarIcon = dom.$('img.icon');
            avatarIcon.src = FileAccess.uriToBrowserUri(agent.metadata.icon).toString(true);
            this.icon.replaceChildren(dom.$('.avatar', undefined, avatarIcon));
        }
        else if (agent.metadata.themeIcon) {
            const avatarIcon = dom.$(ThemeIcon.asCSSSelector(agent.metadata.themeIcon));
            this.icon.replaceChildren(dom.$('.avatar.codicon-avatar', undefined, avatarIcon));
        }
        this.domNode.classList.toggle('noExtensionName', !!agent.isDynamic);
        const isAllowed = this.chatAgentNameService.getAgentNameRestriction(agent);
        this.name.textContent = isAllowed ? `@${agent.name}` : getFullyQualifiedId(agent);
        this.extensionName.textContent = agent.extensionDisplayName;
        this.publisherName.textContent = agent.publisherDisplayName ?? agent.extensionPublisherId;
        let description = agent.description ?? '';
        if (description) {
            if (!description.match(/[\.\?\!] *$/)) {
                description += '.';
            }
        }
        this.description.textContent = description;
        this.domNode.classList.toggle('allowedName', isAllowed);
        this.domNode.classList.toggle('verifiedPublisher', false);
        if (!agent.isDynamic) {
            const cancel = this._register(new CancellationTokenSource());
            this.extensionService.getExtensions([{ id: agent.extensionId.value }], cancel.token).then(extensions => {
                cancel.dispose();
                const extension = extensions[0];
                if (extension?.publisherDomain?.verified) {
                    this.domNode.classList.toggle('verifiedPublisher', true);
                    this._onDidChangeContents.fire();
                }
            });
        }
    }
};
ChatAgentHover = __decorate([
    __param(0, IChatAgentService),
    __param(1, IExtensionsWorkbenchService),
    __param(2, IChatAgentNameService)
], ChatAgentHover);
export { ChatAgentHover };
export function getChatAgentHoverOptions(getAgent, commandService) {
    return {
        actions: [
            {
                commandId: showExtensionsWithIdsCommandId,
                label: localize('viewExtensionLabel', "View Extension"),
                run: () => {
                    const agent = getAgent();
                    if (agent) {
                        commandService.executeCommand(showExtensionsWithIdsCommandId, [agent.extensionId.value]);
                    }
                },
            }
        ]
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFnZW50SG92ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRBZ2VudEhvdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFFMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVqRCxPQUFPLEVBQUUsbUJBQW1CLEVBQWtCLHFCQUFxQixFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDeEksT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEcsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDdkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFFcEcsSUFBTSxjQUFjLEdBQXBCLE1BQU0sY0FBZSxTQUFRLFVBQVU7SUFZN0MsWUFDb0Is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