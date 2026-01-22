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
	private readonly actionsSection: HTMLElement;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
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

		// Actions section with header, separator, and button bar
		this.actionsSection = this.domNode.appendChild($('.actions-section'));
		this.actionsSection.appendChild($('.separator'));
		const actionsHeader = this.actionsSection.appendChild($('.actions-header'));
		actionsHeader.textContent = localize('actions', "Actions");
		const buttonBarContainer = this.actionsSection.appendChild($('.button-bar-container'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchButtonBar, buttonBarContainer, MenuId.ChatContextUsageActions, {}));

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
