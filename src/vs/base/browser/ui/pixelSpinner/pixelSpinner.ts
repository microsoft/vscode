/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../dom.js';
import './pixelSpinner.css';

/**
 * Creates a small pixel-art style spinner consisting of six animated dots
 * arranged in a 2×3 grid. Color is driven by `currentColor`, so consumers
 * can control the visual color via the parent element's `color` style or
 * by setting `style.color` directly on the returned element.
 *
 * Respects `prefers-reduced-motion` by disabling the animation.
 *
 * @param parent Optional parent to append the spinner to.
 * @returns The spinner root element.
 */
export function createPixelSpinner(parent?: HTMLElement): HTMLElement {
	const root = h('span.monaco-pixel-spinner', { role: 'img' }).root;
	for (let i = 0; i < 6; i++) {
		root.appendChild(h('span.monaco-pixel-spinner-dot').root);
	}
	parent?.appendChild(root);
	return root;
}
