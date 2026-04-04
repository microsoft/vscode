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
	usedTokens: number;
	completionTokens: number;
	totalContextWindow: number;
	percentage: number;
	outputBufferPercentage?: number;
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
	private readonly outputBufferFill: HTMLElement;
	private readonly outputBufferLegend: HTMLElement;
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

	update(data: IChatContextUsageData): void {
		const { percentage, usedTokens, totalContextWindow, outputBufferPercentage, promptTokenDetails } = data;

		// Update token count and percentage — reflects actual usage only
		this.tokenCountLabel.textContent = localize(
			'tokenCount',
			"{0} / {1} tokens",
			this.formatTokenCount(usedTokens, 1),
			this.formatTokenCount(totalContextWindow, 0)
		);
		this.percentageLabel.textContent = localize('quotaDisplay', "{0}%", Math.min(100, percentage).toFixed(0));

		// Progress bar: actual usage fill + remaining reserved output fill
		const usageBarWidth = Math.max(0, Math.min(100, percentage));
		this.progressFill.style.width = `${usageBarWidth}%`;

		if (outputBufferPercentage !== undefined && outputBufferPercentage > 0) {
			// Clamp so the reserve never overflows the bar
			this.outputBufferFill.style.width = `${Math.max(0, Math.min(100 - usageBarWidth, outputBufferPercentage))}%`;
			this.outputBufferFill.style.display = '';
			this.outputBufferLegend.style.display = '';
		} else {
			this.outputBufferFill.style.width = '0';
			this.outputBufferFill.style.display = 'none';
			this.outputBufferLegend.style.display = 'none';
		}

		// Color classes based on actual usage percentage
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
		// Use M when count is >= 1M, or when K representation would round to 1000K
		const mThreshold = 1000000 - 500 * Math.pow(10, -decimals);

		if (count >= mThreshold) {
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

	focus(): void {
		this.domNode.focus();
	}
}
