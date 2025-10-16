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

/**
 * Lays out a one dimensional view next to an anchor in a viewport.
 *
 * @returns The view offset within the viewport.
 */
export function layout(viewportSize: number, viewSize: number, anchor: ILayoutAnchor): number {
	const layoutAfterAnchorBoundary = anchor.mode === LayoutAnchorMode.ALIGN ? anchor.offset : anchor.offset + anchor.size;
	const layoutBeforeAnchorBoundary = anchor.mode === LayoutAnchorMode.ALIGN ? anchor.offset + anchor.size : anchor.offset;

	if (anchor.position === LayoutAnchorPosition.Before) {
		if (viewSize <= viewportSize - layoutAfterAnchorBoundary) {
			return layoutAfterAnchorBoundary; // happy case, lay it out after the anchor
		}

		if (viewSize <= layoutBeforeAnchorBoundary) {
			return layoutBeforeAnchorBoundary - viewSize; // ok case, lay it out before the anchor
		}

		return Math.max(viewportSize - viewSize, 0); // sad case, lay it over the anchor
	} else {
		if (viewSize <= layoutBeforeAnchorBoundary) {
			return layoutBeforeAnchorBoundary - viewSize; // happy case, lay it out before the anchor
		}

		if (viewSize <= viewportSize - layoutAfterAnchorBoundary) {
			return layoutAfterAnchorBoundary; // ok case, lay it out after the anchor
		}

		return 0; // sad case, lay it over the anchor
	}
}

interface ILayout2DOptions {
	readonly anchorAlignment?: AnchorAlignment; // default: left
	readonly anchorPosition?: AnchorPosition; // default: below
	readonly anchorAxisAlignment?: AnchorAxisAlignment; // default: vertical
}

export function layout2d(viewport: IRect, view: ISize, anchor: IRect, options?: ILayout2DOptions): IPosition {
	const anchorAlignment = options?.anchorAlignment ?? AnchorAlignment.LEFT;
	const anchorPosition = options?.anchorPosition ?? AnchorPosition.BELOW;
	const anchorAxisAlignment = options?.anchorAxisAlignment ?? AnchorAxisAlignment.VERTICAL;

	let top: number;
	let left: number;

	if (anchorAxisAlignment === AnchorAxisAlignment.VERTICAL) {
		const verticalAnchor: ILayoutAnchor = { offset: anchor.top - viewport.top, size: anchor.height, position: anchorPosition === AnchorPosition.BELOW ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After };
		const horizontalAnchor: ILayoutAnchor = { offset: anchor.left, size: anchor.width, position: anchorAlignment === AnchorAlignment.LEFT ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After, mode: LayoutAnchorMode.ALIGN };

		top = layout(viewport.height, view.height, verticalAnchor) + viewport.top;

		// if view intersects vertically with anchor,  we must avoid the anchor
		if (Range.intersects({ start: top, end: top + view.height }, { start: verticalAnchor.offset, end: verticalAnchor.offset + verticalAnchor.size })) {
			horizontalAnchor.mode = LayoutAnchorMode.AVOID;
		}

		left = layout(viewport.width, view.width, horizontalAnchor);
	} else {
		const horizontalAnchor: ILayoutAnchor = { offset: anchor.left, size: anchor.width, position: anchorAlignment === AnchorAlignment.LEFT ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After };
		const verticalAnchor: ILayoutAnchor = { offset: anchor.top, size: anchor.height, position: anchorPosition === AnchorPosition.BELOW ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After, mode: LayoutAnchorMode.ALIGN };

		left = layout(viewport.width, view.width, horizontalAnchor);

		// if view intersects horizontally with anchor, we must avoid the anchor
		if (Range.intersects({ start: left, end: left + view.width }, { start: horizontalAnchor.offset, end: horizontalAnchor.offset + horizontalAnchor.size })) {
			verticalAnchor.mode = LayoutAnchorMode.AVOID;
		}

		top = layout(viewport.height, view.height, verticalAnchor) + viewport.top;
	}

	return { top, left };
}
