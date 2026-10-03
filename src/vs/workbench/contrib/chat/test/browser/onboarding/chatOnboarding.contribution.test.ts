/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IExperimentalSettingsService } from '../../../../../services/configuration/common/experimentalSettings.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenarioService, ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../../../onboarding/common/onboardingScenarioService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { CHAT_INPUT_TOUR_ID } from '../../../browser/onboarding/chatInputSpotlightTour.js';
import { ChatOnboardingContribution } from '../../../browser/onboarding/chatOnboarding.contribution.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { localChatSessionType, SessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration, ChatOnboardingExperience } from '../../../common/constants.js';
import { EditorChatUsage } from '../../../common/editorChatUsage.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';

suite('ChatOnboardingContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface IHarnessOptions {
		readonly experience?: string;
		readonly assigned?: boolean;
		readonly sessionType?: string;
		readonly messagesSent?: number;
		readonly developerMode?: boolean;
	}

	function createHarness(options: IHarnessOptions = {}) {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.OnboardingExperience]: options.experience ?? ChatOnboardingExperience.None,
			[ONBOARDING_DEVELOPER_MODE_CONFIG]: { [CHAT_INPUT_TOUR_ID]: options.developerMode ?? false },
		});
		const storageService = disposables.add(new InMemoryStorageService());
		for (let i = 0; i < (options.messagesSent ?? 0); i++) {
			new EditorChatUsage(storageService).recordSubmission('local', i === 0, false, false, 1_000);
		}

		let assigned = options.assigned ?? false;
		const onDidChangeAssignments = disposables.add(new Emitter<ReadonlySet<string>>());
		const experimentalSettingsService = new class extends mock<IExperimentalSettingsService>() {
			override readonly onDidChangeAssignments = onDidChangeAssignments.event;
			override hasAssignment(setting: string) { return assigned && setting === ChatConfiguration.OnboardingExperience; }
		}();

		const chat = new class extends mock<IChatWidget>() {
			override readonly visible = true;
			override readonly viewContext = { viewId: 'workbench.panel.chat.view.copilot' };
			override readonly onDidChangeViewModel = Event.None;
			override readonly viewModel = new class extends mock<IChatViewModel>() {
				override readonly sessionResource = URI.from({ scheme: options.sessionType ?? SessionType.AgentHostCopilot, path: '/untitled-1' });
			}();
		}();
		const telemetryService = new TestExperimentTriggerTelemetryService();

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IExperimentalSettingsService, experimentalSettingsService);
		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidAcceptRequest = Event.None;
		}());
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = Event.None;
			override readonly onDidRemoveWidget = Event.None;
			override readonly onDidChangeWidgetVisibility = Event.None;
			override getAllWidgets(): readonly IChatWidget[] { return [chat]; }
			override getWidgetsByLocations(): readonly IChatWidget[] { return [chat]; }
		}());
		instantiationService.stub(IOnboardingScenarioService, new class extends mock<IOnboardingScenarioService>() {
			override hasBeenShown() { return false; }
		}());
		instantiationService.stub(IContextViewService, new class extends mock<IContextViewService>() { }());
		instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() { }());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { }());

		const contribution = disposables.add(instantiationService.createInstance(ChatOnboardingContribution));
		return {
			contribution,
			triggers: telemetryService.triggers,
			select: async (experience: string) => {
				await configurationService.setUserConfiguration(ChatConfiguration.OnboardingExperience, experience);
				configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
					override affectsConfiguration(key: string) { return key === ChatConfiguration.OnboardingExperience; }
				}());
			},
			assign: () => {
				assigned = true;
				onDidChangeAssignments.fire(new Set([ChatConfiguration.OnboardingExperience]));
			},
		};
	}

	const isTourRegistered = () => onboardingScenarioRegistry.getScenario(CHAT_INPUT_TOUR_ID) !== undefined;

	test('creates the experience that chat.onboarding.experience selects', async () => {
		const { contribution, select } = createHarness();
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

	test('logs the experiment trigger the same way in every arm, including both arms of an A/A test', () => {
		const arms = [ChatOnboardingExperience.None, ChatOnboardingExperience.None, ChatOnboardingExperience.Spotlight];
		const triggers = arms.map(experience => {
			const harness = createHarness({ experience, assigned: true });
			harness.contribution.dispose();
			return harness.triggers;
		});

		assert.deepStrictEqual(triggers, arms.map(() => ['config.chat.onboarding.experience']));
	});

	test('logs the experiment trigger once the assignment resolves for an eligible user', () => {
		const { triggers, assign } = createHarness({ experience: ChatOnboardingExperience.Spotlight });
		const beforeAssignment = [...triggers];
		assign();
		assign();

		assert.deepStrictEqual({ beforeAssignment, afterAssignment: triggers }, {
			beforeAssignment: [],
			afterAssignment: ['config.chat.onboarding.experience'],
		});
	});

	const notTriggered: readonly [string, IHarnessOptions][] = [
		['without an assignment', { experience: ChatOnboardingExperience.Spotlight, assigned: false }],
		['for a local harness chat', { experience: ChatOnboardingExperience.Spotlight, assigned: true, sessionType: localChatSessionType }],
		['for a returning user', { experience: ChatOnboardingExperience.None, assigned: true, messagesSent: 1 }],
		['for a returning user when developer mode previews the spotlight', { experience: ChatOnboardingExperience.Spotlight, assigned: true, messagesSent: 1, developerMode: true }],
	];
	for (const [name, options] of notTriggered) {
		test(`does not log the experiment trigger ${name}`, () => {
			const { triggers } = createHarness(options);

			assert.deepStrictEqual(triggers, []);
		});
	}
});
