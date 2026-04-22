/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { createServiceIdentifier } from '../../../util/common/services';
import { IAgentMemoryService } from '../common/agentMemoryService';

export interface IAgentMemoryToolRegistrar {
	readonly _serviceBrand: undefined;
	/**
	 * Called at the start of each new agent conversation. Fetches and caches the
	 * /prompt response so that tool schema and instructions are available for rendering.
	 */
	registerMemoryTools(sessionId?: string): Promise<void>;
}

export const IAgentMemoryToolRegistrar = createServiceIdentifier<IAgentMemoryToolRegistrar>('IAgentMemoryToolRegistrar');

export class AgentMemoryToolRegistrar implements IAgentMemoryToolRegistrar {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IAgentMemoryService private readonly agentMemoryService: IAgentMemoryService,
		@ILogService private readonly logService: ILogService,
	) { }

	async registerMemoryTools(sessionId?: string): Promise<void> {
		const enabled = this.configurationService.getExperimentBasedConfig(ConfigKey.CopilotMemoryEnabled, this.experimentationService);
		if (!enabled) {
			return;
		}
		const response = await this.agentMemoryService.getMemoryPrompt(undefined, sessionId);
		this.logService.info(`[AgentMemoryToolRegistrar] primed memory prompt cache for session ${sessionId || 'default'}, definitionVersion=${response?.storeToolDefinition?.definitionVersion ?? 'none'}`);
	}
}
