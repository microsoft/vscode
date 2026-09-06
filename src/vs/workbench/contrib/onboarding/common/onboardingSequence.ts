/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IOnboardingRunContext } from './onboardingPresentation.js';
import { OnboardingDismissReason } from './onboardingScenario.js';

export const ONBOARDING_SEQUENCE_PRESENTATION_KIND = 'sequence';

/** One entry in a heterogeneous onboarding sequence. */
export interface IOnboardingSequenceStep<TPayload = unknown> {
	readonly id: string;
	readonly kind: string;
	readonly payload: TPayload;
}

/** Payload rendered by the sequence presentation. */
export interface IOnboardingSequencePayload {
	readonly steps: readonly IOnboardingSequenceStep[];
}

/** Context passed to a sequence step presentation. */
export interface IOnboardingSequenceStepContext extends IOnboardingRunContext {
	readonly cancellationToken: CancellationToken;
	readonly stepIndex: number;
	readonly visualStepIndex: number;
	readonly visualStepCount: number;
	readonly canGoBack: boolean;
	readonly isLastVisualStep: boolean;
}

/** Traversal result returned by one sequence step. */
export interface IOnboardingSequenceStepResult {
	readonly action: 'next' | 'back' | 'skipStep' | 'skipSequence' | 'abort';
	readonly shown: boolean;
	readonly dismissReason?: OnboardingDismissReason;
}

/** Renders one kind of sequence step. */
export interface IOnboardingSequenceStepPresentation {
	readonly kind: string;
	/** Whether this kind participates in visual progress counters. */
	readonly countsAsVisualStep: boolean;
	/** Whether a forward revisit skips a step that already ran. */
	readonly runOnce?: boolean;
	runStep(step: IOnboardingSequenceStep, context: IOnboardingSequenceStepContext): Promise<IOnboardingSequenceStepResult>;
}

/** Registry of sequence step presentations by kind. */
export interface IOnboardingSequenceStepPresentationRegistry {
	register(presentation: IOnboardingSequenceStepPresentation): IDisposable;
	get(kind: string): IOnboardingSequenceStepPresentation | undefined;
}

class OnboardingSequenceStepPresentationRegistry implements IOnboardingSequenceStepPresentationRegistry {
	private readonly _presentations = new Map<string, IOnboardingSequenceStepPresentation>();

	register(presentation: IOnboardingSequenceStepPresentation): IDisposable {
		if (this._presentations.has(presentation.kind)) {
			throw new Error(`An onboarding sequence step presentation with kind '${presentation.kind}' is already registered.`);
		}
		this._presentations.set(presentation.kind, presentation);
		return {
			dispose: () => {
				if (this._presentations.get(presentation.kind) === presentation) {
					this._presentations.delete(presentation.kind);
				}
			}
		};
	}

	get(kind: string): IOnboardingSequenceStepPresentation | undefined {
		return this._presentations.get(kind);
	}
}

export const onboardingSequenceStepPresentationRegistry: IOnboardingSequenceStepPresentationRegistry = new OnboardingSequenceStepPresentationRegistry();
