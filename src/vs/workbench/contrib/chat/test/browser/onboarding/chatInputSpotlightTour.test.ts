/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IContextKeyChangeEvent, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { EditorPartModalVisibleContext } from '../../../../../common/contextkeys.js';
import { resolveOnboardingTarget } from '../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload } from '../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../onboarding/common/onboardingScenarioService.js';
import { AgentHostChatInputPicker, AgentHostPickerSection } from '../../../browser/agentSessions/agentHost/agentHostChatInputPicker.js';
import { IChatWidget } from '../../../browser/chat.js';
import { CHAT_INPUT_TOUR_ID, ChatInputSpotlightTour, ChatInputTourTarget } from '../../../browser/onboarding/chatInputSpotlightTour.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';

suite('ChatInputSpotlightTour', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createElement(label: string): HTMLElement {
		const element = mainWindow.document.body.appendChild(mainWindow.document.createElement('button'));
		element.textContent = label;
		disposables.add(toDisposable(() => element.remove()));
		return element;
	}

	function createHarness(combined = true) {
		const opened: { label: string; section: AgentHostPickerSection; token: CancellationToken }[] = [];
		const menu = createElement('menu');
		const createPicker = (label: string, combinesPermissions: boolean) => {
			const element = createElement(label);
			let open = false;
			return new class extends mock<AgentHostChatInputPicker>() {
				override get triggerElement() { return element; }
				override get combinesPermissions() { return combinesPermissions; }
				override get menuElement() { return open ? menu : undefined; }
				override async showSection(section: AgentHostPickerSection, token: CancellationToken) {
					open = true;
					opened.push({ label, section, token });
				}
			}();
		};
		const pickers = new Map<string, AgentHostChatInputPicker>([[SessionConfigKey.Mode, createPicker('mode', combined)], [SessionConfigKey.AutoApprove, createPicker('autoApprove', false)]]);
		const model = createElement('Auto');
		const chat = new class extends mock<IChatWidget>() {
			override readonly domNode = mainWindow.document.body;
			override readonly inputPart = new class extends mock<ChatInputPart>() {
				override getAgentHostPicker(property: string) { return property === SessionConfigKey.AutoApprove && combined ? undefined : pickers.get(property); }
				override getModelPickerControl() { return { element: model, open: () => { }, select: () => false }; }
			}();
		}();

		const eligibleChat = observableValue<IChatWidget | undefined>('eligibleChat', undefined);
		const runs: { token: CancellationToken; result: DeferredPromise<OnboardingOutcome> }[] = [];
		const onboardingService = new class extends mock<IOnboardingScenarioService>() {
			override runScenario(_id: string, token: CancellationToken) {
				runs.push({ token, result: new DeferredPromise<OnboardingOutcome>() });
				return runs[runs.length - 1].result.p;
			}
		}();
		const onDidChangeContext = disposables.add(new Emitter<IContextKeyChangeEvent>());
		const contextKeyService = new class extends mock<IContextKeyService>() {
			override readonly onDidChangeContext = onDidChangeContext.event;
			override getContextKeyValue<T>(key: string) { return (key === EditorPartModalVisibleContext.key) as T; }
		}();

		const tour = disposables.add(new ChatInputSpotlightTour({ eligibleChat }, onboardingService, contextKeyService));
		return {
			tour, opened, runs, menu, model, pickers,
			setEligible: (value: boolean) => eligibleChat.set(value ? chat : undefined, undefined),
			openModalEditor: () => onDidChangeContext.fire({ affectsSome: keys => keys.has(EditorPartModalVisibleContext.key), allKeysContainedIn: () => false }),
			settle: () => timeout(ChatInputSpotlightTour.SETTLE_DELAY_MS),
		};
	}

	const resolveTargets = () => Object.values(ChatInputTourTarget).map(targetId => resolveOnboardingTarget(mainWindow, targetId));

	test('starts once its targets render in the eligible chat and opens each picker section with the step token', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { tour, opened, menu, model, pickers, setEligible, settle } = createHarness();
		const beforeEligible = tour.signal.get();
		setEligible(true);
		await settle();
		const targets = resolveTargets();
		const menuBeforeOpen = targets.map(target => target?.additionalElements?.());
		for (const target of targets) {
			await target?.open?.(CancellationToken.Cancelled);
		}
		const scenario = onboardingScenarioRegistry.getScenario(CHAT_INPUT_TOUR_ID)!;

		assert.deepStrictEqual({
			beforeEligible,
			afterRender: tour.signal.get(),
			targets: targets.map(target => target?.element),
			menuBeforeOpen,
			menuAfterOpen: targets.map(target => target?.additionalElements?.()),
			opened: opened.map(({ label, section, token }) => ({ label, section, cancelled: token.isCancellationRequested })),
			experiment: scenario.experiment,
			steps: (scenario.presentation.payload as ISpotlightPayload).steps.map(step => [step.targetId, step.openTarget]),
		}, {
			beforeEligible: false,
			afterRender: true,
			targets: [pickers.get(SessionConfigKey.Mode)!.triggerElement, pickers.get(SessionConfigKey.Mode)!.triggerElement, model],
			menuBeforeOpen: [[], [], undefined],
			menuAfterOpen: [[menu], [menu], undefined],
			opened: [{ label: 'mode', section: 'mode', cancelled: true }, { label: 'mode', section: 'permissions', cancelled: true }],
			experiment: { behaviorFlag: 'onb.chatInput.show', assignmentContextIdFlag: 'onb.chatInput.id' },
			steps: [[ChatInputTourTarget.ModelPicker, undefined], [ChatInputTourTarget.AgentMode, true], [ChatInputTourTarget.Permissions, true]],
		});
	}));

	test('uses the separate permissions picker when mode and permissions are not combined', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { opened, pickers, setEligible, settle } = createHarness(false);
		setEligible(true);
		await settle();
		const permissions = resolveTargets()[1];
		await permissions?.open?.();

		assert.deepStrictEqual({ element: permissions?.element, opened: opened.map(({ label, section }) => [label, section]) }, {
			element: pickers.get(SessionConfigKey.AutoApprove)!.triggerElement,
			opened: [['autoApprove', 'permissions']],
		});
	}));

	test('drops the signal and its targets while the chat is not eligible', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { tour, setEligible, settle } = createHarness();
		setEligible(true);
		await settle();
		setEligible(false);
		const whenIneligible = { signal: tour.signal.get(), targets: resolveTargets().filter(target => target).length };
		setEligible(true);

		assert.deepStrictEqual({ whenIneligible, whenEligibleAgain: tour.signal.get() }, { whenIneligible: { signal: false, targets: 0 }, whenEligibleAgain: true });
	}));

	test('ends the running tour when a modal editor opens', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { runs, setEligible, openModalEditor, settle } = createHarness();
		setEligible(true);
		await settle();
		for (const step of (onboardingScenarioRegistry.getScenario(CHAT_INPUT_TOUR_ID)!.presentation.payload as ISpotlightPayload).steps) {
			step.onBeforeShow?.();
		}
		openModalEditor();

		assert.deepStrictEqual(runs.map(run => run.token.isCancellationRequested), [true]);
		runs[0].result.complete(OnboardingOutcome.Aborted);
	}));
});
