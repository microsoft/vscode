/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestHostService, TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';
import { RunOnboardingStepPresentation, RUN_ONBOARDING_STEP_KIND } from '../../browser/sequence/runOnboardingStep.js';
import { OnboardingSequencePresentation } from '../../browser/sequence/sequencePresentation.js';
import { IOnboardingTargetOptions, markOnboardingTarget } from '../../browser/spotlight/onboardingTarget.js';
import { SpotlightPresentation } from '../../browser/spotlight/spotlightPresentation.js';
import { ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../browser/spotlight/spotlightTypes.js';
import { IOnboardingRunContext } from '../../common/onboardingPresentation.js';
import { IOnboardingRunResult, IOnboardingScenario, OnboardingDismissReason, OnboardingOutcome } from '../../common/onboardingScenario.js';
import { IOnboardingSequencePayload, IOnboardingSequenceStep, IOnboardingSequenceStepContext, IOnboardingSequenceStepPresentation, IOnboardingSequenceStepResult, ONBOARDING_SEQUENCE_PRESENTATION_KIND, onboardingSequenceStepPresentationRegistry } from '../../common/onboardingSequence.js';

class TestVisualStepPresentation implements IOnboardingSequenceStepPresentation {
	readonly countsAsVisualStep = true;
	readonly contexts: { readonly id: string; readonly index: number; readonly count: number; readonly canGoBack: boolean; readonly isLast: boolean }[] = [];

	constructor(
		readonly kind: string,
		private readonly _actions: Map<string, IOnboardingSequenceStepResult[]>,
	) { }

	async runStep(step: IOnboardingSequenceStep, context: IOnboardingSequenceStepContext): Promise<IOnboardingSequenceStepResult> {
		this.contexts.push({
			id: step.id,
			index: context.visualStepIndex,
			count: context.visualStepCount,
			canGoBack: context.canGoBack,
			isLast: context.isLastVisualStep,
		});
		return this._actions.get(step.id)?.shift() ?? { action: 'next', shown: true };
	}
}

class SequenceTestLayoutService extends TestLayoutService {
	constructor(private readonly _container: HTMLElement) {
		super();
	}

	override getContainer(): HTMLElement {
		return this._container;
	}
}

suite('OnboardingSequencePresentation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let kindSeed = 0;

	function createScenario(steps: readonly IOnboardingSequenceStep[]): IOnboardingScenario<IOnboardingSequencePayload> {
		return {
			id: 'test.sequence',
			trigger: { kind: 'auto' },
			presentation: {
				kind: ONBOARDING_SEQUENCE_PRESENTATION_KIND,
				payload: { steps },
			},
		};
	}

	function context(onAbort: Event<void> = Event.None): IOnboardingRunContext {
		return { targetWindow: mainWindow, onAbort };
	}

	function createSpotlightTarget(container: HTMLElement, id: string, options: IOnboardingTargetOptions): HTMLElement {
		const target = $('button');
		target.style.position = 'fixed';
		target.style.left = '100px';
		target.style.top = '100px';
		target.style.width = '100px';
		target.style.height = '30px';
		container.appendChild(target);
		disposables.add(markOnboardingTarget(target, id, options));
		return target;
	}

	test('renders spotlight counters using only spotlight steps', async () => {
		const container = $('.onboarding-sequence-presentation-test');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const spotlight = disposables.add(new SpotlightPresentation(new SequenceTestLayoutService(container), new TestHostService(), contextKeyService));
		disposables.add(onboardingSequenceStepPresentationRegistry.register(spotlight));
		disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
		const counters: string[] = [];
		const createAdvancingTarget = (id: string) => {
			const target = createSpotlightTarget(container, id, {
				open: () => {
					counters.push(container.getElementsByClassName('spotlight-callout-counter')[0].textContent ?? '');
					target.click();
				},
			});
			return target;
		};
		createAdvancingTarget('test.sequence.first');
		createAdvancingTarget('test.sequence.second');
		const spotlightStep = (id: string): ISpotlightStep => ({
			id,
			targetId: `test.sequence.${id}`,
			title: id,
			description: id,
			openTarget: true,
			advanceOnTargetClick: true,
		});
		const presentation = disposables.add(new OnboardingSequencePresentation());

		const result = await presentation.run(createScenario([
			{ id: 'first', kind: SPOTLIGHT_PRESENTATION_KIND, payload: spotlightStep('first') },
			{ id: 'script', kind: RUN_ONBOARDING_STEP_KIND, payload: { run: () => undefined } },
			{ id: 'second', kind: SPOTLIGHT_PRESENTATION_KIND, payload: spotlightStep('second') },
		]), context());

		assert.deepStrictEqual({ counters, result }, {
			counters: ['1 of 2', '2 of 2'],
			result: {
				outcome: OnboardingOutcome.Completed,
				shown: true,
				dismissReason: OnboardingDismissReason.TargetClick,
				lastStepIndex: 2,
				stepCount: 3,
			},
		});
	});

	test('counts only visual steps while retaining sequence indices in the result', async () => {
		const visualKind = `test-visual-${kindSeed++}`;
		const visual = new TestVisualStepPresentation(visualKind, new Map());
		disposables.add(onboardingSequenceStepPresentationRegistry.register(visual));
		disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
		const runCalls: string[] = [];
		const presentation = disposables.add(new OnboardingSequencePresentation());

		const result = await presentation.run(createScenario([
			{ id: 'first', kind: visualKind, payload: undefined },
			{ id: 'script', kind: RUN_ONBOARDING_STEP_KIND, payload: { run: () => runCalls.push('script') } },
			{ id: 'second', kind: visualKind, payload: undefined },
		]), context());

		assert.deepStrictEqual({ contexts: visual.contexts, runCalls, result }, {
			contexts: [
				{ id: 'first', index: 0, count: 2, canGoBack: false, isLast: false },
				{ id: 'second', index: 1, count: 2, canGoBack: true, isLast: true },
			],
			runCalls: ['script'],
			result: {
				outcome: OnboardingOutcome.Completed,
				shown: true,
				dismissReason: OnboardingDismissReason.Completed,
				lastStepIndex: 2,
				stepCount: 3,
			},
		});
	});

	test('reports a user-visible run step as shown when preceding visuals are skipped', async () => {
		const visualKind = `test-visual-${kindSeed++}`;
		const visual = new TestVisualStepPresentation(visualKind, new Map([
			['skipped', [{ action: 'skipStep', shown: false }]],
		]));
		disposables.add(onboardingSequenceStepPresentationRegistry.register(visual));
		disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
		const presentation = disposables.add(new OnboardingSequencePresentation());

		const result = await presentation.run(createScenario([
			{ id: 'skipped', kind: visualKind, payload: undefined },
			{ id: 'script', kind: RUN_ONBOARDING_STEP_KIND, payload: { run: () => ({ shown: true }) } },
		]), context());

		assert.deepStrictEqual(result, {
			outcome: OnboardingOutcome.Completed,
			shown: true,
			dismissReason: OnboardingDismissReason.Completed,
			lastStepIndex: 1,
			stepCount: 2,
		});
	});

	test('Back skips run steps and forward traversal runs them at most once', async () => {
		const visualKind = `test-visual-${kindSeed++}`;
		const actions = new Map<string, IOnboardingSequenceStepResult[]>([
			['first', [{ action: 'next', shown: true }, { action: 'next', shown: true }]],
			['second', [{ action: 'back', shown: true }, { action: 'next', shown: true }]],
		]);
		const visual = new TestVisualStepPresentation(visualKind, actions);
		disposables.add(onboardingSequenceStepPresentationRegistry.register(visual));
		disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
		let runCount = 0;
		const presentation = disposables.add(new OnboardingSequencePresentation());

		const result = await presentation.run(createScenario([
			{ id: 'first', kind: visualKind, payload: undefined },
			{ id: 'script', kind: RUN_ONBOARDING_STEP_KIND, payload: { run: () => runCount++ } },
			{ id: 'second', kind: visualKind, payload: undefined },
		]), context());

		assert.deepStrictEqual({ ids: visual.contexts.map(item => item.id), runCount, result }, {
			ids: ['first', 'second', 'first', 'second'],
			runCount: 1,
			result: {
				outcome: OnboardingOutcome.Completed,
				shown: true,
				dismissReason: OnboardingDismissReason.Completed,
				lastStepIndex: 2,
				stepCount: 3,
			},
		});
	});

	test('reports run errors and continues to the next step', async () => {
		const visualKind = `test-visual-${kindSeed++}`;
		const visual = new TestVisualStepPresentation(visualKind, new Map());
		disposables.add(onboardingSequenceStepPresentationRegistry.register(visual));
		disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		const errors: string[] = [];
		setUnexpectedErrorHandler(error => errors.push(error.message));
		const presentation = disposables.add(new OnboardingSequencePresentation());

		try {
			const result = await presentation.run(createScenario([
				{ id: 'script', kind: RUN_ONBOARDING_STEP_KIND, payload: { run: () => { throw new Error('run failed'); } } },
				{ id: 'visual', kind: visualKind, payload: undefined },
			]), context());

			assert.deepStrictEqual({ errors, ids: visual.contexts.map(item => item.id), result }, {
				errors: ['run failed'],
				ids: ['visual'],
				result: {
					outcome: OnboardingOutcome.Completed,
					shown: true,
					dismissReason: OnboardingDismissReason.Completed,
					lastStepIndex: 1,
					stepCount: 2,
				},
			});
		} finally {
			setUnexpectedErrorHandler(originalErrorHandler);
		}
	});

	test('cancels an awaited run step and aborts before later steps', async () => {
		const visualKind = `test-visual-${kindSeed++}`;
		const visual = new TestVisualStepPresentation(visualKind, new Map());
		disposables.add(onboardingSequenceStepPresentationRegistry.register(visual));
		disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
		const abort = disposables.add(new Emitter<void>());
		let tokenCancelled = false;
		let signalStarted!: () => void;
		const started = new Promise<void>(resolve => signalStarted = resolve);
		const presentation = disposables.add(new OnboardingSequencePresentation());

		const resultPromise = presentation.run(createScenario([
			{ id: 'before', kind: visualKind, payload: undefined },
			{
				id: 'script',
				kind: RUN_ONBOARDING_STEP_KIND,
				payload: {
					run: (token: CancellationToken) => new Promise<void>(resolve => {
						signalStarted();
						const listener = token.onCancellationRequested(() => {
							listener.dispose();
							tokenCancelled = true;
							resolve();
						});
					}),
				},
			},
			{ id: 'after', kind: visualKind, payload: undefined },
		]), context(abort.event));
		await started;
		abort.fire();
		const result: IOnboardingRunResult = await resultPromise;

		assert.deepStrictEqual({ tokenCancelled, visualRuns: visual.contexts.map(item => item.id), result }, {
			tokenCancelled: true,
			visualRuns: ['before'],
			result: {
				outcome: OnboardingOutcome.Aborted,
				shown: true,
				dismissReason: OnboardingDismissReason.Aborted,
				lastStepIndex: 1,
				stepCount: 3,
			},
		});
	});
});
