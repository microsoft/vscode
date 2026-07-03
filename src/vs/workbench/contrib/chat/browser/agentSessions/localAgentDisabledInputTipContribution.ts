/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IChatSessionsService, localChatSessionType, SessionType } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IChatWidget, IChatWidgetService, isIChatResourceViewContext } from '../chat.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from '../widget/input/chatInputNotificationService.js';

const LOCAL_AGENT_DISABLED_NOTIFICATION_ID = 'chat.localAgentDisabled.continueInAgentHostCopilot';
export const LOCAL_AGENT_DISABLED_MUTE_STORAGE_KEY = 'chat.localAgentDisabled.continueInAgentHostCopilot.muted';
export const LOCAL_AGENT_DISABLED_CONTINUE_IN_AGENT_HOST_COPILOT_COMMAND_ID = '_chat.localAgentDisabled.continueInAgentHostCopilot';
export const LOCAL_AGENT_DISABLED_MUTE_CONTINUE_IN_AGENT_HOST_COPILOT_COMMAND_ID = '_chat.localAgentDisabled.muteContinueInAgentHostCopilot';

CommandsRegistry.registerCommand(LOCAL_AGENT_DISABLED_CONTINUE_IN_AGENT_HOST_COPILOT_COMMAND_ID, async (accessor: ServicesAccessor) => {
	const chatWidgetService = accessor.get(IChatWidgetService);
	const chatSessionsService = accessor.get(IChatSessionsService);
	const notificationService = accessor.get(IChatInputNotificationService);
	const widget = chatWidgetService.lastFocusedWidget;
	if (!widget || !chatSessionsService.getChatSessionContribution(SessionType.AgentHostCopilot)) {
		return;
	}

	widget.input.continueInSession(SessionType.AgentHostCopilot);
	notificationService.dismissNotification(LOCAL_AGENT_DISABLED_NOTIFICATION_ID);
});

CommandsRegistry.registerCommand(LOCAL_AGENT_DISABLED_MUTE_CONTINUE_IN_AGENT_HOST_COPILOT_COMMAND_ID, (accessor: ServicesAccessor) => {
	const storageService = accessor.get(IStorageService);

	storageService.store(LOCAL_AGENT_DISABLED_MUTE_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
});

export class LocalAgentDisabledInputTipContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.localAgentDisabledInputTip';

	private _lastPostedFor: string | undefined;
	private _dismissedForWindow = false;

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatInputNotificationService private readonly notificationService: IChatInputNotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IStorageService private readonly storageService: IStorageService,
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
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, LOCAL_AGENT_DISABLED_MUTE_STORAGE_KEY, this._store)(() => {
			this.update(true);
		}));
		this._register(this.notificationService.onDidDismiss(id => {
			if (id === LOCAL_AGENT_DISABLED_NOTIFICATION_ID) {
				this.dismissForWindow();
			}
		}));

		this.update();
	}

	private update(resetDismissal = false): void {
		if (this.isMuted() || this._dismissedForWindow) {
			this.clear();
			return;
		}

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
			id: LOCAL_AGENT_DISABLED_NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message: localize('chat.localAgentDisabled.continueInAgentHostCopilot.message', "Continue using the agent host."),
			description: localize('chat.localAgentDisabled.continueInAgentHostCopilot.description', "You can bring your local harness history into a new chat with the agent host. To keep using the local harness instead and hide this notification, set \"chat.editor.localAgent.enabled\" to true."),
			actions: [{
				label: localize('chat.localAgentDisabled.continueInAgentHostCopilot.action', "Continue In Agent Host"),
				commandId: LOCAL_AGENT_DISABLED_CONTINUE_IN_AGENT_HOST_COPILOT_COMMAND_ID,
			}],
			dismissible: true,
			autoDismissOnMessage: false,
			mute: {
				commandId: LOCAL_AGENT_DISABLED_MUTE_CONTINUE_IN_AGENT_HOST_COPILOT_COMMAND_ID,
				tooltip: localize('chat.localAgentDisabled.continueInAgentHostCopilot.mute', "Don't Show Again"),
			},
			sessionTypes: [localChatSessionType],
		});
	}

	private isMuted(): boolean {
		return this.storageService.getBoolean(LOCAL_AGENT_DISABLED_MUTE_STORAGE_KEY, StorageScope.PROFILE, false);
	}

	private dismissForWindow(): void {
		if (this._dismissedForWindow) {
			return;
		}
		this._dismissedForWindow = true;
		this.clear();
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
		this.notificationService.deleteNotification(LOCAL_AGENT_DISABLED_NOTIFICATION_ID);
	}
}
