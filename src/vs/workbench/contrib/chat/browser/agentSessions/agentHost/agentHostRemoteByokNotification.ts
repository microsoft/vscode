/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { localize } from '../../../../../../nls.js';
import { isCopilotAgentHostSessionType, isRemoteAgentHostSessionType, parseAgentHostHarness, parseRemoteAgentHostSessionTypeAuthority } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { PersistentConnectionEventType } from '../../../../../../platform/remote/common/remoteAgentConnection.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatInputNotificationSeverity, IChatInputNotificationContext, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';

const REMOTE_BYOK_NOTIFICATION_ID = 'agentHost.remoteByok';
const REMOTE_BYOK_NOTIFICATION_DISABLED_STORAGE_KEY = 'chat.agentHost.remoteByokNotification.disabled';
const DISABLE_REMOTE_BYOK_NOTIFICATION_COMMAND = 'workbench.action.chat.disableRemoteByokNotification';

export class AgentHostRemoteByokNotificationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostRemoteByokNotification';

	private _shownContext: IChatInputNotificationContext | undefined;
	private _remoteWorkspaceConnected = false;

	constructor(
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IStorageService private readonly _storageService: IStorageService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ILogService logService: ILogService,
	) {
		super();

		if (this._environmentService.isSessionsWindow) {
			return;
		}

		this._register(toDisposable(() => this._notificationService.deleteNotification(REMOTE_BYOK_NOTIFICATION_ID)));
		this._register(CommandsRegistry.registerCommand(DISABLE_REMOTE_BYOK_NOTIFICATION_COMMAND, () => {
			this._storageService.store(REMOTE_BYOK_NOTIFICATION_DISABLED_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
		}));
		this._register(Event.any(
			this._languageModelsService.onDidChangeLanguageModels,
			this._chatEntitlementService.onDidChangeSentiment,
			this._remoteAgentHostService.onDidChangeConnections,
			this._storageService.onDidChangeValue(StorageScope.PROFILE, REMOTE_BYOK_NOTIFICATION_DISABLED_STORAGE_KEY, this._store),
		)(() => this._refresh()));

		const remoteConnection = remoteAgentService.getConnection();
		if (this._environmentService.remoteAuthority && remoteConnection) {
			let connectionStateReceived = false;
			this._register(remoteConnection.onDidStateChange(event => {
				connectionStateReceived = true;
				this._remoteWorkspaceConnected = event.type === PersistentConnectionEventType.ConnectionGain;
				this._refresh();
			}));
			remoteAgentService.getRawEnvironment().then(environment => {
				if (!this._store.isDisposed && !connectionStateReceived) {
					this._remoteWorkspaceConnected = environment !== null;
					this._refresh();
				}
			}, error => logService.warn('[AgentHostRemoteByokNotification] Failed to resolve remote environment', error));
		}

		this._notificationService.setNotification({
			id: REMOTE_BYOK_NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Warning,
			message: localize('agentHost.remoteByok.message', "Bring your own key (BYOK) models aren't supported in remote Copilot sessions."),
			description: localize('agentHost.remoteByok.description', "Use a GitHub Copilot model for this session, or switch to the local agent harness to use your own models."),
			actions: [],
			when: context => this._isEligible(context),
			onDidShow: context => {
				if (!this._shownContext && context) {
					this._shownContext = context;
					this._notificationService.refresh();
				}
			},
			dismissible: true,
			autoDismissOnMessage: false,
			mute: {
				commandId: DISABLE_REMOTE_BYOK_NOTIFICATION_COMMAND,
				tooltip: localize('agentHost.remoteByok.dontShowAgain', "Don't Show Again"),
			},
		});
	}

	private _refresh(): void {
		if (this._shownContext && !this._isEligible(this._shownContext)) {
			this._notificationService.dismissNotification(REMOTE_BYOK_NOTIFICATION_ID);
		}
		this._notificationService.refresh();
	}

	private _isEligible(context: IChatInputNotificationContext): boolean {
		if (!context.sessionType || !isCopilotAgentHostSessionType(context.sessionType)
			|| this._chatEntitlementService.sentiment.hidden
			|| this._storageService.getBoolean(REMOTE_BYOK_NOTIFICATION_DISABLED_STORAGE_KEY, StorageScope.PROFILE, false)) {
			return false;
		}
		if (this._shownContext && (
			!isEqual(this._shownContext.inputUri, context.inputUri)
			|| !isEqual(this._shownContext.sessionResource, context.sessionResource)
			|| this._shownContext.sessionType !== context.sessionType
		)) {
			return false;
		}
		const hasByokModels = this._languageModelsService.getLanguageModelIds().some(id => {
			const model = this._languageModelsService.lookupLanguageModel(id);
			return model?.isBYOK && !model.targetChatSessionType && this._languageModelsService.hasResolvedVendor(model.vendor);
		});
		if (!hasByokModels) {
			return false;
		}
		if (isRemoteAgentHostSessionType(context.sessionType)) {
			const provider = parseAgentHostHarness(context.sessionType);
			const authority = provider && parseRemoteAgentHostSessionTypeAuthority(context.sessionType, provider);
			return this._remoteAgentHostService.connections.some(connection =>
				agentHostAuthority(connection.address) === authority && RemoteAgentHostConnectionStatus.isConnected(connection.status));
		}
		return this._remoteWorkspaceConnected;
	}
}
