/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatContextUsageDetails.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';

const $ = dom.$;

export interface IChatContextUsageData {
	promptTokens: number;
	maxInputTokens: number;
	percentage: number;
}

/**
 * Detailed widget that shows context usage breakdown.
 * Displayed when the user clicks on the ChatContextUsageIcon.
 */
export class ChatContextUsageDetails extends Disposable {

	readonly domNode: HTMLElement;

	private readonly quotaItem: HTMLElement;
	private readonly percentageLabel: HTMLElement;
	private readonly progressFill: HTMLElement;
	private readonly warningMessage: HTMLElement;

	constructor() {
		super();

		this.domNode = $('.chat-context-usage-details');
		this.domNode.setAttribute('tabindex', '0');

		// Using same structure as ChatUsageWidget quota items
		this.quotaItem = this.domNode.appendChild($('.quota-item'));

		// Header row with label and percentage
		const quotaItemHeader = this.quotaItem.appendChild($('.quota-item-header'));
		const quotaItemLabel = quotaItemHeader.appendChild($('.quota-item-label'));
		quotaItemLabel.textContent = localize('contextWindow', "Context Window");
		this.percentageLabel = quotaItemHeader.appendChild($('.quota-item-value'));

		// Progress bar - using same structure as chat usage widget
		const progressBar = this.quotaItem.appendChild($('.quota-bar'));
		this.progressFill = progressBar.appendChild($('.quota-bit'));

		// Warning message (shown when usage is high)
		this.warningMessage = this.domNode.appendChild($('.warning-message'));
		this.warningMessage.textContent = localize('qualityWarning', "Quality may decline as limit nears.");
		this.warningMessage.style.display = 'none';

		// Action button (placeholder for future functionality)
		const buttonContainer = this.domNode.appendChild($('.button-container'));
		const button = this._register(new Button(buttonContainer, {
			...defaultButtonStyles,
			secondary: true
		}));
		button.label = localize('increaseContextWindow', "Increase context window");
		button.element.title = localize('mayIncurCost', "May incur cost");
	}

	update(data: IChatContextUsageData): void {
		const { percentage } = data;

		// Update percentage label
		this.percentageLabel.textContent = `${percentage.toFixed(0)}%`;

		// Update progress bar
		this.progressFill.style.width = `${Math.min(100, percentage)}%`;

		// Update color classes based on usage level on the quota item
		this.quotaItem.classList.remove('warning', 'error');
		if (percentage >= 90) {
			this.quotaItem.classList.add('error');
		} else if (percentage >= 75) {
			this.quotaItem.classList.add('warning');
		}

		// Show/hide warning message
		this.warningMessage.style.display = percentage >= 75 ? '' : 'none';
	}

	focus(): void {
		this.domNode.focus();
	}
}
