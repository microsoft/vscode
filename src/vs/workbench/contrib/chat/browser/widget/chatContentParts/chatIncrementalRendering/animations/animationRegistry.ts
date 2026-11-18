/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIncrementalRenderingAnimation } from './animation.js';
import { BlockAnimation } from './blockAnimations.js';

/**
 * Registry of all available animation styles.
 * To add a new animation, add an entry here.
 */
export const ANIMATION_STYLES = {
	none: (): IIncrementalRenderingAnimation => ({ animate() { } }),
	fade: (): IIncrementalRenderingAnimation => new BlockAnimation('fade'),
	rise: (): IIncrementalRenderingAnimation => new BlockAnimation('rise'),
	blur: (): IIncrementalRenderingAnimation => new BlockAnimation('blur'),
	scale: (): IIncrementalRenderingAnimation => new BlockAnimation('scale'),
	slide: (): IIncrementalRenderingAnimation => new BlockAnimation('slide'),
	reveal: (): IIncrementalRenderingAnimation => new BlockAnimation('reveal'),
} as const satisfies Record<string, () => IIncrementalRenderingAnimation>;

export type AnimationStyleName = keyof typeof ANIMATION_STYLES;
