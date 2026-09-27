/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { Memento } from '../../../../../workbench/common/memento.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { OnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/browser/onboardingService.js';
import { markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { SpotlightPresentation } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightPresentation.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { IOnboardingPresentation, onboardingPresentationRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingPresentation.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingDismissReason, OnboardingOutcome } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { ONBOARDING_ENABLED_CONFIG } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { NullWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/test/common/nullAssignmentService.js';
import { ChatEntitlement, ChatEntitlementContextKeys } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { TestHostService, TestLayoutService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { TestChatEntitlementService, TestLifecycleService, TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { AgentHostSessionTypesAvailableContext, IsNewChatSessionContext, NewSessionOnboardingHandoffContext, SessionHarnessPickerVisibleContext, SessionWorkspacePickerVisibleContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { getSessionOnboardingTargetId, SessionsList } from '../../../sessions/browser/views/sessionsList.js';
import { SessionsView } from '../../../sessions/browser/views/sessionsView.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { ParallelWorkOnboarding } from '../../browser/parallelWorkOnboarding.js';
import { createNewSessionTour, NEW_SESSION_ONBOARDING_SEEN_KEY } from '../../browser/tours/newSessionTour.js';
import { createNewSessionViewTour } from '../../browser/tours/newSessionViewTour.js';
import { createNewSessionViewV2Tour, NEW_SESSION_VIEW_V2_PARALLEL_WORK_TOUR_ID, NEW_SESSION_VIEW_V2_TOUR_ID } from '../../browser/tours/newSessionViewV2Tour.js';
import { createNewSessionViewV3Tour } from '../../browser/tours/newSessionViewV3Tour.js';

suite('ParallelWorkOnboarding', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => Memento.clear(StorageScope.APPLICATION));

	function createHarness(options: { enabled?: boolean; hidden?: boolean; outcome?: OnboardingOutcome } = {}) {
		const configuration = new TestConfigurationService({ [ONBOARDING_ENABLED_CONFIG]: options.enabled ?? true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const context = store.add(new ContextKeyService(configuration));
		ChatContextKeys.enabled.bindTo(context).set(true);
		IsNewChatSessionContext.bindTo(context).set(true);
		AgentHostSessionTypesAvailableContext.bindTo(context).set(true);
		ChatEntitlementContextKeys.Entitlement.signedOut.bindTo(context).set(false);
		const storage = store.add(new TestStorageService());
		const lifecycle = store.add(new TestLifecycleService());
		const assignment = new class extends NullWorkbenchAssignmentService {
			override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
				return (name.endsWith('.show') ? true : name.endsWith('.id') ? 'onb-parallel-work-test' : undefined) as T | undefined;
			}
		}();
		const onboarding = store.add(new OnboardingScenarioService(storage, context, configuration, lifecycle, assignment, NullTelemetryService));
		store.add(onboardingScenarioRegistry.register(createNewSessionViewV2Tour(constObservable(true))));
		const entitlement = new class extends TestChatEntitlementService {
			override readonly sentiment = { hidden: options.hidden ?? false };
		}();
		entitlement.entitlement = ChatEntitlement.Available;
		const activeSession = observableValue<IActiveSession | undefined>(store, undefined);
		const session = createTestSession('Running session', { status: SessionStatus.InProgress }).session;
		const events: string[] = [];
		const presented: string[] = [];
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
				await payload.steps[0].onBeforeShow?.();
				started.complete();
				return { outcome: await result, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: payload.steps.length };
			},
		}));
		const warnings: string[] = [];
		const log = store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const runner = store.add(new ParallelWorkOnboarding(
			onboarding, configuration, context, upcastPartial<ISessionsService>({ activeSession }),
			lifecycle, views, entitlement, log,
		));
		return {
			runner, onboarding, context, session, events, presented, started: started.p, entitlement, activeSession, warnings,
			handoff: async () => { events.push('handoff'); },
			resolveSession: async () => { events.push('resolve'); return session; },
			pending: () => context.getContextKeyValue<boolean>(NewSessionOnboardingHandoffContext.key),
			setResult: (value: Promise<OnboardingOutcome>) => { result = value; },
			setPresentation: (value: IOnboardingPresentation) => { presentation = value; },
			setReveal: (value: typeof reveal) => { reveal = value; },
		};
	}

	for (const outcome of [OnboardingOutcome.Completed, OnboardingOutcome.Skipped]) {
		test(`shares V2 shown state and releases the reveal after the tour is ${outcome}`, async () => {
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
				presented: [NEW_SESSION_VIEW_V2_PARALLEL_WORK_TOUR_ID],
				events: ['handoff', 'resolve', 'expanded:true', 'reveal:Running session', 'released', 'handoff'],
				seen: true,
				pending: false,
			});
		});
	}

	test('does not show the variation when the regular V2 tour was already shown', async () => {
		const h = createHarness();
		await h.onboarding.runScenario(NEW_SESSION_VIEW_V2_TOUR_ID);
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		assert.deepStrictEqual({ presented: h.presented, events: h.events }, {
			presented: [NEW_SESSION_VIEW_V2_TOUR_ID], events: ['handoff'],
		});
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
			presented: [NEW_SESSION_VIEW_V2_PARALLEL_WORK_TOUR_ID],
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
		const second = h.runner.runWithHandoff(h.handoff, async () => replacement, CancellationToken.None);
		await timeout(0);
		const whileBlocked = { firstFinished, pending: h.pending(), targets: [...targets] };
		finish.complete();
		await Promise.all([blocker, first, second]);

		assert.deepStrictEqual({ whileBlocked, targets, presented: h.presented, pending: h.pending() }, {
			whileBlocked: { firstFinished: true, pending: true, targets: [] },
			targets: [getSessionOnboardingTargetId(replacement)],
			presented: [blockerId, NEW_SESSION_VIEW_V2_PARALLEL_WORK_TOUR_ID],
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

	test('does not replace a created session preserved by the draft handoff', async () => {
		const h = createHarness();
		h.activeSession.set(upcastPartial<IActiveSession>({ isCreated: constObservable(true) }), undefined);
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		assert.deepStrictEqual({ presented: h.presented, events: h.events }, { presented: [], events: ['handoff'] });
	});

	test('propagates handoff failures and clears the startup-tour reservation', async () => {
		const h = createHarness();
		await assert.rejects(h.runner.runWithHandoff(async () => { throw new Error('handoff failed'); }, h.resolveSession, CancellationToken.None), /handoff failed/);
		assert.deepStrictEqual({ presented: h.presented, pending: h.pending() }, { presented: [], pending: false });
	});

	test('shows only the row, workspace, and model spotlights and restores focus after keyboard dismissal', () => runWithFakedTimers({ startTime: 1 }, async () => {
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
		const steps: string[] = [];
		h.setPresentation({
			kind: presentation.kind,
			run: (scenario, runContext) => presentation.run(scenario, {
				...runContext,
				onDidShow: () => {
					runContext.onDidShow?.();
					steps.push(container.querySelector('.spotlight-callout-title')?.textContent ?? '');
					const next = [...container.querySelectorAll<HTMLElement>('.spotlight-callout-actions .monaco-button')].at(-1)!;
					if (steps.length < 3) {
						next.click();
					} else {
						next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
					}
				},
			}),
		});
		await h.runner.runWithHandoff(h.handoff, h.resolveSession, CancellationToken.None);
		assert.deepStrictEqual({
			steps, rowActivations, focused: mainWindow.document.activeElement === input,
			overlayRemaining: !!container.querySelector('.spotlight-callout'),
			rowTargetRemaining: row.hasAttribute('data-onboarding-id'),
		}, {
			steps: ['Your session is here', 'Choose a workspace', 'Choose a model'],
			rowActivations: 0, focused: true, overlayRemaining: false, rowTargetRemaining: false,
		});
	}));
});
