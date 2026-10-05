/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { Memento } from '../../../../../workbench/common/memento.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { OnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/browser/onboardingService.js';
import { markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { SpotlightPresentation } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightPresentation.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { IOnboardingPresentation, onboardingPresentationRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingPresentation.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingDismissReason, OnboardingOutcome } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_ENABLED_CONFIG } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { NullWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/test/common/nullAssignmentService.js';
import { ChatEntitlement, ChatEntitlementContextKeys } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { TestHostService, TestLayoutService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { TestChatEntitlementService, TestLifecycleService, TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { AgentHostSessionTypesAvailableContext, IsNewChatSessionContext, NewSessionOnboardingHandoffContext, SessionHarnessPickerVisibleContext, SessionWorkspacePickerVisibleContext } from '../../../../common/contextkeys.js';
import { ISessionNavigationRequest, ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { getSessionOnboardingTargetId, SessionsList } from '../../../sessions/browser/views/sessionsList.js';
import { SessionsView } from '../../../sessions/browser/views/sessionsView.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { AgentsWindowInvitationOnboarding } from '../../browser/agentsWindowInvitationOnboarding.js';
import { createNewSessionTour, NEW_SESSION_ONBOARDING_SEEN_KEY } from '../../browser/tours/newSessionTour.js';
import { createNewSessionViewTour } from '../../browser/tours/newSessionViewTour.js';
import { createNewSessionViewV2Tour, NEW_SESSION_VIEW_V2_TOUR_ID } from '../../browser/tours/newSessionViewV2Tour.js';
import { AGENTS_WINDOW_INVITATION_TOUR_ID } from '../../browser/tours/agentsWindowInvitationTour.js';
import { createNewSessionViewV3Tour } from '../../browser/tours/newSessionViewV3Tour.js';

suite('AgentsWindowInvitationOnboarding', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => Memento.clear(StorageScope.APPLICATION));

	function createHarness(options: { enabled?: boolean; hidden?: boolean; outcome?: OnboardingOutcome; parallelWorkDeveloperMode?: boolean } = {}) {
		const configuration = new TestConfigurationService({
			[ONBOARDING_ENABLED_CONFIG]: options.enabled ?? true,
			[ONBOARDING_DEVELOPER_MODE_CONFIG]: { [AGENTS_WINDOW_INVITATION_TOUR_ID]: options.parallelWorkDeveloperMode ?? false },
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const context = store.add(new ContextKeyService(configuration));
		ChatContextKeys.enabled.bindTo(context).set(true);
		IsNewChatSessionContext.bindTo(context).set(true);
		AgentHostSessionTypesAvailableContext.bindTo(context).set(true);
		ChatEntitlementContextKeys.Entitlement.signedOut.bindTo(context).set(false);
		const storage = store.add(new TestStorageService());
		const lifecycle = store.add(new TestLifecycleService());
		const treatments = new Map<string, string | number | boolean | undefined | Error | Promise<string | number | boolean | undefined>>();
		const requestedTreatments: string[] = [];
		const refetched = store.add(new Emitter<void>());
		const assignment = new class extends NullWorkbenchAssignmentService {
			override readonly onDidRefetchAssignments = refetched.event;
			override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
				if (name.startsWith('onb.agentsWindowInvitation.')) {
					requestedTreatments.push(name);
					const value = treatments.get(name);
					if (value instanceof Error) {
						throw value;
					}
					return await value as T | undefined;
				}
				return (name.endsWith('.show') ? true : name.endsWith('.id') ? 'onb-parallel-work-test' : undefined) as T | undefined;
			}
		}();
		const onboarding = store.add(new OnboardingScenarioService(storage, context, configuration, lifecycle, assignment, NullTelemetryService));
		store.add(onboardingScenarioRegistry.register(createNewSessionViewV2Tour(constObservable(true))));
		const entitlement = new class extends TestChatEntitlementService {
			override readonly sentiment = { hidden: options.hidden ?? false };
			override readonly sentimentObs = observableValue(this, this.sentiment);
		}();
		entitlement.entitlement = ChatEntitlement.Available;
		entitlement.entitlementObs.set(ChatEntitlement.Available, undefined);
		const session = createTestSession('Running session', { status: SessionStatus.InProgress }).session;
		const activeSession = observableValue<IActiveSession | undefined>(store, upcastPartial<IActiveSession>({ resource: session.resource, isCreated: constObservable(true) }));
		const initialRestoreComplete = observableValue(store, true);
		const navigationRequest = observableValue<ISessionNavigationRequest | undefined>(store, undefined);
		const events: string[] = [];
		const presented: string[] = [];
		const copies: Pick<ISpotlightStep, 'title' | 'description'>[] = [];
		const tourSteps: (readonly ISpotlightStep[])[] = [];
		const started = new DeferredPromise<void>();
		let result = Promise.resolve(options.outcome ?? OnboardingOutcome.Completed);
		let presentation: IOnboardingPresentation | undefined;
		let reveal = () => toDisposable(() => events.push('released'));
		const view = upcastPartial<SessionsView>({
			setExpanded: expanded => { events.push(`expanded:${expanded}`); return true; },
			sessionsControl: upcastPartial<SessionsList>({
				revealSessionForOnboarding: target => {
					events.push(`reveal:${target.sessionId}`);
					const revealed = reveal();
					return { targetId: getSessionOnboardingTargetId(target), dispose: () => revealed.dispose() };
				},
			}),
		});
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IViewsService, {});
		instantiation.stub(IViewsService, 'openView', async () => view);
		const views = instantiation.get(IViewsService);
		store.add(onboardingPresentationRegistry.register({
			kind: SPOTLIGHT_PRESENTATION_KIND,
			async run(scenario, runContext) {
				presented.push(scenario.id);
				if (presentation) {
					return presentation.run(scenario, runContext);
				}
				const payload = scenario.presentation.payload as ISpotlightPayload;
				const steps = await payload.resolveSteps?.() ?? payload.steps;
				tourSteps.push(steps);
				copies.push({ title: steps[0].title, description: steps[0].description });
				await steps[0].onBeforeShow?.();
				started.complete();
				return { outcome: await result, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: steps.length };
			},
		}));
		const warnings: string[] = [];
		const traces: string[] = [];
		const log = store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
			override trace(message: string): void { traces.push(message); }
		}());
		const runner = store.add(new AgentsWindowInvitationOnboarding(
			onboarding, configuration, context, upcastPartial<ISessionsService>({ activeSession, initialRestoreComplete, navigationRequest }),
			lifecycle, views, entitlement, log, assignment,
		));
		return {
			runner, onboarding, context, configuration, session, events, presented, started: started.p, activeSession, initialRestoreComplete, navigationRequest, warnings, traces,
			copies, tourSteps, treatments, requestedTreatments, refetch: () => refetched.fire(),
			handoff: async () => { events.push('handoff'); },
			resolveSession: async () => { events.push('resolve'); return session; },
			pending: () => context.getContextKeyValue<boolean>(NewSessionOnboardingHandoffContext.key),
			setResult: (value: Promise<OnboardingOutcome>) => { result = value; },
			setPresentation: (value: IOnboardingPresentation) => { presentation = value; },
			setReveal: (value: typeof reveal) => { reveal = value; },
			setEntitlement: (value: ChatEntitlement) => {
				entitlement.entitlement = value;
				entitlement.entitlementObs.set(value, undefined);
			},
			hideAI: () => {
				entitlement.sentiment.hidden = true;
				entitlement.sentimentObs.set({ hidden: true }, undefined);
			},
		};
	}

	for (const entry of [
		{ name: 'no assignments', title: undefined, description: undefined, invalid: [] },
		{ name: 'title only', title: 'Your active session', description: undefined, invalid: [] },
		{ name: 'description only', title: undefined, description: 'Switch between your agent sessions here.', invalid: [] },
		{ name: 'both fields', title: 'Your active session', description: 'Switch between your agent sessions here.', invalid: [] },
		{ name: 'empty copy', title: '', description: ' \t ', invalid: ['title', 'description'] },
		{ name: 'non-string copy', title: false, description: 42, invalid: ['title', 'description'] },
	] as const) {
		test(`resolves invitation copy treatments with localized fallbacks: ${entry.name}`, async () => {
			const h = createHarness();
			h.treatments.set('onb.agentsWindowInvitation.title', entry.title);
			h.treatments.set('onb.agentsWindowInvitation.description', entry.description);
			await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
			assert.deepStrictEqual({ copies: h.copies, requested: h.requestedTreatments, warnings: h.warnings }, {
				copies: [{
					title: typeof entry.title === 'string' && entry.title.trim() ? entry.title : 'Your session is here',
					description: typeof entry.description === 'string' && entry.description.trim() ? entry.description : 'Find this session here alongside your other agent sessions.',
				}],
				requested: ['onb.agentsWindowInvitation.title', 'onb.agentsWindowInvitation.description', 'onb.agentsWindowInvitation.newSessionTitle', 'onb.agentsWindowInvitation.newSessionDescription'],
				warnings: entry.invalid.map(field => `[AgentsWindowInvitationOnboarding] Ignoring invalid onb.agentsWindowInvitation.${field} treatment`),
			});
		});
	}

	for (const entry of [
		{ name: 'no assignments', title: undefined, description: undefined, warnings: [] },
		{ name: 'both fields', title: 'Start your next task', description: 'Work on another project in parallel.', warnings: [] },
		{ name: 'invalid copy', title: '', description: false, warnings: ['Ignoring invalid onb.agentsWindowInvitation.newSessionTitle treatment', 'Ignoring invalid onb.agentsWindowInvitation.newSessionDescription treatment'] },
		{ name: 'failed title', title: new Error('Assignment unavailable'), description: 'Work on another project in parallel.', warnings: ['Failed to resolve onb.agentsWindowInvitation.newSessionTitle treatment'] },
	] as const) {
		test(`resolves new-session step copy with localized fallbacks: ${entry.name}`, async () => {
			const h = createHarness();
			h.treatments.set('onb.agentsWindowInvitation.newSessionTitle', entry.title);
			h.treatments.set('onb.agentsWindowInvitation.newSessionDescription', entry.description);
			await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
			assert.deepStrictEqual({
				copies: h.tourSteps[0].slice(1).map(step => ({ title: step.title, description: step.description })),
				warnings: h.warnings,
			}, {
				copies: [{
					title: typeof entry.title === 'string' && entry.title ? entry.title : 'Create a new session from here',
					description: typeof entry.description === 'string' ? entry.description : 'Start another task while your other sessions keep running.',
				}],
				warnings: entry.warnings.map(warning => `[AgentsWindowInvitationOnboarding] ${warning}`),
			});
		});
	}

	test('a failed copy treatment is logged and does not discard the other field or the spotlight', async () => {
		const h = createHarness();
		h.treatments.set('onb.agentsWindowInvitation.title', new Error('Assignment unavailable'));
		h.treatments.set('onb.agentsWindowInvitation.description', 'Switch between your agent sessions here.');
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		assert.deepStrictEqual({ copies: h.copies, warnings: h.warnings }, {
			copies: [{ title: 'Your session is here', description: 'Switch between your agent sessions here.' }],
			warnings: ['[AgentsWindowInvitationOnboarding] Failed to resolve onb.agentsWindowInvitation.title treatment'],
		});
	});

	test('refetched copy applies to the next invitation without changing the current presentation', async () => {
		const h = createHarness();
		const finish = new DeferredPromise<OnboardingOutcome>();
		h.setResult(finish.p);
		h.treatments.set('onb.agentsWindowInvitation.title', 'First title');
		h.treatments.set('onb.agentsWindowInvitation.description', 'First description');
		h.treatments.set('onb.agentsWindowInvitation.newSessionTitle', 'First new-session title');
		h.treatments.set('onb.agentsWindowInvitation.newSessionDescription', 'First new-session description');
		const first = h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		await h.started;
		h.treatments.set('onb.agentsWindowInvitation.title', 'Next title');
		h.treatments.set('onb.agentsWindowInvitation.description', 'Next description');
		h.treatments.set('onb.agentsWindowInvitation.newSessionTitle', 'Next new-session title');
		h.treatments.set('onb.agentsWindowInvitation.newSessionDescription', 'Next new-session description');
		h.refetch();
		await finish.complete(OnboardingOutcome.Completed);
		await first;
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		assert.deepStrictEqual({ copies: h.tourSteps.map(steps => steps.map(step => ({ title: step.title, description: step.description }))), requested: h.requestedTreatments }, {
			copies: [
				[{ title: 'First title', description: 'First description' }, { title: 'First new-session title', description: 'First new-session description' }],
				[{ title: 'Next title', description: 'Next description' }, { title: 'Next new-session title', description: 'Next new-session description' }],
			],
			requested: [
				'onb.agentsWindowInvitation.title', 'onb.agentsWindowInvitation.description', 'onb.agentsWindowInvitation.newSessionTitle', 'onb.agentsWindowInvitation.newSessionDescription',
				'onb.agentsWindowInvitation.title', 'onb.agentsWindowInvitation.description', 'onb.agentsWindowInvitation.newSessionTitle', 'onb.agentsWindowInvitation.newSessionDescription',
			],
		});
	});

	test('does not wait for copy assignments after the handoff is cancelled', async () => {
		const h = createHarness();
		const assignment = new DeferredPromise<string>();
		const resolving = new DeferredPromise<void>();
		const cancellation = store.add(new CancellationTokenSource());
		h.treatments.set('onb.agentsWindowInvitation.title', assignment.p);
		h.setPresentation({
			kind: SPOTLIGHT_PRESENTATION_KIND,
			async run(scenario) {
				const payload = scenario.presentation.payload as ISpotlightPayload;
				const steps = payload.resolveSteps!();
				resolving.complete();
				await steps;
				return { outcome: OnboardingOutcome.Aborted, shown: false, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex: 0, stepCount: 1 };
			},
		});
		const running = h.runner.runWithHandoff(h.handoff, h.resolveSession, cancellation.token);
		await resolving.p;
		cancellation.cancel();
		await running;
		const pending = h.pending();
		await assignment.complete('Late title');
		assert.deepStrictEqual({ pending, events: h.events }, { pending: false, events: ['handoff', 'resolve'] });
	});

	for (const outcome of [OnboardingOutcome.Completed, OnboardingOutcome.Skipped]) {
		test(`repeats after ${outcome} without sharing new-session onboarding state`, async () => {
			const h = createHarness({ outcome });
			const finish = new DeferredPromise<OnboardingOutcome>();
			h.setResult(finish.p);
			const running = h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
			await h.started;
			const pendingDuringTour = h.pending();
			const releasedDuringTour = h.events.includes('released');
			finish.complete(outcome);
			await running;
			await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
			assert.deepStrictEqual({
				pendingDuringTour, releasedDuringTour,
				presented: h.presented,
				events: h.events,
				seen: h.onboarding.hasBeenShown(NEW_SESSION_VIEW_V2_TOUR_ID),
				pending: h.pending(),
			}, {
				pendingDuringTour: true, releasedDuringTour: false,
				presented: [AGENTS_WINDOW_INVITATION_TOUR_ID, AGENTS_WINDOW_INVITATION_TOUR_ID],
				events: ['handoff', 'resolve', 'expanded:true', 'reveal:Running session', 'released', 'handoff', 'resolve', 'expanded:true', 'reveal:Running session', 'released'],
				seen: false,
				pending: false,
			});
		});
	}

	test('shows the invitation spotlight even when the regular V2 tour was already shown', async () => {
		const h = createHarness();
		await h.onboarding.runScenario(NEW_SESSION_VIEW_V2_TOUR_ID);
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		assert.deepStrictEqual({ presented: h.presented, events: h.events }, {
			presented: [NEW_SESSION_VIEW_V2_TOUR_ID, AGENTS_WINDOW_INVITATION_TOUR_ID], events: ['handoff', 'resolve', 'expanded:true', 'reveal:Running session', 'released'],
		});
	});

	test('developer mode replays the variation after the regular V2 tour was shown', async () => {
		const h = createHarness({ parallelWorkDeveloperMode: true });
		await h.onboarding.runScenario(NEW_SESSION_VIEW_V2_TOUR_ID);
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		assert.deepStrictEqual(h.presented, [NEW_SESSION_VIEW_V2_TOUR_ID, AGENTS_WINDOW_INVITATION_TOUR_ID]);
	});

	for (const options of [{ enabled: false }, { hidden: true }]) {
		test(`preserves the handoff without onboarding when ${JSON.stringify(options)}`, async () => {
			const h = createHarness(options);
			await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
			assert.deepStrictEqual({ presented: h.presented, events: h.events }, { presented: [], events: ['handoff'] });
		});
	}

	test('reserves onboarding while the draft and provider catalog load instead of racing startup tours', async () => {
		const h = createHarness();
		for (const scenario of [createNewSessionTour(constObservable(true)), createNewSessionViewTour(constObservable(true)), createNewSessionViewV3Tour(constObservable(true), () => true)]) {
			store.add(onboardingScenarioRegistry.register(scenario));
		}
		const handoff = new DeferredPromise<void>();
		const catalog = new DeferredPromise<typeof h.session>();
		const running = h.runner.runWithHandoff(async () => {
			h.onboarding.start();
			await handoff.p;
		}, () => catalog.p, CancellationToken.None);
		await timeout(0);
		const duringHandoff = { pending: h.pending(), presented: [...h.presented] };
		handoff.complete();
		await timeout(0);
		const duringCatalog = { pending: h.pending(), presented: [...h.presented] };
		catalog.complete(h.session);
		await running;
		await timeout(0);
		assert.deepStrictEqual({ duringHandoff, duringCatalog, presented: h.presented, pending: h.pending() }, {
			duringHandoff: { pending: true, presented: [] },
			duringCatalog: { pending: true, presented: [] },
			presented: [AGENTS_WINDOW_INVITATION_TOUR_ID],
			pending: false,
		});
	});

	test('releases pending onboarding when the handoff is superseded', async () => {
		const h = createHarness();
		const cancellation = store.add(new CancellationTokenSource());
		const handoff = new DeferredPromise<void>();
		const running = h.runner.runWithHandoff(() => handoff.p, h.resolveSession, cancellation.token);
		cancellation.cancel();
		handoff.complete();
		await running;
		assert.deepStrictEqual({ presented: h.presented, pending: h.pending(), events: h.events }, { presented: [], pending: false, events: [] });
	});

	test('cancels a queued tour before registering its replacement', async () => {
		const h = createHarness();
		const blockerId = 'parallelWork.blocker';
		const blocked = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		const targets: string[] = [];
		const replacement = createTestSession('Replacement session', { status: SessionStatus.InProgress }).session;
		store.add(onboardingScenarioRegistry.register({
			id: blockerId,
			trigger: { kind: 'command', commandId: 'noop' },
			presentation: { kind: SPOTLIGHT_PRESENTATION_KIND, payload: undefined },
		}));
		h.setPresentation({
			kind: SPOTLIGHT_PRESENTATION_KIND,
			async run(scenario) {
				if (scenario.id === blockerId) {
					blocked.complete();
					await finish.p;
				} else {
					const payload = scenario.presentation.payload as ISpotlightPayload;
					targets.push(payload.steps[0].targetId);
					await payload.steps[0].onBeforeShow?.();
				}
				return { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 1 };
			},
		});
		const blocker = h.onboarding.runScenario(blockerId);
		await blocked.p;
		const cancellation = store.add(new CancellationTokenSource());
		let firstFinished = false;
		const first = h.runner.runWithHandoff(h.handoff, h.resolveSession, cancellation.token).then(() => { firstFinished = true; });
		await timeout(0);
		cancellation.cancel();
		h.activeSession.set(upcastPartial<IActiveSession>({ resource: replacement.resource, isCreated: constObservable(true) }), undefined);
		const second = h.runner.runWithHandoff(h.handoff, async () => replacement, CancellationToken.None);
		await timeout(0);
		const whileBlocked = { firstFinished, pending: h.pending(), targets: [...targets] };
		finish.complete();
		await Promise.all([blocker, first, second]);

		assert.deepStrictEqual({ whileBlocked, targets, presented: h.presented, pending: h.pending() }, {
			whileBlocked: { firstFinished: true, pending: true, targets: [] },
			targets: [getSessionOnboardingTargetId(replacement)],
			presented: [blockerId, AGENTS_WINDOW_INVITATION_TOUR_ID],
			pending: false,
		});
	});

	test('waits for a superseded presentation to clean up before releasing its target or starting a replacement', async () => {
		const h = createHarness();
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		const targets: string[] = [];
		const replacement = createTestSession('Replacement session', { status: SessionStatus.InProgress }).session;
		h.setPresentation({
			kind: SPOTLIGHT_PRESENTATION_KIND,
			async run(scenario, context) {
				const payload = scenario.presentation.payload as ISpotlightPayload;
				targets.push(payload.steps[0].targetId);
				await payload.steps[0].onBeforeShow?.();
				const presentationStore = new DisposableStore();
				try {
					if (targets.length === 1) {
						presentationStore.add(context.onAbort(() => h.events.push('abort')));
						started.complete();
						await finish.p;
						h.events.push('cleanup');
						return { outcome: OnboardingOutcome.Aborted, shown: true, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex: 0, stepCount: 3 };
					}
					return { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 3 };
				} finally {
					presentationStore.dispose();
				}
			},
		});
		const cancellation = store.add(new CancellationTokenSource());
		const first = h.runner.runWithHandoff(h.handoff, h.resolveSession, cancellation.token);
		await started.p;
		cancellation.cancel();
		h.activeSession.set(upcastPartial<IActiveSession>({ resource: replacement.resource, isCreated: constObservable(true) }), undefined);
		const second = h.runner.runWithHandoff(h.handoff, async () => replacement, CancellationToken.None);
		await timeout(0);
		const duringCleanup = { events: [...h.events], pending: h.pending() };
		finish.complete();
		await Promise.all([first, second]);

		assert.deepStrictEqual({ duringCleanup, targets, events: h.events, pending: h.pending() }, {
			duringCleanup: { events: ['handoff', 'resolve', 'expanded:true', 'reveal:Running session', 'abort'], pending: true },
			targets: [getSessionOnboardingTargetId(h.session), getSessionOnboardingTargetId(replacement)],
			events: ['handoff', 'resolve', 'expanded:true', 'reveal:Running session', 'abort', 'cleanup', 'released', 'handoff', 'expanded:true', 'reveal:Replacement session', 'released'],
			pending: false,
		});
	});

	for (const cancelBy of ['token', 'disposal']) {
		test(`removes the spotlight and restores focus before releasing its reveal on ${cancelBy} cancellation`, () => runWithFakedTimers({ startTime: 1 }, async () => {
			const h = createHarness();
			const container = $('div');
			mainWindow.document.body.appendChild(container);
			store.add(toDisposable(() => container.remove()));
			const input = $('input');
			container.appendChild(input);
			input.focus();
			const row = $('button');
			row.textContent = h.session.title.get();
			container.appendChild(row);
			const releases: { overlay: boolean; focused: boolean }[] = [];
			h.setReveal(() => {
				const target = markOnboardingTarget(row, getSessionOnboardingTargetId(h.session));
				return toDisposable(() => {
					releases.push({ overlay: !!container.querySelector('.spotlight-callout'), focused: mainWindow.document.activeElement === input });
					target.dispose();
				});
			});
			const presentation = store.add(new SpotlightPresentation(
				new class extends TestLayoutService { override getContainer(): HTMLElement { return container; } }(),
				new TestHostService(), h.context,
			));
			const shown = new DeferredPromise<void>();
			h.setPresentation({
				kind: presentation.kind,
				run: (scenario, context) => presentation.run(scenario, {
					...context,
					onDidShow: () => { context.onDidShow?.(); shown.complete(); },
				}),
			});
			const cancellation = store.add(new CancellationTokenSource());
			const running = h.runner.runWithHandoff(h.handoff, h.resolveSession, cancellation.token);
			await shown.p;
			if (cancelBy === 'token') {
				cancellation.cancel();
			} else {
				h.runner.dispose();
			}
			await timeout(0);
			const afterCancellation = { overlay: !!container.querySelector('.spotlight-callout'), target: row.hasAttribute('data-onboarding-id') };
			container.querySelector('.spotlight-callout')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
			await running;

			assert.deepStrictEqual({ afterCancellation, releases, pending: h.pending(), seen: h.onboarding.hasBeenShown(NEW_SESSION_ONBOARDING_SEEN_KEY) }, {
				afterCancellation: { overlay: false, target: false },
				releases: [{ overlay: false, focused: true }],
				pending: false,
				seen: false,
			});
		}));
	}

	test('reports a missing session without marking the tour seen', async () => {
		const h = createHarness();
		await h.runner.runWithHandoff(h.handoff, async () => undefined, CancellationToken.None);
		assert.deepStrictEqual({
			presented: h.presented, warnings: h.warnings.length, pending: h.pending(),
			seen: h.onboarding.hasBeenShown(NEW_SESSION_ONBOARDING_SEEN_KEY),
		}, { presented: [], warnings: 1, pending: false, seen: false });
	});

	for (const hasDraft of [false, true]) {
		test(`spotlights the invited session from the new-session view without activating it (draft: ${hasDraft})`, async () => {
			const h = createHarness();
			const active = hasDraft ? upcastPartial<IActiveSession>({ resource: h.session.resource.with({ path: '/draft' }), isCreated: constObservable(false) }) : undefined;
			h.activeSession.set(active, undefined);
			await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None, false);
			assert.deepStrictEqual({
				preservedActiveSession: h.activeSession.get() === active,
				presented: h.presented,
				events: h.events,
				steps: h.tourSteps[0].map(step => ({ id: step.id, nextButtonLabel: step.nextButtonLabel })),
				requested: h.requestedTreatments,
			}, {
				preservedActiveSession: true,
				presented: [AGENTS_WINDOW_INVITATION_TOUR_ID],
				events: ['handoff', 'resolve', 'expanded:true', 'reveal:Running session', 'released'],
				steps: [{ id: 'session', nextButtonLabel: 'Understood' }],
				requested: ['onb.agentsWindowInvitation.title', 'onb.agentsWindowInvitation.description'],
			});
		});
	}

	test('a spotlight-only handoff allows a pending draft to initialize while restoration settles', async () => {
		const h = createHarness();
		h.activeSession.set(undefined, undefined);
		h.initialRestoreComplete.set(false, undefined);
		const running = h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None, false);
		await timeout(0);
		const beforeRestore = [...h.events];
		const restoredSession = upcastPartial<IActiveSession>({ resource: h.session.resource.with({ path: '/draft' }), isCreated: constObservable(false) });
		h.activeSession.set(restoredSession, undefined);
		h.initialRestoreComplete.set(true, undefined);
		await running;
		assert.deepStrictEqual({
			beforeRestore, preservedActiveSession: h.activeSession.get() === restoredSession, events: h.events,
		}, {
			beforeRestore: ['handoff'], preservedActiveSession: true,
			events: ['handoff', 'resolve', 'expanded:true', 'reveal:Running session', 'released'],
		});
	});

	test('a spotlight-only handoff allows automatic draft creation while resolving the invited session', async () => {
		const h = createHarness();
		h.activeSession.set(undefined, undefined);
		const draft = upcastPartial<IActiveSession>({ resource: h.session.resource.with({ path: '/draft' }), isCreated: constObservable(false) });
		await h.runner.runWithHandoff(h.handoff, async () => {
			h.activeSession.set(draft, undefined);
			return h.resolveSession();
		}, CancellationToken.None, false);
		assert.deepStrictEqual({ presented: h.presented, preservedDraft: h.activeSession.get() === draft }, {
			presented: [AGENTS_WINDOW_INVITATION_TOUR_ID], preservedDraft: true,
		});
	});

	test('cancelling a spotlight-only handoff releases the restoration wait and startup reservation', async () => {
		const h = createHarness();
		const cancellation = store.add(new CancellationTokenSource());
		h.initialRestoreComplete.set(false, undefined);
		const running = h.runner.runWithHandoff(h.handoff, h.resolveSession, cancellation.token, false);
		await timeout(0);
		cancellation.cancel();
		await running;
		assert.deepStrictEqual({ presented: h.presented, events: h.events, pending: h.pending() }, {
			presented: [], events: ['handoff'], pending: false,
		});
	});

	test('a spotlight-only handoff yields to navigation while the provider resolves the invited session', async () => {
		const h = createHarness();
		await h.runner.runWithHandoff(h.handoff, async () => {
			h.activeSession.set(upcastPartial<IActiveSession>({ resource: h.session.resource.with({ path: '/another-session' }), isCreated: constObservable(true) }), undefined);
			return h.resolveSession();
		}, CancellationToken.None, false);
		assert.deepStrictEqual({ presented: h.presented, events: h.events }, { presented: [], events: ['handoff', 'resolve'] });
	});

	test('a queued spotlight-only handoff yields to navigation before showing', async () => {
		const h = createHarness();
		h.activeSession.set(undefined, undefined);
		let cancelled = false;
		h.setPresentation({
			kind: SPOTLIGHT_PRESENTATION_KIND,
			async run(scenario, context) {
				store.add(context.onAbort(() => { cancelled = true; }));
				h.activeSession.set(upcastPartial<IActiveSession>({ resource: h.session.resource.with({ path: '/another-session' }), isCreated: constObservable(true) }), undefined);
				const payload = scenario.presentation.payload as ISpotlightPayload;
				await payload.steps[0].onBeforeShow?.();
				return { outcome: OnboardingOutcome.Aborted, shown: false, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex: 0, stepCount: 1 };
			},
		});
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None, false);
		assert.deepStrictEqual({ cancelled, events: h.events, pending: h.pending() }, {
			cancelled: true, events: ['handoff', 'resolve'], pending: false,
		});
	});

	test('a spotlight-only handoff yields to explicit navigation even if the new-session view stays active', async () => {
		const h = createHarness();
		h.activeSession.set(undefined, undefined);
		await h.runner.runWithHandoff(h.handoff, async () => {
			h.navigationRequest.set({ token: CancellationToken.None }, undefined);
			return h.resolveSession();
		}, CancellationToken.None, false);
		assert.deepStrictEqual({ presented: h.presented, pending: h.pending(), events: h.events }, {
			presented: [], pending: false, events: ['handoff', 'resolve'],
		});
	});

	for (const revealSession of [false, true]) {
		test(`waits for cold-start sign-in before showing the invitation tour (reveal: ${revealSession})`, () => runWithFakedTimers({ startTime: 1 }, async () => {
			const h = createHarness();
			h.setEntitlement(ChatEntitlement.Unknown);
			if (!revealSession) {
				h.activeSession.set(undefined, undefined);
			}
			const running = h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None, revealSession);
			await timeout(1_000);
			const waiting = { pending: h.pending(), presented: [...h.presented] };
			h.setEntitlement(ChatEntitlement.Unresolved);
			await running;
			assert.deepStrictEqual({ waiting, presented: h.presented, pending: h.pending(), stepCount: h.tourSteps[0].length }, {
				waiting: { pending: true, presented: [] },
				presented: [AGENTS_WINDOW_INVITATION_TOUR_ID],
				pending: false,
				stepCount: revealSession ? 2 : 1,
			});
		}));
	}

	test('bounds the sign-in wait and releases the startup reservation without showing a tour', () => runWithFakedTimers({ startTime: 1 }, async () => {
		const h = createHarness();
		h.setEntitlement(ChatEntitlement.Unknown);
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		assert.deepStrictEqual({ presented: h.presented, pending: h.pending(), traces: h.traces }, {
			presented: [], pending: false, traces: ['[AgentsWindowInvitationOnboarding] Timed out waiting for Chat sign-in.'],
		});
	}));

	test('cancels the sign-in wait without waiting for its deadline', () => runWithFakedTimers({ startTime: 1 }, async () => {
		const h = createHarness();
		h.setEntitlement(ChatEntitlement.Unknown);
		const cancellation = store.add(new CancellationTokenSource());
		const running = h.runner.runWithHandoff(h.handoff, h.resolveSession, cancellation.token);
		await timeout(1_000);
		cancellation.cancel();
		await running;
		assert.deepStrictEqual({ presented: h.presented, pending: h.pending(), traces: h.traces }, {
			presented: [], pending: false, traces: [],
		});
	}));

	test('does not resume onboarding after navigation while sign-in was pending', () => runWithFakedTimers({ startTime: 1 }, async () => {
		const h = createHarness();
		h.setEntitlement(ChatEntitlement.Unknown);
		const running = h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		await timeout(1_000);
		h.navigationRequest.set({ token: CancellationToken.None }, undefined);
		h.setEntitlement(ChatEntitlement.Available);
		await running;
		assert.deepStrictEqual({ presented: h.presented, pending: h.pending() }, { presented: [], pending: false });
	}));

	test('does not spotlight after the user navigates away from the invited session', async () => {
		const h = createHarness();
		h.activeSession.set(upcastPartial<IActiveSession>({ resource: h.session.resource.with({ path: '/another-session' }), isCreated: constObservable(true) }), undefined);
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		assert.deepStrictEqual({ presented: h.presented, events: h.events }, { presented: [], events: ['handoff', 'resolve'] });
	});

	test('cancels a queued spotlight if its target is no longer the active session before showing', async () => {
		const h = createHarness();
		let cancelled = false;
		h.setPresentation({
			kind: SPOTLIGHT_PRESENTATION_KIND,
			async run(scenario, context) {
				store.add(context.onAbort(() => { cancelled = true; }));
				h.activeSession.set(upcastPartial<IActiveSession>({ resource: h.session.resource.with({ path: '/another-session' }), isCreated: constObservable(true) }), undefined);
				const payload = scenario.presentation.payload as ISpotlightPayload;
				await payload.steps[0].onBeforeShow?.();
				return { outcome: OnboardingOutcome.Aborted, shown: false, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex: 0, stepCount: 1 };
			},
		});
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		assert.deepStrictEqual({ cancelled, events: h.events, pending: h.pending(), shown: h.onboarding.hasBeenShown(AGENTS_WINDOW_INVITATION_TOUR_ID) }, {
			cancelled: true, events: ['handoff', 'resolve'], pending: false, shown: false,
		});
	});

	test('propagates handoff failures and clears the startup-tour reservation', async () => {
		const h = createHarness();
		await assert.rejects(h.runner.runWithHandoff(async () => { throw new Error('handoff failed'); }, h.resolveSession, CancellationToken.None), /handoff failed/);
		assert.deepStrictEqual({ presented: h.presented, pending: h.pending() }, { presented: [], pending: false });
	});

	test('does not show the New Session step after navigation away from the invited session', async () => {
		const h = createHarness();
		let cancelled = false;
		h.setPresentation({
			kind: SPOTLIGHT_PRESENTATION_KIND,
			async run(scenario, context) {
				store.add(context.onAbort(() => { cancelled = true; }));
				const payload = scenario.presentation.payload as ISpotlightPayload;
				await payload.steps[0].onBeforeShow?.();
				h.activeSession.set(undefined, undefined);
				h.navigationRequest.set({ token: CancellationToken.None }, undefined);
				await payload.steps[1].onBeforeShow?.();
				return { outcome: OnboardingOutcome.Aborted, shown: true, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex: 0, stepCount: 2 };
			},
		});
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		assert.deepStrictEqual({ cancelled, events: h.events, pending: h.pending() }, {
			cancelled: true, events: ['handoff', 'resolve', 'expanded:true', 'reveal:Running session', 'released'], pending: false,
		});
	});

	for (const change of ['navigation', 'activeSession', 'disabledOnboarding', 'hiddenAI'] as const) {
		test(`cancels a visible spotlight when ${change} changes and releases its UI and reservation`, () => runWithFakedTimers({ startTime: 1 }, async () => {
			const h = createHarness();
			const container = $('div');
			mainWindow.document.body.appendChild(container);
			store.add(toDisposable(() => container.remove()));
			const input = $('input');
			const row = $('button');
			container.append(input, row);
			input.focus();
			h.setReveal(() => markOnboardingTarget(row, getSessionOnboardingTargetId(h.session)));
			const presentation = store.add(new SpotlightPresentation(
				new class extends TestLayoutService { override getContainer(): HTMLElement { return container; } }(),
				new TestHostService(), h.context,
			));
			let shown = false;
			let cancelled = false;
			h.setPresentation({
				kind: presentation.kind,
				run: (scenario, context) => {
					store.add(context.onAbort(() => { cancelled = true; }));
					return presentation.run(scenario, {
						...context,
						onDidShow: () => {
							context.onDidShow?.();
							shown = true;
							if (change === 'navigation') {
								h.navigationRequest.set({ token: CancellationToken.None }, undefined);
							} else if (change === 'activeSession') {
								h.activeSession.set(undefined, undefined);
							} else if (change === 'hiddenAI') {
								h.hideAI();
							} else {
								void h.configuration.setUserConfiguration(ONBOARDING_ENABLED_CONFIG, false).then(() => {
									h.configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
										affectedKeys: new Set([ONBOARDING_ENABLED_CONFIG]),
										affectsConfiguration: section => section === ONBOARDING_ENABLED_CONFIG,
									}));
								});
							}
						},
					});
				},
			});
			await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
			assert.deepStrictEqual({
				shown, cancelled, focused: mainWindow.document.activeElement === input,
				overlay: !!container.querySelector('.spotlight-callout'),
				target: row.hasAttribute('data-onboarding-id'), pending: h.pending(),
			}, { shown: true, cancelled: true, focused: true, overlay: false, target: false, pending: false });
		}));
	}

	test('renders experiment copy on an inactive session row without opening it and restores focus after keyboard dismissal', () => runWithFakedTimers({ startTime: 1 }, async () => {
		const h = createHarness();
		const active = upcastPartial<IActiveSession>({ resource: h.session.resource.with({ path: '/draft' }), isCreated: constObservable(false) });
		h.activeSession.set(active, undefined);
		h.treatments.set('onb.agentsWindowInvitation.title', 'Your active session');
		h.treatments.set('onb.agentsWindowInvitation.description', 'Switch between your agent sessions here.');
		const container = $('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const input = $('input');
		container.appendChild(input);
		input.focus();
		const row = $('button');
		row.textContent = h.session.title.get();
		container.appendChild(row);
		h.setReveal(() => markOnboardingTarget(row, getSessionOnboardingTargetId(h.session)));
		let rowActivations = 0;
		store.add(addDisposableListener(row, EventType.CLICK, () => rowActivations++));
		for (const picker of ['workspacePicker', 'harnessPicker', 'modelPicker']) {
			const button = $('button');
			button.textContent = picker;
			container.appendChild(button);
			store.add(markOnboardingTarget(button, `sessions.newSession.${picker}`));
		}
		SessionWorkspacePickerVisibleContext.bindTo(h.context).set(true);
		SessionHarnessPickerVisibleContext.bindTo(h.context).set(true);
		const presentation = store.add(new SpotlightPresentation(
			new class extends TestLayoutService { override getContainer(): HTMLElement { return container; } }(),
			new TestHostService(), h.context,
		));
		const steps: { title: string | undefined; description: string | undefined; action: string | null; primary: boolean }[] = [];
		h.setPresentation({
			kind: presentation.kind,
			run: (scenario, runContext) => presentation.run(scenario, {
				...runContext,
				onDidShow: () => {
					runContext.onDidShow?.();
					const next = [...container.querySelectorAll<HTMLElement>('.spotlight-callout-actions .monaco-button')].at(-1)!;
					steps.push({
						title: container.querySelector('.spotlight-callout-title')?.textContent ?? undefined,
						description: container.querySelector('.spotlight-callout-description')?.textContent ?? undefined,
						action: next.textContent,
						primary: !next.classList.contains('secondary')
							&& [defaultButtonStyles.buttonBackground, defaultButtonStyles.buttonHoverBackground].includes(next.style.backgroundColor),
					});
					next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
				},
			}),
		});
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None, false);
		assert.deepStrictEqual({
			steps, rowActivations, focused: mainWindow.document.activeElement === input,
			preservedActiveSession: h.activeSession.get() === active,
			overlayRemaining: !!container.querySelector('.spotlight-callout'),
			rowTargetRemaining: row.hasAttribute('data-onboarding-id'),
		}, {
			steps: [{ title: 'Your active session', description: 'Switch between your agent sessions here.', action: 'Understood', primary: true }],
			rowActivations: 0, focused: true, overlayRemaining: false, rowTargetRemaining: false,
			preservedActiveSession: true,
		});
	}));

	for (const finishWith of ['understood', 'click', 'keyboard'] as const) {
		test(`shows the session then the interactive New Session button and completes via ${finishWith}`, () => runWithFakedTimers({ startTime: 1 }, async () => {
			const h = createHarness();
			const container = $('div');
			mainWindow.document.body.appendChild(container);
			store.add(toDisposable(() => container.remove()));
			const input = $('input');
			container.appendChild(input);
			input.focus();
			const row = $('button');
			row.textContent = h.session.title.get();
			container.appendChild(row);
			h.setReveal(() => markOnboardingTarget(row, getSessionOnboardingTargetId(h.session)));
			const newSession = store.add(new Button(container, { ...defaultButtonStyles }));
			newSession.label = 'New Session';
			store.add(markOnboardingTarget(newSession.element, 'sessions.newSession.button', {
				onDidActivate: Event.map(newSession.onDidClick, () => undefined),
			}));
			let newSessionActivations = 0;
			store.add(newSession.onDidClick(() => {
				newSessionActivations++;
				h.activeSession.set(undefined, undefined);
				h.navigationRequest.set({ token: CancellationToken.None }, undefined);
				input.focus();
			}));
			const presentation = store.add(new SpotlightPresentation(
				new class extends TestLayoutService { override getContainer(): HTMLElement { return container; } }(),
				new TestHostService(), h.context,
			));
			const steps: { title: string | undefined; action: string | null; primary: boolean; interactive: boolean; clickable: boolean }[] = [];
			h.setPresentation({
				kind: presentation.kind,
				run: (scenario, context) => presentation.run(scenario, {
					...context,
					onDidShow: () => {
						context.onDidShow?.();
						const next = [...container.querySelectorAll<HTMLElement>('.spotlight-callout-actions .monaco-button')].at(-1)!;
						const target = steps.length === 0 ? row : newSession.element;
						const bounds = target.getBoundingClientRect();
						const hit = mainWindow.document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
						steps.push({
							title: container.querySelector('.spotlight-callout-title')?.textContent ?? undefined,
							action: next.textContent,
							primary: !next.classList.contains('secondary')
								&& [defaultButtonStyles.buttonBackground, defaultButtonStyles.buttonHoverBackground].includes(next.style.backgroundColor),
							interactive: container.querySelector('.spotlight-callout')?.getAttribute('aria-modal') === 'false',
							clickable: !!hit && target.contains(hit),
						});
						if (steps.length === 1 || finishWith === 'understood') {
							next.click();
						} else if (finishWith === 'click') {
							newSession.element.click();
						} else {
							next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
							assert.strictEqual(mainWindow.document.activeElement, newSession.element);
							newSession.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
						}
					},
				}),
			});
			await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
			assert.deepStrictEqual({
				steps, newSessionActivations, activeSession: h.activeSession.get()?.resource,
				focused: mainWindow.document.activeElement === input,
				overlayRemaining: !!container.querySelector('.spotlight-callout'),
				rowTargetRemaining: row.hasAttribute('data-onboarding-id'),
				pending: h.pending(),
			}, {
				steps: [
					{ title: 'Your session is here', action: 'Next', primary: true, interactive: false, clickable: false },
					{ title: 'Create a new session from here', action: 'Understood', primary: true, interactive: true, clickable: true },
				],
				newSessionActivations: finishWith === 'understood' ? 0 : 1,
				activeSession: finishWith === 'understood' ? h.session.resource : undefined,
				focused: true, overlayRemaining: false, rowTargetRemaining: false, pending: false,
			});
		}));
	}
});
