/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow, scheduleAtNextAnimationFrame } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ToolBar } from '../../../../../../base/browser/ui/toolbar/toolbar.js';
import { Action } from '../../../../../../base/common/actions.js';
import { DeferredPromise, retry, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextMenuProvider } from '../../../../../../base/browser/contextmenu.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { Memento } from '../../../../../common/memento.js';
import { NullWorkbenchAssignmentService } from '../../../../../services/assignment/test/common/nullAssignmentService.js';
import { DialogService } from '../../../../../services/dialogs/common/dialogService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { TestHostService, TestLayoutService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestLifecycleService, TestProductService } from '../../../../../test/common/workbenchTestServices.js';
import { OnboardingScenarioService } from '../../../../onboarding/browser/onboardingService.js';
import { runWithOnboardingPresentation } from '../../../../onboarding/browser/onboardingPresentationQueue.js';
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
import { ChatMode, IChatMode, IChatModes } from '../../../common/chatModes.js';
import { CHAT_ATTACH_CONTEXT_ACTION_ID, ChatConfiguration } from '../../../common/constants.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

suite('AgentPickerSpotlight', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => Memento.clear(StorageScope.APPLICATION));

	const custom: IChatMode = { ...ChatMode.Agent, id: 'custom-agent', isBuiltin: false };

	function createHarness(enabled = true, initialCustomModes: readonly IChatMode[] = [custom]) {
		const configuration = new TestConfigurationService({ [ChatConfiguration.AgentsPickerInAttachContextMenu]: enabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const root = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		store.add(toDisposable(() => root.remove()));
		let button: HTMLElement;
		let activations = 0;
		const action = store.add(new Action(CHAT_ATTACH_CONTEXT_ACTION_ID, 'Add Context', undefined, true, async () => { activations++; }));
		const toolbar = store.add(new ToolBar(root, upcastPartial<IContextMenuProvider>({}), {
			actionViewItemProvider: action => new class extends ActionViewItem {
				override render(container: HTMLElement) {
					super.render(container);
					button = container;
					button.style.cssText = 'width: 28px; height: 28px;';
				}
			}(undefined, action, { label: true }),
		}));
		const executeToolbar = store.add(new ToolBar(root, upcastPartial<IContextMenuProvider>({})));
		toolbar.setActions([action]);
		const mode = observableValue('mode', ChatMode.Agent);
		let visible = true;
		let supported = true;
		const changed = store.add(new Emitter<IChatWidget>());
		const buttonChanged = store.add(new Emitter<void>());
		const modesChanged = store.add(new Emitter<void>());
		let customModes = initialCustomModes;
		const modes = observableValue('modes', upcastPartial<IChatModes>({
			onDidChange: modesChanged.event,
			get custom() { return customModes; },
		}));
		const inputPart: ChatInputPart = Object.create(ChatInputPart.prototype, {
			inputActionsToolbar: { value: toolbar },
			executeToolbar: { value: executeToolbar },
			currentModeObs: { get: () => mode },
			currentChatModesObs: { get: () => modes },
			isAgentPickerInAttachContextMenu: { get: () => supported && mode.get() === ChatMode.Agent },
			attachContextButtonElement: { get: () => button.isConnected ? button : undefined },
			onDidChangeAttachContextButton: { value: buttonChanged.event },
		});
		const widget = new class extends mock<IChatWidget>() {
			override readonly domNode = root;
			override get visible() { return visible; }
			override readonly inputPart = inputPart;
		}();
		const widgets = [widget];
		const widgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = changed.event;
			override readonly onDidRemoveWidget = changed.event;
			override readonly onDidChangeWidgetVisibility = changed.event;
			override readonly onDidChangeFocusedWidget = Event.None;
			override getWidgetsByLocations() { return widgets; }
		}();
		const spotlight = store.add(new AgentPickerSpotlight(configuration, widgetService, TestProductService));
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
			configuration, button: button!, mode, scenario, signal, frame, setEnabled, spotlight, root, toolbar,
			modes,
			setCustomModes: (value: readonly IChatMode[]) => { customModes = value; modesChanged.fire(); },
			activations: () => activations,
			setVisible: (value: boolean) => { visible = value; changed.fire(widget); },
			setSupported: (value: boolean) => { supported = value; buttonChanged.fire(); },
			removeWidget: () => { widgets.length = 0; changed.fire(widget); },
			replaceButton: () => {
				toolbar.setActions([action]);
				buttonChanged.fire();
				return button;
			},
		};
	}

	test('requires a custom agent and follows discovery, removal, and session modes', async () => {
		const { signal, frame, modes, setCustomModes } = createHarness(true, []);
		await frame();
		const empty = signal?.get();
		setCustomModes([{ ...custom, source: { storage: PromptsStorage.builtIn } }]);
		await frame();
		const builtInOnly = signal?.get();
		setCustomModes([custom]);
		await frame();
		const discovered = signal?.get();
		setCustomModes([]);
		await frame();
		const removed = signal?.get();
		modes.set(upcastPartial<IChatModes>({ custom: [custom], onDidChange: Event.None }), undefined);
		await frame();
		const newSession = signal?.get();
		modes.set(upcastPartial<IChatModes>({ custom: [], onDidChange: Event.None }), undefined);
		await frame();
		assert.deepStrictEqual({ empty, builtInOnly, discovered, removed, newSession, emptySession: signal?.get() }, {
			empty: false, builtInOnly: false, discovered: true, removed: false, newSession: true, emptySession: false,
		});
	});

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
		await frame();
		assert.deepStrictEqual({
			ready: signal?.get(),
			currentTarget: resolveOnboardingTarget(mainWindow, AGENT_PICKER_SPOTLIGHT_ID)?.element === replacement,
		}, { ready: true, currentTarget: true });
	});

	test('waits for a hidden composer to become visibly resolvable', async () => {
		const { root, signal, frame } = createHarness();
		root.style.display = 'none';
		await frame();
		const hidden = { ready: signal?.get(), resolved: !!resolveOnboardingTarget(mainWindow, AGENT_PICKER_SPOTLIGHT_ID) };
		root.style.display = '';
		await retry(async () => assert.strictEqual(signal?.get(), true), 20, 10);
		assert.deepStrictEqual({ hidden, visible: !!resolveOnboardingTarget(mainWindow, AGENT_PICKER_SPOTLIGHT_ID) }, {
			hidden: { ready: false, resolved: false }, visible: true,
		});
	});

	test('does not consume readiness for a composer in another document', async () => {
		const { root, signal, frame, setEnabled } = createHarness(false);
		const auxiliaryDocument = mainWindow.document.implementation.createHTMLDocument();
		auxiliaryDocument.body.appendChild(root);
		await setEnabled(true);
		await frame();
		const auxiliary = signal?.get();
		mainWindow.document.body.appendChild(root);
		await setEnabled(false);
		await setEnabled(true);
		await frame();
		assert.deepStrictEqual({ auxiliary, main: signal?.get() }, { auxiliary: false, main: true });
	});

	test('honors AI and onboarding gates and persists once-only state across engine recreation', async () => {
		const { configuration, frame, setEnabled, replaceButton } = createHarness();
		const context = store.add(new ContextKeyService(configuration));
		const aiEnabled = context.createKey<boolean>(ChatContextKeys.enabled.key, false);
		context.createKey(`config.${ChatConfiguration.AgentsPickerInAttachContextMenu}`, true);
		const storage = store.add(new InMemoryStorageService());
		const runs: string[] = [];
		let resolvedTarget: HTMLElement | undefined;
		store.add(onboardingPresentationRegistry.register({
			kind: SPOTLIGHT_PRESENTATION_KIND,
			run: async (scenario, runContext) => {
				runs.push(scenario.id);
				resolvedTarget = resolveOnboardingTarget(mainWindow, AGENT_PICKER_SPOTLIGHT_ID)?.element;
				runContext.onDidShow?.();
				return { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 1 };
			},
		}));
		const createEngine = () => store.add(new OnboardingScenarioService(
			storage, context, configuration, store.add(new TestLifecycleService()),
			new NullWorkbenchAssignmentService(), NullTelemetryService,
			store.add(new DialogService(new class extends mock<IWorkbenchEnvironmentService>() { }(), new NullLogService())),
		));
		const finish = new DeferredPromise<void>();
		store.add(toDisposable(() => { void finish.complete(); }));
		const occupant = runWithOnboardingPresentation(mainWindow, CancellationToken.None, () => finish.p);
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
		const queued = { runs: runs.length, shown: first.hasBeenShown(AGENT_PICKER_SPOTLIGHT_ID) };
		const replacement = replaceButton();
		await frame();
		await finish.complete();
		await occupant;
		await timeout(0);
		first.dispose();
		Memento.clear(StorageScope.APPLICATION);
		const second = createEngine();
		second.start();
		await setEnabled(false);
		await setEnabled(true);
		await frame();
		await timeout(0);
		assert.deepStrictEqual({ whileAIHidden, whileOnboardingDisabled, queued, runs, replacedWhileQueued: resolvedTarget === replacement, persisted: second.hasBeenShown(AGENT_PICKER_SPOTLIGHT_ID) }, {
			whileAIHidden: 0, whileOnboardingDisabled: 0, queued: { runs: 0, shown: false }, runs: [AGENT_PICKER_SPOTLIGHT_ID], replacedWhileQueued: true, persisted: true,
		});
	});

	for (const dismiss of ['understood', 'escape', 'target', 'enter', 'space', 'rerender'] as const) {
		test(`shows the accessible tip after toolbar replacement and dismisses via ${dismiss}`, async () => {
			const { scenario, frame, replaceButton, toolbar, activations } = createHarness();
			await frame();
			let button = replaceButton();
			await frame();
			toolbar.focus();
			const context = store.add(new ContextKeyService(new TestConfigurationService()));
			const layout = new class extends TestLayoutService {
				override getContainer() { return mainWindow.document.body; }
			}();
			const presentation = store.add(new SpotlightPresentation(layout, new TestHostService(), context));
			const shown = new DeferredPromise<void>();
			const result = presentation.run(scenario, { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => { void shown.complete(); } });
			await shown.p;
			if (dismiss === 'rerender') {
				button = replaceButton();
				await retry(async () => assert.notStrictEqual(button.id, ''), 20, 10);
			}
			const callout = mainWindow.document.querySelector<HTMLElement>('.spotlight-callout')!;
			const description = mainWindow.document.getElementById(callout.getAttribute('aria-describedby')!);
			const next = Array.from(callout.querySelectorAll<HTMLElement>('.monaco-button')).find(element => element.textContent === 'Understood')!;
			const before = { role: callout.getAttribute('role'), description: description?.textContent, focused: mainWindow.document.activeElement === next };
			if (dismiss === 'target') {
				button.querySelector<HTMLElement>('.action-label')!.click();
			} else if (dismiss === 'enter' || dismiss === 'space' || dismiss === 'rerender') {
				toolbar.focus();
				const key = dismiss === 'space' ? ' ' : 'Enter';
				const keyCode = dismiss === 'space' ? 32 : 13;
				for (const type of ['keydown', 'keyup']) {
					mainWindow.document.activeElement!.dispatchEvent(new KeyboardEvent(type, { key, keyCode, bubbles: true }));
				}
			} else if (dismiss === 'understood') {
				next.click();
			} else {
				next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
			}
			const outcome = (await result).outcome;
			assert.deepStrictEqual({ before, outcome, restored: button.contains(mainWindow.document.activeElement), activations: activations() }, {
				before: { role: 'dialog', description: 'We default to Agent, find your custom agents in the + menu', focused: true },
				outcome: dismiss === 'escape' ? OnboardingOutcome.Skipped : OnboardingOutcome.Completed,
				restored: dismiss !== 'target',
				activations: dismiss === 'understood' || dismiss === 'escape' ? 0 : 1,
			});
		});
	}
});
