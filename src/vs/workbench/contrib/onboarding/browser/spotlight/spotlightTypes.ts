/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';

/** The presentation `kind` handled by the spotlight presentation. */
export const SPOTLIGHT_PRESENTATION_KIND = 'spotlight';

/** Preferred placement of the callout relative to the spotlighted target. */
export type SpotlightPlacement = 'above' | 'below' | 'left' | 'right' | 'auto';

/** Behavior when a spotlight target is not rendered when its step is reached. */
export type SpotlightMissingTargetBehavior =
	| { readonly kind: 'skip' }
	| { readonly kind: 'wait'; readonly timeoutMs: number };

/**
 * A single step in a spotlight tour. Steps are pure data; the spotlight
 * presentation turns them into the dim overlay, the cut-out highlight and the
 * anchored callout.
 */
export interface ISpotlightStep {
	/** Stable identifier (unique within the tour). */
	readonly id: string;

	/**
	 * The `data-onboarding-id` of the element to spotlight. Resolved on demand
	 * via {@link findOnboardingTarget} so steps work even if the element is not
	 * yet rendered when the tour starts.
	 */
	readonly targetId: string;

	/** Callout heading (localized). */
	readonly title: string;

	/** Callout body (localized string or markdown). */
	readonly description: string | IMarkdownString;

	/** Preferred placement of the callout. Defaults to `'auto'`. */
	readonly placement?: SpotlightPlacement;

	/** When present and unsatisfied, the step is skipped. */
	readonly when?: ContextKeyExpression;

	/** Missing-target behavior. Defaults to waiting two seconds before skipping. */
	readonly missingTarget?: SpotlightMissingTargetBehavior;

	/** Opens or expands the target through its owner before the step begins. */
	readonly openTarget?: boolean;

	/** Allow the spotlighted element to remain interactive. Defaults to `false`. */
	readonly allowTargetInteraction?: boolean;

	/**
	 * When set, the step advances when the user clicks the spotlighted target
	 * itself (rather than a "Next" button). The target is kept interactive.
	 */
	readonly advanceOnTargetClick?: boolean;

	/** Hides Next and advances once this context expression becomes satisfied. */
	readonly advanceWhen?: ContextKeyExpression;

	/** Extra padding (px) around the target when cutting the highlight hole. */
	readonly padding?: number;

	/**
	 * Optional hook run just before the step is shown, e.g. to open the view
	 * that hosts the target. Awaited before the target is resolved.
	 */
	readonly onBeforeShow?: () => Promise<void> | void;
}

/**
 * The payload of a spotlight scenario: an ordered list of steps.
 */
export interface ISpotlightPayload {
	readonly steps: readonly ISpotlightStep[];
}
