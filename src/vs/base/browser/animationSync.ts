/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ISynchronizeAnimationsOptions {
	/**
	 * Also synchronize animations running on descendant elements (e.g. the dots
	 * of a spinner whose animations live on child nodes). Defaults to `false`.
	 */
	readonly subtree?: boolean;

	/**
	 * When provided, further narrows synchronization to CSS animations whose
	 * `animation-name` is in this set. Non-keyframe animations (e.g. transitions)
	 * are always skipped regardless of this option.
	 */
	readonly animationNames?: ReadonlySet<string>;
}

/**
 * Phase-aligns looping CSS animations so that every animation of the same
 * duration displays the same frame at the same time, regardless of when each
 * one started.
 *
 * All CSS animations share the document's timeline, so anchoring each
 * animation's `startTime` to the same origin (`0`) forces their `currentTime`
 * to equal the timeline time — making identical animations run in lock-step.
 * Per-element `animation-delay` offsets are preserved (they are part of each
 * animation's own timing), so intentional cascades (e.g. spinner dots) still
 * work while the group as a whole stays globally in phase.
 *
 * Unlike adjusting `animation-delay`, this re-seeks animations that are already
 * running (Chromium does not reliably re-seek a running animation when its
 * `animation-delay` changes). Call it whenever an animation (re)starts or
 * resumes after being paused offscreen — e.g. from an `animationstart` handler
 * or when an element scrolls back into view.
 *
 * @param element The element whose (and optionally whose descendants') CSS
 * animations should be synchronized.
 * @param options See {@link ISynchronizeAnimationsOptions}.
 */
export function synchronizeCSSAnimations(element: HTMLElement, options?: ISynchronizeAnimationsOptions): void {
	if (typeof element.getAnimations !== 'function') {
		return; // Web Animations API not available; leave animations as-is.
	}
	for (const animation of element.getAnimations({ subtree: options?.subtree })) {
		// Only CSS keyframe animations carry an `animationName`; skip transitions
		// and other Web Animations so this helper strictly aligns CSS animations.
		const animationName = (animation as CSSAnimation).animationName;
		if (animationName === undefined) {
			continue;
		}
		if (options?.animationNames && !options.animationNames.has(animationName)) {
			continue;
		}
		// Anchor to a shared origin so all animations of the same duration display
		// the same frame. Guard against the rare state where startTime is not yet
		// settable (e.g. an animation still in its pending/ready phase).
		try {
			animation.startTime = 0;
		} catch {
			// ignore
		}
	}
}
