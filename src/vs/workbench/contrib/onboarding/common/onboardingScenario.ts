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
 * A declarative onboarding scenario. Scenarios are pure data: they describe
 * *when* onboarding should happen and *which* presentation renders it, but not
 * *how* it is rendered (that is the presentation's job).
 */
export interface IOnboardingScenario<TPayload = unknown> {
	/** Stable identifier. Used as the persistence key for "shown once" state. */
	readonly id: string;

	/** Eligibility gate. AND-ed with the engine's own checks. */
	readonly when?: ContextKeyExpression;

	/** How the scenario becomes eligible to run automatically. */
	readonly trigger: OnboardingTrigger;

	/** Higher priority scenarios run first when several are eligible at once. Default `0`. */
	readonly priority?: number;

	/** The presentation that renders this scenario plus its payload. */
	readonly presentation: IOnboardingPresentationRef<TPayload>;

	/** Optional experiment treatment id that must be enabled for the scenario to run. */
	readonly experiment?: string;

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
