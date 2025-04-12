/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptLinkProvider } from './promptLinkProvider.js';
import { isWindows } from '../../../../../../../base/common/platform.js';
import { PromptPathAutocompletion } from './promptPathAutocompletion.js';
import { Registry } from '../../../../../../../platform/registry/common/platform.js';
import { LifecyclePhase } from '../../../../../../services/lifecycle/common/lifecycle.js';
import { PromptLinkDiagnosticsInstanceManager } from './promptLinkDiagnosticsProvider.js';
import { BrandedService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { PromptDecorationsProviderInstanceManager } from './decorationsProvider/promptDecorationsProvider.js';
import { IWorkbenchContributionsRegistry, Extensions, IWorkbenchContribution } from '../../../../../../common/contributions.js';

/**
 * Whether to enable decorations in the prompt editor.
 */
export const DECORATIONS_ENABLED = false;

/**
 * Register all language features related to reusable prompts files.
 */
export const registerReusablePromptLanguageFeatures = () => {
	registerContribution(PromptLinkProvider);
	registerContribution(PromptLinkDiagnosticsInstanceManager);

	if (DECORATIONS_ENABLED) {
		registerContribution(PromptDecorationsProviderInstanceManager);
	}

	/**
	 * We restrict this provider to `Unix` machines for now because of
	 * the filesystem paths differences on `Windows` operating system.
	 *
	 * Notes on `Windows` support:
	 * 	- we add the `./` for the first path component, which may not work on `Windows`
	 * 	- the first path component of the absolute paths must be a drive letter
	 */
	if (isWindows === false) {
		registerContribution(PromptPathAutocompletion);
	}
};

/**
 * Register a specific workbench contribution.
 */
const registerContribution = <TServices extends BrandedService[]>(
	contribution: new (...services: TServices) => IWorkbenchContribution,
) => {
	Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench)
		.registerWorkbenchContribution(contribution, LifecyclePhase.Eventually);
};
