/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IChatSessionsService, localChatSessionType, SessionType } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IChatWidget, IChatWidgetService, isIChatResourceViewContext } from '../chat.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from '../widget/input/chatInputNotificationService.js';

export class LocalAgentDisabledInputTipContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.localAgentDisabledInputTip';

	private static readonly NOTIFICATION_ID = 'chat.localAgentDisabled.continueInAgentHostCopilot';

	private _lastPostedFor: string | undefined;

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatInputNotificationService private readonly notificationService: IChatInputNotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		this._register(this.chatWidgetService.onDidChangeFocusedSession(() => this.update()));
		this._register(this.chatWidgetService.onDidAddWidget(() => this.update()));
		this._register(this.chatSessionsService.onDidChangeAvailability(() => this.update()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.EditorLocalAgentEnabled) || e.affectsConfiguration(ChatConfiguration.EditorDefaultProvider)) {
				this.update(true);
			}
		}));

		this.update();
	}

	private update(resetDismissal = false): void {
		const widget = this.chatWidgetService.lastFocusedWidget;
		const sessionResource = widget?.viewModel?.sessionResource;
		const key = sessionResource?.toString();

		if (!widget || !sessionResource || !this.isEligible(widget)) {
			this.clear();
			return;
		}

		if (!resetDismissal && this._lastPostedFor === key) {
			return;
		}

		this._lastPostedFor = key;
		this.notificationService.setNotification({
			id: LocalAgentDisabledInputTipContribution.NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message: localize('chat.localAgentDisabled.continueInAgentHostCopilot.message', "Copilot CLI [Agent Host] can continue with this local chat history."),
			description: localize('chat.localAgentDisabled.continueInAgentHostCopilot.description', "Use Continue In to move this local harness history to Copilot CLI [Agent Host]. To keep using local and turn off this notification, set \"chat.editor.localAgent.enabled\" to true."),
			actions: [],
			dismissible: true,
			autoDismissOnMessage: false,
			sessionTypes: [localChatSessionType],
		});
	}

	private isEligible(widget: IChatWidget): boolean {
		const model = widget.viewModel?.model;
		const sessionResource = widget.viewModel?.sessionResource;
		return !!model
			&& !!sessionResource
			&& getChatSessionType(sessionResource) === localChatSessionType
			&& model.hasRequests
			&& this.configurationService.getValue<boolean>(ChatConfiguration.EditorLocalAgentEnabled) === false
			&& this.configurationService.getValue<string>(ChatConfiguration.EditorDefaultProvider) === 'copilotAh'
			&& !!this.chatSessionsService.getChatSessionContribution(SessionType.AgentHostCopilot)
			&& !this.isQuickOrInlineChat(widget)
			&& !IsSessionsWindowContext.getValue(widget.scopedContextKeyService);
	}

	private isQuickOrInlineChat(widget: IChatWidget): boolean {
		return isIChatResourceViewContext(widget.viewContext)
			&& (Boolean(widget.viewContext.isQuickChat) || Boolean(widget.viewContext.isInlineChat));
	}

	private clear(): void {
		if (!this._lastPostedFor) {
			return;
		}
		this._lastPostedFor = undefined;
		this.notificationService.deleteNotification(LocalAgentDisabledInputTipContribution.NOTIFICATION_ID);
	}
}
