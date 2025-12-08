/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatStatusWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ChatEntitlement, ChatEntitlementContextKeys, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatInputPartWidgetsRegistry, IChatInputPartWidget } from './chatInputPartWidgets.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { CHAT_SETUP_ACTION_ID } from './actions/chatActions.js';

const $ = dom.$;

/**
 * Widget that displays a status message with an optional action button.
 * Only shown for free tier users when the setting is enabled (experiment controlled via onExP tag).
 */
export class ChatStatusWidget extends Disposable implements IChatInputPartWidget {

	static readonly ID = 'chatStatusWidget';

	readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private messageElement: HTMLElement | undefined;
	private actionButton: Button | undefined;

	constructor(
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this.domNode = $('.chat-status-widget');
		this.domNode.style.display = 'none';
		this.initializeIfEnabled();
	}

	private initializeIfEnabled(): void {
		const enabledSku = this.configurationService.getValue<string | null>('chat.statusWidget.sku');
		if (enabledSku !== 'free' && enabledSku !== 'anonymous') {
			return;
		}

		const entitlement = this.chatEntitlementService.entitlement;
		const isAnonymous = this.chatEntitlementService.anonymous;

		if (enabledSku === 'anonymous' && isAnonymous) {
			this.createWidgetContent(enabledSku);
		} else if (enabledSku === 'free' && entitlement === ChatEntitlement.Free) {
			this.createWidgetContent(enabledSku);
		} else {
			return;
		}

		this.domNode.style.display = '';
		this._onDidChangeHeight.fire();
	}

	get height(): number {
		return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
	}

	private createWidgetContent(enabledSku: 'free' | 'anonymous'): void {
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
			const message = localize('chat.anonymousRateLimited.message', "You've reached the limit for chat messages. Try Copilot Pro for free.");
			const buttonLabel = localize('chat.anonymousRateLimited.signIn', "Sign In");
			this.messageElement.textContent = message;
			this.actionButton.label = buttonLabel;
			this.actionButton.element.ariaLabel = localize('chat.anonymousRateLimited.signIn.ariaLabel', "{0} {1}", message, buttonLabel);
		} else {
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
			await this.commandService.executeCommand(commandId);
		}));

		this.domNode.appendChild(contentContainer);
		this.domNode.appendChild(actionContainer);
	}
}

ChatInputPartWidgetsRegistry.register(
	ChatStatusWidget.ID,
	ChatStatusWidget,
	ContextKeyExpr.and(
		ChatContextKeys.chatQuotaExceeded,
		ChatContextKeys.chatSessionIsEmpty,
		ContextKeyExpr.or(
			ChatContextKeys.Entitlement.planFree,
			ChatEntitlementContextKeys.chatAnonymous
		)
	)
);
