/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../dom.js';
import { pauseCSSAnimationsWhenHidden } from '../../animationSync.js';
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

export interface IPixelSpinner extends IDisposable {
	readonly element: HTMLElement;
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
 * @returns The spinner and its root element.
 */
export function createPixelSpinner(parent?: HTMLElement, options?: IPixelSpinnerOptions): IPixelSpinner {
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
	const animationTracking = trackSpinner(root);
	return {
		element: root,
		dispose: () => animationTracking.dispose(),
	};
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

function trackSpinner(root: HTMLElement): IDisposable {
	return pauseCSSAnimationsWhenHidden(root, {
		pausedClass: PAUSED_CLASS,
		subtree: true,
		animationNames: SPINNER_ANIMATION_NAMES,
	});
}
