/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { localize } from '../../../../nls.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ChatConfiguration } from '../common/constants.js';
import { COPILOT_VENDOR_ID, ILanguageModelsService } from '../common/languageModels.js';
import { createDefaultModelArrays, DefaultModelContribution } from './defaultModelContribution.js';

const defaultEntryLabel = localize('chat.riskAssessmentModel.defaultEntry.label', 'Default');
const defaultEntryDescription = localize('chat.riskAssessmentModel.defaultEntry.description', "Use the built-in default risk assessment model");

const modelArrays = createDefaultModelArrays(defaultEntryLabel, defaultEntryDescription);

/**
 * Populates the dynamic enum of language models for the `chat.tools.riskAssessment.model`
 * setting.
 */
export class RiskAssessmentModelContribution extends DefaultModelContribution {
	static readonly ID = 'workbench.contrib.riskAssessmentModel';

	static readonly modelIds = modelArrays.modelIds;
	static readonly modelLabels = modelArrays.modelLabels;
	static readonly modelDescriptions = modelArrays.modelDescriptions;

	constructor(
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ILogService logService: ILogService,
	) {
		super(modelArrays, {
			configKey: ChatConfiguration.ToolRiskAssessmentModel,
			configSectionId: 'chatSidebar',
			logPrefix: '[RiskAssessmentModel]',
			filter: metadata => metadata.vendor !== COPILOT_VENDOR_ID,
			storageFormat: 'vendorAndId',
			defaultEntryLabel,
			defaultEntryDescription,
		}, languageModelsService, logService);
	}
}

registerWorkbenchContribution2(RiskAssessmentModelContribution.ID, RiskAssessmentModelContribution, WorkbenchPhase.BlockRestore);
