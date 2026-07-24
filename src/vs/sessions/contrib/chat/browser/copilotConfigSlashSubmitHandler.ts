/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { parseLeadingSlashCommand } from '../../../../platform/agentHost/common/agentHostSlashCommand.js';
import { resolveCopilotConfigSlashCommandOnSend } from '../../../../platform/agentHost/common/copilotConfigSlashCommands.js';
import { IChatSubmitRequestHandlerService, type IChatSubmitRequest } from '../../../../workbench/contrib/chat/browser/chatSubmitRequestHandlerService.js';
import { applyAgentHostCompletionAction } from '../../../../workbench/contrib/chat/browser/agentHostCompletionAction.js';
import { SessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class SessionsCopilotConfigSlashSubmitHandlerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.chat.copilotConfigSlashSubmitHandler';

	constructor(
		@IChatSubmitRequestHandlerService submitRequestHandlerService: IChatSubmitRequestHandlerService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._register(submitRequestHandlerService.register({
			id: 'sessions.copilot.configSlash',
			tryHandle: request => this._tryHandle(request),
		}));
	}

	private async _tryHandle(request: IChatSubmitRequest): Promise<boolean> {
		if (getChatSessionType(request.sessionResource) !== SessionType.AgentHostCopilot) {
			return false;
		}
		const slashCommand = parseLeadingSlashCommand(request.input);
		const configAction = slashCommand ? resolveCopilotConfigSlashCommandOnSend(slashCommand.command, slashCommand.rawRest) : undefined;
		if (!configAction) {
			return false;
		}
		const session = this._sessionsManagementService.getSession(request.sessionResource);
		const providerId = session?.providerId ?? request.providerId;
		const sessionId = session?.sessionId ?? request.sessionId;
		if (!providerId || !sessionId) {
			return false;
		}
		const provider = this._sessionsProvidersService.getProvider(providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return false;
		}
		await applyAgentHostCompletionAction({ applyConfig: configAction.applyConfig }, this._dialogService, this._storageService, async config => {
			await Promise.all(Object.entries(config).map(([key, value]) => provider.setSessionConfigValue(sessionId, key, value)));
		});
		return !configAction.strippedPrompt;
	}
}
