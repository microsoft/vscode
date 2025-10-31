/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatUsageWidget.css';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IChatEntitlementService, IQuotaSnapshot } from '../../../../services/chat/common/chatEntitlementService.js';
import { language } from '../../../../../base/common/platform.js';
import { safeIntl } from '../../../../../base/common/date.js';

const $ = DOM.$;

export class ChatUsageWidget extends Disposable {

	private readonly _onDidChangeContentHeight = new Emitter<number>();
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	readonly element: HTMLElement;
	private usageSection!: HTMLElement;

	private readonly dateFormatter = safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' });
	private readonly dateTimeFormatter = safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });

	constructor(
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService
	) {
		super();

		this.element = DOM.$('.chat-usage-widget');
		this.create(this.element);
		this.render();

		// Update when quotas or entitlements change
		this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.render()));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.render()));
	}

	private create(container: HTMLElement): void {
		// Content container
		this.usageSection = DOM.append(container, $('.copilot-usage-section'));
	}

	private render(): void {
		DOM.clearNode(this.usageSection);

		const { chat: chatQuota, completions: completionsQuota, premiumChat: premiumChatQuota, resetDate, resetDateHasTime } = this.chatEntitlementService.quotas;

		// Anonymous Indicator - show limited quotas
		if (this.chatEntitlementService.anonymous && this.chatEntitlementService.sentiment.installed && !completionsQuota && !chatQuota && !premiumChatQuota) {
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
				this.renderQuotaItem(this.usageSection, localize('plan.premiumRequests', 'Premium requests'), premiumChatQuota);

				// Additional overage message
				if (premiumChatQuota.overageEnabled) {
					const overageMessage = DOM.append(this.usageSection, $('.overage-message'));
					overageMessage.textContent = localize('plan.additionalPaidEnabled', 'Additional paid premium requests enabled.');
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

	private renderQuotaItem(container: HTMLElement, label: string, quota: IQuotaSnapshot): void {
		const quotaItem = DOM.append(container, $('.quota-item'));

		const quotaItemHeader = DOM.append(quotaItem, $('.quota-item-header'));
		const quotaItemLabel = DOM.append(quotaItemHeader, $('.quota-item-label'));
		quotaItemLabel.textContent = label;

		const quotaItemValue = DOM.append(quotaItemHeader, $('.quota-item-value'));
		if (quota.unlimited) {
			quotaItemValue.textContent = localize('plan.included', 'Included');
		} else {
			quotaItemValue.textContent = localize('plan.included', 'Included');
		}

		// Progress bar - using same structure as chat status
		const progressBarContainer = DOM.append(quotaItem, $('.quota-bar'));
		const progressBar = DOM.append(progressBarContainer, $('.quota-bit'));
		const percentageUsed = this.getQuotaPercentageUsed(quota);
		progressBar.style.width = percentageUsed + '%';

		// Apply warning/error classes based on usage
		if (percentageUsed >= 90) {
			quotaItem.classList.add('error');
		} else if (percentageUsed >= 75) {
			quotaItem.classList.add('warning');
		}
	}

	private getQuotaPercentageUsed(quota: IQuotaSnapshot): number {
		if (quota.unlimited) {
			return 0;
		}
		return Math.max(0, 100 - quota.percentRemaining);
	}

	private renderLimitedQuotaItem(container: HTMLElement, label: string): void {
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
}
