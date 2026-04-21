/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { createServiceIdentifier } from '../../../util/common/services';
import type { MemoryPromptResponse } from '../common/agentMemoryService';

export interface IAgentMemoryToolRegistrar {
	readonly _serviceBrand: undefined;
	/**
	 * Called at the start of each new agent conversation. Logs enablement state.
	 * Tool registration itself is handled statically via package.json.
	 */
	registerMemoryTools(promptResponse?: MemoryPromptResponse): Promise<void>;
}

export const IAgentMemoryToolRegistrar = createServiceIdentifier<IAgentMemoryToolRegistrar>('IAgentMemoryToolRegistrar');

export class AgentMemoryToolRegistrar implements IAgentMemoryToolRegistrar {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@ILogService private readonly logService: ILogService,
	) { }

	async registerMemoryTools(_promptResponse?: MemoryPromptResponse): Promise<void> {
		const enabled = this.configurationService.getExperimentBasedConfig(ConfigKey.CopilotMemoryEnabled, this.experimentationService);
		this.logService.info(`[AgentMemoryToolRegistrar] registerMemoryTools called, enabled=${enabled}`);
	}
}
