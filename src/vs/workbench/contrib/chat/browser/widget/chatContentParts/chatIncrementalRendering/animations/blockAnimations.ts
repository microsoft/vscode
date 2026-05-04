/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIncrementalRenderingAnimation } from './animation.js';

/** Duration of the animation applied to newly rendered blocks. */
export const ANIMATION_DURATION_MS = 600;

/**
 * Delay (ms) between each successive new child's animation start.
 * Creates a cascading top-to-bottom reveal across a batch of new
 * block-level elements.
 */
const STAGGER_DELAY_MS = 150;

/**
 * Block-level CSS animation styles: fade, rise, blur, scale, slide,
 * and lineFade. Each applies a CSS class and staggered timing
 * variables to new top-level children so they reveal sequentially.
 */
export class BlockAnimation implements IIncrementalRenderingAnimation {

	constructor(private readonly _style: 'fade' | 'rise' | 'blur' | 'scale' | 'slide' | 'reveal') { }

	animate(children: HTMLCollection, fromIndex: number, currentCount: number, elapsed: number): void {
		const className = `chat-smooth-animate-${this._style}`;

		for (let i = fromIndex; i < currentCount; i++) {
			const child = children[i] as HTMLElement;
			if (!child.classList) {
				continue;
			}

			const staggerOffset = (i - fromIndex) * STAGGER_DELAY_MS;
			const childDelay = -elapsed + staggerOffset;

			child.classList.add(className);
			child.style.setProperty('--chat-smooth-duration', `${ANIMATION_DURATION_MS}ms`);
			child.style.setProperty('--chat-smooth-delay', `${childDelay}ms`);

			child.addEventListener('animationend', (e) => {
				if (e.target !== child) {
					return;
				}
				child.classList.remove(className);
				child.style.removeProperty('--chat-smooth-duration');
				child.style.removeProperty('--chat-smooth-delay');
			}, { once: true });
		}
	}
}
