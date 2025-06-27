/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigMigration } from './config/configMigration.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchContributionsRegistry, Extensions, IWorkbenchContribution } from '../../../../common/contributions.js';
import { PromptLinkProvider } from './languageProviders/promptLinkProvider.js';
import { PromptLinkDiagnosticsInstanceManager } from './languageProviders/promptLinkDiagnosticsProvider.js';
import { PromptHeaderDiagnosticsInstanceManager } from './languageProviders/promptHeaderDiagnosticsProvider.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { PromptPathAutocompletion } from './languageProviders/promptPathAutocompletion.js';


/**
 * Function that registers all prompt-file related contributions.
 */
export function registerPromptFileContributions(): void {

	// all language constributions

	registerContribution(PromptLinkProvider);
	registerContribution(PromptLinkDiagnosticsInstanceManager);
	registerContribution(PromptHeaderDiagnosticsInstanceManager);
	/**
	 * PromptDecorationsProviderInstanceManager is currently disabled because the only currently
	 * available decoration is the Front Matter header, which we decided to disable for now.
	 * Add it back when more decorations are needed.
	 */
	// registerContribution(PromptDecorationsProviderInstanceManager); ,


	/**
	 * We restrict this provider to `Unix` machines for now because of
	 * the filesystem paths differences on `Windows` operating system.
	 *
	 * Notes on `Windows` support:
	 * 	- we add the `./` for the first path component, which may not work on `Windows`
	 * 	- the first path component of the absolute paths must be a drive letter
	 */
	if (!isWindows) {
		registerContribution(PromptPathAutocompletion);
	}

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
