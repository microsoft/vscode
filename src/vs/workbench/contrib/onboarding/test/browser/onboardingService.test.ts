/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService, NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { Memento } from '../../../../common/memento.js';
import { IAssignmentFilter, IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { TestLifecycleService } from '../../../../test/common/workbenchTestServices.js';
import { OnboardingScenarioService } from '../../browser/onboardingService.js';
import { IOnboardingPresentation, IOnboardingRunContext, onboardingPresentationRegistry } from '../../common/onboardingPresentation.js';
import { onboardingScenarioRegistry } from '../../common/onboardingRegistry.js';
import { IOnboardingRunResult, IOnboardingScenario, OnboardingDismissReason, OnboardingOutcome } from '../../common/onboardingScenario.js';
import { ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_ENABLED_CONFIG } from '../../common/onboardingScenarioService.js';

function completedResult(outcome: OnboardingOutcome = OnboardingOutcome.Completed): IOnboardingRunResult {
	const dismissReason = outcome === OnboardingOutcome.Skipped ? OnboardingDismissReason.SkipButton
		: outcome === OnboardingOutcome.Aborted ? OnboardingDismissReason.Aborted
			: OnboardingDismissReason.Completed;
	return { outcome, shown: true, dismissReason, lastStepIndex: 0, stepCount: 1 };
}

/** A result for a degenerate run that rendered nothing (no steps / all steps skipped). */
function notShownResult(): IOnboardingRunResult {
	return { outcome: OnboardingOutcome.Completed, shown: false, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 0 };
}

/** Captures the names of `publicLog2` telemetry events. */
class CapturingTelemetryService extends NullTelemetryServiceShape {
	readonly events: string[] = [];
	override publicLog2(eventName?: string): void {
		if (eventName) {
			this.events.push(eventName);
		}
	}
}

/** A presentation that resolves with a fixed run result. */
class FixedResultPresentation implements IOnboardingPresentation {
	constructor(readonly kind: string, private readonly result: IOnboardingRunResult) { }
	async run(_scenario: IOnboardingScenario, _context: IOnboardingRunContext): Promise<IOnboardingRunResult> {
		return this.result;
	}
}

/** Records every scenario it renders, then resolves with a fixed outcome. */
class RecordingPresentation implements IOnboardingPresentation {
	readonly runs: string[] = [];
	constructor(
		readonly kind: string,
		private readonly outcome: OnboardingOutcome = OnboardingOutcome.Completed,
		private readonly onRun?: () => void,
	) { }
	async run(scenario: IOnboardingScenario, _context: IOnboardingRunContext): Promise<IOnboardingRunResult> {
		this.runs.push(scenario.id);
		this.onRun?.();
		return completedResult(this.outcome);
	}
}

/** Blocks until the engine aborts the run (used to test shutdown behaviour). */
class BlockingUntilAbortPresentation implements IOnboardingPresentation {
	readonly runs: string[] = [];
	constructor(readonly kind: string) { }
	run(scenario: IOnboardingScenario, context: IOnboardingRunContext): Promise<IOnboardingRunResult> {
		this.runs.push(scenario.id);
		return new Promise<IOnboardingRunResult>(resolve => {
			const listener = context.onAbort(() => {
				listener.dispose();
				resolve(completedResult(OnboardingOutcome.Aborted));
			});
		});
	}
}

/**
 * Assignment service test double that returns canned treatments and records the registered
 * telemetry filter so tests can assert which assignment-context ids would be excluded.
 */
class FakeAssignmentService extends NullWorkbenchAssignmentService {
	private readonly _filters: IAssignmentFilter[] = [];
	constructor(private readonly treatments: Record<string, string | number | boolean>) {
		super();
	}
	override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
		return this.treatments[name] as T | undefined;
	}
	override addTelemetryAssignmentFilter(filter: IAssignmentFilter): void {
		this._filters.push(filter);
	}
	/** True when the given assignment-context id is currently excluded from telemetry. */
	isExcluded(assignment: string): boolean {
		return this._filters.some(f => f.exclude(assignment));
	}
}

suite('OnboardingScenarioService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		// The Memento maintains a static cache keyed by id; clear it so each test
		// starts with fresh persisted state instead of leaking across tests.
		Memento.clear(StorageScope.APPLICATION);
	});

	let idSeed = 0;
	function uniqueKind(): string { return `test-presentation-${idSeed++}`; }

	function createService(configValues: Record<string, unknown> = {}, assignment?: IWorkbenchAssignmentService, storage = disposables.add(new InMemoryStorageService()), telemetry: ITelemetryService = NullTelemetryService as unknown as ITelemetryService): { service: OnboardingScenarioService; contextKeyService: IContextKeyService; config: TestConfigurationService; lifecycle: TestLifecycleService } {
		const store = disposables;
		const config = new TestConfigurationService(configValues);
		const contextKeyService = store.add(new ContextKeyService(config));
		const lifecycle = store.add(new TestLifecycleService());
		const service = store.add(new OnboardingScenarioService(
			storage,
			contextKeyService,
			config as unknown as IConfigurationService,
			lifecycle,
			assignment ?? new NullWorkbenchAssignmentService(),
			telemetry,
		));
		return { service, contextKeyService, config, lifecycle };
	}

	function registerPresentation(presentation: IOnboardingPresentation): void {
		disposables.add(onboardingPresentationRegistry.register(presentation));
	}

	function registerScenario(scenario: IOnboardingScenario): void {
		disposables.add(onboardingScenarioRegistry.register(scenario));
	}

	test('runs an eligible auto scenario exactly once and marks it shown', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		registerScenario({ id: 'auto-1', trigger: { kind: 'auto' }, presentation: { kind: presentation.kind, payload: undefined } });

		const { service } = createService();
		service.start();
		await timeout(0);

		// Re-evaluating (e.g. another start) must not run it again.
		service.start();
		await timeout(0);

		assert.deepStrictEqual(
			{ runs: presentation.runs, shown: service.hasBeenShown('auto-1') },
			{ runs: ['auto-1'], shown: true }
		);
	});

	test('developer mode ignores previously shown state for auto scenarios', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		registerScenario({ id: 'dev-repeat-1', trigger: { kind: 'auto' }, presentation: { kind: presentation.kind, payload: undefined } });

		const storage = disposables.add(new InMemoryStorageService());
		const first = createService({}, undefined, storage).service;
		first.start();
		await timeout(0);

		const { service: second, contextKeyService } = createService({ [ONBOARDING_DEVELOPER_MODE_CONFIG]: { 'dev-repeat-1': true } }, undefined, storage);
		second.start();
		await timeout(0);

		contextKeyService.createKey<boolean>('onboardingTestDevModeReevaluate', false).set(true);
		await timeout(0);

		assert.deepStrictEqual(presentation.runs, ['dev-repeat-1', 'dev-repeat-1']);
	});

	test('does not run automatically when onboarding.enabled is false', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		registerScenario({ id: 'disabled-1', trigger: { kind: 'auto' }, presentation: { kind: presentation.kind, payload: undefined } });

		const { service } = createService({ [ONBOARDING_ENABLED_CONFIG]: false });
		service.start();
		await timeout(0);

		assert.deepStrictEqual(presentation.runs, []);
	});

	test('respects the when clause and reacts to context changes', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		registerScenario({
			id: 'when-1',
			when: ContextKeyExpr.equals('onboardingTestReady', true),
			trigger: { kind: 'auto' },
			presentation: { kind: presentation.kind, payload: undefined }
		});

		const { service, contextKeyService } = createService();
		service.start();
		await timeout(0);
		assert.deepStrictEqual(presentation.runs, [], 'should not run while when is unsatisfied');

		const key: IContextKey<boolean> = contextKeyService.createKey('onboardingTestReady', false);
		key.set(true);
		await timeout(0);

		assert.deepStrictEqual(presentation.runs, ['when-1']);
	});

	test('runs higher-priority scenarios before lower-priority ones', async () => {
		const order: string[] = [];
		const presentation = new RecordingPresentation(uniqueKind(), OnboardingOutcome.Completed);
		// Track ordering via the recorder's runs array which is appended in run().
		registerPresentation(presentation);
		registerScenario({ id: 'low', priority: 1, trigger: { kind: 'auto' }, presentation: { kind: presentation.kind, payload: undefined } });
		registerScenario({ id: 'high', priority: 10, trigger: { kind: 'auto' }, presentation: { kind: presentation.kind, payload: undefined } });

		const { service } = createService();
		service.start();
		await timeout(0);
		order.push(...presentation.runs);

		assert.deepStrictEqual(order, ['high', 'low']);
	});

	test('observable triggers start the scenario when the signal turns true', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		const signal = observableValue<boolean>('onboardingTestSignal', false);
		registerScenario({ id: 'observable-1', trigger: { kind: 'observable', signal }, presentation: { kind: presentation.kind, payload: undefined } });

		const { service } = createService();
		service.start();
		await timeout(0);
		assert.deepStrictEqual(presentation.runs, [], 'should not run while signal is false');

		signal.set(true, undefined);
		await timeout(0);

		assert.deepStrictEqual(presentation.runs, ['observable-1']);
	});

	test('command-triggered scenarios never run automatically', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		registerScenario({ id: 'command-1', trigger: { kind: 'command', commandId: 'noop' }, presentation: { kind: presentation.kind, payload: undefined } });

		const { service } = createService();
		service.start();
		await timeout(0);

		assert.deepStrictEqual(presentation.runs, []);
	});

	test('runScenario runs manually even when disabled and already shown', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		registerScenario({ id: 'manual-1', trigger: { kind: 'auto' }, presentation: { kind: presentation.kind, payload: undefined } });

		const { service } = createService({ [ONBOARDING_ENABLED_CONFIG]: false });
		service.start();
		await timeout(0);
		assert.deepStrictEqual(presentation.runs, [], 'disabled: should not auto-run');

		const outcome = await service.runScenario('manual-1');

		assert.deepStrictEqual({ runs: presentation.runs, outcome }, { runs: ['manual-1'], outcome: OnboardingOutcome.Completed });
	});

	test('runScenario joins an in-flight run instead of starting a second one', async () => {
		let release!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		const kind = uniqueKind();
		const runs: string[] = [];
		const presentation: IOnboardingPresentation = {
			kind,
			async run(scenario: IOnboardingScenario): Promise<IOnboardingRunResult> {
				runs.push(scenario.id);
				await gate;
				return completedResult();
			}
		};
		registerPresentation(presentation);
		registerScenario({ id: 'inflight-1', trigger: { kind: 'command', commandId: 'noop' }, presentation: { kind, payload: undefined } });

		const { service } = createService();
		service.start();

		const first = service.runScenario('inflight-1');
		await timeout(0);
		// Second call while the first run is still in-flight must not start again.
		const second = service.runScenario('inflight-1');
		await timeout(0);

		release();
		const [a, b] = await Promise.all([first, second]);

		assert.deepStrictEqual({ runs, a, b }, { runs: ['inflight-1'], a: OnboardingOutcome.Completed, b: OnboardingOutcome.Completed });
	});

	test('resetAll clears shown state so the scenario can run again', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		registerScenario({ id: 'reset-1', trigger: { kind: 'auto' }, presentation: { kind: presentation.kind, payload: undefined } });

		const { service } = createService();
		service.start();
		await timeout(0);

		service.resetAll();
		assert.strictEqual(service.hasBeenShown('reset-1'), false);
	});

	test('emits scenarioOutcome telemetry when a tour is shown but not when nothing is rendered', async () => {
		const shownKind = uniqueKind();
		const notShownKind = uniqueKind();
		registerPresentation(new FixedResultPresentation(shownKind, completedResult()));
		registerPresentation(new FixedResultPresentation(notShownKind, notShownResult()));
		registerScenario({ id: 'tele-shown', trigger: { kind: 'auto' }, presentation: { kind: shownKind, payload: undefined } });
		registerScenario({ id: 'tele-notshown', trigger: { kind: 'auto' }, presentation: { kind: notShownKind, payload: undefined } });

		const telemetry = new CapturingTelemetryService();
		const { service } = createService({}, undefined, undefined, telemetry as unknown as ITelemetryService);
		service.start();
		await timeout(0);
		await timeout(0);

		// One event for the shown tour; none for the degenerate run that rendered nothing.
		assert.deepStrictEqual(telemetry.events, ['onboarding.scenarioOutcome']);
	});

	test('experiment-driven scenario does not run unless both treatment flags are set', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		registerScenario({
			id: 'exp-off',
			experiment: { behaviorFlag: 'exp.show', assignmentContextIdFlag: 'exp.id' },
			trigger: { kind: 'auto' },
			presentation: { kind: presentation.kind, payload: undefined }
		});

		// Only one of the two flags resolves -> treated as not configured -> does not run.
		const { service } = createService({}, new FakeAssignmentService({ 'exp.show': true }));
		service.start();
		await timeout(0);
		await timeout(0);

		assert.deepStrictEqual(presentation.runs, []);
	});

	test('an assignment-context id without the reserved prefix is rejected as inactive', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		// Misconfigured id: would never be gated by the prefix filter, so it must not run.
		const assignment = new FakeAssignmentService({ 'exp.show': true, 'exp.id': 'newsession-2026q3' });
		registerScenario({
			id: 'exp-badid',
			experiment: { behaviorFlag: 'exp.show', assignmentContextIdFlag: 'exp.id' },
			trigger: { kind: 'auto' },
			presentation: { kind: presentation.kind, payload: undefined }
		});

		const origErrorHandler = errorHandler.getUnexpectedErrorHandler();
		const errors: unknown[] = [];
		setUnexpectedErrorHandler(error => errors.push(error));
		try {
			const { service } = createService({}, assignment);
			service.start();
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual(
				{ runs: presentation.runs, shown: service.hasBeenShown('exp-badid'), reported: errors.length === 1 },
				{ runs: [], shown: false, reported: true }
			);
		} finally {
			setUnexpectedErrorHandler(origErrorHandler);
		}
	});

	test('treatment arm shows the tour and opens the telemetry gate', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		const assignment = new FakeAssignmentService({ 'exp.show': true, 'exp.id': 'onb-tour-q3' });
		registerScenario({
			id: 'exp-treat',
			experiment: { behaviorFlag: 'exp.show', assignmentContextIdFlag: 'exp.id' },
			trigger: { kind: 'auto' },
			presentation: { kind: presentation.kind, payload: undefined }
		});

		const assignmentContext = 'onb-tour-q3:12345';
		const { service } = createService({}, assignment);
		const excludedBeforeWouldShow = assignment.isExcluded(assignmentContext);

		service.start();
		await timeout(0);
		await timeout(0);

		assert.deepStrictEqual(
			{
				excludedBeforeWouldShow,
				runs: presentation.runs,
				shown: service.hasBeenShown('exp-treat'),
				excludedAfterWouldShow: assignment.isExcluded(assignmentContext),
				otherVariantExcluded: assignment.isExcluded('onb-tour-q3-other:12346')
			},
			{
				excludedBeforeWouldShow: true,
				runs: ['exp-treat'],
				shown: true,
				excludedAfterWouldShow: false,
				otherVariantExcluded: true
			}
		);
	});

	test('control arm opens the gate but shows nothing and stays eligible', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		const assignment = new FakeAssignmentService({ 'exp.show': false, 'exp.id': 'onb-tour-q3' });
		registerScenario({
			id: 'exp-control',
			experiment: { behaviorFlag: 'exp.show', assignmentContextIdFlag: 'exp.id' },
			trigger: { kind: 'auto' },
			presentation: { kind: presentation.kind, payload: undefined }
		});

		const { service } = createService({}, assignment);
		service.start();
		await timeout(0);
		await timeout(0);

		// No tour shown, not marked shown (re-eligible later), but the id now flows.
		assert.deepStrictEqual(
			{ runs: presentation.runs, shown: service.hasBeenShown('exp-control'), excluded: assignment.isExcluded('onb-tour-q3:12345') },
			{ runs: [], shown: false, excluded: false }
		);
	});

	test('developer mode shows an experiment scenario whose experiment is not active', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		// Neither treatment flag resolves: the experiment is inactive, so it would not run
		// automatically — but developer mode bypasses the experiment gate.
		const assignment = new FakeAssignmentService({});
		registerScenario({
			id: 'exp-dev-inactive',
			experiment: { behaviorFlag: 'exp.show', assignmentContextIdFlag: 'exp.id' },
			trigger: { kind: 'auto' },
			presentation: { kind: presentation.kind, payload: undefined }
		});

		const { service } = createService({ [ONBOARDING_DEVELOPER_MODE_CONFIG]: { 'exp-dev-inactive': true } }, assignment);
		service.start();
		await timeout(0);
		await timeout(0);

		// The tour is shown, but since the experiment is not active no telemetry gate is
		// opened (there is no assignment-context id to flow).
		assert.deepStrictEqual(
			{ runs: presentation.runs, excluded: assignment.isExcluded('onb-tour-q3') },
			{ runs: ['exp-dev-inactive'], excluded: true }
		);
	});

	test('developer mode shows the tour even when the user is in the control arm', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		const assignment = new FakeAssignmentService({ 'exp.show': false, 'exp.id': 'onb-tour-q3' });
		registerScenario({
			id: 'exp-dev-control',
			experiment: { behaviorFlag: 'exp.show', assignmentContextIdFlag: 'exp.id' },
			trigger: { kind: 'auto' },
			presentation: { kind: presentation.kind, payload: undefined }
		});

		const { service } = createService({ [ONBOARDING_DEVELOPER_MODE_CONFIG]: { 'exp-dev-control': true } }, assignment);
		service.start();
		await timeout(0);
		await timeout(0);

		// Developer mode shows the tour unconditionally and never opens the telemetry
		// gate, so the assignment-context id stays excluded even though the user is in
		// the (active) control arm — a local preview can't affect the scorecard.
		assert.deepStrictEqual(
			{ runs: presentation.runs, excluded: assignment.isExcluded('onb-tour-q3') },
			{ runs: ['exp-dev-control'], excluded: true }
		);
	});

	test('an opened gate persists so the id keeps flowing after a reload', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		const storage = disposables.add(new InMemoryStorageService());
		registerScenario({
			id: 'exp-persist',
			experiment: { behaviorFlag: 'exp.show', assignmentContextIdFlag: 'exp.id' },
			trigger: { kind: 'auto' },
			presentation: { kind: presentation.kind, payload: undefined }
		});

		// First "session": control reaches would-show and opens the gate.
		const first = createService({}, new FakeAssignmentService({ 'exp.show': false, 'exp.id': 'onb-tour-q3' }), storage);
		first.service.start();
		await timeout(0);
		await timeout(0);

		// Second "session" (reload) with a fresh service + assignment service: the persisted
		// gate must immediately allow the id, even before any would-show this session.
		const secondAssignment = new FakeAssignmentService({ 'exp.show': false, 'exp.id': 'onb-tour-q3' });
		createService({}, secondAssignment, storage);

		assert.strictEqual(secondAssignment.isExcluded('onb-tour-q3:12345'), false);
	});

	test('a second experiment with a new id is blocked for a user who already saw the tour', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);
		const storage = disposables.add(new InMemoryStorageService());
		const kind = presentation.kind;

		// Experiment 1: treatment. The user sees the tour and is marked shown.
		disposables.add(onboardingScenarioRegistry.register({
			id: 'tour',
			experiment: { behaviorFlag: 'exp.show', assignmentContextIdFlag: 'exp.id' },
			trigger: { kind: 'auto' },
			presentation: { kind, payload: undefined }
		}));
		const first = createService({}, new FakeAssignmentService({ 'exp.show': true, 'exp.id': 'onb-tour-2026q3' }), storage);
		first.service.start();
		await timeout(0);
		await timeout(0);
		assert.strictEqual(first.service.hasBeenShown('tour'), true);

		// Experiment 2 (new id) in a reload: already shown -> not eligible -> id stays blocked.
		const secondAssignment = new FakeAssignmentService({ 'exp.show': true, 'exp.id': 'onb-tour-2027q1' });
		const second = createService({}, secondAssignment, storage);
		second.service.start();
		await timeout(0);
		await timeout(0);

		assert.deepStrictEqual(
			{ shown: second.service.hasBeenShown('tour'), excludedNew: secondAssignment.isExcluded('onb-tour-2027q1') },
			{ shown: true, excludedNew: true }
		);
	});

	test('shutdown aborts the active scenario and never starts queued ones', async () => {
		const active = new BlockingUntilAbortPresentation(uniqueKind());
		const queued = new RecordingPresentation(uniqueKind());
		registerPresentation(active);
		registerPresentation(queued);
		// `active` has higher priority so it runs first and blocks; `queued` waits.
		registerScenario({ id: 'active', priority: 10, trigger: { kind: 'auto' }, presentation: { kind: active.kind, payload: undefined } });
		registerScenario({ id: 'queued', priority: 1, trigger: { kind: 'auto' }, presentation: { kind: queued.kind, payload: undefined } });

		const { service, lifecycle } = createService();
		service.start();
		await timeout(0);
		// Only the active (blocking) scenario should have started.
		assert.deepStrictEqual({ active: active.runs, queued: queued.runs }, { active: ['active'], queued: [] });

		lifecycle.fireShutdown();
		await timeout(0);

		// The queued scenario must never have been presented.
		assert.deepStrictEqual({ active: active.runs, queued: queued.runs }, { active: ['active'], queued: [] });
	});

	test('service starts and disposes without leaking', () => {
		const store = new DisposableStore();
		const storage = store.add(new InMemoryStorageService());
		const config = new TestConfigurationService();
		const contextKeyService = store.add(new ContextKeyService(config));
		const lifecycle = store.add(new TestLifecycleService());
		const service = store.add(new OnboardingScenarioService(storage, contextKeyService, config as unknown as IConfigurationService, lifecycle, new NullWorkbenchAssignmentService(), NullTelemetryService as unknown as ITelemetryService));
		service.start();
		store.dispose();
		assert.ok(true);
	});
});
