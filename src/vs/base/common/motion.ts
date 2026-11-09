/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type MotionDirection = 'inline-start' | 'inline-end' | 'block-start' | 'block-end';

export interface IMotionFrame {
	readonly opacity?: number;
	readonly transform?: string;
	readonly offset?: number;
}

export interface IMotionEffect {
	readonly frames: readonly IMotionFrame[];
	readonly duration: number;
	readonly delay: number;
	readonly easing: string;
	readonly iterations: number;
	readonly direction: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
}

/** A resolved recipe includes its meaningful, non-looping reduced-motion alternative. */
export interface IMotionRecipe {
	readonly id: string;
	readonly effect: IMotionEffect;
	readonly reducedEffect: IMotionEffect;
}
