/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { IOnboardingSequenceStep, IOnboardingSequenceStepContext, IOnboardingSequenceStepPresentation, IOnboardingSequenceStepResult } from '../../common/onboardingSequence.js';

export const RUN_ONBOARDING_STEP_KIND = 'run';

/** Callback payload for a cancellable non-visual sequence step. */
export interface IRunOnboardingStepPayload {
	readonly run: (token: CancellationToken) => Promise<void> | void;
}

/** Executes a run-step callback once and continues after reported errors. */
export class RunOnboardingStepPresentation implements IOnboardingSequenceStepPresentation {
	readonly kind = RUN_ONBOARDING_STEP_KIND;
	readonly countsAsVisualStep = false;
	readonly runOnce = true;

	async runStep(step: IOnboardingSequenceStep, context: IOnboardingSequenceStepContext): Promise<IOnboardingSequenceStepResult> {
		if (context.cancellationToken.isCancellationRequested) {
			return { action: 'abort', shown: false };
		}
		try {
			const payload = step.payload as IRunOnboardingStepPayload;
			await raceCancellation(Promise.resolve(payload.run(context.cancellationToken)), context.cancellationToken);
		} catch (error) {
			if (!context.cancellationToken.isCancellationRequested) {
				onUnexpectedError(error);
			}
		}
		return context.cancellationToken.isCancellationRequested
			? { action: 'abort', shown: false }
			: { action: 'next', shown: false };
	}
}
