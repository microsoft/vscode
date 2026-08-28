/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IOnboardingPresentation, IOnboardingRunContext } from '../../common/onboardingPresentation.js';
import { IOnboardingRunResult, IOnboardingScenario, OnboardingDismissReason, OnboardingOutcome } from '../../common/onboardingScenario.js';
import { IOnboardingSequencePayload, IOnboardingSequenceStep, IOnboardingSequenceStepPresentation, ONBOARDING_SEQUENCE_PRESENTATION_KIND, onboardingSequenceStepPresentationRegistry } from '../../common/onboardingSequence.js';

/** Runs a heterogeneous sequence while leaving each step's rendering to its registered kind. */
export class OnboardingSequencePresentation extends Disposable implements IOnboardingPresentation {
	readonly kind = ONBOARDING_SEQUENCE_PRESENTATION_KIND;

	async run(scenario: IOnboardingScenario, context: IOnboardingRunContext): Promise<IOnboardingRunResult> {
		const steps = (scenario.presentation.payload as IOnboardingSequencePayload)?.steps ?? [];
		if (steps.length === 0) {
			return { outcome: OnboardingOutcome.Completed, shown: false, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 0 };
		}

		const store = new DisposableStore();
		try {
			const cancellation = store.add(new CancellationTokenSource());
			store.add(context.onAbort(() => cancellation.cancel()));
			const skippedVisualSteps = new Set<number>();
			const shownVisualSteps = new Set<number>();
			const executedRunOnceSteps = new Set<number>();
			const visualStepCount = steps.reduce((count, step) => count + (this._presentation(step)?.countsAsVisualStep ? 1 : 0), 0);
			let index = 0;
			let direction: 1 | -1 = 1;
			let shown = false;
			let lastStepIndex = 0;
			let dismissReason = OnboardingDismissReason.Completed;

			while (index >= 0 && index < steps.length && !cancellation.token.isCancellationRequested) {
				const step = steps[index];
				const presentation = this._presentation(step);
				if (!presentation) {
					onUnexpectedError(new Error(`No onboarding sequence step presentation registered for '${step.kind}'.`));
					return { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount: steps.length };
				}

				if (!presentation.countsAsVisualStep && direction === -1) {
					index--;
					continue;
				}
				if (presentation.runOnce && executedRunOnceSteps.has(index)) {
					index += direction;
					continue;
				}
				if (presentation.runOnce) {
					executedRunOnceSteps.add(index);
				}
				if (presentation.countsAsVisualStep) {
					skippedVisualSteps.delete(index);
				}

				const visualStepIndex = this._visualStepIndex(steps, index, skippedVisualSteps);
				const currentVisualStepCount = visualStepCount - skippedVisualSteps.size;
				if (!presentation.countsAsVisualStep) {
					lastStepIndex = Math.max(lastStepIndex, index);
				}
				const result = await presentation.runStep(step, {
					...context,
					cancellationToken: cancellation.token,
					stepIndex: index,
					visualStepIndex,
					visualStepCount: currentVisualStepCount,
					canGoBack: Array.from(shownVisualSteps).some(stepIndex => stepIndex < index),
					isLastVisualStep: visualStepIndex === currentVisualStepCount - 1,
				});
				if (cancellation.token.isCancellationRequested || result.action === 'abort') {
					return { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount: steps.length };
				}

				if (result.shown) {
					shown = true;
					lastStepIndex = Math.max(lastStepIndex, index);
					if (presentation.countsAsVisualStep) {
						shownVisualSteps.add(index);
					}
				}

				switch (result.action) {
					case 'next':
						dismissReason = result.dismissReason ?? dismissReason;
						direction = 1;
						index++;
						break;
					case 'back':
						direction = -1;
						index--;
						break;
					case 'skipStep':
						if (presentation.countsAsVisualStep) {
							skippedVisualSteps.add(index);
						}
						index += direction;
						break;
					case 'skipSequence':
						return {
							outcome: OnboardingOutcome.Skipped,
							shown,
							dismissReason: result.dismissReason ?? OnboardingDismissReason.SkipButton,
							lastStepIndex,
							stepCount: steps.length,
						};
				}
			}

			return cancellation.token.isCancellationRequested
				? { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount: steps.length }
				: { outcome: OnboardingOutcome.Completed, shown, dismissReason, lastStepIndex, stepCount: steps.length };
		} finally {
			store.dispose();
		}
	}

	private _presentation(step: IOnboardingSequenceStep): IOnboardingSequenceStepPresentation | undefined {
		return onboardingSequenceStepPresentationRegistry.get(step.kind);
	}

	private _visualStepIndex(steps: readonly IOnboardingSequenceStep[], index: number, skippedVisualSteps: ReadonlySet<number>): number {
		let visualStepIndex = 0;
		for (let stepIndex = 0; stepIndex < index; stepIndex++) {
			if (this._presentation(steps[stepIndex])?.countsAsVisualStep && !skippedVisualSteps.has(stepIndex)) {
				visualStepIndex++;
			}
		}
		return visualStepIndex;
	}
}
