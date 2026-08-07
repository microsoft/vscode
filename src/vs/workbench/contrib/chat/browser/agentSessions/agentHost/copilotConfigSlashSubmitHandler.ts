/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { parseLeadingSlashCommand } from '../../../../../../platform/agentHost/common/agentHostSlashCommand.js';
import { resolveCopilotConfigSlashCommandOnSend } from '../../../../../../platform/agentHost/common/copilotConfigSlashCommands.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IChatSubmitRequestHandlerService, type IChatSubmitRequest } from '../../chatSubmitRequestHandlerService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { applyAgentHostSubmitConfig } from './applyAgentHostSubmitConfig.js';

export interface ICopilotConfigSlashSubmitResolution {
	readonly applyConfig: Readonly<Record<string, string>>;
	readonly strippedPrompt: string;
}

/** Resolves a typed Copilot config slash command into a config change. */
export function resolveCopilotConfigSlashSubmit(input: string): ICopilotConfigSlashSubmitResolution | undefined {
	const slashCommand = parseLeadingSlashCommand(input);
	return slashCommand ? resolveCopilotConfigSlashCommandOnSend(slashCommand.command, slashCommand.rawRest) : undefined;
}

export class CopilotConfigSlashSubmitHandlerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.copilotConfigSlashSubmitHandler';

	constructor(
		@IChatSubmitRequestHandlerService submitRequestHandlerService: IChatSubmitRequestHandlerService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisionalService: IAgentHostUntitledProvisionalSessionService,
		@IAgentHostSessionWorkingDirectoryResolver private readonly _workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._register(submitRequestHandlerService.register({
			id: 'copilot.configSlash',
			tryHandle: request => this._tryHandle(request),
		}));
	}

	private async _tryHandle(request: IChatSubmitRequest): Promise<boolean> {
		if (getChatSessionType(request.sessionResource) !== SessionType.AgentHostCopilot) {
			return false;
		}
		const configAction = resolveCopilotConfigSlashSubmit(request.input);
		if (!configAction) {
			return false;
		}
		await applyAgentHostSubmitConfig(request.sessionResource, configAction.applyConfig, {
			agentHostService: this._agentHostService,
			provisionalService: this._provisionalService,
			workingDirectoryResolver: this._workingDirectoryResolver,
			workspaceContextService: this._workspaceContextService,
			configurationService: this._configurationService,
			dialogService: this._dialogService,
			storageService: this._storageService,
		});
		return !configAction.strippedPrompt;
	}
}
