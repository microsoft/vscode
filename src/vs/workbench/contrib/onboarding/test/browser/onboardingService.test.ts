/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { TestLifecycleService } from '../../../../test/common/workbenchTestServices.js';
import { OnboardingScenarioService } from '../../browser/onboardingService.js';
import { IOnboardingPresentation, IOnboardingRunContext, onboardingPresentationRegistry } from '../../common/onboardingPresentation.js';
import { onboardingScenarioRegistry } from '../../common/onboardingRegistry.js';
import { IOnboardingScenario, OnboardingOutcome } from '../../common/onboardingScenario.js';
import { ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_ENABLED_CONFIG } from '../../common/onboardingScenarioService.js';

/** Records every scenario it renders, then resolves with a fixed outcome. */
class RecordingPresentation implements IOnboardingPresentation {
	readonly runs: string[] = [];
	constructor(
		readonly kind: string,
		private readonly outcome: OnboardingOutcome = OnboardingOutcome.Completed,
		private readonly onRun?: () => void,
	) { }
	async run(scenario: IOnboardingScenario, _context: IOnboardingRunContext): Promise<OnboardingOutcome> {
		this.runs.push(scenario.id);
		this.onRun?.();
		return this.outcome;
	}
}

/** Blocks until the engine aborts the run (used to test shutdown behaviour). */
class BlockingUntilAbortPresentation implements IOnboardingPresentation {
	readonly runs: string[] = [];
	constructor(readonly kind: string) { }
	run(scenario: IOnboardingScenario, context: IOnboardingRunContext): Promise<OnboardingOutcome> {
		this.runs.push(scenario.id);
		return new Promise<OnboardingOutcome>(resolve => {
			const listener = context.onAbort(() => {
				listener.dispose();
				resolve(OnboardingOutcome.Aborted);
			});
		});
	}
}

suite('OnboardingScenarioService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		// The Memento maintains a static cache keyed by id; clear it so each test
		// starts with fresh persisted state instead of leaking across tests.
		Memento.clear(StorageScope.PROFILE);
	});

	let idSeed = 0;
	function uniqueKind(): string { return `test-presentation-${idSeed++}`; }

	function createService(configValues: Record<string, unknown> = {}, assignment?: IWorkbenchAssignmentService, storage = disposables.add(new InMemoryStorageService())): { service: OnboardingScenarioService; contextKeyService: IContextKeyService; config: TestConfigurationService; lifecycle: TestLifecycleService } {
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

		const { service: second, contextKeyService } = createService({ [ONBOARDING_DEVELOPER_MODE_CONFIG]: true }, undefined, storage);
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
			async run(scenario: IOnboardingScenario): Promise<OnboardingOutcome> {
				runs.push(scenario.id);
				await gate;
				return OnboardingOutcome.Completed;
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

	test('experiment gate blocks the scenario until the treatment is enabled', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);

		class DisabledExperimentAssignmentService extends NullWorkbenchAssignmentService {
			override async getTreatment<T extends string | number | boolean>(_name: string): Promise<T | undefined> {
				return undefined;
			}
		}

		registerScenario({ id: 'exp-off', experiment: 'exp.disabled', trigger: { kind: 'auto' }, presentation: { kind: presentation.kind, payload: undefined } });

		const { service } = createService({}, new DisabledExperimentAssignmentService());
		service.start();
		await timeout(0);

		assert.deepStrictEqual(presentation.runs, []);
	});

	test('experiment gate allows the scenario once the treatment resolves true', async () => {
		const presentation = new RecordingPresentation(uniqueKind());
		registerPresentation(presentation);

		class EnabledExperimentAssignmentService extends NullWorkbenchAssignmentService {
			override async getTreatment<T extends string | number | boolean>(_name: string): Promise<T | undefined> {
				return true as T;
			}
		}

		registerScenario({ id: 'exp-on', experiment: 'exp.enabled', trigger: { kind: 'auto' }, presentation: { kind: presentation.kind, payload: undefined } });

		const { service } = createService({}, new EnabledExperimentAssignmentService());
		service.start();
		// Allow the async treatment fetch + re-evaluation to settle.
		await timeout(0);
		await timeout(0);

		assert.deepStrictEqual(presentation.runs, ['exp-on']);
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
		const service = store.add(new OnboardingScenarioService(storage, contextKeyService, config as unknown as IConfigurationService, lifecycle, new NullWorkbenchAssignmentService()));
		service.start();
		store.dispose();
		assert.ok(true);
	});
});
