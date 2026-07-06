/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';

/**
 * Describes when an onboarding scenario becomes eligible to run automatically.
 */
export type OnboardingTrigger =
	/** Eligible as soon as the scenario's `when` clause is satisfied. */
	| { readonly kind: 'auto' }
	/** Only started explicitly via a command (never runs automatically). */
	| { readonly kind: 'command'; readonly commandId: string }
	/** Eligible whenever the provided observable yields `true`. */
	| { readonly kind: 'observable'; readonly signal: IObservable<boolean> };

/**
 * A reference to a registered {@link IOnboardingPresentation} together with the
 * opaque payload that presentation understands (e.g. spotlight steps).
 */
export interface IOnboardingPresentationRef<TPayload = unknown> {
	/** The presentation kind, e.g. `'spotlight'`. */
	readonly kind: string;
	/** Presentation-specific data. The engine never inspects this. */
	readonly payload: TPayload;
}

/**
 * Reserved prefix that every onboarding experiment's **assignment-context identifier** must
 * use (for example `onb-newsession-2026q3`).
 *
 * ### Why this exists
 * The experimentation platform stamps every telemetry event with the user's assignment
 * context as soon as the assignments are fetched at startup. For onboarding experiments we
 * must *not* emit the identifier until the user actually reaches the point where the
 * onboarding would be shown — otherwise the scorecard counts activity from before the
 * experiment could have had any effect.
 *
 * The treatment flags that tell the client *which* identifier belongs to a given tour resolve
 * asynchronously, after the assignment context has already been committed to telemetry, so
 * they are too late to block the very first events. This prefix solves that race: because it
 * is a *static, well-known* string, the client can pre-emptively exclude **any**
 * assignment-context entry that starts with it from the very first event, and then
 * selectively unblock the one specific identifier once the user reaches the onboarding moment.
 *
 * ### Contract for experiment authors
 * - Every onboarding experiment configured in ExP MUST set its assignment-context identifier
 *   to a value beginning with this prefix.
 * - That same value MUST be returned by the experiment's
 *   {@link IOnboardingExperiment.assignmentContextIdFlag} treatment flag.
 *
 * The engine enforces this defensively: an id that lacks the prefix is rejected (the experiment
 * is treated as inactive and the misconfiguration is reported via `onUnexpectedError`) so a bad
 * id can never leak into telemetry ungated. A prefixed id that is never claimed by a registered
 * tour simply stays blocked forever.
 */
export const ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX = 'onb-';

/**
 * Experiment configuration for an onboarding scenario. The two treatment flag *names* are
 * resolved against the experimentation service; the experiment is only considered **active**
 * when *both* resolve: the boolean to a boolean and the id to a non-empty string that starts
 * with {@link ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX}. If either flag is missing or the id lacks
 * the required prefix, the experiment is **inactive** and the scenario does not run
 * automatically (it can still be started explicitly via a command/`runScenario`, which
 * bypasses experiment gating and does not open the telemetry gate; or by enabling
 * `onboarding.developerMode` for the scenario, which previews the tour without opening the
 * telemetry gate).
 */
export interface IOnboardingExperiment {
	/**
	 * Name of the boolean treatment flag that decides the *experience*: `true` shows the tour
	 * (treatment arm), `false` does not (control arm). In both arms the assignment-context
	 * identifier starts flowing once the user reaches the onboarding moment.
	 */
	readonly behaviorFlag: string;

	/**
	 * Name of the string treatment flag whose value is this experiment's assignment-context
	 * identifier — the exact entry that appears inside the telemetry `abexp.assignmentcontext`
	 * property and that the scorecard keys on. The value MUST start with
	 * {@link ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX}; an id without the prefix is rejected (the
	 * experiment is treated as inactive) so it can never leak into telemetry ungated.
	 */
	readonly assignmentContextIdFlag: string;
}

/**
 * A declarative onboarding scenario. Scenarios are pure data: they describe
 * *when* onboarding should happen and *which* presentation renders it, but not
 * *how* it is rendered (that is the presentation's job).
 */
export interface IOnboardingScenario<TPayload = unknown> {
	/** Stable identifier. Used as the persistence key for "shown once" state. */
	readonly id: string;

	/**
	 * Persistence key for the once-per-user "shown" state. Scenarios that share a
	 * `seenKey` are treated as the *same* onboarding for once-per-user gating:
	 * showing any one of them marks them all as seen, so the others never run
	 * automatically. Use this for variations of the same tour that should be
	 * shown at most once between them. Defaults to {@link id}.
	 */
	readonly seenKey?: string;

	/** Eligibility gate. AND-ed with the engine's own checks. */
	readonly when?: ContextKeyExpression;

	/** How the scenario becomes eligible to run automatically. */
	readonly trigger: OnboardingTrigger;

	/** Higher priority scenarios run first when several are eligible at once. Default `0`. */
	readonly priority?: number;

	/** The presentation that renders this scenario plus its payload. */
	readonly presentation: IOnboardingPresentationRef<TPayload>;

	/**
	 * Optional experiment that gates and measures this scenario. When present, the scenario
	 * only runs if the experiment is active (both treatment flags set). See
	 * {@link IOnboardingExperiment}.
	 */
	readonly experiment?: IOnboardingExperiment;

	/** When `true`, the scenario runs on every eligible session instead of once per user. */
	readonly repeatable?: boolean;
}

/**
 * The result of running a scenario's presentation.
 */
export const enum OnboardingOutcome {
	/** The user reached the end of the scenario. */
	Completed = 'completed',
	/** The user explicitly skipped the scenario. */
	Skipped = 'skipped',
	/** The scenario was dismissed (e.g. closed without an explicit skip). */
	Dismissed = 'dismissed',
	/** The scenario was aborted by the engine (e.g. window shutdown, target lost). */
	Aborted = 'aborted'
}

/**
 * The concrete mechanism that ended a scenario run. Refines {@link OnboardingOutcome} with
 * the specific user action, primarily for telemetry (e.g. distinguishing the Skip button
 * from the Escape key).
 */
export const enum OnboardingDismissReason {
	/** The user reached and advanced past the final step. */
	Completed = 'completed',
	/** The user pressed the Skip button. */
	SkipButton = 'skipButton',
	/** The user pressed the Escape key. */
	EscapeKey = 'escapeKey',
	/** The user advanced by clicking the highlighted target on the final step. */
	TargetClick = 'targetClick',
	/** The engine aborted the run (window shutdown, target lost, ...). */
	Aborted = 'aborted'
}

/**
 * Rich result returned by a presentation's `run`, carrying the outcome plus the data the
 * engine needs to emit per-tour telemetry (how far the user got and how the run ended).
 */
export interface IOnboardingRunResult {
	/** Coarse engine-level outcome. */
	readonly outcome: OnboardingOutcome;

	/**
	 * Whether the presentation actually displayed anything to the user. `false` for a
	 * degenerate run that rendered no UI (e.g. a scenario with no steps, or every step
	 * skipped because its target/`when` was unavailable). The engine only emits outcome
	 * telemetry when a tour was genuinely shown.
	 */
	readonly shown: boolean;

	/** Concrete reason/mechanism that ended the run. */
	readonly dismissReason: OnboardingDismissReason;

	/** Furthest 0-based step index the user reached (`0` if the first step never showed). */
	readonly lastStepIndex: number;

	/** Total number of steps the scenario declared. */
	readonly stepCount: number;
}
