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
import './media/chatContextUsageDetails.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IMenuService, MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { MenuWorkbenchButtonBar } from '../../../../../../platform/actions/browser/buttonbar.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
const $ = dom.$;
/**
 * Detailed widget that shows context usage breakdown.
 * Displayed when the user clicks on the ChatContextUsageIcon.
 */
let ChatContextUsageDetails = class ChatContextUsageDetails extends Disposable {
    constructor(instantiationService, menuService, contextKeyService) {
        super();
        this.instantiationService = instantiationService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.domNode = $('.chat-context-usage-details');
        // Quota indicator — using same structure as ChatStatusDashboard
        this.quotaItem = this.domNode.appendChild($('.quota-indicator'));
        // Header row
        const header = this.domNode.insertBefore($('div.header'), this.quotaItem);
        header.textContent = localize('contextWindow', "Context Window");
        // Quota label row with token count + percentage
        const quotaLabel = this.quotaItem.appendChild($('.quota-label'));
        this.tokenCountLabel = quotaLabel.appendChild($('span'));
        this.percentageLabel = quotaLabel.appendChild($('span.quota-value'));
        // Progress bar
        const progressBar = this.quotaItem.appendChild($('.quota-bar'));
        this.progressFill = progressBar.appendChild($('.quota-bit'));
        this.outputBufferFill = progressBar.appendChild($('.quota-bit.output-buffer'));
        // Output buffer legend (shown only when outputBuffer is provided)
        this.outputBufferLegend = this.quotaItem.appendChild($('.output-buffer-legend'));
        this.outputBufferLegend.appendChild($('.output-buffer-swatch'));
        const legendLabel = this.outputBufferLegend.appendChild($('span'));
        legendLabel.textContent = localize('outputReserved', "Reserved for response");
        this.outputBufferLegend.style.display = 'none';
        // Token details container (for category breakdown)
        this.tokenDetailsContainer = this.domNode.appendChild($('.token-details-container'));
        // Warning message (shown when usage is high)
        this.warningMessage = this.domNode.appendChild($('div.description'));
        this.warningMessage.textContent = localize('qualityWarning', "Quality may decline as limit nears.");
        this.warningMessage.style.display = 'none';
        // Actions section with button bar
        this.actionsSection = this.domNode.appendChild($('.actions-section'));
        const buttonBarContainer = this.actionsSection.appendChild($('.button-bar-container'));
        this._register(this.instantiationService.createInstance(MenuWorkbenchButtonBar, buttonBarContainer, MenuId.ChatContextUsageActions, {
            toolbarOptions: {
                primaryGroup: () => true
            },
            buttonConfigProvider: () => ({ isSecondary: true })
        }));
        // Listen to menu changes to show/hide actions section
        const menu = this._register(this.menuService.createMenu(MenuId.ChatContextUsageActions, this.contextKeyService));
        const updateActionsVisibility = () => {
            const actions = menu.getActions();
            const hasActions = actions.length > 0 && actions.some(([, items]) => items.length > 0);
            this.actionsSection.style.display = hasActions ? '' : 'none';
        };
        this._register(menu.onDidChange(updateActionsVisibility));
        updateActionsVisibility();
    }
    update(data) {
        const { percentage, usedTokens, totalContextWindow, outputBufferPercentage, promptTokenDetails } = data;
        // Update token count and percentage — reflects actual usage only
        this.tokenCountLabel.textContent = localize('tokenCount', "{0} / {1} tokens", this.formatTokenCount(usedTokens, 1), this.formatTokenCount(totalContextWindow, 0));
        this.percentageLabel.textContent = localize('quotaDisplay', "{0}%", Math.min(100, percentage).toFixed(0));
        // Progress bar: actual usage fill + remaining reserved output fill
        const usageBarWidth = Math.max(0, Math.min(100, percentage));
        this.progressFill.style.width = `${usageBarWidth}%`;
        if (outputBufferPercentage !== undefined && outputBufferPercentage > 0) {
            // Clamp so the reserve never overflows the bar
            this.outputBufferFill.style.width = `${Math.max(0, Math.min(100 - usageBarWidth, outputBufferPercentage))}%`;
            this.outputBufferFill.style.display = '';
            this.outputBufferLegend.style.display = '';
        }
        else {
            this.outputBufferFill.style.width = '0';
            this.outputBufferFill.style.display = 'none';
            this.outputBufferLegend.style.display = 'none';
        }
        // Color classes based on actual usage percentage
        this.quotaItem.classList.remove('warning', 'error');
        if (percentage >= 90) {
            this.quotaItem.classList.add('error');
        }
        else if (percentage >= 75) {
            this.quotaItem.classList.add('warning');
        }
        // Render token details breakdown if available
        this.renderTokenDetails(promptTokenDetails, percentage);
        // Show/hide warning message
        this.warningMessage.style.display = percentage >= 75 ? '' : 'none';
    }
    formatTokenCount(count, decimals) {
        // Use M when count is >= 1M, or when K representation would round to 1000K
        const mThreshold = 1000000 - 500 * Math.pow(10, -decimals);
        if (count >= mThreshold) {
            return `${(count / 1000000).toFixed(decimals)}M`;
        }
        else if (count >= 1000) {
            return `${(count / 1000).toFixed(decimals)}K`;
        }
        return count.toString();
    }
    renderTokenDetails(details, contextWindowPercentage) {
        // Clear previous content
        dom.clearNode(this.tokenDetailsContainer);
        if (!details || details.length === 0) {
            this.tokenDetailsContainer.style.display = 'none';
            return;
        }
        this.tokenDetailsContainer.style.display = '';
        // Group details by category
        const categoryMap = new Map();
        let totalPercentage = 0;
        for (const detail of details) {
            const existing = categoryMap.get(detail.category) || [];
            existing.push({ label: detail.label, percentageOfPrompt: detail.percentageOfPrompt });
            categoryMap.set(detail.category, existing);
            totalPercentage += detail.percentageOfPrompt;
        }
        // Add uncategorized if percentages don't sum to 100%
        if (totalPercentage < 100) {
            const uncategorizedPercentage = 100 - totalPercentage;
            categoryMap.set(localize('uncategorized', "Uncategorized"), [
                { label: localize('other', "Other"), percentageOfPrompt: uncategorizedPercentage }
            ]);
        }
        // Render each category
        for (const [category, items] of categoryMap) {
            // Filter out items with 0% usage
            const visibleItems = items.filter(item => {
                const contextRelativePercentage = (item.percentageOfPrompt / 100) * contextWindowPercentage;
                return contextRelativePercentage >= 0.05; // Show if at least 0.1% when rounded
            });
            if (visibleItems.length === 0) {
                continue;
            }
            const categorySection = this.tokenDetailsContainer.appendChild($('.token-category'));
            // Category header
            const categoryHeader = categorySection.appendChild($('.token-category-header'));
            categoryHeader.textContent = category;
            // Category items
            for (const item of visibleItems) {
                const itemRow = categorySection.appendChild($('.token-detail-item'));
                const itemLabel = itemRow.appendChild($('.token-detail-label'));
                itemLabel.textContent = item.label;
                // Calculate percentage relative to context window
                // E.g., if context window is at 10% and item uses 10% of prompt, show 1%
                const contextRelativePercentage = (item.percentageOfPrompt / 100) * contextWindowPercentage;
                const itemValue = itemRow.appendChild($('.token-detail-value'));
                itemValue.textContent = `${contextRelativePercentage.toFixed(1)}%`;
            }
        }
    }
    focus() {
        this.domNode.focus();
    }
};
ChatContextUsageDetails = __decorate([
    __param(0, IInstantiationService),
    __param(1, IMenuService),
    __param(2, IContextKeyService)
], ChatContextUsageDetails);
export { ChatContextUsageDetails };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbnRleHRVc2FnZURldGFpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0SG9zdHMvdmlld1BhbmUvY2hhdENvbnRleHRVc2FnZURldGFpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxxQ0FBcUMsQ0FBQztBQUM3QyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM1RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVoRyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBaUJoQjs7O0dBR0c7QUFDSSxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF3QixTQUFRLFVBQVU7SUFjdEQsWUFDeUMsb0JBQTJDLEVBQ3BELFdBQXlCLEVBQ25CLGlCQUFxQztRQUUxRSxLQUFLLEVBQUUsQ0FBQztRQUpnQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQ3BELGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ25CLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFJMUUsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUVoRCxnRUFB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