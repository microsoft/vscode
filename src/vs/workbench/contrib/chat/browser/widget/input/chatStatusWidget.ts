/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { ChatEntitlement, ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { CHAT_SETUP_ACTION_ID } from '../../actions/chatActions.js';
import { ChatInputPartWidgetsRegistry, IChatInputPartWidget } from './chatInputPartWidgets.js';
import './media/chatStatusWidget.css';

const $ = dom.$;

const DISMISS_STORAGE_KEY = 'chat.noAuthWidget.dismissed';

/**
 * Widget that displays a status message with an optional action button.
 * Handles three cases:
 * - 'free': Quota exceeded for free tier users
 * - 'anonymous': Quota exceeded for anonymous users
 * - 'anonymousWelcome': Welcome banner for anonymous users who haven't used chat yet (experiment controlled)
 */
export class ChatStatusWidget extends Disposable implements IChatInputPartWidget {

	static readonly ID = 'chatStatusWidget';

	readonly domNode: HTMLElement;

	private messageElement: HTMLElement | undefined;
	private actionButton: Button | undefined;

	constructor(
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IChatService private readonly chatService: IChatService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.domNode = $('.chat-status-widget');
		this.domNode.style.display = 'none';
		void this.initializeIfEnabled();
	}

	private async initializeIfEnabled(): Promise<void> {
		const entitlement = this.chatEntitlementService.entitlement;
		const isAnonymous = this.chatEntitlementService.anonymous;

		const anonymousEnabled = this.configurationService.getValue<boolean>('chat.statusWidget.anonymous');
		const enabledBanner = this.configurationService.getValue<boolean>('chat.noAuthWidget.enabled');
		const bannerDismissed = this.storageService.getBoolean(DISMISS_STORAGE_KEY, StorageScope.PROFILE, false);

		const quotaExceeded = this.chatEntitlementService.quotas.chat?.percentRemaining === 0;

		if (quotaExceeded && isAnonymous && anonymousEnabled) {
			this.createWidgetContent('anonymous');
			this.domNode.style.display = '';
		} else if (quotaExceeded && entitlement === ChatEntitlement.Free) {
			this.createWidgetContent('free');
			this.domNode.style.display = '';
		} else if (isAnonymous && enabledBanner && !bannerDismissed) {
			try {
				const history = await this.chatService.getHistorySessionItems();
				if (this._store.isDisposed) {
					return;
				}
				if (history.length === 0 && this.chatEntitlementService.anonymous &&
					this.configurationService.getValue<boolean>('chat.noAuthWidget.enabled') &&
					!this.storageService.getBoolean(DISMISS_STORAGE_KEY, StorageScope.PROFILE, false)) {
					this.createWidgetContent('anonymousWelcome');
					this.domNode.style.display = '';
					this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
						id: 'chatStatusWidget.welcomeShown',
						from: 'chatStatusWidget'
					});
				}
			} catch {
				// best-effort: banner won't show if history check fails
			}
		}
	}

	get height(): number {
		return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
	}

	private createWidgetContent(mode: 'free' | 'anonymous' | 'anonymousWelcome'): void {
		const contentContainer = $('.chat-status-content');
		this.messageElement = $('.chat-status-message');

		let dismissButton: HTMLElement | undefined;

		if (mode === 'anonymousWelcome') {
			const copilotIcon = renderIcon(Codicon.copilot);
			copilotIcon.classList.add('chat-status-icon');
			copilotIcon.setAttribute('aria-hidden', 'true');
			contentContainer.appendChild(copilotIcon);
			contentContainer.appendChild(this.messageElement);

			this.messageElement.textContent = localize('chat.anonymousWelcome.message', "GitHub Copilot is now enabled.");

			// Dismiss button (X)
			dismissButton = $('.chat-status-dismiss');
			dismissButton.setAttribute('role', 'button');
			dismissButton.tabIndex = 0;
			const dismissLabel = localize('chat.anonymousWelcome.dismiss', "Dismiss");
			dismissButton.setAttribute('aria-label', dismissLabel);
			const dismissIcon = renderIcon(Codicon.close);
			dismissIcon.setAttribute('aria-hidden', 'true');
			dismissButton.appendChild(dismissIcon);
			this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), dismissButton, dismissLabel));

			const handleDismiss = (e: Event) => {
				e.stopPropagation();
				this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
					id: 'chatStatusWidget.welcomeDismiss',
					from: 'chatStatusWidget'
				});
				this.storageService.store(DISMISS_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
				this.domNode.style.display = 'none';
			};

			this._register(dom.addDisposableListener(dismissButton, 'click', handleDismiss));
			this._register(dom.addStandardDisposableListener(dismissButton, dom.EventType.KEY_DOWN, (e: StandardKeyboardEvent) => {
				if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
					e.preventDefault();
					handleDismiss(e.browserEvent);
				}
			}));
		} else {
			contentContainer.appendChild(this.messageElement);
			const actionContainer = $('.chat-status-action');
			this.actionButton = this._register(new Button(actionContainer, {
				...defaultButtonStyles,
				supportIcons: true
			}));
			this.actionButton.element.classList.add('chat-status-button');

			if (mode === 'anonymous') {
				const message = localize('chat.anonymousRateLimited.message', "You've reached the limit for chat messages. Sign in to use Copilot Free.");
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
				this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
					id: commandId,
					from: 'chatStatusWidget'
				});
				await this.commandService.executeCommand(commandId);
			}));

			this.domNode.appendChild(actionContainer);
		}

		this.domNode.appendChild(contentContainer);
		if (dismissButton) {
			this.domNode.appendChild(dismissButton);
		}
	}
}

ChatInputPartWidgetsRegistry.register(
	ChatStatusWidget.ID,
	ChatStatusWidget,
	ContextKeyExpr.and(
		ChatContextKeys.chatSessionIsEmpty,
		ContextKeyExpr.or(
			ContextKeyExpr.and(ChatContextKeys.chatQuotaExceeded, ChatContextKeys.Entitlement.planFree),
			ChatEntitlementContextKeys.chatAnonymous
		)
	)
);
