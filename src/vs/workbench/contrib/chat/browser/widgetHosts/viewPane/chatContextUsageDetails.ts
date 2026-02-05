/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatContextUsageDetails.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IMenuService, MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { MenuWorkbenchButtonBar } from '../../../../../../platform/actions/browser/buttonbar.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';

const $ = dom.$;

export interface IChatContextUsagePromptTokenDetail {
	category: string;
	label: string;
	percentageOfPrompt: number;
}

export interface IChatContextUsageData {
	promptTokens: number;
	maxInputTokens: number;
	percentage: number;
	promptTokenDetails?: readonly IChatContextUsagePromptTokenDetail[];
}

/**
 * Detailed widget that shows context usage breakdown.
 * Displayed when the user clicks on the ChatContextUsageIcon.
 */
export class ChatContextUsageDetails extends Disposable {

	readonly domNode: HTMLElement;

	private readonly quotaItem: HTMLElement;
	private readonly percentageLabel: HTMLElement;
	private readonly tokenCountLabel: HTMLElement;
	private readonly progressFill: HTMLElement;
	private readonly tokenDetailsContainer: HTMLElement;
	private readonly warningMessage: HTMLElement;
	private readonly actionsSection: HTMLElement;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this.domNode = $('.chat-context-usage-details');

		// Using same structure as ChatUsageWidget quota items
		this.quotaItem = this.domNode.appendChild($('.quota-item'));

		// Header row with label
		const quotaItemHeader = this.quotaItem.appendChild($('.quota-item-header'));
		const quotaItemLabel = quotaItemHeader.appendChild($('.quota-item-label'));
		quotaItemLabel.textContent = localize('contextWindow', "Context Window");

		// Token count and percentage row (on same line)
		const tokenRow = this.quotaItem.appendChild($('.token-row'));
		this.tokenCountLabel = tokenRow.appendChild($('.token-count-label'));
		this.percentageLabel = tokenRow.appendChild($('.quota-item-value'));

		// Progress bar - using same structure as chat usage widget
		const progressBar = this.quotaItem.appendChild($('.quota-bar'));
		this.progressFill = progressBar.appendChild($('.quota-bit'));

		// Token details container (for category breakdown)
		this.tokenDetailsContainer = this.domNode.appendChild($('.token-details-container'));

		// Warning message (shown when usage is high)
		this.warningMessage = this.domNode.appendChild($('.warning-message'));
		this.warningMessage.textContent = localize('qualityWarning', "Quality may decline as limit nears.");
		this.warningMessage.style.display = 'none';

		// Actions section with header, separator, and button bar
		this.actionsSection = this.domNode.appendChild($('.actions-section'));
		this.actionsSection.appendChild($('.separator'));
		const actionsHeader = this.actionsSection.appendChild($('.actions-header'));
		actionsHeader.textContent = localize('actions', "Actions");
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

	update(data: IChatContextUsageData): void {
		const { percentage, promptTokens, maxInputTokens, promptTokenDetails } = data;

		// Update token count and percentage on same line
		this.tokenCountLabel.textContent = localize(
			'tokenCount',
			"{0} / {1} tokens",
			this.formatTokenCount(promptTokens, 1),
			this.formatTokenCount(maxInputTokens, 0)
		);
		this.percentageLabel.textContent = `• ${percentage.toFixed(0)}%`;

		// Update progress bar
		this.progressFill.style.width = `${Math.min(100, percentage)}%`;

		// Update color classes based on usage level on the quota item
		this.quotaItem.classList.remove('warning', 'error');
		if (percentage >= 90) {
			this.quotaItem.classList.add('error');
		} else if (percentage >= 75) {
			this.quotaItem.classList.add('warning');
		}

		// Render token details breakdown if available
		this.renderTokenDetails(promptTokenDetails, percentage);

		// Show/hide warning message
		this.warningMessage.style.display = percentage >= 75 ? '' : 'none';
	}

	private formatTokenCount(count: number, decimals: number): string {
		if (count >= 1000000) {
			return `${(count / 1000000).toFixed(decimals)}M`;
		} else if (count >= 1000) {
			return `${(count / 1000).toFixed(decimals)}K`;
		}
		return count.toString();
	}

	private renderTokenDetails(details: readonly IChatContextUsagePromptTokenDetail[] | undefined, contextWindowPercentage: number): void {
		// Clear previous content
		dom.clearNode(this.tokenDetailsContainer);

		if (!details || details.length === 0) {
			this.tokenDetailsContainer.style.display = 'none';
			return;
		}

		this.tokenDetailsContainer.style.display = '';

		// Group details by category
		const categoryMap = new Map<string, { label: string; percentageOfPrompt: number }[]>();
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
			const categorySection = this.tokenDetailsContainer.appendChild($('.token-category'));

			// Category header
			const categoryHeader = categorySection.appendChild($('.token-category-header'));
			categoryHeader.textContent = category;

			// Category items
			for (const item of items) {
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

	focus(): void {
		this.domNode.focus();
	}
}
