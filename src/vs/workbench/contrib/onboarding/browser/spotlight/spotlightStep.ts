/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { IOnboardingSequenceStep } from '../../common/onboardingSequence.js';
import { ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from './spotlightTypes.js';

const DEFAULT_TARGET_WAIT_TIMEOUT = 10_000;

export type IOnboardingClickStepOptions = Omit<ISpotlightStep, 'advanceOnTargetClick' | 'advanceWhen'>;

export interface IOnboardingContextStepOptions extends IOnboardingClickStepOptions {
	/** The state produced by the requested user action. */
	readonly completeWhen: ContextKeyExpression;
}

export function createOnboardingClickStep(options: IOnboardingClickStepOptions): IOnboardingSequenceStep<ISpotlightStep> {
	return createStep({
		...options,
		allowTargetInteraction: options.allowTargetInteraction ?? true,
		advanceOnTargetClick: true,
		missingTarget: options.missingTarget ?? { kind: 'wait', timeoutMs: DEFAULT_TARGET_WAIT_TIMEOUT },
	});
}

export function createOnboardingContextStep(options: IOnboardingContextStepOptions): IOnboardingSequenceStep<ISpotlightStep> {
	const { completeWhen, ...step } = options;
	return createStep({
		...step,
		openTarget: step.openTarget ?? true,
		allowTargetInteraction: step.allowTargetInteraction ?? true,
		advanceWhen: completeWhen,
		missingTarget: step.missingTarget ?? { kind: 'wait', timeoutMs: DEFAULT_TARGET_WAIT_TIMEOUT },
	});
}

function createStep(step: ISpotlightStep): IOnboardingSequenceStep<ISpotlightStep> {
	return {
		id: step.id,
		kind: SPOTLIGHT_PRESENTATION_KIND,
		payload: step,
	};
}
