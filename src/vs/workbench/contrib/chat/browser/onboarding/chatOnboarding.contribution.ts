/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { isOnboardingDeveloperModeEnabled, ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../../onboarding/common/onboardingScenarioService.js';
import { ChatConfiguration, ChatOnboardingExperience } from '../../common/constants.js';
import { CHAT_INPUT_TOUR_ID, ChatInputSpotlightTour } from './chatInputSpotlightTour.js';
import { ChatOnboardingEligibility, IChatOnboardingEligibility } from './chatOnboardingEligibility.js';

/** An onboarding experience that `chat.onboarding.experience` can select. */
interface IChatOnboardingExperienceDescriptor {
	/** The onboarding scenario the experience registers, used for `onboarding.developerMode`. */
	readonly scenarioId: string;
	/** Creates the experience. It runs in the chats that `eligibility` reports as eligible. */
	create(instantiationService: IInstantiationService, eligibility: IChatOnboardingEligibility): IDisposable;
}

/**
 * The experiences `chat.onboarding.experience` can select. Every experience shares
 * the same {@link ChatOnboardingEligibility}, so adding one only adds its UI.
 */
const chatOnboardingExperiences: { readonly [experience: string]: IChatOnboardingExperienceDescriptor | undefined } = {
	[ChatOnboardingExperience.Spotlight]: {
		scenarioId: CHAT_INPUT_TOUR_ID,
		create: (instantiationService, eligibility) => instantiationService.createInstance(ChatInputSpotlightTour, eligibility),
	},
};

/**
 * Shows new users the chat onboarding experience that `chat.onboarding.experience`
 * selects. Deciding *whether* onboarding may run is left to
 * {@link ChatOnboardingEligibility}; the selected experience only decides *what* runs.
 * The setting is registered for ExP, so an experiment can swap experiences without
 * changing who is eligible.
 */
export class ChatOnboardingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatOnboarding';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const experience = observableConfigValue<string>(ChatConfiguration.OnboardingExperience, ChatOnboardingExperience.None, configurationService);
		const descriptor = derived(this, reader => chatOnboardingExperiences[experience.read(reader)]);
		const developerMode = observableConfigValue<unknown>(ONBOARDING_DEVELOPER_MODE_CONFIG, undefined, configurationService);
		const bypassNewUserCheck: IObservable<boolean> = derived(this, reader => {
			developerMode.read(reader);
			const selected = descriptor.read(reader);
			return !!selected && isOnboardingDeveloperModeEnabled(configurationService, selected.scenarioId);
		});

		const eligibility = this._register(instantiationService.createInstance(ChatOnboardingEligibility, bypassNewUserCheck));
		this._register(autorun(reader => {
			const selected = descriptor.read(reader);
			if (selected) {
				reader.store.add(selected.create(instantiationService, eligibility));
			}
		}));
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[ChatConfiguration.OnboardingExperience]: {
			type: 'string',
			enum: [ChatOnboardingExperience.None, ChatOnboardingExperience.Spotlight],
			enumDescriptions: [
				localize('chat.onboarding.experience.none', "Do not show a chat onboarding experience."),
				localize('chat.onboarding.experience.spotlight', "Spotlight the model, agent mode, and permissions pickers."),
			],
			default: ChatOnboardingExperience.None,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.onboarding.experience', "Controls which onboarding experience new users see the first time the Chat view shows a Copilot harness chat, if they have not sent a chat message yet."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
	},
});

registerWorkbenchContribution2(ChatOnboardingContribution.ID, ChatOnboardingContribution, WorkbenchPhase.AfterRestored);
