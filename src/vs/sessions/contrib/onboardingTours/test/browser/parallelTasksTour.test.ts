/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorPartModalVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AgentsWindowUsage } from '../../../../../workbench/contrib/chat/common/agentsWindowUsage.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { ChatEntitlementContextKeys } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { NewSessionOnboardingHandoffContext, SessionsWelcomeVisibleContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ParallelTasksTourContribution } from '../../browser/parallelTasksTourContribution.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from '../../browser/tours/newSessionTour.js';
import { createParallelTasksTour, PARALLEL_TASKS_ONBOARDING_SEEN_KEY, PARALLEL_TASKS_TOUR_ID } from '../../browser/tours/parallelTasksTour.js';

suite('ParallelTasksTour', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(id = 'session') {
		const status = observableValue('status', SessionStatus.InProgress);
		const isCreated = observableValue('isCreated', true);
		const isArchived = observableValue('isArchived', false);
		const isAutomation = observableValue('isAutomation', false);
		const session = new class extends mock<IActiveSession>() {
			override readonly sessionId = id;
			override readonly status = status;
			override readonly isCreated = isCreated;
			override readonly isArchived = isArchived;
			override readonly isAutomation = isAutomation;
		}();
		return { session, status, isCreated, isArchived, isAutomation };
	}

	function createHarness(sessionCount = 1) {
		const storage = disposables.add(new InMemoryStorageService());
		const usage = new AgentsWindowUsage(storage);
		for (let i = 0; i < sessionCount; i++) {
			usage.recordSessionCreated();
		}
		const started = disposables.add(new Emitter<ISession>());
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const initialRestoreComplete = observableValue('initialRestoreComplete', true);
		const contribution = disposables.add(new ParallelTasksTourContribution(
			new class extends mock<ISessionsManagementService>() {
				override readonly onDidStartSession = started.event;
			}(),
			new class extends mock<ISessionsService>() {
				override readonly activeSession = activeSession;
				override readonly initialRestoreComplete = initialRestoreComplete;
			}(),
			storage,
			new class extends mock<IViewsService>() { }(),
		));
		const scenario = onboardingScenarioRegistry.getScenario(PARALLEL_TASKS_TOUR_ID)!;
		const triggered = () => scenario.trigger.kind === 'observable' && scenario.trigger.signal.get();
		const start = (session: IActiveSession) => {
			activeSession.set(session, undefined);
			started.fire(session);
		};
		return { usage, started, activeSession, initialRestoreComplete, contribution, start, triggered };
	}

	test('highlights New Session independently of the removed first-task and new-session tours', async () => {
		let revealed = 0;
		const scenario = createParallelTasksTour(observableValue('trigger', false), async () => { revealed++; });
		const [step] = scenario.presentation.payload.steps;
		await step.onBeforeShow!();

		assert.deepStrictEqual({
			id: scenario.id,
			seenKey: scenario.seenKey,
			independentSeenKey: scenario.seenKey !== NEW_SESSION_ONBOARDING_SEEN_KEY && !scenario.seenKey?.includes('firstTask'),
			experiment: scenario.experiment,
			presentation: scenario.presentation.kind,
			step: { ...step, onBeforeShow: undefined },
			revealed,
		}, {
			id: 'sessions.onboarding.parallelTasks',
			seenKey: PARALLEL_TASKS_ONBOARDING_SEEN_KEY,
			independentSeenKey: true,
			experiment: {
				behaviorFlag: 'onb.parallelTasks.show',
				assignmentContextIdFlag: 'onb.parallelTasks.id',
			},
			presentation: 'spotlight',
			step: {
				id: 'newSession',
				targetId: 'sessions.newSession.button',
				title: 'Start another task while this runs',
				description: 'Sessions run side by side, so you don\'t have to wait for this one to finish.',
				nextButtonLabel: 'Got It',
				placement: 'right',
				allowTargetInteraction: true,
				advanceOnTargetClick: true,
				hideNext: false,
				missingTarget: { kind: 'wait', timeoutMs: 5_000, onTimeout: 'skip' },
				onBeforeShow: undefined,
			},
			revealed: 1,
		});
	});

	test('hides the tour when AI is disabled, signed out, or a blocking surface is open', () => {
		const configuration = new TestConfigurationService();
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		const enabled = ChatContextKeys.enabled.bindTo(context);
		enabled.set(true);
		const blockers = [
			ChatEntitlementContextKeys.Entitlement.signedOut.bindTo(context),
			EditorPartModalVisibleContext.bindTo(context),
			NewSessionOnboardingHandoffContext.bindTo(context),
			SessionsWelcomeVisibleContext.bindTo(context),
		];
		const scenario = createParallelTasksTour(observableValue('trigger', false), async () => { });
		const eligible = () => context.contextMatchesRules(scenario.when);
		const initial = eligible();
		enabled.set(false);
		const aiDisabled = eligible();
		enabled.set(true);
		const blocked = blockers.map(blocker => {
			blocker.set(true);
			const result = eligible();
			blocker.set(false);
			return result;
		});

		assert.deepStrictEqual({ initial, aiDisabled, blocked, unblocked: eligible() }, {
			initial: true, aiDisabled: false, blocked: [false, false, false, false], unblocked: true,
		});
	});

	for (const sessionCount of [1, 2, 3, 4]) {
		test(`only triggers below three lifetime sessions (${sessionCount} created) after navigation settles`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { start, triggered } = createHarness(sessionCount);
			start(createSession().session);
			await timeout(1_499);
			const beforeDelay = triggered();
			await timeout(1);

			assert.deepStrictEqual({ beforeDelay, afterDelay: triggered() }, { beforeDelay: false, afterDelay: sessionCount < 3 });
		}));
	}

	test('does not trigger before a user starts a session or for restored sessions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { activeSession, triggered } = createHarness(0);
		await timeout(1_500);
		const beforeSession = triggered();
		activeSession.set(createSession().session, undefined);
		await timeout(1_500);

		assert.deepStrictEqual({ beforeSession, restoredSession: triggered() }, { beforeSession: false, restoredSession: false });
	}));

	test('rechecks the lifetime count when a third session is recorded after it starts', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { start, usage, triggered } = createHarness(2);
		start(createSession().session);
		await timeout(1_000);
		usage.recordSessionCreated();
		await timeout(1_500);

		assert.strictEqual(triggered(), false);
	}));

	test('withdraws eligibility when another window records the third session', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { start, usage, triggered } = createHarness(2);
		start(createSession().session);
		await timeout(1_500);
		const beforeThirdSession = triggered();
		usage.recordSessionCreated();

		assert.deepStrictEqual({ beforeThirdSession, afterThirdSession: triggered() }, { beforeThirdSession: true, afterThirdSession: false });
	}));

	for (const change of ['completed', 'archived', 'automation', 'draft', 'navigatedAway', 'disposed'] as const) {
		test(`cancels the pending spotlight when the session is ${change}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { start, activeSession, contribution, triggered } = createHarness();
			const session = createSession();
			start(session.session);
			await timeout(1_000);
			switch (change) {
				case 'completed': session.status.set(SessionStatus.Completed, undefined); break;
				case 'archived': session.isArchived.set(true, undefined); break;
				case 'automation': session.isAutomation.set(true, undefined); break;
				case 'draft': session.isCreated.set(false, undefined); break;
				case 'navigatedAway': activeSession.set(createSession('other').session, undefined); break;
				case 'disposed': contribution.dispose(); break;
			}
			await timeout(1_500);

			assert.strictEqual(triggered(), false);
		}));
	}

	test('waits for restore and the newly started session to become active', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { started, activeSession, initialRestoreComplete, triggered } = createHarness();
		const { session } = createSession();
		initialRestoreComplete.set(false, undefined);
		started.fire(session);
		await timeout(1_500);
		const beforeActive = triggered();
		activeSession.set(session, undefined);
		await timeout(1_500);
		const beforeRestore = triggered();
		initialRestoreComplete.set(true, undefined);
		await timeout(1_500);

		assert.deepStrictEqual({ beforeActive, beforeRestore, afterRestore: triggered() }, { beforeActive: false, beforeRestore: false, afterRestore: true });
	}));
});
