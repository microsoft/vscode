/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IOnboardingPresentation, IOnboardingRunContext } from '../../common/onboardingPresentation.js';
import { IOnboardingRunResult, IOnboardingScenario, OnboardingDismissReason, OnboardingOutcome } from '../../common/onboardingScenario.js';
import { findOnboardingTarget } from './onboardingTarget.js';
import { ISpotlightContent, SpotlightOverlay } from './spotlightOverlay.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from './spotlightTypes.js';

/** How long to wait for a step's target element to appear before skipping it. */
const TARGET_RESOLVE_TIMEOUT = 2000;
const TARGET_POLL_INTERVAL = 50;
const TARGET_ANIMATION_SETTLE_TIMEOUT = 600;

/** The terminal action of a single step, carrying the data needed for telemetry. */
type StepEnd =
	| { readonly action: 'next'; readonly via: 'button' | 'target' }
	| { readonly action: 'back' }
	| { readonly action: 'skip'; readonly reason: OnboardingDismissReason.SkipButton | OnboardingDismissReason.EscapeKey }
	| { readonly action: 'abort' };

/**
 * Renders {@link ISpotlightPayload} scenarios: it dims the window (including the
 * native window controls), walks the steps, and shows an anchored callout for
 * each. Implements the engine's {@link IOnboardingPresentation} contract so the
 * scenario engine can drive it without knowing anything about spotlights.
 */
export class SpotlightPresentation extends Disposable implements IOnboardingPresentation {

	readonly kind = SPOTLIGHT_PRESENTATION_KIND;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IHostService private readonly hostService: IHostService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
	}

	async run(scenario: IOnboardingScenario, context: IOnboardingRunContext): Promise<IOnboardingRunResult> {
		const payload = scenario.presentation.payload as ISpotlightPayload;
		const steps = payload?.steps ?? [];
		const stepCount = steps.length;
		if (stepCount === 0) {
			return { outcome: OnboardingOutcome.Completed, shown: false, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 0 };
		}

		// Furthest step the user actually saw (0-based). Stays at the last shown
		// step regardless of how the run ends, for telemetry.
		let lastStepIndex = 0;
		// Whether at least one step was actually rendered. Stays `false` if every step is
		// skipped (missing target / unsatisfied `when`) so nothing was ever displayed.
		let shown = false;

		const store = new DisposableStore();
		try {
			const container = this.layoutService.getContainer(context.targetWindow);
			const overlay = store.add(new SpotlightOverlay(container));

			// Dim the native window controls overlay in sync with the dim layer.
			this.hostService.setWindowDimmed(context.targetWindow, true);
			store.add(toDisposable(() => this.hostService.setWindowDimmed(context.targetWindow, false)));

			let aborted = false;
			store.add(context.onAbort(() => { aborted = true; }));

			// Keep the callout glued to the target as the workbench re-layouts.
			// Schedule the measurement so it runs after the layout event's DOM work
			// has settled, including position-only shifts that ResizeObserver misses.
			store.add(this.layoutService.onDidLayoutContainer(() => overlay.scheduleLayout()));

			let index = 0;
			let direction: 1 | -1 = 1;

			while (index >= 0 && index < stepCount && !aborted) {
				const step = steps[index];

				if (step.when && !this.contextKeyService.contextMatchesRules(step.when)) {
					index += direction;
					continue;
				}

				try {
					await step.onBeforeShow?.();
				} catch (error) {
					onUnexpectedError(error);
				}
				if (aborted) {
					break;
				}

				const target = await this._resolveTarget(context.targetWindow, step.targetId);
				if (aborted) {
					break;
				}
				if (!target) {
					index += direction;
					continue;
				}

				await this._waitForTargetReady(context.targetWindow, target);
				if (aborted) {
					break;
				}

				lastStepIndex = Math.max(lastStepIndex, index);
				shown = true;

				const end = await this._runStep(overlay, context, step, target, index, stepCount);
				switch (end.action) {
					case 'next':
						if (index === stepCount - 1) {
							// Advancing past the final step completes the tour.
							const dismissReason = end.via === 'target' ? OnboardingDismissReason.TargetClick : OnboardingDismissReason.Completed;
							return { outcome: OnboardingOutcome.Completed, shown, dismissReason, lastStepIndex, stepCount };
						}
						direction = 1;
						index++;
						break;
					case 'back':
						direction = -1;
						index--;
						break;
					case 'skip':
						return { outcome: OnboardingOutcome.Skipped, shown, dismissReason: end.reason, lastStepIndex, stepCount };
					case 'abort':
						return { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount };
				}
			}

			return aborted
				? { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount }
				: { outcome: OnboardingOutcome.Completed, shown, dismissReason: OnboardingDismissReason.Completed, lastStepIndex, stepCount };
		} finally {
			store.dispose();
		}
	}

	private async _resolveTarget(targetWindow: Window, targetId: string): Promise<HTMLElement | undefined> {
		const deadline = Date.now() + TARGET_RESOLVE_TIMEOUT;
		let element = findOnboardingTarget(targetWindow, targetId);
		while (!element && Date.now() < deadline) {
			await timeout(TARGET_POLL_INTERVAL);
			element = findOnboardingTarget(targetWindow, targetId);
		}
		return element;
	}

	private async _waitForTargetReady(targetWindow: Window, target: HTMLElement): Promise<void> {
		const animations = this._getActiveFiniteAnimations(target);
		if (animations.length > 0) {
			await Promise.race([
				Promise.allSettled(animations.map(animation => animation.finished.catch(() => undefined))),
				timeout(TARGET_ANIMATION_SETTLE_TIMEOUT),
			]);
		}
		await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
	}

	private _getActiveFiniteAnimations(target: HTMLElement): Animation[] {
		const animations: Animation[] = [];
		for (let element: HTMLElement | null = target; element; element = element.parentElement) {
			for (const animation of element.getAnimations()) {
				if (animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity) {
					animations.push(animation);
				}
			}
		}
		return animations;
	}

	private _runStep(overlay: SpotlightOverlay, context: IOnboardingRunContext, step: ISpotlightStep, target: HTMLElement, index: number, stepCount: number): Promise<StepEnd> {
		return new Promise<StepEnd>(resolve => {
			const stepStore = new DisposableStore();
			const done = (end: StepEnd) => {
				stepStore.dispose();
				resolve(end);
			};

			stepStore.add(overlay.onDidClickNext(via => done({ action: 'next', via })));
			stepStore.add(overlay.onDidClickPrevious(() => done({ action: 'back' })));
			stepStore.add(overlay.onDidSkip(reason => done({ action: 'skip', reason })));
			stepStore.add(context.onAbort(() => done({ action: 'abort' })));

			const content: ISpotlightContent = {
				title: step.title,
				description: step.description,
				stepIndex: index,
				stepCount,
				canGoBack: index > 0,
				isLastStep: index === stepCount - 1,
			};

			overlay.show(target, content, {
				placement: step.placement,
				allowTargetInteraction: step.allowTargetInteraction,
				advanceOnTargetClick: step.advanceOnTargetClick,
				padding: step.padding,
			});
		});
	}
}
