/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { applyAgentHostCompletionAction } from '../../agentHostCompletionAction.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { applyAgentHostSessionConfigChange } from './applyAgentHostSessionConfig.js';

export interface IApplyAgentHostSubmitConfigServices {
	readonly agentHostService: IAgentHostService;
	readonly provisionalService: IAgentHostUntitledProvisionalSessionService;
	readonly workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver;
	readonly workspaceContextService: IWorkspaceContextService;
	readonly configurationService: IConfigurationService;
	readonly dialogService: IDialogService;
	readonly storageService: IStorageService;
}

export async function applyAgentHostSubmitConfig(
	sessionResource: URI,
	config: Readonly<Record<string, string>>,
	services: IApplyAgentHostSubmitConfigServices,
): Promise<boolean> {
	let applied = false;
	const confirmed = await applyAgentHostCompletionAction({ applyConfig: config }, services.dialogService, services.storageService, async config => {
		applied = await applyAgentHostSessionConfigChange(sessionResource, config, services);
	});
	return confirmed && applied;
}
