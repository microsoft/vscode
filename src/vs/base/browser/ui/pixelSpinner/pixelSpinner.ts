/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, h, onDidUnregisterWindow } from '../../dom.js';
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
const observersByWindow = new Map<CodeWindow, IntersectionObserver>();
let unregisterWindowListener: IDisposable | undefined;

// Tracks spinners that have been connected to the DOM at least once, so we can
// tell a spinner that is not yet inserted (keep observing — it may be appended
// later) apart from one that was removed (stop observing to avoid leaking a
// strong reference to a detached element).
const everConnected = new WeakSet<HTMLElement>();

function getObserverFor(targetWindow: CodeWindow): IntersectionObserver | undefined {
	if (typeof targetWindow.IntersectionObserver !== 'function') {
		return undefined;
	}
	let observer = observersByWindow.get(targetWindow);
	if (!observer) {
		observer = new targetWindow.IntersectionObserver(entries => {
			for (const entry of entries) {
				const target = entry.target as HTMLElement;
				if (!target.isConnected) {
					// A spinner is created detached and observed before it is
					// appended to the DOM; the observer's initial callback can
					// arrive while it is still detached. Only stop observing
					// once it has been connected and is now removed, otherwise
					// keep observing so it unpauses when it is inserted.
					if (everConnected.has(target)) {
						observer!.unobserve(target);
						everConnected.delete(target);
					}
					continue;
				}
				everConnected.add(target);
				target.classList.toggle(PAUSED_CLASS, !entry.isIntersecting);
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

