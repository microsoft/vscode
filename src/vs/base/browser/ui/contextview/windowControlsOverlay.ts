/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IWindowControlsOverlayTitlebarRect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface IWindowControlsOverlayViewport {
	readonly top: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;
}

export interface IWindowControlsOverlaySize {
	readonly width: number;
	readonly height: number;
}

export interface IWindowControlsOverlayPosition {
	readonly top: number;
	readonly left: number;
}

interface IStrip {
	readonly side: 'left' | 'right';
	readonly start: number;
	readonly end: number;
}

/**
 * Moves a view so that it does not cover the native window controls, which
 * occupy the parts of the titlebar band to the left and right of the
 * titlebar area rect of a visible window controls overlay.
 *
 * @param titlebarAreaRect The titlebar area rect, in client coordinates, or
 * `undefined` when the overlay is not visible.
 * @param viewport The viewport, where `top` and `left` are the coordinates of
 * the client origin in the coordinate space of `position`.
 * @param view The size of the view.
 * @param position The position of the view.
 * @returns The adjusted position, or `position` itself when no change is needed.
 */
export function avoidWindowControlsOverlay(
	titlebarAreaRect: IWindowControlsOverlayTitlebarRect | undefined,
	viewport: IWindowControlsOverlayViewport,
	view: IWindowControlsOverlaySize,
	position: IWindowControlsOverlayPosition
): IWindowControlsOverlayPosition {
	if (!titlebarAreaRect) {
		return position;
	}

	const values = [
		titlebarAreaRect.x, titlebarAreaRect.y, titlebarAreaRect.width, titlebarAreaRect.height,
		viewport.top, viewport.left, viewport.width, viewport.height,
		view.width, view.height,
		position.top, position.left
	];
	if (values.some(value => !Number.isFinite(value)) || titlebarAreaRect.height <= 0) {
		return position;
	}

	const bandHeight = Math.min(titlebarAreaRect.height, viewport.height);
	if (bandHeight <= 0) {
		return position;
	}

	const areaStart = clamp(titlebarAreaRect.x, 0, viewport.width);
	const areaEnd = clamp(titlebarAreaRect.x + titlebarAreaRect.width, areaStart, viewport.width);

	const allStrips: IStrip[] = [
		{ side: 'left', start: viewport.left, end: viewport.left + areaStart },
		{ side: 'right', start: viewport.left + areaEnd, end: viewport.left + viewport.width }
	];
	const strips = allStrips.filter(strip => strip.end - strip.start > 0);

	const bandTop = viewport.top;
	const bandBottom = viewport.top + bandHeight;

	const overlapsStrip = (top: number, left: number, strip: IStrip) =>
		overlaps(top, top + view.height, bandTop, bandBottom) && overlaps(left, left + view.width, strip.start, strip.end);

	const overlapping = strips.filter(strip => overlapsStrip(position.top, position.left, strip));
	if (overlapping.length === 0) {
		return position;
	}

	// 1. Push the view below the titlebar band if it fits in the viewport
	if (bandBottom + view.height <= viewport.top + viewport.height) {
		return { top: bandBottom, left: position.left };
	}

	// 2. Shift the view horizontally inwards, clear of the strip it covers
	if (overlapping.length === 1) {
		const strip = overlapping[0];
		const left = strip.side === 'left' ? strip.end : strip.start - view.width;
		const fitsViewport = left >= viewport.left && left + view.width <= viewport.left + viewport.width;
		if (fitsViewport && !strips.some(other => overlapsStrip(position.top, left, other))) {
			return { top: position.top, left };
		}
	}

	// 3. Move the view as far down as the viewport allows. A view too tall to
	// clear the titlebar band still covers the controls, but is not clipped.
	return { top: Math.max(viewport.top, viewport.top + viewport.height - view.height), left: position.left };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
	return start < otherEnd && otherStart < end;
}
