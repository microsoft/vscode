/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { createServiceIdentifier } from '../../../util/common/services';
import { IAgentMemoryService } from '../common/agentMemoryService';

export interface IAgentMemoryCachePrimer {
	readonly _serviceBrand: undefined;
	/**
	 * Called at the start of each new agent conversation. Fetches and caches the
	 * /prompt response so that tool schema and instructions are available for rendering.
	 */
	primeCache(sessionId?: string): Promise<void>;
}

export const IAgentMemoryCachePrimer = createServiceIdentifier<IAgentMemoryCachePrimer>('IAgentMemoryCachePrimer');

export class AgentMemoryCachePrimer implements IAgentMemoryCachePrimer {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IAgentMemoryService private readonly agentMemoryService: IAgentMemoryService,
		@ILogService private readonly logService: ILogService,
	) { }

	async primeCache(sessionId?: string): Promise<void> {
		const enabled = this.configurationService.getExperimentBasedConfig(ConfigKey.CopilotMemoryEnabled, this.experimentationService);
		if (!enabled) {
			return;
		}
		// Call with sessionId but let service auto-determine repoNwo to match original working behavior
		const response = await this.agentMemoryService.getMemoryPrompt(undefined, sessionId);
		if (!sessionId) {
			this.logService.debug('[AgentMemoryCachePrimer] fetched memory prompt without caching because no sessionId was provided');
			return;
		}
		if (!response) {
			this.logService.debug(`[AgentMemoryCachePrimer] did not prime memory prompt cache for session ${sessionId} because no prompt response was returned`);
			return;
		}
		this.logService.info(`[AgentMemoryCachePrimer] primed memory prompt cache for session ${sessionId}, definitionVersion=${response.storeToolDefinition?.definitionVersion ?? 'none'}`);
	}
}
