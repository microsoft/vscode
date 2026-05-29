/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../dom.js';
import { mainWindow } from '../../window.js';
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

// Pause animations when the spinner is offscreen or the document is hidden, so
// continuous CSS animations stop costing compositor work for spinners the user
// can't see. Falls back to always-on if the platform lacks IntersectionObserver.

const PAUSED_CLASS = 'monaco-pixel-spinner-paused';
const trackedSpinners = new Set<HTMLElement>();
let intersectionObserver: IntersectionObserver | undefined;
let visibilityListenerAttached = false;

function updateForDocumentVisibility(): void {
	const hidden = mainWindow.document.visibilityState === 'hidden';
	for (const el of trackedSpinners) {
		if (!el.isConnected) {
			trackedSpinners.delete(el);
			intersectionObserver?.unobserve(el);
			continue;
		}
		if (hidden) {
			el.classList.add(PAUSED_CLASS);
		}
		// When becoming visible, leave the per-element class alone — the
		// IntersectionObserver callback will run and set the correct state.
	}
}

function trackSpinner(root: HTMLElement): void {
	if (typeof IntersectionObserver !== 'function') {
		return;
	}
	if (!intersectionObserver) {
		intersectionObserver = new mainWindow.IntersectionObserver(entries => {
			const hidden = mainWindow.document.visibilityState === 'hidden';
			for (const entry of entries) {
				const target = entry.target as HTMLElement;
				if (!target.isConnected) {
					trackedSpinners.delete(target);
					intersectionObserver!.unobserve(target);
					continue;
				}
				if (entry.isIntersecting && !hidden) {
					target.classList.remove(PAUSED_CLASS);
				} else {
					target.classList.add(PAUSED_CLASS);
				}
			}
		});
	}
	if (!visibilityListenerAttached) {
		mainWindow.document.addEventListener('visibilitychange', updateForDocumentVisibility);
		visibilityListenerAttached = true;
	}

	root.classList.add(PAUSED_CLASS);
	trackedSpinners.add(root);
	intersectionObserver.observe(root);
}
