/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
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
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/browser/onboardingService.js';
import { onboardingPresentationRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingPresentation.js';
import { OnboardingDismissReason, OnboardingOutcome } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { ICustomViewDescriptor, ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { SessionsWelcomeVisibleContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ChatEntitlementContextKeys } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { NullWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/test/common/nullAssignmentService.js';
import { TestLifecycleService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { NewSessionOnboardingHandoffContext } from '../../../../common/agentsWindowContextKeys.js';
import { AutomationsTourContribution } from '../../browser/automationsTourContribution.js';
import { AUTOMATIONS_TOUR_ID, createAutomationsTour } from '../../browser/tours/automationsTour.js';

suite('AutomationsTour', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => Memento.clear(StorageScope.APPLICATION));

	test('a previously shown checklist tour suppresses the automatic introduction', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const configuration = new TestConfigurationService();
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		ChatContextKeys.enabled.bindTo(context).set(true);
		ChatAutomationsEnabledContext.bindTo(context).set(true);
		const visible = observableValue('automationsVisible', false);
		const intro = createAutomationsTour(visible);
		const runs: string[] = [];
		const kind = 'automations-introduction-test';
		disposables.add(onboardingPresentationRegistry.register({
			kind,
			run: async scenario => {
				runs.push(scenario.id);
				return { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 1 };
			},
		}));
		const legacyTourId = 'sessions.getStarted.showMe.automation';
		disposables.add(onboardingScenarioRegistry.register({
			id: legacyTourId,
			repeatable: true,
			trigger: { kind: 'command', commandId: legacyTourId },
			presentation: { kind, payload: undefined },
		}));
		disposables.add(onboardingScenarioRegistry.register({ ...intro, presentation: { ...intro.presentation, kind } }));
		const service = disposables.add(new OnboardingScenarioService(
			storage, context, configuration, disposables.add(new TestLifecycleService()), new NullWorkbenchAssignmentService(),
			new class extends mock<ITelemetryService>() { override publicLog2(): void { } }(),
			new class extends mock<IDialogService>() { override readonly hasDialog = false; override readonly onDidShowDialog = Event.None; }(),
		));
		service.start();
		await service.runScenario(legacyTourId);
		visible.set(true, undefined);
		await timeout(0);

		assert.deepStrictEqual({ runs, introduced: service.hasBeenShown(AUTOMATIONS_TOUR_ID) }, {
			runs: [legacyTourId], introduced: true,
		});
	});

	test('is eligible only while Automations is open, including a restored opening', () => {
		const automations = upcastPartial<ICustomViewDescriptor>({ id: AUTOMATIONS_CUSTOM_VIEW_ID });
		const activeCustomView = observableValue<ICustomViewDescriptor | undefined>('activeCustomView', automations);
		const contribution = disposables.add(new AutomationsTourContribution(new class extends mock<ICustomViewService>() {
			override readonly activeCustomView = activeCustomView;
		}()));
		const scenario = onboardingScenarioRegistry.getScenario(AUTOMATIONS_TOUR_ID)!;
		const triggered = () => scenario.trigger.kind === 'observable' && scenario.trigger.signal.get();
		const restored = triggered();
		activeCustomView.set(undefined, undefined);
		const hidden = triggered();
		activeCustomView.set(upcastPartial<ICustomViewDescriptor>({ id: 'other' }), undefined);
		const otherView = triggered();
		activeCustomView.set(automations, undefined);
		const reopened = triggered();
		contribution.dispose();

		assert.deepStrictEqual({ restored, hidden, otherView, reopened, unregistered: !onboardingScenarioRegistry.getScenario(AUTOMATIONS_TOUR_ID) }, {
			restored: true, hidden: false, otherView: false, reopened: true, unregistered: true,
		});
	});

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
		const scenario = createAutomationsTour(observableValue('visible', true));
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
