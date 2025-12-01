/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatStatusWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ChatEntitlement, ChatEntitlementContextKeys, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatInputPartWidgetsRegistry, IChatInputPartWidget } from './chatInputPartWidgets.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';

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
	private _isEnabled = false;

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
		const isEnabled = this.configurationService.getValue<boolean>('chat.statusWidget.enabled');
		if (!isEnabled) {
			return;
		}

		this._isEnabled = true;
		if (!this.chatEntitlementService.isInternal) {
			return;
		}

		this.createWidgetContent();
		this.updateContent();
		this.domNode.style.display = '';

		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
			this.updateContent();
		}));

		this._onDidChangeHeight.fire();
	}

	get height(): number {
		return this._isEnabled ? this.domNode.offsetHeight : 0;
	}

	private createWidgetContent(): void {
		const contentContainer = $('.chat-status-content');
		this.messageElement = $('.chat-status-message');
		contentContainer.appendChild(this.messageElement);

		const actionContainer = $('.chat-status-action');
		this.actionButton = this._register(new Button(actionContainer, {
			...defaultButtonStyles,
			supportIcons: true
		}));
		this.actionButton.element.classList.add('chat-status-button');

		this._register(this.actionButton.onDidClick(async () => {
			const commandId = this.chatEntitlementService.entitlement === ChatEntitlement.Free
				? 'workbench.action.chat.upgradePlan'
				: 'workbench.action.chat.manageOverages';
			await this.commandService.executeCommand(commandId);
		}));

		this.domNode.appendChild(contentContainer);
		this.domNode.appendChild(actionContainer);
	}

	private updateContent(): void {
		if (!this.messageElement || !this.actionButton) {
			return;
		}

		this.messageElement.textContent = localize('chat.quotaExceeded.message', "Free tier chat message limit reached.");
		this.actionButton.label = localize('chat.quotaExceeded.increaseLimit', "Increase Limit");

		this._onDidChangeHeight.fire();
	}
}

// TODO@bhavyaus remove this command after testing complete with team
registerAction2(class ToggleChatQuotaExceededAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.toggleStatusWidget',
			title: localize2('chat.toggleStatusWidget.label', "Toggle Chat Status Widget State"),
			f1: true,
			category: Categories.Developer,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatEntitlementContextKeys.Entitlement.internal),
		});
	}

	run(accessor: ServicesAccessor): void {
		const contextKeyService = accessor.get(IContextKeyService);
		const currentValue = ChatEntitlementContextKeys.chatQuotaExceeded.getValue(contextKeyService) ?? false;
		ChatEntitlementContextKeys.chatQuotaExceeded.bindTo(contextKeyService).set(!currentValue);
	}
});

ChatInputPartWidgetsRegistry.register(
	ChatStatusWidget.ID,
	ChatStatusWidget,
	ContextKeyExpr.and(ChatContextKeys.chatQuotaExceeded, ChatContextKeys.chatSessionIsEmpty)
);
