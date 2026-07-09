/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, h, onDidUnregisterWindow } from '../../dom.js';
import { synchronizeCSSAnimations } from '../../animationSync.js';
import { CodeWindow } from '../../window.js';
import { IDisposable } from '../../../common/lifecycle.js';
import './pixelSpinner.css';

export interface IPixelSpinnerOptions {
	/**
	 * Accessible label for the spinner. When provided, the spinner is given
	 * `role="status"` and `aria-label` so screen readers announce a busy state.
	 * When omitted (the default), the spinner is purely decorative and is marked
	 * `aria-hidden="true"` — appropriate when a surrounding element already
	 * conveys the busy state.
	 */
	readonly ariaLabel?: string;

	/**
	 * Visual variant of the spinner.
	 *  - `'grid'` (default): six dots in a 2×3 grid that cascade vertically.
	 *  - `'ring'`: six dots arranged in a circle with a highlight that orbits the ring.
	 */
	readonly variant?: 'grid' | 'ring';
}

/**
 * Creates a small pixel-art style spinner. Color is driven by `currentColor`,
 * so consumers can control the visual color via the parent element's `color`
 * style or by setting `style.color` directly on the returned element.
 *
 * Respects `prefers-reduced-motion` by disabling the animation.
 *
 * @param parent Optional parent to append the spinner to.
 * @param options Optional spinner configuration.
 * @returns The spinner root element.
 */
export function createPixelSpinner(parent?: HTMLElement, options?: IPixelSpinnerOptions): HTMLElement {
	const variant = options?.variant ?? 'grid';
	const rootClass = variant === 'ring' ? 'span.monaco-pixel-spinner.monaco-pixel-spinner-ring' : 'span.monaco-pixel-spinner';
	const root = h(rootClass).root;
	if (options?.ariaLabel) {
		root.setAttribute('role', 'status');
		root.setAttribute('aria-label', options.ariaLabel);
	} else {
		root.setAttribute('aria-hidden', 'true');
	}
	for (let i = 0; i < 6; i++) {
		root.appendChild(h('span.monaco-pixel-spinner-dot').root);
	}
	parent?.appendChild(root);
	trackSpinner(root);
	return root;
}


const PAUSED_CLASS = 'monaco-pixel-spinner-paused';
// Keyframes names used by the spinner variants (see pixelSpinner.css). The sync
// is scoped to these so it never disturbs unrelated animations/transitions
// (e.g. the icon cross-fade) that may run on the same subtree.
const SPINNER_ANIMATION_NAMES = new Set([
	'monaco-pixel-spinner-dot-cycle',
	'monaco-pixel-spinner-dot-cycle-long',
	'monaco-pixel-spinner-dot-cycle-short',
	'monaco-pixel-spinner-ring-pulse',
]);
const observersByWindow = new Map<CodeWindow, IntersectionObserver>();
let unregisterWindowListener: IDisposable | undefined;

function getObserverFor(targetWindow: CodeWindow): IntersectionObserver | undefined {
	if (typeof targetWindow.IntersectionObserver !== 'function') {
		return undefined;
	}
	let observer = observersByWindow.get(targetWindow);
	if (!observer) {
		observer = new targetWindow.IntersectionObserver(entries => {
			// Two passes so all style writes happen before any style read: the
			// pause-class toggles below dirty style, and `getAnimations()` in the
			// sync pass flushes it. Interleaving them would force a style recalc
			// per entry instead of one for the whole batch.
			const toResync: HTMLElement[] = [];
			for (const entry of entries) {
				const target = entry.target as HTMLElement;
				if (!target.isConnected) {
					observer!.unobserve(target);
					continue;
				}
				target.classList.toggle(PAUSED_CLASS, !entry.isIntersecting);
				if (entry.isIntersecting) {
					toResync.push(target);
				}
			}
			// Re-sync resumed spinners to the shared timeline: while paused
			// offscreen the animation froze and its startTime drifted from
			// spinners that kept running. Anchor it back (now that it is running
			// again) so all visible spinners display the same frame.
			for (const target of toResync) {
				synchronizeCSSAnimations(target, { subtree: true, animationNames: SPINNER_ANIMATION_NAMES });
			}
		});
		observersByWindow.set(targetWindow, observer);

		if (!unregisterWindowListener) {
			unregisterWindowListener = onDidUnregisterWindow(window => {
				const obs = observersByWindow.get(window);
				if (obs) {
					obs.disconnect();
					observersByWindow.delete(window);
				}
			});
		}
	}
	return observer;
}

function trackSpinner(root: HTMLElement): void {
	const observer = getObserverFor(getWindow(root));
	if (!observer) {
		return;
	}
	// Start paused; the observer delivers an initial notification that resumes
	// the spinner if it is actually on screen.
	root.classList.add(PAUSED_CLASS);
	observer.observe(root);
}
