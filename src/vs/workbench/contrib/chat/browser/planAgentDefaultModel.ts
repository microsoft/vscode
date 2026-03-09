/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ChatConfiguration } from '../common/constants.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { createDefaultModelArrays, DefaultModelContribution } from './defaultModelContribution.js';

const arrays = createDefaultModelArrays();

export class PlanAgentDefaultModel extends DefaultModelContribution {
	static readonly ID = 'workbench.contrib.planAgentDefaultModel';

	static readonly modelIds = arrays.modelIds;
	static readonly modelLabels = arrays.modelLabels;
	static readonly modelDescriptions = arrays.modelDescriptions;

	constructor(
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ILogService logService: ILogService,
	) {
		super(arrays, {
			configKey: ChatConfiguration.PlanAgentDefaultModel,
			configSectionId: 'chatSidebar',
			logPrefix: '[PlanAgentDefaultModel]',
			filter: metadata => !!metadata.capabilities?.toolCalling,
		}, languageModelsService, logService);
	}
}

registerWorkbenchContribution2(PlanAgentDefaultModel.ID, PlanAgentDefaultModel, WorkbenchPhase.BlockRestore);
