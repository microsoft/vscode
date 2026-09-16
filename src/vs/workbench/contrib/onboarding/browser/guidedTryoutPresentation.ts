/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { onboardingPresentationRegistry } from '../common/onboardingPresentation.js';
import { IOnboardingScenario, OnboardingOutcome } from '../common/onboardingScenario.js';
import { ONBOARDING_SEQUENCE_PRESENTATION_KIND, onboardingSequenceStepPresentationRegistry } from '../common/onboardingSequence.js';
import { IOnboardingTryoutPresentation, IOnboardingTryoutRunContext, IOnboardingTryoutUnavailable, OnboardingTryoutAvailability, OnboardingTryoutPreparation, OnboardingTryoutResult } from '../common/onboardingTryout.js';
import { IGuidedTryoutPayload, isGuidedTryoutPayload } from '../common/onboardingTryoutActions.js';
import { OnboardingSequencePresentation } from './sequence/sequencePresentation.js';

export const GUIDED_TRYOUT_PRESENTATION_KIND = 'guidedTryout';

export class GuidedTryoutPresentation extends Disposable implements IOnboardingTryoutPresentation {
	readonly kind = GUIDED_TRYOUT_PRESENTATION_KIND;
	readonly onDidChangeAvailability = Event.any(
		onboardingPresentationRegistry.onDidChange,
		onboardingSequenceStepPresentationRegistry.onDidChange,
	);

	private readonly sequencePresentation = this._register(new OnboardingSequencePresentation());

	getAvailability(scenario: IOnboardingScenario): OnboardingTryoutAvailability {
		const payload = this.getPayload(scenario);
		const launch = this.getLaunchPresentation(payload);
		if (!launch) {
			return this.unavailable(payload);
		}
		if (payload.steps.some(step => !onboardingSequenceStepPresentationRegistry.get(step.kind))) {
			return this.unavailable(payload);
		}
		return launch.getAvailability(this.createLaunchScenario(scenario, payload));
	}

	async prepare(scenario: IOnboardingScenario, context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutPreparation> {
		const payload = this.getPayload(scenario);
		const launch = this.getLaunchPresentation(payload);
		if (!launch || payload.steps.some(step => !onboardingSequenceStepPresentationRegistry.get(step.kind))) {
			return this.unavailable(payload);
		}
		const launchScenario = this.createLaunchScenario(scenario, payload);
		const preparation = await launch.prepare(launchScenario, context);
		if (preparation.kind !== 'ready') {
			return preparation;
		}
		return {
			kind: 'ready',
			run: async () => {
				const launchResult = await preparation.run();
				if (!this.didLaunch(launchResult) || context.token.isCancellationRequested) {
					return context.token.isCancellationRequested ? { kind: 'cancelled' } : launchResult;
				}

				const guidanceStore = new DisposableStore();
				const abort = guidanceStore.add(new Emitter<void>());
				guidanceStore.add(context.token.onCancellationRequested(() => abort.fire()));
				const guidanceResult = await this.sequencePresentation.run({
					...scenario,
					presentation: {
						kind: ONBOARDING_SEQUENCE_PRESENTATION_KIND,
						payload: { steps: payload.steps },
					},
				}, {
					targetWindow: mainWindow,
					onAbort: abort.event,
				}).finally(() => guidanceStore.dispose());

				if (context.token.isCancellationRequested) {
					return { kind: 'cancelled' };
				}
				if (!guidanceResult.shown || guidanceResult.outcome === OnboardingOutcome.Aborted) {
					return this.unavailable(payload);
				}
				return launchResult;
			},
		};
	}

	private getPayload(scenario: IOnboardingScenario): IGuidedTryoutPayload {
		const payload = scenario.presentation.payload;
		if (!isGuidedTryoutPayload(payload) || payload.launch.kind === this.kind) {
			throw new Error(localize('onboarding.tryout.invalidGuidedPayload', "The guided feature example '{0}' has an invalid presentation.", scenario.id));
		}
		return payload;
	}

	private getLaunchPresentation(payload: IGuidedTryoutPayload): IOnboardingTryoutPresentation | undefined {
		const presentation = onboardingPresentationRegistry.get(payload.launch.kind);
		return presentation && hasKey(presentation, { prepare: true }) ? presentation : undefined;
	}

	private createLaunchScenario(scenario: IOnboardingScenario, payload: IGuidedTryoutPayload): IOnboardingScenario {
		return { ...scenario, presentation: payload.launch };
	}

	private didLaunch(result: OnboardingTryoutResult): boolean {
		return result.kind === 'opened' || result.kind === 'executed' || result.kind === 'prepared';
	}

	private unavailable(payload: IGuidedTryoutPayload): IOnboardingTryoutUnavailable {
		return {
			kind: 'unavailable',
			message: payload.unavailableMessage ?? localize('onboarding.tryout.guidanceUnavailable', "The example opened, but its highlighted control is not available."),
		};
	}
}
