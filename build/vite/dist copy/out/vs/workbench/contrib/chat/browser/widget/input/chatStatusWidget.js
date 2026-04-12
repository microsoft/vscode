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
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { ChatEntitlement, ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { CHAT_SETUP_ACTION_ID } from '../../actions/chatActions.js';
import { ChatInputPartWidgetsRegistry } from './chatInputPartWidgets.js';
import './media/chatStatusWidget.css';
const $ = dom.$;
/**
 * Widget that displays a status message with an optional action button.
 * Only shown for free tier users when the setting is enabled (experiment controlled via onExP tag).
 */
let ChatStatusWidget = class ChatStatusWidget extends Disposable {
    static { this.ID = 'chatStatusWidget'; }
    constructor(chatEntitlementService, commandService, configurationService, telemetryService) {
        super();
        this.chatEntitlementService = chatEntitlementService;
        this.commandService = commandService;
        this.configurationService = configurationService;
        this.telemetryService = telemetryService;
        this.domNode = $('.chat-status-widget');
        this.domNode.style.display = 'none';
        this.initializeIfEnabled();
    }
    initializeIfEnabled() {
        const entitlement = this.chatEntitlementService.entitlement;
        const isAnonymous = this.chatEntitlementService.anonymous;
        if (isAnonymous && this.configurationService.getValue('chat.statusWidget.anonymous')) {
            this.createWidgetContent('anonymous');
        }
        else if (entitlement === ChatEntitlement.Free) {
            this.createWidgetContent('free');
        }
        else {
            return;
        }
        this.domNode.style.display = '';
    }
    get height() {
        return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
    }
    createWidgetContent(enabledSku) {
        const contentContainer = $('.chat-status-content');
        this.messageElement = $('.chat-status-message');
        contentContainer.appendChild(this.messageElement);
        const actionContainer = $('.chat-status-action');
        this.actionButton = this._register(new Button(actionContainer, {
            ...defaultButtonStyles,
            supportIcons: true
        }));
        this.actionButton.element.classList.add('chat-status-button');
        if (enabledSku === 'anonymous') {
            const message = localize('chat.anonymousRateLimited.message', "You've reached the limit for chat messages. Sign in to use Copilot Free.");
            const buttonLabel = localize('chat.anonymousRateLimited.signIn', "Sign In");
            this.messageElement.textContent = message;
            this.actionButton.label = buttonLabel;
            this.actionButton.element.ariaLabel = localize('chat.anonymousRateLimited.signIn.ariaLabel', "{0} {1}", message, buttonLabel);
        }
        else {
            const message = localize('chat.freeQuotaExceeded.message', "You've reached the limit for chat messages.");
            const buttonLabel = localize('chat.freeQuotaExceeded.upgrade', "Upgrade");
            this.messageElement.textContent = message;
            this.actionButton.label = buttonLabel;
            this.actionButton.element.ariaLabel = localize('chat.freeQuotaExceeded.upgrade.ariaLabel', "{0} {1}", message, buttonLabel);
        }
        this._register(this.actionButton.onDidClick(async () => {
            const commandId = this.chatEntitlementService.anonymous
                ? CHAT_SETUP_ACTION_ID
                : 'workbench.action.chat.upgradePlan';
            this.telemetryService.publicLog2('workbenchActionExecuted', {
                id: commandId,
                from: 'chatStatusWidget'
            });
            await this.commandService.executeCommand(commandId);
        }));
        this.domNode.appendChild(contentContainer);
        this.domNode.appendChild(actionContainer);
    }
};
ChatStatusWidget = __decorate([
    __param(0, IChatEntitlementService),
    __param(1, ICommandService),
    __param(2, IConfigurationService),
    __param(3, ITelemetryService)
], ChatStatusWidget);
export { ChatStatusWidget };
ChatInputPartWidgetsRegistry.register(ChatStatusWidget.ID, ChatStatusWidget, ContextKeyExpr.and(ChatContextKeys.chatQuotaExceeded, ChatContextKeys.chatSessionIsEmpty, ContextKeyExpr.or(ChatContextKeys.Entitlement.planFree, ChatEntitlementContextKeys.chatAnonymous)));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFN0YXR1c1dpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdFN0YXR1c1dpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUU1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN6RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDNUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDN0YsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSwwQkFBMEIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3JKLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRSxPQUFPLEVBQUUsNEJBQTRCLEVBQXdCLE1BQU0sMkJBQTJCLENBQUM7QUFDL0YsT0FBTyw4QkFBOEIsQ0FBQztBQUV0QyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWhCOzs7R0FHRztBQUNJLElBQU0s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