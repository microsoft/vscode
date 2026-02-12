/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './motion.css';

//#region Easing Curves

/**
 * A pre-parsed cubic bezier easing curve that can be evaluated directly
 * without reparsing a CSS string on every frame.
 *
 * Given control points `(x1, y1)` and `(x2, y2)` (the CSS `cubic-bezier`
 * parameters), {@link solve} finds the bezier parameter `u` such that
 * `Bx(u) = t` using Newton's method, then returns `By(u)`.
 */
export class CubicBezierCurve {

	constructor(
		readonly x1: number,
		readonly y1: number,
		readonly x2: number,
		readonly y2: number,
	) { }

	/**
	 * Evaluate the curve at time `t` (0-1), returning the eased value.
	 */
	solve(t: number): number {
		if (t <= 0) {
			return 0;
		}
		if (t >= 1) {
			return 1;
		}

		// Newton's method to find u where Bx(u) = t
		let u = t; // initial guess
		for (let i = 0; i < 8; i++) {
			const currentX = bezierComponent(u, this.x1, this.x2);
			const error = currentX - t;
			if (Math.abs(error) < 1e-6) {
				break;
			}
			const dx = bezierComponentDerivative(u, this.x1, this.x2);
			if (Math.abs(dx) < 1e-6) {
				break;
			}
			u -= error / dx;
		}

		u = Math.max(0, Math.min(1, u));
		return bezierComponent(u, this.y1, this.y2);
	}

	/**
	 * Returns the CSS `cubic-bezier(…)` string representation, for use in
	 * CSS `transition` or `animation` properties.
	 */
	toCssString(): string {
		return `cubic-bezier(${this.x1}, ${this.y1}, ${this.x2}, ${this.y2})`;
	}
}

/**
 * Fluent 2 ease-out curve - default for entrances and expansions.
 * Starts fast and decelerates to a stop.
 */
export const EASE_OUT = new CubicBezierCurve(0.1, 0.9, 0.2, 1);

/**
 * Fluent 2 ease-in curve - for exits and collapses.
 * Starts slow and accelerates out.
 */
export const EASE_IN = new CubicBezierCurve(0.9, 0.1, 1, 0.2);

//#endregion

//#region Cubic Bezier Evaluation

/**
 * Parses a CSS `cubic-bezier(x1, y1, x2, y2)` string into a
 * {@link CubicBezierCurve}. Returns a linear curve on parse failure.
 */
export function parseCubicBezier(css: string): CubicBezierCurve {
	const match = css.match(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
	if (!match) {
		return new CubicBezierCurve(0, 0, 1, 1);
	}
	return new CubicBezierCurve(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]), parseFloat(match[4]));
}

/** Evaluates one component of a cubic bezier: B(u) with control points p1, p2, endpoints 0 and 1. */
function bezierComponent(u: number, p1: number, p2: number): number {
	// B(u) = 3(1-u)^2*u*p1 + 3(1-u)*u^2*p2 + u^3
	const oneMinusU = 1 - u;
	return 3 * oneMinusU * oneMinusU * u * p1 + 3 * oneMinusU * u * u * p2 + u * u * u;
}

/** First derivative of a bezier component: B'(u). */
function bezierComponentDerivative(u: number, p1: number, p2: number): number {
	// B'(u) = 3(1-u)^2*p1 + 6(1-u)*u*(p2-p1) + 3*u^2*(1-p2)
	const oneMinusU = 1 - u;
	return 3 * oneMinusU * oneMinusU * p1 + 6 * oneMinusU * u * (p2 - p1) + 3 * u * u * (1 - p2);
}

//#endregion

//#region Duration Scaling

/**
 * Reference pixel distance at which the base duration constants apply.
 * Duration scales linearly: a 600px animation takes twice as long as a 300px
 * one, keeping perceived velocity constant.
 */
const REFERENCE_DISTANCE = 300;

/** Minimum animation duration in milliseconds (avoids sub-frame flickers). */
const MIN_DURATION = 50;

/** Maximum animation duration in milliseconds (avoids sluggish feel). */
const MAX_DURATION = 300;

/**
 * Scales a base animation duration proportionally to the pixel distance
 * being animated, so that perceived velocity stays constant regardless of
 * panel width.
 *
 * @param baseDuration The duration (ms) that applies at {@link REFERENCE_DISTANCE} pixels.
 * @param pixelDistance The actual number of pixels the view will resize.
 * @returns The scaled duration, clamped to [{@link MIN_DURATION}, {@link MAX_DURATION}].
 */
export function scaleDuration(baseDuration: number, pixelDistance: number): number {
	if (pixelDistance <= 0) {
		return baseDuration;
	}
	const scaled = baseDuration * (pixelDistance / REFERENCE_DISTANCE);
	return Math.round(Math.max(MIN_DURATION, Math.min(MAX_DURATION, scaled)));
}

//#endregion

//#region Utility Functions

/**
 * Checks whether motion is reduced by looking for the `monaco-reduce-motion`
 * class on an ancestor element. This integrates with VS Code's existing
 * accessibility infrastructure in {@link AccessibilityService}.
 */
export function isMotionReduced(element: HTMLElement): boolean {
	return element.closest('.monaco-reduce-motion') !== null;
}

//#endregion
