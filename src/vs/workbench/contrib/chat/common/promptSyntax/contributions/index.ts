/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LANGUAGE_FEATURE_CONTRIBUTIONS } from './languageFeatures/index.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContributionsRegistry, Extensions, IWorkbenchContribution } from '../../../../../common/contributions.js';

/**
 * TODO: @legomushroom
 */
export const registerPromptFileContributions = () => {
	registerContributions(LANGUAGE_FEATURE_CONTRIBUTIONS);

	// TODO: @legomushroom
	registerContribution(ConfigMigrationContribution);
};

/**
 * TODO: @legomushroom
 */
class ConfigMigrationContribution implements IWorkbenchContribution {
	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
	) {
		PromptsConfig.migrateOldSetting(this.configService);
	}
}

/**
 * TODO: @legomushroom
 */
export type TContribution = new (...args: any[]) => IWorkbenchContribution;

/**
 * Register a specific workbench contribution.
 */
const registerContribution = (
	contribution: TContribution,
) => {
	Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench)
		.registerWorkbenchContribution(contribution, LifecyclePhase.Eventually);
};

/**
 * Register a specific workbench contribution.
 */
const registerContributions = (
	contributions: readonly TContribution[],
) => {
	contributions
		.map(registerContribution);
};
