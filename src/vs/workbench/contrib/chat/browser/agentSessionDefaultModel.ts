/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ChatConfiguration } from '../common/constants.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { createDefaultModelArrays, DefaultModelContribution } from './defaultModelContribution.js';

const defaultEntryLabel = localize('agentSessionDefaultModel.auto', "Auto (Provider Default)");
const defaultEntryDescription = localize('agentSessionDefaultModel.autoDescription', "Use the agent provider's default model");

const arrays = createDefaultModelArrays(defaultEntryLabel, defaultEntryDescription);

/**
 * Populates the dynamic model enum for the `model` property of the
 * `chat.defaultConfiguration` object setting. Unlike the plan/explore agent
 * model pickers, this includes agent-host models (e.g. Copilot CLI) and stores
 * the bare model `id` so it can be threaded back as a `ModelSelection.id` when
 * creating new agent-host sessions.
 */
export class AgentSessionDefaultModel extends DefaultModelContribution {
	static readonly ID = 'workbench.contrib.agentSessionDefaultModel';

	static readonly modelIds = arrays.modelIds;
	static readonly modelLabels = arrays.modelLabels;
	static readonly modelDescriptions = arrays.modelDescriptions;

	constructor(
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ILogService logService: ILogService,
	) {
		super(arrays, {
			configKey: ChatConfiguration.DefaultConfiguration,
			configSectionId: 'chatSidebar',
			logPrefix: '[AgentSessionDefaultModel]',
			storageFormat: 'id',
			includeAgentHostModels: true,
			// Restrict to agent-host (session-scoped) models so the setting
			// only offers models that apply to agent-host providers and avoids
			// pulling in general chat models.
			filter: metadata => metadata.targetChatSessionType !== undefined,
			defaultEntryLabel,
			defaultEntryDescription,
		}, languageModelsService, logService);
	}
}

registerWorkbenchContribution2(AgentSessionDefaultModel.ID, AgentSessionDefaultModel, WorkbenchPhase.BlockRestore);
