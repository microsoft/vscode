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
import './media/chatUsageWidget.css';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { language } from '../../../../../base/common/platform.js';
import { safeIntl } from '../../../../../base/common/date.js';
const $ = DOM.$;
let ChatUsageWidget = class ChatUsageWidget extends Disposable {
    constructor(chatEntitlementService) {
        super();
        this.chatEntitlementService = chatEntitlementService;
        this._onDidChangeContentHeight = this._register(new Emitter());
        this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
        this.dateFormatter = safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' });
        this.dateTimeFormatter = safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
        this.element = DOM.$('.chat-usage-widget');
        this.create(this.element);
        this.render();
        // Update when quotas or entitlements change
        this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.render()));
        this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.render()));
    }
    create(container) {
        // Content container
        this.usageSection = DOM.append(container, $('.copilot-usage-section'));
    }
    render() {
        DOM.clearNode(this.usageSection);
        const { chat: chatQuota, completions: completionsQuota, premiumChat: premiumChatQuota, resetDate, resetDateHasTime } = this.chatEntitlementService.quotas;
        // Anonymous Indicator - show limited quotas
        if (this.chatEntitlementService.anonymous && this.chatEntitlementService.sentiment.completed && !completionsQuota && !chatQuota && !premiumChatQuota) {
            this.renderLimitedQuotaItem(this.usageSection, localize('completionsLabel', 'Inline Suggestions'));
            this.renderLimitedQuotaItem(this.usageSection, localize('chatsLabel', 'Chat messages'));
        }
        // Copilot Usage section - show detailed breakdown of all quotas
        else if (completionsQuota || chatQuota || premiumChatQuota) {
            // Inline Suggestions
            if (completionsQuota) {
                this.renderQuotaItem(this.usageSection, localize('plan.inlineSuggestions', 'Inline Suggestions'), completionsQuota);
            }
            // Chat messages
            if (chatQuota) {
                this.renderQuotaItem(this.usageSection, localize('plan.chatMessages', 'Chat messages'), chatQuota);
            }
            // Premium requests
            if (premiumChatQuota) {
                const premiumLabel = premiumChatQuota.overageEnabled ? localize('plan.includedPremiumRequests', 'Included premium requests') : localize('plan.premiumRequests', 'Premium requests');
                this.renderQuotaItem(this.usageSection, premiumLabel, premiumChatQuota, premiumChatQuota.overageEnabled);
                if (premiumChatQuota.overageEnabled && !premiumChatQuota.unlimited) {
                    const overageMessage = DOM.append(this.usageSection, $('.overage-message'));
                    overageMessage.append(localize('plan.overageApprovedLine1', "Additional premium requests approved."));
                    DOM.append(overageMessage, $('br'));
                    overageMessage.append(localize('plan.overageApprovedLine2', "You can continue after included premium requests limit reaches 100%."));
                }
            }
            // Reset date
            if (resetDate) {
                const resetText = DOM.append(this.usageSection, $('.allowance-resets'));
                resetText.textContent = localize('plan.allowanceResets', 'Allowance resets {0}.', resetDateHasTime ? this.dateTimeFormatter.value.format(new Date(resetDate)) : this.dateFormatter.value.format(new Date(resetDate)));
            }
        }
        // Emit height change
        const height = this.element.offsetHeight || 400;
        this._onDidChangeContentHeight.fire(height);
    }
    renderQuotaItem(container, label, quota, overageEnabled = false) {
        const quotaItem = DOM.append(container, $('.quota-item'));
        const quotaItemHeader = DOM.append(quotaItem, $('.quota-item-header'));
        const quotaItemLabel = DOM.append(quotaItemHeader, $('.quota-item-label'));
        quotaItemLabel.textContent = label;
        const quotaItemValue = DOM.append(quotaItemHeader, $('.quota-item-value'));
        if (quota.unlimited) {
            quotaItemValue.textContent = localize('plan.included', 'Included');
        }
        else {
            quotaItemValue.textContent = localize('plan.included', 'Included');
        }
        // Progress bar - using same structure as chat status
        const progressBarContainer = DOM.append(quotaItem, $('.quota-bar'));
        const progressBar = DOM.append(progressBarContainer, $('.quota-bit'));
        const percentageUsed = this.getQuotaPercentageUsed(quota);
        progressBar.style.width = percentageUsed + '%';
        // Apply warning/error classes based on usage (don't show error/warning if overage is enabled)
        if (percentageUsed >= 90 && !overageEnabled) {
            quotaItem.classList.add('error');
        }
        else if (percentageUsed >= 75 && !overageEnabled) {
            quotaItem.classList.add('warning');
        }
    }
    getQuotaPercentageUsed(quota) {
        if (quota.unlimited) {
            return 0;
        }
        return Math.max(0, 100 - quota.percentRemaining);
    }
    renderLimitedQuotaItem(container, label) {
        const quotaItem = DOM.append(container, $('.quota-item'));
        const quotaItemHeader = DOM.append(quotaItem, $('.quota-item-header'));
        const quotaItemLabel = DOM.append(quotaItemHeader, $('.quota-item-label'));
        quotaItemLabel.textContent = label;
        const quotaItemValue = DOM.append(quotaItemHeader, $('.quota-item-value'));
        quotaItemValue.textContent = localize('quotaLimited', 'Limited');
        // Progress bar - using same structure as chat status
        const progressBarContainer = DOM.append(quotaItem, $('.quota-bar'));
        DOM.append(progressBarContainer, $('.quota-bit'));
    }
};
ChatUsageWidget = __decorate([
    __param(0, IChatEntitlementService)
], ChatUsageWidget);
export { ChatUsageWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFVzYWdlV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRNYW5hZ2VtZW50L2NoYXRVc2FnZVdpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLDZCQUE2QixDQUFDO0FBQ3JDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLHVCQUF1QixFQUFrQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFOUQsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUVULElBQU0sZUFBZSxHQUFyQixNQUFNLGVBQWdCLFNBQVEsVUFBVTtJQVc5QyxZQUMwQixzQkFBZ0U7UUFFekYsS0FBSyxFQUFFLENBQUM7UUFGa0MsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF5QjtRQVZ6RSw4QkFBeUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFVLENBQUMsQ0FBQztRQUMxRSw2QkFBd0IsR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUMsS0FBSyxDQUFDO1FBS3hELGtCQUFhLEdBQUcsUUFBUSxDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxNQUFN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