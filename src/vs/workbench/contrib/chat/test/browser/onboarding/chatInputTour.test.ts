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
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { resolveOnboardingTarget } from '../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { IOnboardingScenarioService, ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../../../onboarding/common/onboardingScenarioService.js';
import { AgentHostChatInputPicker, AgentHostPickerSection } from '../../../browser/agentSessions/agentHost/agentHostChatInputPicker.js';
import { IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { CHAT_INPUT_TOUR_ID, ChatInputTourTarget, ChatInputTourTrigger, createChatInputTour } from '../../../browser/onboarding/chatInputTour.contribution.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../../common/chatService/chatService.js';
import { localChatSessionType, SessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration, ChatOnboardingExperience } from '../../../common/constants.js';
import { EditorChatUsage } from '../../../common/editorChatUsage.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';

suite('ChatInputTourTrigger', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface IHarnessOptions {
		readonly experience?: ChatOnboardingExperience;
		readonly sessionType?: string;
		readonly combinedPermissions?: boolean;
		readonly messagesSent?: number;
		readonly shown?: boolean;
		readonly developerMode?: boolean;
	}

	function createElement(label: string): HTMLElement {
		const element = mainWindow.document.createElement('button');
		element.textContent = label;
		mainWindow.document.body.appendChild(element);
		disposables.add(toDisposable(() => element.remove()));
		return element;
	}

	function createViewModel(sessionType: string): IChatViewModel {
		return new class extends mock<IChatViewModel>() {
			override readonly sessionResource = URI.from({ scheme: sessionType, path: '/untitled-1' });
		}();
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

		let pickersRendered = false;
		const opened: string[] = [];
		const sections: string[] = [];
		const menu = createElement('menu');
		const createPicker = (label: string, combinesPermissions: boolean) => {
			const element = createElement(label);
			let open = false;
			return new class extends mock<AgentHostChatInputPicker>() {
				override get triggerElement() { return pickersRendered ? element : undefined; }
				override get combinesPermissions() { return combinesPermissions; }
				override get isOpen() { return open; }
				override open(openPermissions?: boolean) {
					open = true;
					opened.push(`${label}${openPermissions ? ':permissions' : ''}`);
				}
				override setSectionExpanded(section: AgentHostPickerSection, expanded: boolean) {
					if (!open || !combinesPermissions) {
						return false;
					}
					sections.push(`${section}:${expanded ? 'expand' : 'collapse'}`);
					return true;
				}
			}();
		};
		const combined = options.combinedPermissions ?? true;
		const pickers = new Map<string, AgentHostChatInputPicker>([
			[SessionConfigKey.Mode, createPicker('mode', combined)],
			[SessionConfigKey.AutoApprove, createPicker('autoApprove', false)],
		]);
		const modelPicker = createElement('Auto');
		const inputPart = new class extends mock<ChatInputPart>() {
			override getAgentHostPicker(property: string) { return property === SessionConfigKey.AutoApprove && combined ? undefined : pickers.get(property); }
			override get modelPickerElement() { return pickersRendered ? modelPicker : undefined; }
		}();

		let widgetVisible = false;
		let viewModel = createViewModel(options.sessionType ?? SessionType.AgentHostCopilot);
		const onDidChangeViewModel = disposables.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const widget = new class extends mock<IChatWidget>() {
			override readonly domNode = mainWindow.document.body;
			override readonly viewContext = { viewId: 'workbench.panel.chat.view.copilot' };
			override readonly inputPart = inputPart;
			override readonly onDidChangeViewModel = onDidChangeViewModel.event;
			override get viewModel() { return viewModel; }
			override get visible() { return widgetVisible; }
		}();
		const onDidChangeWidgetVisibility = disposables.add(new Emitter<IChatWidget>());
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = disposables.add(new Emitter<IChatWidget>()).event;
			override readonly onDidRemoveWidget = disposables.add(new Emitter<IChatWidget>()).event;
			override readonly onDidChangeWidgetVisibility = onDidChangeWidgetVisibility.event;
			override getAllWidgets() { return [widget]; }
			override getWidgetsByLocations() { return [widget]; }
		}();
		const onboardingService = new class extends mock<IOnboardingScenarioService>() {
			override hasBeenShown(): boolean { return options.shown ?? false; }
		}();
		const contextViewService = new class extends mock<IContextViewService>() {
			override getContextViewElement() { return menu; }
		}();
		const actionWidgetService = new class extends mock<IActionWidgetService>() {
			override readonly isVisible = false;
			override hide() { }
		}();

		const trigger = disposables.add(new ChatInputTourTrigger(onboardingService, chatService, chatWidgetService, storageService, configurationService, contextViewService, actionWidgetService));
		return {
			trigger,
			opened,
			sections,
			menu,
			modelPicker,
			pickerElement: (property: string) => pickers.get(property)?.triggerElement,
			configurationService,
			showWidget: () => {
				widgetVisible = true;
				onDidChangeWidgetVisibility.fire(widget);
			},
			switchSession: (sessionType: string) => {
				viewModel = createViewModel(sessionType);
				onDidChangeViewModel.fire({ previousSessionResource: undefined, currentSessionResource: viewModel.sessionResource });
			},
			renderPickers: () => { pickersRendered = true; },
			sendRequest: () => onDidAcceptRequest.fire({ chatSessionResource: URI.parse('vscode-chat-session://local/1'), isNewSession: true }),
			settle: () => timeout(ChatInputTourTrigger.SETTLE_DELAY_MS),
			retry: () => timeout(ChatInputTourTrigger.RETRY_DELAY_MS),
		};
	}

	async function openTargets() {
		const targets = Object.values(ChatInputTourTarget).map(targetId => ({ targetId, target: resolveOnboardingTarget(mainWindow, targetId) }));
		const popupsBeforeOpen = targets.map(({ target }) => target?.popup?.());
		for (const { target } of targets) {
			await target?.open?.();
		}
		return { targets, popupsBeforeOpen, popups: targets.map(({ target }) => target?.popup?.()) };
	}

	test('triggers once a Copilot harness chat shows its pickers and moves the open menu from agent mode to permissions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { trigger, opened, sections, menu, modelPicker, pickerElement, showWidget, renderPickers, settle, retry } = createHarness();

		const beforeOpen = trigger.signal.get();
		showWidget();
		await settle();
		const beforeRender = trigger.signal.get();
		renderPickers();
		await retry();
		const { targets, popupsBeforeOpen, popups } = await openTargets();

		assert.deepStrictEqual({
			beforeOpen,
			beforeRender,
			afterRender: trigger.signal.get(),
			targets: targets.map(({ targetId, target }) => ({ targetId, element: target?.element.textContent })),
			modePickerIsShared: targets[0].target?.element === pickerElement(SessionConfigKey.Mode) && targets[1].target?.element === pickerElement(SessionConfigKey.Mode),
			modelPicker: targets[2].target?.element === modelPicker,
			opened,
			sections,
			popupsBeforeOpen,
			popupsAreMenu: popups.map(popup => popup === menu),
			steps: createChatInputTour(trigger.signal).presentation.payload.steps.map(step => ({ targetId: step.targetId, openTarget: step.openTarget })),
		}, {
			beforeOpen: false,
			beforeRender: false,
			afterRender: true,
			targets: [
				{ targetId: ChatInputTourTarget.AgentMode, element: 'mode' },
				{ targetId: ChatInputTourTarget.Permissions, element: 'mode' },
				{ targetId: ChatInputTourTarget.ModelPicker, element: 'Auto' },
			],
			modePickerIsShared: true,
			modelPicker: true,
			opened: ['mode'],
			sections: ['mode:collapse', 'permissions:expand'],
			popupsBeforeOpen: [undefined, undefined, undefined],
			popupsAreMenu: [true, true, false],
			steps: [
				{ targetId: ChatInputTourTarget.ModelPicker, openTarget: undefined },
				{ targetId: ChatInputTourTarget.AgentMode, openTarget: true },
				{ targetId: ChatInputTourTarget.Permissions, openTarget: true },
			],
		});
	}));

	test('uses the separate permissions picker when mode and permissions are not combined', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { trigger, opened, showWidget, renderPickers, settle } = createHarness({ combinedPermissions: false });
		renderPickers();
		showWidget();
		await settle();
		const { targets } = await openTargets();

		assert.deepStrictEqual({
			triggered: trigger.signal.get(),
			permissionsTarget: targets[1].target?.element.textContent,
			opened,
		}, {
			triggered: true,
			permissionsTarget: 'autoApprove',
			opened: ['mode', 'autoApprove:permissions'],
		});
	}));

	test('waits for the Copilot harness before triggering', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { trigger, showWidget, renderPickers, switchSession, settle } = createHarness({ sessionType: localChatSessionType });
		renderPickers();
		showWidget();
		await settle();
		const withLocalHarness = trigger.signal.get();

		switchSession(SessionType.AgentHostCopilot);
		await settle();

		assert.deepStrictEqual({ withLocalHarness, withCopilotHarness: trigger.signal.get() }, { withLocalHarness: false, withCopilotHarness: true });
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
