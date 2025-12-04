/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from './range.js';

export interface IAnchor {
	x: number;
	y: number;
	width?: number;
	height?: number;
}

export const enum AnchorAlignment {
	LEFT, RIGHT
}

export const enum AnchorPosition {
	BELOW, ABOVE
}

export const enum AnchorAxisAlignment {
	VERTICAL, HORIZONTAL
}

interface IPosition {
	readonly top: number;
	readonly left: number;
}

interface ISize {
	readonly width: number;
	readonly height: number;
}

export interface IRect extends IPosition, ISize { }

export const enum LayoutAnchorPosition {
	Before,
	After
}

export enum LayoutAnchorMode {
	AVOID,
	ALIGN
}

export interface ILayoutAnchor {
	offset: number;
	size: number;
	mode?: LayoutAnchorMode; // default: AVOID
	position: LayoutAnchorPosition;
}

export interface ILayoutResult {
	position: number;
	result: 'ok' | 'flipped' | 'overlap';
}

/**
 * Lays out a one dimensional view next to an anchor in a viewport.
 *
 * @returns The view offset within the viewport.
 */
export function layout(viewportSize: number, viewSize: number, anchor: ILayoutAnchor): ILayoutResult {
	const layoutAfterAnchorBoundary = anchor.mode === LayoutAnchorMode.ALIGN ? anchor.offset : anchor.offset + anchor.size;
	const layoutBeforeAnchorBoundary = anchor.mode === LayoutAnchorMode.ALIGN ? anchor.offset + anchor.size : anchor.offset;

	if (anchor.position === LayoutAnchorPosition.Before) {
		if (viewSize <= viewportSize - layoutAfterAnchorBoundary) {
			return { position: layoutAfterAnchorBoundary, result: 'ok' }; // happy case, lay it out after the anchor
		}

		if (viewSize <= layoutBeforeAnchorBoundary) {
			return { position: layoutBeforeAnchorBoundary - viewSize, result: 'flipped' }; // ok case, lay it out before the anchor
		}

		return { position: Math.max(viewportSize - viewSize, 0), result: 'overlap' }; // sad case, lay it over the anchor
	} else {
		if (viewSize <= layoutBeforeAnchorBoundary) {
			return { position: layoutBeforeAnchorBoundary - viewSize, result: 'ok' }; // happy case, lay it out before the anchor
		}

		if (viewSize <= viewportSize - layoutAfterAnchorBoundary) {
			return { position: layoutAfterAnchorBoundary, result: 'flipped' }; // ok case, lay it out after the anchor
		}

		return { position: 0, result: 'overlap' }; // sad case, lay it over the anchor
	}
}

interface ILayout2DOptions {
	readonly anchorAlignment?: AnchorAlignment; // default: left
	readonly anchorPosition?: AnchorPosition; // default: below
	readonly anchorAxisAlignment?: AnchorAxisAlignment; // default: vertical
}

export interface ILayout2DResult {
	top: number;
	left: number;
	bottom: number;
	right: number;
	anchorAlignment: AnchorAlignment;
	anchorPosition: AnchorPosition;
}

export function layout2d(viewport: IRect, view: ISize, anchor: IRect, options?: ILayout2DOptions): ILayout2DResult {
	let anchorAlignment = options?.anchorAlignment ?? AnchorAlignment.LEFT;
	let anchorPosition = options?.anchorPosition ?? AnchorPosition.ABOVE;
	const anchorAxisAlignment = options?.anchorAxisAlignment ?? AnchorAxisAlignment.VERTICAL;

	let top: number;
	let left: number;

	if (anchorAxisAlignment === AnchorAxisAlignment.VERTICAL) {
		const verticalAnchor: ILayoutAnchor = { offset: anchor.top - viewport.top, size: anchor.height, position: anchorPosition === AnchorPosition.BELOW ? LayoutAnchorPosition.After : LayoutAnchorPosition.Before };
		const horizontalAnchor: ILayoutAnchor = { offset: anchor.left, size: anchor.width, position: anchorAlignment === AnchorAlignment.LEFT ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After, mode: LayoutAnchorMode.ALIGN };

		const verticalLayoutResult = layout(viewport.height, view.height, verticalAnchor);
		top = verticalLayoutResult.position + viewport.top;

		if (verticalLayoutResult.result === 'flipped') {
			anchorPosition = anchorPosition === AnchorPosition.BELOW ? AnchorPosition.ABOVE : AnchorPosition.BELOW;
		}

		// if view intersects vertically with anchor, we must avoid the anchor
		if (Range.intersects({ start: top, end: top + view.height }, { start: verticalAnchor.offset, end: verticalAnchor.offset + verticalAnchor.size })) {
			horizontalAnchor.mode = LayoutAnchorMode.AVOID;
		}

		const horizontalLayoutResult = layout(viewport.width, view.width, horizontalAnchor);
		left = horizontalLayoutResult.position;

		if (horizontalLayoutResult.result === 'flipped') {
			anchorAlignment = anchorAlignment === AnchorAlignment.LEFT ? AnchorAlignment.RIGHT : AnchorAlignment.LEFT;
		}
	} else {
		const horizontalAnchor: ILayoutAnchor = { offset: anchor.left, size: anchor.width, position: anchorAlignment === AnchorAlignment.LEFT ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After };
		const verticalAnchor: ILayoutAnchor = { offset: anchor.top, size: anchor.height, position: anchorPosition === AnchorPosition.BELOW ? LayoutAnchorPosition.After : LayoutAnchorPosition.Before, mode: LayoutAnchorMode.ALIGN };

		const horizontalLayoutResult = layout(viewport.width, view.width, horizontalAnchor);
		left = horizontalLayoutResult.position;

		if (horizontalLayoutResult.result === 'flipped') {
			anchorAlignment = anchorAlignment === AnchorAlignment.LEFT ? AnchorAlignment.RIGHT : AnchorAlignment.LEFT;
		}

		// if view intersects horizontally with anchor, we must avoid the anchor
		if (Range.intersects({ start: left, end: left + view.width }, { start: horizontalAnchor.offset, end: horizontalAnchor.offset + horizontalAnchor.size })) {
			verticalAnchor.mode = LayoutAnchorMode.AVOID;
		}

		const verticalLayoutResult = layout(viewport.height, view.height, verticalAnchor);
		top = verticalLayoutResult.position + viewport.top;

		if (verticalLayoutResult.result === 'flipped') {
			anchorPosition = anchorPosition === AnchorPosition.BELOW ? AnchorPosition.ABOVE : AnchorPosition.BELOW;
		}
	}

	const right = viewport.width - (left + view.width);
	const bottom = viewport.height - (top + view.height);

	return { top, left, bottom, right, anchorAlignment, anchorPosition };
}
