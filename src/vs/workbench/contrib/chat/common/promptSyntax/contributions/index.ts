/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigMigration } from './configMigration.js';
import { LANGUAGE_FEATURE_CONTRIBUTIONS } from './languageFeatures/index.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchContributionsRegistry, Extensions, IWorkbenchContribution } from '../../../../../common/contributions.js';

/**
 * Function that registers all prompt-file related contributions.
 */
export const registerPromptFileContributions = (): void => {
	registerContributions(LANGUAGE_FEATURE_CONTRIBUTIONS);
	registerContribution(ConfigMigration);
};

/**
 * Type for a generic workbench contribution.
 */
export type TContribution = new (...args: any[]) => IWorkbenchContribution;

/**
 * Register a specific workbench contribution.
 */
const registerContribution = (contribution: TContribution): void => {
	Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench)
		.registerWorkbenchContribution(contribution, LifecyclePhase.Eventually);
};

/**
 * Register a specific workbench contribution.
 */
const registerContributions = (contributions: readonly TContribution[]): void => {
	contributions
		.forEach(registerContribution);
};
