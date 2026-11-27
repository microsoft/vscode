/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentsModeWorkspaceService } from '../../configuration/browser/agents/agentsModeWorkspaceService.js';
import { IWorkbenchConfigurationService } from '../../configuration/common/configuration.js';
import { IAgentsModeService } from '../common/agentsMode.js';

/**
 * Switches the window's {@link AgentsModeWorkspaceService} into and out of
 * Agents mode. Windows whose workspace and configuration service can't switch
 * (web, remote, the Agents window, and windows with a folder unless the user opted in) don't support the mode.
 */
export class AgentsModeService implements IAgentsModeService {

	declare readonly _serviceBrand: undefined;

	private readonly workspaceService: AgentsModeWorkspaceService | undefined;

	readonly onDidChange: Event<boolean>;

	constructor(
		@IWorkbenchConfigurationService configurationService: IWorkbenchConfigurationService,
	) {
		this.workspaceService = configurationService instanceof AgentsModeWorkspaceService ? configurationService : undefined;
		this.onDidChange = this.workspaceService?.onDidChangeAgentsMode ?? Event.None;
	}

	get isSupported(): boolean {
		return !!this.workspaceService;
	}

	get windowFolders(): readonly URI[] {
		return this.workspaceService?.windowFolders ?? [];
	}

	get isActive(): boolean {
		return !!this.workspaceService?.isAgentsMode;
	}

	async setActive(active: boolean, workspaceId?: string): Promise<void> {
		if (!this.workspaceService) {
			return;
		}
		await this.workspaceService.setAgentsMode(active, workspaceId);
	}
}
