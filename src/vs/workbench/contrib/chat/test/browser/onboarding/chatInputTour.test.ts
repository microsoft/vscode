/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { resolveOnboardingTarget } from '../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { IOnboardingScenarioService, ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../../../onboarding/common/onboardingScenarioService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { CHAT_INPUT_TOUR_ID, ChatInputTourTarget, ChatInputTourTrigger, createChatInputTour } from '../../../browser/onboarding/chatInputTour.contribution.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../../common/chatService/chatService.js';
import { ChatConfiguration, ChatOnboardingExperience } from '../../../common/constants.js';
import { EditorChatUsage } from '../../../common/editorChatUsage.js';

suite('ChatInputTourTrigger', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface IHarnessOptions {
		readonly experience?: ChatOnboardingExperience;
		readonly messagesSent?: number;
		readonly shown?: boolean;
		readonly developerMode?: boolean;
	}

	function createPicker(label: string): HTMLElement {
		const element = mainWindow.document.createElement('button');
		element.textContent = label;
		mainWindow.document.body.appendChild(element);
		disposables.add(toDisposable(() => element.remove()));
		return element;
	}

	function createHarness(options: IHarnessOptions = {}) {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.OnboardingExperience]: options.experience ?? ChatOnboardingExperience.Spotlight,
			[ONBOARDING_DEVELOPER_MODE_CONFIG]: { [CHAT_INPUT_TOUR_ID]: options.developerMode ?? false },
		});
		const storageService = disposables.add(new InMemoryStorageService());
		for (let i = 0; i < (options.messagesSent ?? 0); i++) {
			new EditorChatUsage(storageService).recordSubmission('local', i === 0, false, false, 1_000);
		}

		const onDidAcceptRequest = disposables.add(new Emitter<IChatRequestAcceptedEvent>());
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidAcceptRequest = onDidAcceptRequest.event;
		}();

		const modePicker = createPicker('Agent');
		const modelPicker = createPicker('Auto');
		let widgetVisible = false;
		let pickersRendered = false;
		const inputPart = new class extends mock<ChatInputPart>() {
			override get modePickerElement() { return pickersRendered ? modePicker : undefined; }
			override get modelPickerElement() { return pickersRendered ? modelPicker : undefined; }
		}();
		const widget = new class extends mock<IChatWidget>() {
			override readonly domNode = mainWindow.document.body;
			override readonly viewContext = { viewId: 'workbench.panel.chat.view.copilot' };
			override readonly inputPart = inputPart;
			override get visible() { return widgetVisible; }
		}();
		const onDidChangeWidgetVisibility = disposables.add(new Emitter<IChatWidget>());
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = disposables.add(new Emitter<IChatWidget>()).event;
			override readonly onDidChangeWidgetVisibility = onDidChangeWidgetVisibility.event;
			override getWidgetsByLocations() { return [widget]; }
		}();
		const onboardingService = new class extends mock<IOnboardingScenarioService>() {
			override hasBeenShown(): boolean { return options.shown ?? false; }
		}();

		const trigger = disposables.add(new ChatInputTourTrigger(onboardingService, chatService, chatWidgetService, storageService, configurationService));
		return {
			trigger,
			modePicker,
			modelPicker,
			configurationService,
			showWidget: () => {
				widgetVisible = true;
				onDidChangeWidgetVisibility.fire(widget);
			},
			renderPickers: () => { pickersRendered = true; },
			sendRequest: () => onDidAcceptRequest.fire({ chatSessionResource: URI.parse('vscode-chat-session://local/1'), isNewSession: true }),
			settle: () => timeout(ChatInputTourTrigger.SETTLE_DELAY_MS),
			retry: () => timeout(ChatInputTourTrigger.RETRY_DELAY_MS),
		};
	}

	test('triggers once the Chat view shows both pickers and resolves them as spotlight targets', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { trigger, modePicker, modelPicker, showWidget, renderPickers, settle, retry } = createHarness();

		const beforeOpen = trigger.signal.get();
		await settle();
		showWidget();
		await settle();
		const beforeRender = trigger.signal.get();
		renderPickers();
		await retry();

		assert.deepStrictEqual({
			beforeOpen,
			beforeRender,
			afterRender: trigger.signal.get(),
			modePicker: resolveOnboardingTarget(mainWindow, ChatInputTourTarget.ModePicker)?.element === modePicker,
			modelPicker: resolveOnboardingTarget(mainWindow, ChatInputTourTarget.ModelPicker)?.element === modelPicker,
			steps: createChatInputTour(trigger.signal).presentation.payload.steps.map(step => ({ targetId: step.targetId, openTarget: step.openTarget, allowTargetInteraction: step.allowTargetInteraction })),
		}, {
			beforeOpen: false,
			beforeRender: false,
			afterRender: true,
			modePicker: true,
			modelPicker: true,
			steps: [
				{ targetId: ChatInputTourTarget.ModePicker, openTarget: undefined, allowTargetInteraction: undefined },
				{ targetId: ChatInputTourTarget.ModelPicker, openTarget: undefined, allowTargetInteraction: undefined },
			],
		});
	}));

	test('waits for the spotlight experience to be selected', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { trigger, configurationService, showWidget, renderPickers, settle } = createHarness({ experience: ChatOnboardingExperience.None });
		renderPickers();
		showWidget();
		await settle();
		const whileNone = trigger.signal.get();

		await configurationService.setUserConfiguration(ChatConfiguration.OnboardingExperience, ChatOnboardingExperience.Spotlight);
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(key: string) { return key === ChatConfiguration.OnboardingExperience; }
		}());
		await settle();

		assert.deepStrictEqual({ whileNone, afterSpotlight: trigger.signal.get() }, { whileNone: false, afterSpotlight: true });
	}));

	const guards: readonly [string, IHarnessOptions, boolean][] = [
		['messages already sent', { messagesSent: 1 }, false],
		['already shown', { shown: true }, false],
		['developer mode with messages sent', { messagesSent: 3, developerMode: true }, true],
	];
	for (const [name, options, expected] of guards) {
		test(`eligibility: ${name}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { trigger, showWidget, renderPickers, settle } = createHarness(options);
			renderPickers();
			showWidget();
			await settle();

			assert.strictEqual(trigger.signal.get(), expected);
		}));
	}

	test('sending a request before the tour starts cancels it', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { trigger, showWidget, renderPickers, sendRequest, settle } = createHarness();
		renderPickers();
		showWidget();
		sendRequest();
		await settle();
		showWidget();
		await settle();

		assert.strictEqual(trigger.signal.get(), false);
	}));
});
