/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow, scheduleAtNextAnimationFrame } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { Memento } from '../../../../../common/memento.js';
import { NullWorkbenchAssignmentService } from '../../../../../services/assignment/test/common/nullAssignmentService.js';
import { DialogService } from '../../../../../services/dialogs/common/dialogService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { TestHostService, TestLayoutService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestLifecycleService } from '../../../../../test/common/workbenchTestServices.js';
import { OnboardingScenarioService } from '../../../../onboarding/browser/onboardingService.js';
import { resolveOnboardingTarget } from '../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { SpotlightPresentation } from '../../../../onboarding/browser/spotlight/spotlightPresentation.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingPresentationRegistry } from '../../../../onboarding/common/onboardingPresentation.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario, OnboardingDismissReason, OnboardingOutcome } from '../../../../onboarding/common/onboardingScenario.js';
import { ONBOARDING_ENABLED_CONFIG } from '../../../../onboarding/common/onboardingScenarioService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { AgentPickerSpotlight, AGENT_PICKER_SPOTLIGHT_ID } from '../../../browser/onboarding/agentPickerSpotlight.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatMode } from '../../../common/chatModes.js';
import { ChatConfiguration } from '../../../common/constants.js';

suite('AgentPickerSpotlight', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => Memento.clear(StorageScope.APPLICATION));

	function createHarness(enabled = true) {
		const configuration = new TestConfigurationService({ [ChatConfiguration.AgentsPickerInAttachContextMenu]: enabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		let button = mainWindow.document.body.appendChild(mainWindow.document.createElement('button'));
		button.textContent = '+';
		button.style.cssText = 'width: 28px; height: 28px;';
		store.add(toDisposable(() => button.remove()));
		const mode = observableValue('mode', ChatMode.Agent);
		let visible = true;
		let supported = true;
		const changed = store.add(new Emitter<IChatWidget>());
		const widget = new class extends mock<IChatWidget>() {
			override readonly domNode = mainWindow.document.body;
			override get visible() { return visible; }
			override readonly inputPart = new class extends mock<ChatInputPart>() {
				override get currentModeObs() { return mode; }
				override get isAgentPickerInAttachContextMenu() { return supported && mode.get() === ChatMode.Agent; }
				override get attachContextButtonElement() { return button.isConnected ? button : undefined; }
			}();
		}();
		const widgets = [widget];
		const widgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = changed.event;
			override readonly onDidRemoveWidget = changed.event;
			override readonly onDidChangeWidgetVisibility = changed.event;
			override readonly onDidChangeFocusedWidget = Event.None;
			override getWidgetsByLocations() { return widgets; }
		}();
		const spotlight = store.add(new AgentPickerSpotlight(configuration, widgetService));
		const scenario = onboardingScenarioRegistry.getScenario(AGENT_PICKER_SPOTLIGHT_ID) as IOnboardingScenario<ISpotlightPayload>;
		const signal = scenario.trigger.kind === 'observable' ? scenario.trigger.signal : undefined;
		const frame = () => new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(getWindow(button), resolve)));
		const setEnabled = async (value: boolean) => {
			await configuration.setUserConfiguration(ChatConfiguration.AgentsPickerInAttachContextMenu, value);
			configuration.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				change: { keys: [ChatConfiguration.AgentsPickerInAttachContextMenu], overrides: [] },
				affectedKeys: new Set([ChatConfiguration.AgentsPickerInAttachContextMenu]),
				affectsConfiguration: key => key === ChatConfiguration.AgentsPickerInAttachContextMenu,
			});
		};
		return {
			configuration, button, mode, scenario, signal, frame, setEnabled, spotlight,
			setVisible: (value: boolean) => { visible = value; changed.fire(widget); },
			setSupported: (value: boolean) => { supported = value; changed.fire(widget); },
			removeWidget: () => { widgets.length = 0; changed.fire(widget); },
			replaceButton: () => {
				const replacement = mainWindow.document.createElement('button');
				replacement.textContent = '+';
				replacement.style.cssText = button.style.cssText;
				button.replaceWith(replacement);
				button = replacement;
				return replacement;
			},
		};
	}

	test('waits for layout and follows setting, mode, visibility, and placement support', async () => {
		const { button, signal, frame, setEnabled, mode, setVisible, setSupported, removeWidget } = createHarness(false);
		const states: boolean[] = [];
		const record = () => states.push(!!signal?.get());
		await frame();
		record();
		await setEnabled(true);
		record();
		await frame();
		record();
		assert.strictEqual(resolveOnboardingTarget(mainWindow, AGENT_PICKER_SPOTLIGHT_ID)?.element, button);
		mode.set(ChatMode.Ask, undefined);
		record();
		mode.set(ChatMode.Agent, undefined);
		await frame();
		record();
		setVisible(false);
		record();
		setVisible(true);
		await frame();
		record();
		setSupported(false);
		record();
		setSupported(true);
		await frame();
		await setEnabled(false);
		record();
		await setEnabled(true);
		await frame();
		removeWidget();
		record();
		assert.deepStrictEqual(states, [false, false, true, false, true, false, true, false, false, false]);
	});

	test('resolves the current + button when the toolbar rerenders after readiness', async () => {
		const { frame, replaceButton, signal } = createHarness();
		await frame();
		const replacement = replaceButton();
		assert.deepStrictEqual({
			ready: signal?.get(),
			currentTarget: resolveOnboardingTarget(mainWindow, AGENT_PICKER_SPOTLIGHT_ID)?.element === replacement,
		}, { ready: true, currentTarget: true });
	});

	test('honors AI and onboarding gates and persists once-only state across engine recreation', async () => {
		const { configuration, frame, setEnabled } = createHarness();
		const context = store.add(new ContextKeyService(configuration));
		const aiEnabled = context.createKey<boolean>(ChatContextKeys.enabled.key, false);
		context.createKey(`config.${ChatConfiguration.AgentsPickerInAttachContextMenu}`, true);
		const storage = store.add(new InMemoryStorageService());
		const runs: string[] = [];
		store.add(onboardingPresentationRegistry.register({
			kind: SPOTLIGHT_PRESENTATION_KIND,
			run: async (scenario, runContext) => {
				runs.push(scenario.id);
				runContext.onDidShow?.();
				return { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 1 };
			},
		}));
		const createEngine = () => store.add(new OnboardingScenarioService(
			storage, context, configuration, store.add(new TestLifecycleService()),
			new NullWorkbenchAssignmentService(), NullTelemetryService,
			store.add(new DialogService(new class extends mock<IWorkbenchEnvironmentService>() { }(), new NullLogService())),
		));
		const first = createEngine();
		first.start();
		await frame();
		await timeout(0);
		const whileAIHidden = runs.length;
		await configuration.setUserConfiguration(ONBOARDING_ENABLED_CONFIG, false);
		aiEnabled.set(true);
		await timeout(0);
		const whileOnboardingDisabled = runs.length;
		await configuration.setUserConfiguration(ONBOARDING_ENABLED_CONFIG, true);
		configuration.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			change: { keys: [ONBOARDING_ENABLED_CONFIG], overrides: [] },
			affectedKeys: new Set([ONBOARDING_ENABLED_CONFIG]),
			affectsConfiguration: key => key === ONBOARDING_ENABLED_CONFIG,
		});
		await timeout(0);
		first.dispose();
		Memento.clear(StorageScope.APPLICATION);
		const second = createEngine();
		second.start();
		await setEnabled(false);
		await setEnabled(true);
		await frame();
		await timeout(0);
		assert.deepStrictEqual({ whileAIHidden, whileOnboardingDisabled, runs, persisted: second.hasBeenShown(AGENT_PICKER_SPOTLIGHT_ID) }, {
			whileAIHidden: 0, whileOnboardingDisabled: 0, runs: [AGENT_PICKER_SPOTLIGHT_ID], persisted: true,
		});
	});

	for (const dismiss of ['understood', 'escape', 'target'] as const) {
		test(`shows the accessible tip after toolbar replacement and dismisses via ${dismiss}`, async () => {
			const { scenario, frame, replaceButton } = createHarness();
			await frame();
			const button = replaceButton();
			button.focus();
			const context = store.add(new ContextKeyService(new TestConfigurationService()));
			const layout = new class extends TestLayoutService {
				override getContainer() { return mainWindow.document.body; }
			}();
			const presentation = store.add(new SpotlightPresentation(layout, new TestHostService(), context));
			const shown = new DeferredPromise<void>();
			const result = presentation.run(scenario, { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => { void shown.complete(); } });
			await shown.p;
			const callout = mainWindow.document.querySelector<HTMLElement>('.spotlight-callout')!;
			const description = mainWindow.document.getElementById(callout.getAttribute('aria-describedby')!);
			const next = Array.from(callout.querySelectorAll<HTMLElement>('.monaco-button')).find(element => element.textContent === 'Understood')!;
			const before = { role: callout.getAttribute('role'), description: description?.textContent, focused: mainWindow.document.activeElement === next };
			if (dismiss === 'target') {
				button.click();
			} else if (dismiss === 'understood') {
				next.click();
			} else {
				next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
			}
			const outcome = (await result).outcome;
			assert.deepStrictEqual({ before, outcome, restored: mainWindow.document.activeElement === button }, {
				before: { role: 'dialog', description: 'We default to Agent, find your custom agents in the + menu', focused: true },
				outcome: dismiss === 'escape' ? OnboardingOutcome.Skipped : OnboardingOutcome.Completed,
				restored: dismiss !== 'target',
			});
		});
	}
});
