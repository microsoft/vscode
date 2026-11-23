/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { EditorPartModalVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { Memento } from '../../../../../workbench/common/memento.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { SpotlightPresentation } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightPresentation.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/browser/onboardingService.js';
import { onboardingPresentationRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingPresentation.js';
import { OnboardingDismissReason, OnboardingOutcome } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { SessionsWelcomeVisibleContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ChatEntitlementContextKeys } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { NullWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/test/common/nullAssignmentService.js';
import { TestLifecycleService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { TestHostService, TestLayoutService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { NewSessionOnboardingHandoffContext } from '../../../../common/agentsWindowContextKeys.js';
import { AutomationsTourContribution } from '../../browser/automationsTourContribution.js';
import { AUTOMATIONS_TOUR_ID, createAutomationsTour } from '../../browser/tours/automationsTour.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';

suite('AutomationsTour', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => Memento.clear(StorageScope.APPLICATION));

	for (const previousTourId of ['sessions.getStarted.showMe.automation', AUTOMATIONS_TOUR_ID]) {
		test(`a previously shown tour suppresses the click introduction after restart: ${previousTourId}`, async () => {
			const storage = disposables.add(new InMemoryStorageService());
			const configuration = new TestConfigurationService();
			disposables.add(configuration.onDidChangeConfigurationEmitter);
			const context = disposables.add(new ContextKeyService(configuration));
			ChatContextKeys.enabled.bindTo(context).set(true);
			ChatAutomationsEnabledContext.bindTo(context).set(true);
			const intro = createAutomationsTour();
			const runs: string[] = [];
			const kind = 'automations-introduction-test';
			disposables.add(onboardingPresentationRegistry.register({
				kind,
				run: async scenario => {
					runs.push(scenario.id);
					return { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 1 };
				},
			}));
			disposables.add(onboardingScenarioRegistry.register({
				id: 'sessions.getStarted.showMe.automation',
				repeatable: true,
				trigger: { kind: 'command', commandId: 'sessions.getStarted.showMe.automation' },
				presentation: { kind, payload: undefined },
			}));
			disposables.add(onboardingScenarioRegistry.register({ ...intro, presentation: { ...intro.presentation, kind } }));
			const createService = () => disposables.add(new OnboardingScenarioService(
				storage, context, configuration, disposables.add(new TestLifecycleService()), new NullWorkbenchAssignmentService(),
				new class extends mock<ITelemetryService>() { override publicLog2(): void { } }(),
				new class extends mock<IDialogService>() { override readonly hasDialog = false; override readonly onDidShowDialog = Event.None; }(),
			));
			const service = createService();
			service.start();
			await service.runScenario(previousTourId);
			service.dispose();
			Memento.clear(StorageScope.APPLICATION);
			const restarted = createService();
			restarted.start();
			await timeout(0);

			assert.deepStrictEqual({ runs, introduced: restarted.hasBeenShown(AUTOMATIONS_TOUR_ID), eligible: restarted.shouldShowNudge(AUTOMATIONS_TOUR_ID) }, {
				runs: [previousTourId], introduced: true, eligible: false,
			});
		});
	}

	test('waits for activation without consuming the introduction when the view is available', async () => {
		const configuration = new TestConfigurationService();
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		ChatContextKeys.enabled.bindTo(context).set(true);
		ChatAutomationsEnabledContext.bindTo(context).set(true);
		disposables.add(new AutomationsTourContribution());
		const runs: string[] = [];
		disposables.add(onboardingPresentationRegistry.register({
			kind: 'spotlight',
			run: async scenario => {
				runs.push(scenario.id);
				return { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 1 };
			},
		}));
		const service = disposables.add(new OnboardingScenarioService(
			disposables.add(new InMemoryStorageService()), context, configuration, disposables.add(new TestLifecycleService()), new NullWorkbenchAssignmentService(),
			new class extends mock<ITelemetryService>() { override publicLog2(): void { } }(),
			new class extends mock<IDialogService>() { override readonly hasDialog = false; override readonly onDidShowDialog = Event.None; }(),
		));
		service.start();
		await timeout(0);
		const beforeClick = { runs: [...runs], seen: service.hasBeenShown(AUTOMATIONS_TOUR_ID), eligible: service.shouldShowNudge(AUTOMATIONS_TOUR_ID) };
		await configuration.setUserConfiguration('onboarding.enabled', false);
		const disabled = service.shouldShowNudge(AUTOMATIONS_TOUR_ID);
		await configuration.setUserConfiguration('onboarding.enabled', true);
		await service.runScenario(AUTOMATIONS_TOUR_ID);

		assert.deepStrictEqual({ beforeClick, disabled, runs, eligible: service.shouldShowNudge(AUTOMATIONS_TOUR_ID) }, {
			beforeClick: { runs: [], seen: false, eligible: true }, disabled: false, runs: [AUTOMATIONS_TOUR_ID], eligible: false,
		});
	});

	for (const dismiss of ['gotIt', 'escape', 'targetClick', 'targetEnter'] as const) {
		test(`ending the presentation via ${dismiss} restores focus without re-entering the target action`, async () => {
			const container = append(mainWindow.document.body, $('div'));
			disposables.add(toDisposable(() => container.remove()));
			const button = disposables.add(new Button(container, {}));
			button.label = 'Create with Agent';
			disposables.add(markOnboardingTarget(button.element, 'sessions.automations.create'));
			let activations = 0;
			disposables.add(button.onDidClick(() => activations++));
			button.focus();
			const context = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const layout = new class extends TestLayoutService {
				override getContainer() { return mainWindow.document.body; }
			}();
			const presentation = disposables.add(new SpotlightPresentation(layout, new TestHostService(), context, new TestConfigurationService(), NullTelemetryService));
			const shown = new DeferredPromise<void>();
			const result = presentation.run(createAutomationsTour(), {
				targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => { void shown.complete(); },
			});
			await shown.p;
			const callout = mainWindow.document.querySelector<HTMLElement>('.spotlight-callout')!;
			const next = Array.from(callout.querySelectorAll<HTMLElement>('.monaco-button')).find(button => button.textContent === 'Got It')!;
			const beforeDismissal = {
				role: callout.getAttribute('role'),
				focused: mainWindow.document.activeElement === next,
			};
			switch (dismiss) {
				case 'gotIt': next.click(); break;
				case 'escape': next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); break;
				case 'targetClick': button.element.click(); break;
				case 'targetEnter':
					next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
					for (const type of ['keydown', 'keyup']) {
						button.element.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
					}
					break;
			}
			const outcome = (await result).outcome;
			const afterDismissal = {
				activations, restored: mainWindow.document.activeElement === button.element,
				remaining: !!mainWindow.document.querySelector('.spotlight-callout'),
			};
			button.element.click();

			assert.deepStrictEqual({ beforeDismissal, outcome, afterDismissal, subsequentActivations: activations }, {
				beforeDismissal: { role: 'dialog', focused: true },
				outcome: dismiss === 'escape' ? OnboardingOutcome.Skipped : OnboardingOutcome.Completed,
				afterDismissal: { activations: 0, restored: true, remaining: false },
				subsequentActivations: 1,
			});
		});
	}

	test('suppresses the introduction when AI or Automations is disabled, signed out, or blocked', () => {
		const configuration = new TestConfigurationService();
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		const enabled = ChatContextKeys.enabled.bindTo(context);
		const automationsEnabled = ChatAutomationsEnabledContext.bindTo(context);
		enabled.set(true);
		automationsEnabled.set(true);
		const blockers = [
			ChatEntitlementContextKeys.Entitlement.signedOut.bindTo(context),
			EditorPartModalVisibleContext.bindTo(context),
			NewSessionOnboardingHandoffContext.bindTo(context),
			SessionsWelcomeVisibleContext.bindTo(context),
		];
		const scenario = createAutomationsTour();
		const eligible = () => context.contextMatchesRules(scenario.when);
		const initial = eligible();
		enabled.set(false);
		const aiDisabled = eligible();
		enabled.set(true);
		automationsEnabled.set(false);
		const automationsDisabled = eligible();
		automationsEnabled.set(true);
		const blocked = blockers.map(blocker => {
			blocker.set(true);
			const result = eligible();
			blocker.set(false);
			return result;
		});

		assert.deepStrictEqual({ initial, aiDisabled, automationsDisabled, blocked, unblocked: eligible() }, {
			initial: true, aiDisabled: false, automationsDisabled: false, blocked: [false, false, false, false], unblocked: true,
		});
	});
});
