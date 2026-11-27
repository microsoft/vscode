/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWorkbenchConfigurationService } from '../../configuration/common/configuration.js';
import { AgentsModeService } from '../browser/agentsModeService.js';
import { IAgentsModeService } from '../common/agentsMode.js';

/**
 * Also tells main whether the window is in Agents mode, so that main
 * restores the window in the same mode after a reload or a restart.
 */
export class NativeAgentsModeService extends AgentsModeService {

	constructor(
		@IWorkbenchConfigurationService configurationService: IWorkbenchConfigurationService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) {
		super(configurationService);
	}

	override async setActive(active: boolean, workspaceId?: string): Promise<void> {
		await super.setActive(active, workspaceId);
		if (this.isSupported) {
			await this.nativeHostService.setWindowAgentsMode(this.isActive);
		}
	}
}

registerSingleton(IAgentsModeService, NativeAgentsModeService, InstantiationType.Delayed);
