/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { GuidedTryoutPresentation, GUIDED_TRYOUT_PRESENTATION_KIND } from '../../browser/guidedTryoutPresentation.js';
import { IOnboardingScenario } from '../../common/onboardingScenario.js';
import { IOnboardingSequenceStep, IOnboardingSequenceStepContext, IOnboardingSequenceStepPresentation, IOnboardingSequenceStepResult, onboardingSequenceStepPresentationRegistry } from '../../common/onboardingSequence.js';
import { IOnboardingTryoutPresentation, IOnboardingTryoutRunContext, onboardingTryoutPresentationRegistry, OnboardingTryoutAvailability, OnboardingTryoutPreparation } from '../../common/onboardingTryout.js';
import { IGuidedTryoutPayload } from '../../common/onboardingTryoutActions.js';

class TestLaunchPresentation implements IOnboardingTryoutPresentation {
	readonly kind = 'test.launch';
	readonly events: string[] = [];
	availability: OnboardingTryoutAvailability = { kind: 'ready' };
	targetScope: string | undefined;

	getAvailability(): OnboardingTryoutAvailability {
		this.events.push('availability');
		return this.availability;
	}

	async prepare(scenario: IOnboardingScenario): Promise<OnboardingTryoutPreparation> {
		this.events.push(`prepare:${scenario.presentation.kind}`);
		return {
			kind: 'ready',
			run: async () => {
				this.events.push('launch');
				return { kind: 'opened', targetScope: this.targetScope };
			},
		};
	}
}

class TestGuidanceStep implements IOnboardingSequenceStepPresentation {
	readonly kind = 'test.guidance';
	readonly countsAsVisualStep = true;
	action: IOnboardingSequenceStepResult = { action: 'next', shown: true };

	constructor(private readonly events: string[]) { }

	async runStep(step: IOnboardingSequenceStep, context: IOnboardingSequenceStepContext): Promise<IOnboardingSequenceStepResult> {
		this.events.push(`guide:${step.id}:${context.visualStepIndex + 1}/${context.visualStepCount}:${context.targetScope ?? 'global'}`);
		return this.action;
	}
}

suite('GuidedTryoutPresentation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createScenario(stepKind = 'test.guidance', launchKind = 'test.launch'): IOnboardingScenario<IGuidedTryoutPayload> {
		return {
			id: 'test.guided',
			trigger: { kind: 'command', commandId: 'workbench.action.onboarding.tryFeature' },
			tryout: { title: 'Guided example', description: 'Open and highlight a control.' },
			presentation: {
				kind: GUIDED_TRYOUT_PRESENTATION_KIND,
				payload: {
					launch: { kind: launchKind, payload: { target: 'view' } },
					steps: [{ id: 'control', kind: stepKind, payload: { targetId: 'test.control' } }],
					unavailableMessage: 'The control could not be highlighted.',
				},
			},
		};
	}

	function createContext(token = CancellationToken.None): IOnboardingTryoutRunContext {
		return {
			id: 'test.guided',
			token,
			store: disposables.add(new DisposableStore()),
		};
	}

	function registerLaunchAndGuidance() {
		const launch = new TestLaunchPresentation();
		const guidance = new TestGuidanceStep(launch.events);
		disposables.add(onboardingTryoutPresentationRegistry.register(launch));
		disposables.add(onboardingSequenceStepPresentationRegistry.register(guidance));
		return { launch, guidance };
	}

	test('launches before showing guidance and returns the launch result', async () => {
		const { launch } = registerLaunchAndGuidance();
		launch.targetScope = 'prepared-instance';
		const presentation = disposables.add(new GuidedTryoutPresentation());
		const scenario = createScenario();

		const availability = presentation.getAvailability(scenario);
		const preparation = await presentation.prepare(scenario, createContext());
		assert.strictEqual(preparation.kind, 'ready');
		if (preparation.kind !== 'ready') {
			return;
		}
		const eventsBeforeRun = [...launch.events];
		const result = await preparation.run();

		assert.deepStrictEqual({ availability, eventsBeforeRun, result, events: launch.events }, {
			availability: { kind: 'ready' },
			eventsBeforeRun: ['availability', 'prepare:test.launch'],
			result: { kind: 'opened', targetScope: 'prepared-instance' },
			events: ['availability', 'prepare:test.launch', 'availability', 'launch', 'guide:control:1/1:prepared-instance'],
		});
	});

	test('does not prepare when a guidance kind is unavailable', async () => {
		const launch = new TestLaunchPresentation();
		disposables.add(onboardingTryoutPresentationRegistry.register(launch));
		const presentation = disposables.add(new GuidedTryoutPresentation());
		const scenario = createScenario('missing.guidance');

		const availability = presentation.getAvailability(scenario);
		const preparation = await presentation.prepare(scenario, createContext());

		assert.deepStrictEqual({ availability, preparation, events: launch.events }, {
			availability: { kind: 'unavailable', message: 'The control could not be highlighted.' },
			preparation: { kind: 'unavailable', message: 'The control could not be highlighted.' },
			events: [],
		});
	});

	test('reports missing guidance after the target UI has opened', async () => {
		const { launch, guidance } = registerLaunchAndGuidance();
		guidance.action = { action: 'abort', shown: false };
		const presentation = disposables.add(new GuidedTryoutPresentation());
		const preparation = await presentation.prepare(createScenario(), createContext());
		assert.strictEqual(preparation.kind, 'ready');
		if (preparation.kind !== 'ready') {
			return;
		}

		const result = await preparation.run();
		assert.deepStrictEqual({ result, events: launch.events }, {
			result: { kind: 'unavailable', message: 'The control could not be highlighted.' },
			events: ['prepare:test.launch', 'availability', 'launch', 'guide:control:1/1:global'],
		});
	});

	test('cancellation after launch prevents guidance', async () => {
		const cancellation = disposables.add(new CancellationTokenSource());
		const launch = new TestLaunchPresentation();
		launch.prepare = async () => ({
			kind: 'ready',
			run: async () => {
				launch.events.push('launch');
				cancellation.cancel();
				return { kind: 'opened' };
			},
		});
		const guidance = new TestGuidanceStep(launch.events);
		disposables.add(onboardingTryoutPresentationRegistry.register(launch));
		disposables.add(onboardingSequenceStepPresentationRegistry.register(guidance));
		const presentation = disposables.add(new GuidedTryoutPresentation());
		const preparation = await presentation.prepare(createScenario(), createContext(cancellation.token));
		assert.strictEqual(preparation.kind, 'ready');
		if (preparation.kind !== 'ready') {
			return;
		}

		const result = await preparation.run();
		assert.deepStrictEqual({ result, events: launch.events }, {
			result: { kind: 'cancelled' },
			events: ['availability', 'launch'],
		});
	});

	test('rejects recursive guided launches', () => {
		const presentation = disposables.add(new GuidedTryoutPresentation());
		const scenario = createScenario('test.guidance', GUIDED_TRYOUT_PRESENTATION_KIND);
		assert.throws(() => presentation.getAvailability(scenario), /invalid presentation/);
	});

	test('forwards launch unavailability without preparing', async () => {
		const { launch } = registerLaunchAndGuidance();
		launch.availability = { kind: 'unavailable', message: 'Open a workspace first.' };
		const presentation = disposables.add(new GuidedTryoutPresentation());
		const scenario = createScenario();

		assert.deepStrictEqual(presentation.getAvailability(scenario), {
			kind: 'unavailable',
			message: 'Open a workspace first.',
		});
	});
});
