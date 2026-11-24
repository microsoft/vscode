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
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { onboardingPresentationRegistry } from '../common/onboardingPresentation.js';
import { onboardingScenarioRegistry } from '../common/onboardingRegistry.js';
import { onboardingSequenceStepPresentationRegistry } from '../common/onboardingSequence.js';
import { IOnboardingScenarioService, ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG, ONBOARDING_ENABLED_CONFIG } from '../common/onboardingScenarioService.js';
import { OnboardingScenarioService } from './onboardingService.js';
import { RunOnboardingStepPresentation } from './sequence/runOnboardingStep.js';
import { OnboardingSequencePresentation } from './sequence/sequencePresentation.js';
import { SpotlightPresentation } from './spotlight/spotlightPresentation.js';
import { SPOTLIGHT_BACKDROP_CONFIG, SPOTLIGHT_CLOSE_BUTTON_CONFIG } from './spotlight/spotlightTypes.js';
import './onboardingTryout.contribution.js';

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
	const variationProperties: IStringDictionary<IConfigurationPropertySchema> = {};
	const variationDefaultValue: IStringDictionary<string> = {};
	for (const scenario of [...onboardingScenarioRegistry.getScenarioDescriptors()].sort((a, b) => a.id.localeCompare(b.id))) {
		if (scenario.tryout) {
			continue;
		}
		properties[scenario.id] = { type: 'boolean', default: false };
		defaultValue[scenario.id] = false;
		if (scenario.developerModeVariations?.length) {
			variationProperties[scenario.id] = {
				type: 'string',
				default: '',
				enum: ['', ...scenario.developerModeVariations],
			};
			variationDefaultValue[scenario.id] = '';
		}
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
				description: localize('onboarding.developerMode', "Map of onboarding scenario/tour id to whether developer mode is enabled for it. When enabled for a scenario, that onboarding tour ignores usage-based eligibility checks (such as how many sessions you have started), previously persisted shown state, and any linked experiment (so it is shown even if the experiment is not running or you are in the control group). It does not override the {0} setting. The tour is still shown at most once per window session, so reload the window to show it again.", `\`#${ONBOARDING_ENABLED_CONFIG}#\``)
			},
			[ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG]: {
				type: 'object',
				default: variationDefaultValue,
				properties: variationProperties,
				additionalProperties: { type: 'string' },
				tags: ['experimental'],
				description: localize('onboarding.developerModeVariations', "Map of onboarding scenario/tour id to the variation used while developer mode is enabled for that scenario. An empty value uses the experiment-selected or default variation.")
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
			default: true,
			description: localize('onboarding.enabled', "When enabled, onboarding tours and hints may appear automatically to highlight features. Disabling this does not affect tours you start manually.")
		},
		[SPOTLIGHT_BACKDROP_CONFIG]: {
			type: 'boolean',
			default: product.quality !== 'insider',
			tags: ['experimental', 'advanced'],
			description: localize('onboarding.spotlight.backdrop', "Controls whether onboarding spotlights dim and block the rest of the window behind the highlighted element. When disabled, the rest of the window stays interactive while a spotlight is shown. Takes effect the next time a spotlight is shown.")
		},
		[SPOTLIGHT_CLOSE_BUTTON_CONFIG]: {
			type: 'boolean',
			default: product.quality === 'insider',
			tags: ['experimental', 'advanced'],
			experiment: { mode: 'auto' },
			description: localize('onboarding.spotlight.closeButton', "Controls whether onboarding spotlights show a close button next to the title instead of an End Tour button. Takes effect the next time a spotlight is shown.")
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
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();
		// Keep the developer-mode setting's default ids in sync with the scenarios
		// registered so far (and any registered later, e.g. session tours), but not
		// as their owners unregister them while the window closes: updating the
		// setting then reconfigures the workbench for nothing.
		refreshDeveloperModeConfiguration();
		this._register(onboardingScenarioRegistry.onDidChange(() => {
			if (!lifecycleService.willShutdown) {
				refreshDeveloperModeConfiguration();
			}
		}));
		const spotlight = this._register(instantiationService.createInstance(SpotlightPresentation));
		this._register(onboardingPresentationRegistry.register(spotlight));
		this._register(onboardingSequenceStepPresentationRegistry.register(spotlight));
		const sequence = this._register(new OnboardingSequencePresentation());
		this._register(onboardingPresentationRegistry.register(sequence));
		this._register(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
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
