/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentsModeWorkspaceService } from '../../configuration/browser/agents/agentsModeWorkspaceService.js';
import { IAgentsModeService } from '../common/agentsMode.js';

/**
 * Switches the window's {@link AgentsModeWorkspaceService} into and out of Agents mode. The window's
 * main creates it together with that workspace and configuration service; windows that can't switch
 * get a `NullAgentsModeService` instead.
 */
export class AgentsModeService implements IAgentsModeService {

	declare readonly _serviceBrand: undefined;

	readonly isSupported = true;

	readonly onWillChange: Event<boolean>;
	readonly onDidChange: Event<boolean>;

	constructor(private readonly workspaceService: AgentsModeWorkspaceService) {
		this.onWillChange = workspaceService.onWillChangeAgentsMode;
		this.onDidChange = workspaceService.onDidChangeAgentsMode;
	}

	get windowFolders(): readonly URI[] {
		return this.workspaceService.windowFolders;
	}

	get isActive(): boolean {
		return this.workspaceService.isAgentsMode;
	}

	setActive(active: boolean, workspaceId?: string): Promise<void> {
		return this.workspaceService.setAgentsMode(active, workspaceId);
	}
}
