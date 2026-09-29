/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostSessionTypesAvailableContext, IsNewChatSessionContext, SessionHasWorkspaceContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { findOnboardingTarget, markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ChatEntitlement, ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { createSessionsPartTestHarness, createTestActiveSession, getSessionPickerVisibility } from '../../../../test/browser/sessionViewTestUtils.js';
import { NewSessionViewTourTrigger } from '../../browser/newSessionViewTourTrigger.js';
import { createNewSessionViewTour } from '../../browser/tours/newSessionViewTour.js';
import { createNewSessionViewV2Tour, NEW_SESSION_VIEW_V2_TOUR_ID } from '../../browser/tours/newSessionViewV2Tour.js';
import { createNewSessionViewV3Tour, NEW_SESSION_VIEW_V3_TOUR_ID } from '../../browser/tours/newSessionViewV3Tour.js';
import { TOTAL_SESSIONS_KEY } from '../../../sessions/browser/sessionsLifecycleTracker.js';

suite('NewSessionViewTourTrigger', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options: { restored?: boolean; entitlement?: ChatEntitlement; requestsSent?: number; shown?: boolean } = {}) {
		const fixture = createSessionsPartTestHarness(disposables);
		const { configurationService, contextKeyService, part } = fixture;
		const initialRestoreComplete = observableValue('initialRestoreComplete', options.restored ?? true);
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
			override readonly initialRestoreComplete = initialRestoreComplete;
		}();
		const entitlement = observableValue('entitlement', options.entitlement ?? ChatEntitlement.Available);
		const entitlementService = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeEntitlement = Event.None;
			override readonly entitlementObs = entitlement;
			override get entitlement(): ChatEntitlement { return entitlement.get(); }
		}();
		const onboardingService = new class extends mock<IOnboardingScenarioService>() {
			override hasBeenShown(): boolean { return options.shown ?? false; }
		}();
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(TOTAL_SESSIONS_KEY, options.requestsSent ?? 0, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const triggers = [NEW_SESSION_VIEW_V2_TOUR_ID, NEW_SESSION_VIEW_V3_TOUR_ID].map(id => disposables.add(new NewSessionViewTourTrigger(
			id,
			onboardingService,
			sessionsService,
			storageService,
			configurationService,
			contextKeyService,
			entitlementService,
		)));
		const open = (visible: readonly (IActiveSession | undefined)[], active: IActiveSession | undefined) => {
			activeSession.set(active, undefined);
			part.updateVisibleSessions(visible, active);
		};
		return { ...fixture, initialRestoreComplete, entitlement, triggers, open, signals: () => triggers.map(trigger => trigger.signal.get()) };
	}

	test('waits for the actual visible-session restore before triggering', () => {
		const { open, chatViews, initialRestoreComplete, signals } = createHarness({ restored: false });
		open([undefined], undefined);
		chatViews[0].inputPickerVisibility.setVisible('workspace', true);

		const beforeRestore = signals();
		initialRestoreComplete.set(true, undefined);

		assert.deepStrictEqual({ beforeRestore, afterRestore: signals() }, { beforeRestore: [false, false], afterRestore: [true, true] });
	});

	test('V2 and V3 use the active empty composer for trigger readiness and workspace-step eligibility', () => {
		const { open, part, chatViews, contextKeyService, triggers, signals } = createHarness();
		const existing = createTestActiveSession('existing');
		open([existing, undefined], existing);
		const composer = chatViews.find(view => view.kind === 'newSession')!;
		const v2 = createNewSessionViewV2Tour(triggers[0].signal);
		const v3 = createNewSessionViewV3Tour(triggers[1].signal, () => true);
		const v2Workspace = v2.presentation.payload.steps[0];
		const v3Workspace = v3.presentation.payload.steps[0].payload as typeof v2Workspace;
		const workspaceSteps = () => [v2Workspace, v3Workspace].map(step => contextKeyService.contextMatchesRules(step.when));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		AgentHostSessionTypesAvailableContext.bindTo(contextKeyService).set(true);
		ChatEntitlementContextKeys.Entitlement.signedOut.bindTo(contextKeyService).set(false);
		IsNewChatSessionContext.bindTo(contextKeyService).set(true);
		const scenarioEligible = [v2, v3].map(scenario => contextKeyService.contextMatchesRules(scenario.when));

		open([existing, undefined], undefined);
		const beforeRender = { signals: signals(), workspaceSteps: workspaceSteps() };
		const target = document.createElement('button');
		target.textContent = 'Workspace';
		composer.element.appendChild(target);
		disposables.add(markOnboardingTarget(target, v2Workspace.targetId));
		composer.inputPickerVisibility.setVisible('workspace', true);
		const afterRender = { signals: signals(), workspaceSteps: workspaceSteps() };
		SessionHasWorkspaceContext.bindTo(contextKeyService).set(true);

		assert.deepStrictEqual({
			scenarioEligible,
			beforeRender,
			afterRender,
			visibleTarget: findOnboardingTarget(mainWindow, v2Workspace.targetId) === target,
			global: getSessionPickerVisibility(contextKeyService),
			local: getSessionPickerVisibility(contextKeyService, part.getSessionView(undefined)!.element),
			afterWorkspaceSelection: workspaceSteps(),
		}, {
			scenarioEligible: [true, true],
			beforeRender: { signals: [false, false], workspaceSteps: [false, false] },
			afterRender: { signals: [true, true], workspaceSteps: [true, true] },
			visibleTarget: true,
			global: { workspace: true, harness: false, isolation: false },
			local: { workspace: true, harness: false, isolation: false },
			afterWorkspaceSelection: [false, false],
		});
	});

	test('inactive and hidden composers cannot trigger either tour, and all picker steps follow the active view', () => {
		const { open, part, chatViews, contextKeyService, triggers, signals } = createHarness();
		const existing = createTestActiveSession('existing');
		open([undefined, existing], existing);
		const composer = chatViews.find(view => view.kind === 'newSession')!;
		composer.inputPickerVisibility.setVisible('workspace', true);
		composer.inputPickerVisibility.setVisible('harness', true);
		composer.inputPickerVisibility.setVisible('isolation', true);
		const steps = createNewSessionViewTour(triggers[0].signal).presentation.payload.steps;
		const eligibleSteps = () => steps.map(step => contextKeyService.contextMatchesRules(step.when));
		const inactive = { signals: signals(), steps: eligibleSteps() };
		part.setContentVisible(false);
		open([undefined, existing], undefined);
		const hidden = { signals: signals(), steps: eligibleSteps() };
		part.setContentVisible(true);

		assert.deepStrictEqual({
			inactive, hidden,
			active: { signals: signals(), steps: eligibleSteps() },
		}, {
			inactive: { signals: [false, false], steps: [false, false, false] },
			hidden: { signals: [false, false], steps: [false, false, false] },
			active: { signals: [true, true], steps: [true, true, true] },
		});
	});

	for (const options of [{ entitlement: ChatEntitlement.Unknown }, { requestsSent: 2 }, { shown: true }]) {
		test(`preserves eligibility guards with scoped picker state: ${JSON.stringify(options)}`, () => {
			const { open, chatViews, signals } = createHarness(options);
			open([undefined], undefined);
			chatViews[0].inputPickerVisibility.setVisible('workspace', true);

			assert.deepStrictEqual(signals(), [false, false]);
		});
	}
});
