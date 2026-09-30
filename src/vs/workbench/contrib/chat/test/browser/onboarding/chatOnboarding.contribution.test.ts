/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenarioService } from '../../../../onboarding/common/onboardingScenarioService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { CHAT_INPUT_TOUR_ID } from '../../../browser/onboarding/chatInputSpotlightTour.js';
import { ChatOnboardingContribution } from '../../../browser/onboarding/chatOnboarding.contribution.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatConfiguration, ChatOnboardingExperience } from '../../../common/constants.js';

suite('ChatOnboardingContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates the experience that chat.onboarding.experience selects', async () => {
		const configurationService = new TestConfigurationService({ [ChatConfiguration.OnboardingExperience]: ChatOnboardingExperience.None });
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidAcceptRequest = Event.None;
		}());
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = Event.None;
			override readonly onDidRemoveWidget = Event.None;
			override readonly onDidChangeWidgetVisibility = Event.None;
			override getAllWidgets(): readonly IChatWidget[] { return []; }
			override getWidgetsByLocations(): readonly IChatWidget[] { return []; }
		}());
		instantiationService.stub(IOnboardingScenarioService, new class extends mock<IOnboardingScenarioService>() {
			override hasBeenShown() { return false; }
		}());
		instantiationService.stub(IContextViewService, new class extends mock<IContextViewService>() { }());
		instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() { }());

		const select = async (experience: string) => {
			await configurationService.setUserConfiguration(ChatConfiguration.OnboardingExperience, experience);
			configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(key: string) { return key === ChatConfiguration.OnboardingExperience; }
			}());
		};
		const isTourRegistered = () => onboardingScenarioRegistry.getScenario(CHAT_INPUT_TOUR_ID) !== undefined;

		const contribution = disposables.add(instantiationService.createInstance(ChatOnboardingContribution));
		const withNone = isTourRegistered();
		await select(ChatOnboardingExperience.Spotlight);
		const withSpotlight = isTourRegistered();
		await select(ChatOnboardingExperience.None);
		const afterSwitchingBack = isTourRegistered();
		await select(ChatOnboardingExperience.Spotlight);
		contribution.dispose();

		assert.deepStrictEqual({ withNone, withSpotlight, afterSwitchingBack, afterDispose: isTourRegistered() }, {
			withNone: false,
			withSpotlight: true,
			afterSwitchingBack: false,
			afterDispose: false,
		});
	});
});
