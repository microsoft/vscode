/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationNode, IConfigurationPropertySchema, IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { onboardingPresentationRegistry } from '../common/onboardingPresentation.js';
import { onboardingScenarioRegistry } from '../common/onboardingRegistry.js';
import { IOnboardingScenarioService, ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_ENABLED_CONFIG } from '../common/onboardingScenarioService.js';
import { OnboardingScenarioService } from './onboardingService.js';
import { SpotlightPresentation } from './spotlight/spotlightPresentation.js';

registerSingleton(IOnboardingScenarioService, OnboardingScenarioService, InstantiationType.Delayed);

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

/**
 * Builds the configuration node for the developer-mode setting. The setting is a
 * map of scenario/tour id to boolean; the default lists every currently
 * registered scenario id set to `false` so the available ids are discoverable
 * (and individually toggleable) in the settings editor.
 */
function buildDeveloperModeConfigurationNode(): IConfigurationNode {
	const properties: IStringDictionary<IConfigurationPropertySchema> = {};
	const defaultValue: IStringDictionary<boolean> = {};
	for (const id of onboardingScenarioRegistry.getScenarios().map(scenario => scenario.id).sort()) {
		properties[id] = { type: 'boolean', default: false };
		defaultValue[id] = false;
	}
	return {
		...workbenchConfigurationNodeBase,
		properties: {
			[ONBOARDING_DEVELOPER_MODE_CONFIG]: {
				type: 'object',
				default: defaultValue,
				properties,
				additionalProperties: { type: 'boolean' },
				tags: ['experimental'],
				description: localize('onboarding.developerMode', "Map of onboarding scenario/tour id to whether developer mode is enabled for it. When enabled for a scenario, that onboarding tour ignores usage-based eligibility checks (such as how many sessions you have started) and previously persisted shown state. The tour is still shown at most once per window session, so reload the window to show it again.")
			}
		}
	};
}

let developerModeConfigurationNode = buildDeveloperModeConfigurationNode();

configurationRegistry.registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[ONBOARDING_ENABLED_CONFIG]: {
			type: 'boolean',
			default: false,
			description: localize('onboarding.enabled', "When enabled, onboarding tours and hints may appear automatically to highlight features. Disabling this does not affect tours you start manually.")
		}
	}
});
configurationRegistry.registerConfiguration(developerModeConfigurationNode);

/**
 * Re-registers the developer-mode setting so its default value and per-scenario
 * properties reflect the currently registered scenarios.
 */
function refreshDeveloperModeConfiguration(): void {
	const next = buildDeveloperModeConfigurationNode();
	configurationRegistry.updateConfigurations({ add: [next], remove: [developerModeConfigurationNode] });
	developerModeConfigurationNode = next;
}

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
		// Keep the developer-mode setting's default ids in sync with the scenarios
		// registered so far (and any registered later, e.g. session tours).
		refreshDeveloperModeConfiguration();
		this._register(onboardingScenarioRegistry.onDidChange(() => refreshDeveloperModeConfiguration()));
		const spotlight = this._register(instantiationService.createInstance(SpotlightPresentation));
		this._register(onboardingPresentationRegistry.register(spotlight));
		onboardingService.start();
	}
}

registerWorkbenchContribution2(OnboardingContribution.ID, OnboardingContribution, WorkbenchPhase.AfterRestored);

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
