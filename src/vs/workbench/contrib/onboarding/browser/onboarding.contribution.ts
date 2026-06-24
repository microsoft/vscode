/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { onboardingPresentationRegistry } from '../common/onboardingPresentation.js';
import { IOnboardingScenarioService, ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_ENABLED_CONFIG } from '../common/onboardingScenarioService.js';
import { OnboardingScenarioService } from './onboardingService.js';
import { SpotlightPresentation } from './spotlight/spotlightPresentation.js';

registerSingleton(IOnboardingScenarioService, OnboardingScenarioService, InstantiationType.Delayed);

/**
 * Boots the onboarding engine after the workbench has restored: registers the
 * built-in presentations and starts evaluating registered scenarios.
 */
class OnboardingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.onboarding';

	constructor(
		@IOnboardingScenarioService onboardingService: IOnboardingScenarioService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const spotlight = this._register(instantiationService.createInstance(SpotlightPresentation));
		this._register(onboardingPresentationRegistry.register(spotlight));
		onboardingService.start();
	}
}

registerWorkbenchContribution2(OnboardingContribution.ID, OnboardingContribution, WorkbenchPhase.AfterRestored);

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[ONBOARDING_ENABLED_CONFIG]: {
			type: 'boolean',
			default: false,
			description: localize('onboarding.enabled', "When enabled, onboarding tours and hints may appear automatically to highlight features. Disabling this does not affect tours you start manually.")
		},
		[ONBOARDING_DEVELOPER_MODE_CONFIG]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			description: localize('onboarding.developerMode', "When enabled, onboarding tours ignore usage-based eligibility checks (such as how many sessions you have started) and previously persisted shown state so they can be replayed once per window session for testing.")
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.onboarding.resetShownState',
			title: localize2('onboarding.resetShownState', "Reset Onboarding Shown State"),
			category: Categories.Developer,
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IOnboardingScenarioService).resetAll();
	}
});
