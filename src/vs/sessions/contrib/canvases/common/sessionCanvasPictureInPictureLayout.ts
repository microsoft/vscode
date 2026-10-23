/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRectangle } from '../../../../platform/window/common/window.js';

export type CanvasStashSide = 'left' | 'right';

/** Corners in reading order: top left, top right, bottom left, bottom right. */
export type CanvasCorner = 0 | 1 | 2 | 3;

export interface ICanvasPoint {
	readonly x: number;
	readonly y: number;
}

export interface ICanvasSize {
	readonly width: number;
	readonly height: number;
}

export interface ICanvasVelocitySample extends ICanvasPoint {
	readonly time: number;
}

export type CanvasReleaseTarget =
	| { readonly kind: 'stash'; readonly side: CanvasStashSide; readonly y: number }
	| { readonly kind: 'corner'; readonly corner: CanvasCorner; readonly x: number; readonly y: number };

export interface ICanvasSpringPreset {
	readonly stiffness: number;
	readonly damping: number;
}

export const CANVAS_PIP_MARGIN = 12;
export const CANVAS_PIP_SIZES: readonly ICanvasSize[] = [{ width: 280, height: 176 }, { width: 360, height: 226 }, { width: 480, height: 300 }];
export const CANVAS_PIP_DEFAULT_SIZE = CANVAS_PIP_SIZES[1];
export const CANVAS_PIP_MIN_SIZE: ICanvasSize = { width: 220, height: 140 };
export const CANVAS_PIP_MAX_WIDTH = 720;
export const CANVAS_PIP_TOSS_SECONDS = 0.18;
export const CANVAS_PIP_STASH_SLIVER = 28;
export const CANVAS_PIP_STASH_PEEK = 40;
export const CANVAS_PIP_SPRING: ICanvasSpringPreset = { stiffness: 380, damping: 0.74 };

const stashOverhang = 0.4;
const velocityWindowMs = 80;
const maxSpeed = 5000;
const rubberBandLimit = 90;

export function clamp(value: number, low: number, high: number): number {
	return Math.min(Math.max(value, low), Math.max(low, high));
}

/** Returns the area a settled canvas may occupy within a container below its title bar. */
export function getCanvasPlacementArea(container: ICanvasSize, top: number): IRectangle {
	return {
		x: CANVAS_PIP_MARGIN,
		y: top + CANVAS_PIP_MARGIN,
		width: Math.max(0, container.width - 2 * CANVAS_PIP_MARGIN),
		height: Math.max(0, container.height - top - 2 * CANVAS_PIP_MARGIN),
	};
}

export function getCanvasCornerPositions(area: IRectangle, size: ICanvasSize): readonly ICanvasPoint[] {
	const right = area.x + area.width - size.width;
	const bottom = area.y + area.height - size.height;
	return [{ x: area.x, y: area.y }, { x: right, y: area.y }, { x: area.x, y: bottom }, { x: right, y: bottom }];
}

export function getNearestCanvasCorner(area: IRectangle, point: ICanvasPoint, size: ICanvasSize, corners: readonly CanvasCorner[] = [0, 1, 2, 3]): CanvasCorner {
	const positions = getCanvasCornerPositions(area, size);
	return corners.reduce((best, corner) => distance(positions[corner], point) < distance(positions[best], point) ? corner : best, corners[0]);
}

/** Projects a release forward by its velocity and decides whether it lands in a corner or tucks at a side. */
export function getCanvasReleaseTarget(box: IRectangle, velocity: ICanvasPoint, containerWidth: number, area: IRectangle): CanvasReleaseTarget {
	const vx = clamp(velocity.x, -maxSpeed, maxSpeed);
	const vy = clamp(velocity.y, -maxSpeed, maxSpeed);
	const projected = { x: box.x + vx * CANVAS_PIP_TOSS_SECONDS, y: box.y + vy * CANVAS_PIP_TOSS_SECONDS };
	const center = projected.x + box.width / 2;
	const offLeft = Math.max(0, -box.x) / box.width;
	const offRight = Math.max(0, box.x + box.width - containerWidth) / box.width;
	const stashY = clamp(projected.y, area.y, area.y + area.height - box.height);
	if (center < 0 || offLeft > stashOverhang) {
		return { kind: 'stash', side: 'left', y: stashY };
	}
	if (center > containerWidth || offRight > stashOverhang) {
		return { kind: 'stash', side: 'right', y: stashY };
	}
	const corner = getNearestCanvasCorner(area, projected, box);
	return { kind: 'corner', corner, ...getCanvasCornerPositions(area, box)[corner] };
}

/** The x position that leaves only a sliver of a stashed canvas inside the container. */
export function getCanvasStashX(side: CanvasStashSide, width: number, containerWidth: number, peek: boolean): number {
	const visible = peek ? CANVAS_PIP_STASH_PEEK : CANVAS_PIP_STASH_SLIVER;
	return side === 'left' ? visible - width : containerWidth - visible;
}

/** The corner a stashed canvas returns to on its side, nearest to where it was tucked. */
export function getCanvasRevealCorner(side: CanvasStashSide, area: IRectangle, y: number, size: ICanvasSize): CanvasCorner {
	return getNearestCanvasCorner(area, { x: side === 'left' ? area.x : area.x + area.width - size.width, y }, size, side === 'left' ? [0, 2] : [1, 3]);
}

/** Resists movement past a boundary so the canvas feels tethered rather than stopped. */
export function rubberBand(value: number, low: number, high: number): number {
	if (value < low) {
		return low - resist(low - value);
	}
	if (value > high) {
		return high + resist(value - high);
	}
	return value;
}

export function resist(overshoot: number): number {
	return rubberBandLimit * (1 - 1 / (overshoot / rubberBandLimit * 0.6 + 1));
}

/** Estimates release velocity in pixels per second from recent pointer samples. */
export function estimateCanvasVelocity(samples: readonly ICanvasVelocitySample[], time: number): ICanvasPoint {
	const recent = samples.filter(sample => time - sample.time <= velocityWindowMs);
	if (recent.length < 2) {
		return { x: 0, y: 0 };
	}
	const first = recent[0];
	const last = recent[recent.length - 1];
	const elapsed = Math.max(16, last.time - first.time);
	return { x: (last.x - first.x) / elapsed * 1000, y: (last.y - first.y) / elapsed * 1000 };
}

/** Advances a damped spring and returns whether it has come to rest at its target. */
export function stepCanvasSpring(state: { value: number; velocity: number }, target: number, seconds: number, preset: ICanvasSpringPreset = CANVAS_PIP_SPRING): boolean {
	const friction = 2 * Math.sqrt(preset.stiffness) * preset.damping;
	const steps = 4;
	const step = Math.min(seconds, 1 / 30) / steps;
	for (let i = 0; i < steps; i++) {
		const acceleration = -preset.stiffness * (state.value - target) - friction * state.velocity;
		state.velocity += acceleration * step;
		state.value += state.velocity * step;
	}
	if (Math.abs(state.value - target) < 0.4 && Math.abs(state.velocity) < 10) {
		state.value = target;
		state.velocity = 0;
		return true;
	}
	return false;
}

/** Fits a size within the placement area and the canvas limits, optionally preserving its aspect ratio. */
export function constrainCanvasSize(size: ICanvasSize, area: IRectangle, aspect?: number): ICanvasSize {
	const maxWidth = Math.max(CANVAS_PIP_MIN_SIZE.width, Math.min(CANVAS_PIP_MAX_WIDTH, area.width));
	const maxHeight = Math.max(CANVAS_PIP_MIN_SIZE.height, area.height);
	if (aspect) {
		const width = clamp(size.width, Math.max(CANVAS_PIP_MIN_SIZE.width, CANVAS_PIP_MIN_SIZE.height * aspect), Math.min(maxWidth, maxHeight * aspect));
		return { width, height: width / aspect };
	}
	return { width: clamp(size.width, CANVAS_PIP_MIN_SIZE.width, maxWidth), height: clamp(size.height, CANVAS_PIP_MIN_SIZE.height, maxHeight) };
}

/** Returns the preset size closest to a width, stepping by `offset` presets. */
export function getCanvasPresetSize(width: number, offset: number, wrap: boolean): ICanvasSize {
	const current = CANVAS_PIP_SIZES.reduce((best, size, index) => Math.abs(size.width - width) < Math.abs(CANVAS_PIP_SIZES[best].width - width) ? index : best, 0);
	const next = current + offset;
	const index = wrap ? (next + CANVAS_PIP_SIZES.length) % CANVAS_PIP_SIZES.length : clamp(next, 0, CANVAS_PIP_SIZES.length - 1);
	return CANVAS_PIP_SIZES[index];
}

function distance(first: ICanvasPoint, second: ICanvasPoint): number {
	return Math.hypot(first.x - second.x, first.y - second.y);
}
