/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { localize } from '../../../../nls.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ChatConfiguration } from '../common/constants.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { createDefaultModelArrays, DefaultModelContribution } from './defaultModelContribution.js';

// The empty value for these settings means "use the built-in utility-family
// default" (i.e. whatever the copilot-utility / copilot-utility-small family
// resolves to via CAPI), not a vendor-specific default. Use setting-specific
// copy so the Settings UI doesn't say "Auto (Vendor Default)".
const defaultEntryLabel = localize('chat.utilityModel.defaultEntry.label', 'Default');
const defaultEntryDescription = localize('chat.utilityModel.defaultEntry.description', "Use the built-in default utility model");

const utilityArrays = createDefaultModelArrays(defaultEntryLabel, defaultEntryDescription);
const utilitySmallArrays = createDefaultModelArrays(defaultEntryLabel, defaultEntryDescription);

/**
 * Populates the dynamic enum of language models for the `chat.utilityModel`
 * setting. Selecting a model here overrides the internal `copilot-utility`
 * family used for general background/fallback flows (titles, summaries, etc.).
 */
export class UtilityModelContribution extends DefaultModelContribution {
	static readonly ID = 'workbench.contrib.utilityModel';

	static readonly modelIds = utilityArrays.modelIds;
	static readonly modelLabels = utilityArrays.modelLabels;
	static readonly modelDescriptions = utilityArrays.modelDescriptions;

	constructor(
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ILogService logService: ILogService,
	) {
		super(utilityArrays, {
			configKey: ChatConfiguration.UtilityModel,
			configSectionId: 'chatSidebar',
			logPrefix: '[UtilityModel]',
			storageFormat: 'vendorAndId',
			defaultEntryLabel,
			defaultEntryDescription,
		}, languageModelsService, logService);
	}
}

/**
 * Populates the dynamic enum of language models for the
 * `chat.utilitySmallModel` setting. Selecting a model here overrides the
 * internal `copilot-utility-small` family used for fast/cheap background
 * flows (commit messages, intent detection, inline-chat progress, etc.).
 */
export class UtilitySmallModelContribution extends DefaultModelContribution {
	static readonly ID = 'workbench.contrib.utilitySmallModel';

	static readonly modelIds = utilitySmallArrays.modelIds;
	static readonly modelLabels = utilitySmallArrays.modelLabels;
	static readonly modelDescriptions = utilitySmallArrays.modelDescriptions;

	constructor(
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ILogService logService: ILogService,
	) {
		super(utilitySmallArrays, {
			configKey: ChatConfiguration.UtilitySmallModel,
			configSectionId: 'chatSidebar',
			logPrefix: '[UtilitySmallModel]',
			storageFormat: 'vendorAndId',
			defaultEntryLabel,
			defaultEntryDescription,
		}, languageModelsService, logService);
	}
}

registerWorkbenchContribution2(UtilityModelContribution.ID, UtilityModelContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(UtilitySmallModelContribution.ID, UtilitySmallModelContribution, WorkbenchPhase.BlockRestore);
