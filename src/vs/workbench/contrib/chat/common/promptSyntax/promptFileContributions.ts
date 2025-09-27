/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigMigration } from './config/configMigration.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchContributionsRegistry, Extensions, IWorkbenchContribution } from '../../../../common/contributions.js';
import { PromptLinkProvider } from './languageProviders/promptLinkProvider.js';
import { PromptBodyAutocompletion } from './languageProviders/promptBodyAutocompletion.js';
import { PromptHeaderAutocompletion } from './languageProviders/promptHeaderAutocompletion.js';
import { PromptHoverProvider } from './languageProviders/promptHovers.js';
import { PromptHeaderDefinitionProvider } from './languageProviders/PromptHeaderDefinitionProvider.js';
import { PromptValidatorContribution } from './service/promptValidator.js';
import { PromptDocumentSemanticTokensProvider } from './languageProviders/promptDocumentSemanticTokensProvider.js';
import { PromptCodeActionProvider } from './languageProviders/promptCodeActions.js';


/**
 * Function that registers all prompt-file related contributions.
 */
export function registerPromptFileContributions(): void {

	// all language constributions

	registerContribution(PromptLinkProvider);
	registerContribution(PromptValidatorContribution);

	registerContribution(PromptBodyAutocompletion);
	registerContribution(PromptHeaderAutocompletion);
	registerContribution(PromptHoverProvider);
	registerContribution(PromptHeaderDefinitionProvider);
	registerContribution(PromptDocumentSemanticTokensProvider);
	registerContribution(PromptCodeActionProvider);
	registerContribution(ConfigMigration);
}

/**
 * Type for a generic workbench contribution.
 */
export type TContribution = new (...args: any[]) => IWorkbenchContribution;

/**
 * Register a specific workbench contribution.
 */
function registerContribution(contribution: TContribution): void {
	Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(contribution, LifecyclePhase.Eventually);
}
