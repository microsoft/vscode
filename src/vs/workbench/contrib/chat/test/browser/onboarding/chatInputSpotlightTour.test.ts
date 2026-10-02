/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { resolveOnboardingTarget } from '../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenarioService } from '../../../../onboarding/common/onboardingScenarioService.js';
import { AgentHostChatInputPicker, AgentHostPickerSection } from '../../../browser/agentSessions/agentHost/agentHostChatInputPicker.js';
import { IChatWidget } from '../../../browser/chat.js';
import { CHAT_INPUT_TOUR_ID, ChatInputSpotlightTour, ChatInputTourTarget, createChatInputTour } from '../../../browser/onboarding/chatInputSpotlightTour.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';

suite('ChatInputSpotlightTour', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createElement(label: string): HTMLElement {
		const element = mainWindow.document.createElement('button');
		element.textContent = label;
		mainWindow.document.body.appendChild(element);
		disposables.add(toDisposable(() => element.remove()));
		return element;
	}

	function createHarness(options: { readonly combinedPermissions?: boolean; readonly shown?: boolean } = {}) {
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
				override show(_anchor: HTMLElement, openPermissions?: boolean) {
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
		const chat = new class extends mock<IChatWidget>() {
			override readonly domNode = mainWindow.document.body;
			override readonly inputPart = inputPart;
		}();

		const eligibleChat = observableValue<IChatWidget | undefined>('eligibleChat', undefined);
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

		const tour = disposables.add(new ChatInputSpotlightTour({ eligibleChat }, onboardingService, contextViewService, actionWidgetService));
		return {
			tour,
			chat,
			opened,
			sections,
			menu,
			modelPicker,
			pickerElement: (property: string) => pickers.get(property)?.triggerElement,
			setEligible: (value: boolean) => eligibleChat.set(value ? chat : undefined, undefined),
			renderPickers: () => { pickersRendered = true; },
			settle: () => timeout(ChatInputSpotlightTour.SETTLE_DELAY_MS),
			retry: () => timeout(ChatInputSpotlightTour.RETRY_DELAY_MS),
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

	test('starts in the eligible chat once its pickers render and moves the open menu from agent mode to permissions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { tour, opened, sections, menu, modelPicker, pickerElement, setEligible, renderPickers, settle, retry } = createHarness();

		const registered = onboardingScenarioRegistry.getScenario(CHAT_INPUT_TOUR_ID) !== undefined;
		await settle();
		const beforeEligible = tour.signal.get();
		setEligible(true);
		await settle();
		const beforeRender = tour.signal.get();
		renderPickers();
		await retry();
		const { targets, popupsBeforeOpen, popups } = await openTargets();

		assert.deepStrictEqual({
			registered,
			beforeEligible,
			beforeRender,
			afterRender: tour.signal.get(),
			targets: targets.map(({ targetId, target }) => ({ targetId, element: target?.element.textContent })),
			modePickerIsShared: targets[0].target?.element === pickerElement(SessionConfigKey.Mode) && targets[1].target?.element === pickerElement(SessionConfigKey.Mode),
			modelPicker: targets[2].target?.element === modelPicker,
			opened,
			sections,
			popupsBeforeOpen,
			popupsAreMenu: popups.map(popup => popup === menu),
			steps: createChatInputTour(tour.signal).presentation.payload.steps.map(step => ({ targetId: step.targetId, openTarget: step.openTarget })),
		}, {
			registered: true,
			beforeEligible: false,
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
		const { tour, opened, setEligible, renderPickers, settle } = createHarness({ combinedPermissions: false });
		renderPickers();
		setEligible(true);
		await settle();
		const { targets } = await openTargets();

		assert.deepStrictEqual({
			triggered: tour.signal.get(),
			permissionsTarget: targets[1].target?.element.textContent,
			opened,
		}, {
			triggered: true,
			permissionsTarget: 'autoApprove',
			opened: ['mode', 'autoApprove:permissions'],
		});
	}));

	test('stops waiting when the chat stops being eligible', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { tour, setEligible, renderPickers, settle } = createHarness();
		setEligible(true);
		setEligible(false);
		renderPickers();
		await settle();
		const afterIneligible = tour.signal.get();
		setEligible(true);
		await settle();

		assert.deepStrictEqual({ afterIneligible, afterEligibleAgain: tour.signal.get() }, { afterIneligible: false, afterEligibleAgain: true });
	}));

	test('does not start a tour that was already shown', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { tour, setEligible, renderPickers, settle } = createHarness({ shown: true });
		renderPickers();
		setEligible(true);
		await settle();

		assert.strictEqual(tour.signal.get(), false);
	}));
});
