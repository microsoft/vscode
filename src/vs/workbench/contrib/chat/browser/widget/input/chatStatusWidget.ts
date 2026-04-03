/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../../base/common/actions.js';
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
import { ChatInputPartWidgetsRegistry, IChatInputPartWidget } from './chatInputPartWidgets.js';
import './media/chatStatusWidget.css';

const $ = dom.$;

/**
 * Widget that displays a status message with an optional action button.
 * Shown for free tier users when quota is exceeded, and for Pro users when the experimental setting is enabled.
 * Anonymous users require the experimental setting to be enabled.
 */
export class ChatStatusWidget extends Disposable implements IChatInputPartWidget {

	static readonly ID = 'chatStatusWidget';

	readonly domNode: HTMLElement;

	private messageElement: HTMLElement | undefined;
	private actionButton: Button | undefined;

	constructor(
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.domNode = $('.chat-status-widget');
		this.domNode.style.display = 'none';
		this.initializeIfEnabled();
	}

	private initializeIfEnabled(): void {
		const entitlement = this.chatEntitlementService.entitlement;
		const isAnonymous = this.chatEntitlementService.anonymous;

		if (isAnonymous && this.configurationService.getValue<boolean>('chat.statusWidget.anonymous')) {
			this.createWidgetContent('anonymous');
		} else if (entitlement === ChatEntitlement.Free) {
			this.createWidgetContent('free');
		} else if (entitlement === ChatEntitlement.Pro) {
			this.createWidgetContent('pro');
		} else {
			return;
		}

		this.domNode.style.display = '';
	}

	get height(): number {
		return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
	}

	private createWidgetContent(enabledSku: 'free' | 'anonymous' | 'pro'): void {
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
		} else if (enabledSku === 'pro') {
			const message = localize('chat.proQuotaExceeded.message', "You've reached the limit for chat messages.");
			const buttonLabel = localize('chat.proQuotaExceeded.upgrade', "Upgrade");
			this.messageElement.textContent = message;
			this.actionButton.label = buttonLabel;
			this.actionButton.element.ariaLabel = localize('chat.proQuotaExceeded.upgrade.ariaLabel', "{0} {1}", message, buttonLabel);
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
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: commandId,
				from: 'chatStatusWidget'
			});
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
			ChatContextKeys.Entitlement.planPro,
			ChatEntitlementContextKeys.chatAnonymous
		)
	)
);
